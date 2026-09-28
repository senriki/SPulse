import { AudioLoader }     from './audio/audioLoader.js'
import { AudioAnalyser }   from './audio/audioAnalyser.js'
import { canvasEngine }    from './visualizer/canvasEngine.js'
import { visualizerState, resetVisualizerStateToDefaults, isVisualizerStateAtDefaults } from './visualizer/visualizerState.js'
import { initLeftPanel }   from './controls/leftPanel.js'
import { initPanelTabs }   from './controls/panelTabs.js'
import { initStylePicker }      from './controls/stylePicker.js'
import { updateBarWidthVisibility } from './controls/leftPanel.js'
import { backgroundRenderer }   from './background/backgroundRenderer.js'
import { textOverlay }          from './overlay/textOverlay.js'
import { initOverlayControls }  from './controls/overlayControls.js'
import { initMenuBar }          from './controls/menuBar.js'
import { startExport, isExporting, cancelExport } from './export/exportPipeline.js'
import { applyWebExportLimitsToDom, capWebExport, isWebExporting } from './export/webRecorder.js'
import { exportSettings, resetExportSettingsToDefaults, isExportSettingsAtDefaults } from './export/exportSettings.js'
import { serializeState, deserializeState, serializePortableState } from './project/projectManager.js'
import { historyManager }                  from './history/historyManager.js'
import { initErrorDialog }                 from './ui/errorDialog.js'
import { initAboutScreen, showAbout }      from './ui/aboutScreen.js'
import { initConfirmDialog } from './ui/confirmDialog.js'
import { initFormatDialog, chooseProjectFormat } from './ui/formatDialog.js'
import { initUpdateBanner, checkForUpdatesManually } from './ui/updateBanner.js'
import { initTheme }                       from './ui/theme.js'
import { ensurePlatformApi, isWeb }        from './platform/webApi.js'
import { exportMissionManager }             from './export/exportMissionManager.js'
import { drawBarMirror }   from './visualizer/modes/barMirror.js'
import { drawLineSmooth }  from './visualizer/modes/lineSmooth.js'
import { drawLineFill }    from './visualizer/modes/lineFill.js'
import { drawRadialPulse } from './visualizer/modes/radialPulse.js'
import { drawSpectrumGlow } from './visualizer/modes/spectrumGlow.js'

// ─── Shared app state (read by canvas engine, export pipeline, etc.) ────────
export const appState = {
  loaded:      false,
  filePath:    '',
  fileName:    '',
  audioLoader: null,   // AudioLoader instance — holds audioBuffer, amplitudeData
  analyser:    null,   // AudioAnalyser instance — real-time FFT
}
window.appState = appState   // expose for non-module script interop if needed

ensurePlatformApi()
exportMissionManager.init()

function _defaultProjectHint() {
  return isWeb()
    ? 'Ctrl+S downloads your project'
    : 'Ctrl+S to save'
}

// ─── Project state ────────────────────────────────────────────────────────────
let _projectFilePath = null   // path of the currently open .spx file
let _isDirty         = false  // true when state has changed since last save/load
let _webClean        = null   // session fingerprint at last save / import / download
let _webSessionKind  = null   // web status text: 'imported' | 'opened' | 'saved'
let _audioLoadGeneration = 0

// ─── Auto-load last-used project/settings on launch ──────────────────────────
// State only, applied here before anything below reads visualizerState/exportSettings.
// The matching DOM sync (_syncDomFromState / backgroundRenderer.reloadFromState /
// audio reload) runs at the very end of this module instead of here, since it
// depends on module-level `let` bindings (e.g. _detectedGpu) declared further down
// that aren't initialized yet at this point in top-level evaluation. First launch
// (no last-session.json) leaves visualizerState/exportSettings at their hardcoded
// defaults, unchanged. `projectFilePath` (if present) restores which project this
// state belongs to — so relaunching genuinely reopens the last saved/imported/
// opened project, not just its bare settings values with no project identity.
const _lastSession = await window.api.loadLastSession()
let _lastSessionAudioPath = null
if (_lastSession) {
  _lastSessionAudioPath = (await deserializeState(_lastSession)).audioPath
  if (_lastSession.projectFilePath) _projectFilePath = _lastSession.projectFilePath
}

// ─── DOM refs ────────────────────────────────────────────────────────────────
const dropZone     = document.getElementById('canvas-drop-zone')
const dropOverlay  = document.getElementById('drop-overlay')
const fpsCounter   = document.getElementById('fps-counter')
const btnPlay      = document.getElementById('btn-play-pause')
const iconPlay     = btnPlay.querySelector('.icon-play')
const iconPause    = btnPlay.querySelector('.icon-pause')
const scrubberTrack = document.getElementById('scrubber-track')
const scrubberFill  = document.getElementById('scrubber-fill')
const scrubberThumb = document.getElementById('scrubber-thumb')
const timeCurrent   = document.getElementById('time-current')
const timeTotal     = document.getElementById('time-total')
const btnOpenAudio  = document.getElementById('btn-open-audio')
const btnExport     = document.getElementById('btn-export')
const studioExport  = document.querySelector('.studio-export')
const exportHint    = document.getElementById('export-hint')
const audioInfoEmpty = document.getElementById('audio-info-empty')
const btnFullscreen = document.getElementById('btn-fullscreen')
const btnVolume     = document.getElementById('btn-volume')
const volumeSlider  = document.getElementById('volume-slider')
const toggleRightPanel = document.getElementById('toggle-right-panel')
const appLayout     = document.querySelector('.app-layout')
const audioMeta     = document.getElementById('audio-meta')
const metaTitle     = document.getElementById('meta-title')
const metaArtist    = document.getElementById('meta-artist')
const metaDuration  = document.getElementById('meta-duration')
const metaFormat    = document.getElementById('meta-format')
const outputFilename = document.getElementById('output-filename')
const overlayTitle  = document.getElementById('overlay-title')
const overlayArtist = document.getElementById('overlay-artist')

// ─── Load audio from ArrayBuffer + file path ─────────────────────────────────
async function loadAudio(arrayBuffer, filePath, displayName, { markDirty = true, generation = ++_audioLoadGeneration } = {}) {
  _setDropMessage('⟳ Decoding…', true)

  try {
    const loader = new AudioLoader()
    await loader.load(arrayBuffer, displayName || filePath)
    if (_isLoadStale(generation)) {
      // This loader's AudioContext was created for a load that has already been
      // superseded — release it instead of leaking one context per stale load.
      loader.audioContext?.close().catch(() => {})
      _revokeBlobUrl(filePath, '')
      _resetDropMessage()
      return
    }

    const analyser = new AudioAnalyser(loader.audioContext)
    analyser.setBuffer(loader.audioBuffer)
    analyser.onEnded = () => _onPlaybackEnded()

    // Decode first so a bad second file doesn't kill the track that's already loaded.
    // Then tear down the previous AudioContext — otherwise it keeps playing and the
    // canvas/play button stay wired to a mix of old source + new analyser.
    const prevPath = appState.filePath
    const wasPlaying = !!appState.analyser?.isPlaying
    _unloadAudio()
    _revokeBlobUrl(prevPath, filePath)

    appState.loaded      = true
    appState.filePath    = filePath
    appState.fileName    = displayName || loader.fileName
    appState.audioLoader = loader
    appState.analyser    = analyser

    _updateMetaUI(loader)
    _enableTransport(loader.duration)
    dropOverlay.classList.add('hidden')

    // Always replace overlay copy from the new file so the previous track's
    // title/artist don't stick around when the next file has none.
    if (overlayTitle) {
      overlayTitle.value = loader.metadata.title || ''
      visualizerState.overlay.title = loader.metadata.title || ''
    }
    if (overlayArtist) {
      overlayArtist.value = loader.metadata.artist || ''
      visualizerState.overlay.artist = loader.metadata.artist || ''
    }

    // Suggest default output filename and sync exportSettings
    const baseName = loader.fileName.replace(/\.[^.]+$/, '')
    const defaultFilename = isWeb() ? `${baseName}-spulse.webm` : `${baseName}-spulse.mp4`
    if (outputFilename) outputFilename.value = defaultFilename
    exportSettings.filename    = defaultFilename
    exportSettings.outputPath  = ''   // clear any previous explicit path

    // Notify canvas engine (task-4 listens for this)
    window.dispatchEvent(new CustomEvent('audio-loaded', { detail: appState }))
    if (markDirty) {
      _webSessionKind = null
      _setDirty()
    }

    if (wasPlaying) {
      appState.analyser.play()
      canvasEngine.start()
      _syncPlayIcon(true)
    }

    // Clear a lingering "Audio not found" warning (see _applyProjectData) now that a
    // file loaded successfully — this is the audio re-link flow completing.
    const hint = document.getElementById('project-hint')
    if (hint?.textContent.startsWith('Audio not found')) hint.textContent = _defaultProjectHint()
  } catch (err) {
    console.error('Audio decode failed:', err)
    _setDropMessage('✕ Could not decode file', false)
    setTimeout(() => _resetDropMessage(), 2500)
  }
}

function _isLoadStale(generation) {
  return generation !== _audioLoadGeneration || _isInteractionBlocked('session')
}

function _invalidatePendingAudioLoads() {
  _audioLoadGeneration += 1
}

// ─── Metadata UI update ───────────────────────────────────────────────────────
function _updateMetaUI(loader) {
  metaTitle.textContent    = loader.metadata.title  || '—'
  metaArtist.textContent   = loader.metadata.artist || '—'
  metaFormat.textContent   = loader.metadata.format
  metaDuration.textContent = _fmtTime(loader.duration)
  audioInfoEmpty.classList.add('hidden')
  audioMeta.classList.remove('hidden')
  _setStudioTrackName(appState.fileName || loader.fileName || 'Audio loaded')
  _setStudioTrackEmpty(false)
}

function _syncVolumeUi(value) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const muted = percent === 0
  volumeSlider?.setAttribute('aria-valuetext', `${percent}%`)
  btnVolume?.setAttribute('title', muted ? 'Unmute' : `Volume ${percent}%`)
  btnVolume?.setAttribute('aria-label', muted ? 'Unmute' : `Volume ${percent}%`)
  btnVolume?.querySelector('.volume-icon-high')?.classList.toggle('hidden', muted)
  btnVolume?.querySelector('.volume-icon-muted')?.classList.toggle('hidden', !muted)
}

function _setPlaybackVolume(value) {
  const volume = Math.max(0, Math.min(1, Number(value) || 0))
  appState.analyser?.setVolume(volume)
  if (volumeSlider) volumeSlider.value = String(Math.round(volume * 100))
  _syncVolumeUi(volume)
}

function _enableTransport(duration) {
  btnPlay.disabled   = false
  if (volumeSlider) volumeSlider.disabled = false
  if (appState.analyser) appState.analyser.setVolume(1)
  if (volumeSlider) volumeSlider.value = '100'
  _syncVolumeUi(1)
  _syncExportButtonState()
  exportHint.textContent = isWeb()
    ? 'Records in real time · desktop app exports MP4 faster'
    : 'Ready to export'
  if (btnExport) btnExport.title = exportHint.textContent
  timeTotal.textContent  = _fmtTime(duration)
  _updateScrubber(0, duration)
}

// ─── Play / Pause ─────────────────────────────────────────────────────────────
function _togglePlayback() {
  if (_isInteractionBlocked('playback')) return
  if (!appState.analyser) return
  if (appState.analyser.isPlaying) {
    appState.analyser.pause()
    canvasEngine.stop()
    _syncPlayIcon(false)
  } else {
    appState.analyser.play()
    canvasEngine.start()
    _syncPlayIcon(true)
  }
}

function _pauseForExport() {
  if (isWeb()) return
  if (isExporting()) return
  if (!appState.analyser?.isPlaying) return
  appState.analyser.pause()
  canvasEngine.stop()
  _syncPlayIcon(false)
}

function _isInteractionBlocked(scope = 'app') {
  const exporting = isExporting()
  if (scope === 'playback') return exporting && !isWeb()
  if (scope === 'editor') return exporting && !isWeb()
  if (scope === 'session') return exporting
  if (scope === 'app') return exporting
  return exporting || (isWeb() && isWebExporting())
}

async function _startExportFromUi() {
  _invalidatePendingAudioLoads()
  const wasPlaying = !!appState.analyser?.isPlaying
  _pauseForExport()

  const started = await startExport()

  if (!started && wasPlaying && appState.analyser && !_isInteractionBlocked('playback')) {
    appState.analyser.play()
    canvasEngine.start()
    _syncPlayIcon(true)
  }
}

// Stop playback and release the current audio's AudioContext (loadAudio() creates a
// fresh one via `new AudioLoader()` every time) before replacing it or clearing it
// entirely — without this, loading a new project/audio file on top of an existing one
// leaks one AudioContext per load rather than fully letting go of the previous audio.
function _unloadAudio() {
  if (appState.analyser?.isPlaying) appState.analyser.stop()
  appState.audioLoader?.audioContext?.close().catch(() => {})
  appState.loaded      = false
  appState.filePath    = ''
  appState.fileName    = ''
  appState.audioLoader = null
  appState.analyser    = null
  canvasEngine.stop()
  _syncPlayIcon(false)
}

function _revokeBlobUrl(prevPath, nextPath) {
  if (!prevPath || prevPath === nextPath) return
  if (!String(prevPath).startsWith('blob:')) return
  try { URL.revokeObjectURL(prevPath) } catch {}
}

// Reset the audio-related UI back to its "nothing loaded" state — call alongside
// _unloadAudio() whenever there's no guarantee new audio will load right after.
function _resetAudioUI() {
  audioInfoEmpty.classList.remove('hidden')
  audioMeta.classList.add('hidden')
  btnPlay.disabled        = true
  if (volumeSlider) {
    volumeSlider.disabled = true
    volumeSlider.value = '100'
  }
  _syncVolumeUi(1)
  _syncExportButtonState()
  exportHint.textContent  = 'Load an audio file to export'
  if (btnExport) btnExport.title = exportHint.textContent
  timeCurrent.textContent = '0:00'
  timeTotal.textContent   = '0:00'
  scrubberFill.style.width = '0%'
  scrubberThumb.style.left = '0%'
  _resetDropMessage()
  dropOverlay.classList.remove('hidden')
  _setStudioTrackName('Open audio')
  _setStudioTrackEmpty(true)
}

function _setStudioTrackName(name) {
  const trackName = document.getElementById('studio-track-name')
  if (!trackName) return
  const full = String(name || '').trim() || 'Open audio'
  trackName.textContent = _formatTrackLabel(full)
  trackName.dataset.fullName = full
}

function _formatTrackLabel(name, max = 52) {
  if (name.length <= max) return name
  const ext = name.match(/\.[^./\\]{1,10}$/)?.[0] || ''
  const stem = ext ? name.slice(0, -ext.length) : name
  if (max <= ext.length + 2) return `${name.slice(0, max - 1)}…`
  const budget = max - ext.length - 1
  const head = Math.max(18, Math.ceil(budget * 0.7))
  const tail = Math.max(8, budget - head)
  return `${stem.slice(0, head)}…${stem.slice(-tail)}${ext}`
}

function _setStudioTrackEmpty(empty) {
  const track = document.getElementById('studio-track')
  if (!track) return
  track.dataset.empty = empty ? 'true' : 'false'
  const fullName = document.getElementById('studio-track-name')?.dataset.fullName || document.getElementById('studio-track-name')?.textContent
  track.title = empty ? 'Open audio file' : (fullName || 'Open audio file')
}

function _syncExportButtonState() {
  if (!btnExport) return
  const enabled = !!appState.loaded
  btnExport.disabled = !enabled
  studioExport?.classList.toggle('is-disabled', !enabled)
}

function _onPlaybackEnded() {
  canvasEngine.stop()
  _syncPlayIcon(false)
  _updateScrubber(0, appState.audioLoader?.duration ?? 0)
  timeCurrent.textContent = '0:00'
}

function _syncPlayIcon(playing) {
  iconPlay.classList.toggle('hidden', playing)
  iconPause.classList.toggle('hidden', !playing)
}

// ─── Scrubber ─────────────────────────────────────────────────────────────────
export function _updateScrubber(current, duration) {
  const pct = duration > 0 ? Math.min(current / duration, 1) : 0
  scrubberFill.style.width  = `${pct * 100}%`
  scrubberThumb.style.left  = `${pct * 100}%`
  timeCurrent.textContent   = _fmtTime(current)
  scrubberTrack?.setAttribute('aria-valuemax', String(duration || 0))
  scrubberTrack?.setAttribute('aria-valuenow', String(Math.max(0, current || 0)))
  scrubberTrack?.setAttribute('aria-valuetext', _fmtTime(current || 0))
}

let _scrubbing = false
scrubberTrack.addEventListener('pointerdown', e => {
  if (!appState.analyser || _isInteractionBlocked('playback')) return
  _scrubbing = true
  scrubberTrack.setPointerCapture?.(e.pointerId)
  _seekFromEvent(e)
})
document.addEventListener('pointermove', e => {
  if (!_scrubbing) return
  if (_isInteractionBlocked('playback')) { _scrubbing = false; return }
  _seekFromEvent(e)
})
document.addEventListener('pointerup', () => { _scrubbing = false })
scrubberTrack.addEventListener('keydown', e => {
  if (!appState.analyser || _isInteractionBlocked('playback')) return
  const duration = appState.audioLoader?.duration ?? 0
  const step = e.shiftKey ? 10 : 5
  let time = appState.analyser.currentTime
  if (e.key === 'ArrowLeft') time -= step
  else if (e.key === 'ArrowRight') time += step
  else if (e.key === 'Home') time = 0
  else if (e.key === 'End') time = duration
  else return
  e.preventDefault()
  _seekToTime(time)
})

function _seekFromEvent(e) {
  if (_isInteractionBlocked('playback')) return
  const rect = scrubberTrack.getBoundingClientRect()
  const pct  = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
  _seekToTime(pct * (appState.audioLoader?.duration ?? 0))
}

function _seekToTime(time) {
  const duration = appState.audioLoader?.duration ?? 0
  time = Math.max(0, Math.min(time, duration))
  appState.analyser.seek(time)
  _updateScrubber(time, duration)
  // When paused, draw one frame to preview the seek position
  if (!appState.analyser.isPlaying) canvasEngine.stop()
}

// ─── Visualizer drag-to-reposition ───────────────────────────────────────────
const canvasWrapper   = document.getElementById('canvas-wrapper')
const bgSnapGuideV    = document.getElementById('bg-snap-guide-v')
const bgSnapGuideH    = document.getElementById('bg-snap-guide-h')
let _vizDragging      = false
let _vizDragStartY    = 0
let _vizDragStartOff  = 0

window.addEventListener('audio-loaded', () => {
  canvasWrapper?.classList.add('viz-draggable')
})

// ─── Background drag-to-reposition (only while "Adjust position" is on) ──────
let _bgEditMode      = false
let _bgDragging      = false
let _bgDragStartX    = 0
let _bgDragStartY    = 0
let _bgDragStartOffX = 0
let _bgDragStartOffY = 0

document.getElementById('bg-position-edit')?.addEventListener('change', e => {
  _bgEditMode = e.target.checked
  canvasWrapper?.classList.toggle('bg-draggable', _bgEditMode)
})

document.getElementById('btn-bg-reset-position')?.addEventListener('click', () => {
  historyManager.push(_snapshotVS())
  visualizerState.background.scale   = 1
  visualizerState.background.offsetX = 0
  visualizerState.background.offsetY = 0
  const scaleSlider = document.getElementById('bg-scale')
  const scaleVal    = document.getElementById('bg-scale-val')
  if (scaleSlider) scaleSlider.value = '100'
  if (scaleVal)    scaleVal.textContent = '100%'
  if (!appState.analyser?.isPlaying) canvasEngine.stop()
  _setDirty()
})

canvasWrapper?.addEventListener('mousedown', e => {
  if (e.button !== 0 || !appState.loaded) return

  if (_bgEditMode) {
    _bgDragging      = true
    _bgDragStartX    = e.clientX
    _bgDragStartY    = e.clientY
    _bgDragStartOffX = visualizerState.background.offsetX ?? 0
    _bgDragStartOffY = visualizerState.background.offsetY ?? 0
    canvasWrapper.classList.add('bg-dragging')
    historyManager.push(_snapshotVS())
    e.preventDefault()
    return
  }

  _vizDragging     = true
  _vizDragStartY   = e.clientY
  _vizDragStartOff = visualizerState.yOffset
  canvasWrapper.classList.add('viz-dragging')
  historyManager.push(_snapshotVS())
  e.preventDefault()
})

document.addEventListener('mousemove', e => {
  if (_bgDragging) {
    // Background offsets are interpreted in the target export resolution's
    // space (see staticImage.js / videoBackground.js), not the preview canvas's
    // own (possibly downscaled) pixel size — convert the screen-pixel drag delta
    // accordingly.
    const cssW  = canvasWrapper.clientWidth
    const cssH  = canvasWrapper.clientHeight
    const logW  = exportSettings.width  || 1280
    const logH  = exportSettings.height || 720
    const scaleX = cssW > 0 ? logW / cssW : 1
    const scaleY = cssH > 0 ? logH / cssH : 1
    const dx = Math.round((e.clientX - _bgDragStartX) * scaleX)
    const dy = Math.round((e.clientY - _bgDragStartY) * scaleY)

    // Snap to dead-center when close, so lining it up exactly is effortless
    const SNAP_PX = 24
    let newOffX = _bgDragStartOffX + dx
    let newOffY = _bgDragStartOffY + dy
    const snappedX = Math.abs(newOffX) <= SNAP_PX
    const snappedY = Math.abs(newOffY) <= SNAP_PX
    if (snappedX) newOffX = 0
    if (snappedY) newOffY = 0

    visualizerState.background.offsetX = newOffX
    visualizerState.background.offsetY = newOffY

    bgSnapGuideV?.classList.toggle('active', snappedX)
    bgSnapGuideH?.classList.toggle('active', snappedY)

    if (!appState.analyser?.isPlaying) canvasEngine.stop()
    return
  }

  if (!_vizDragging) return
  const cssH  = canvasWrapper.clientHeight
  const logH  = canvasEngine.r2d?.canvas.height ?? 720
  const scale = cssH > 0 ? logH / cssH : 1
  const delta = Math.round((e.clientY - _vizDragStartY) * scale)
  const newOff = Math.max(-400, Math.min(400, _vizDragStartOff + delta))

  if (visualizerState.centerVertically && Math.abs(delta) > 4) {
    visualizerState.centerVertically = false
    const chk = document.getElementById('waveform-center')
    if (chk) chk.checked = false
  }

  visualizerState.yOffset = newOff
  const slider  = document.getElementById('y-offset')
  const display = document.getElementById('y-offset-val')
  if (slider)  slider.value        = String(newOff)
  if (display) display.textContent = `${newOff}px`

  if (!appState.analyser?.isPlaying) canvasEngine.stop()
}, { passive: true })

document.addEventListener('mouseup', () => {
  if (_bgDragging) {
    _bgDragging = false
    canvasWrapper?.classList.remove('bg-dragging')
    bgSnapGuideV?.classList.remove('active')
    bgSnapGuideH?.classList.remove('active')
    _setDirty()
    return
  }

  if (!_vizDragging) return
  _vizDragging = false
  canvasWrapper?.classList.remove('viz-dragging')
  _setDirty()
})

// ─── Drop zone: drag-and-drop ─────────────────────────────────────────────────
dropZone.addEventListener('dragover', e => {
  e.preventDefault()
  if (_isInteractionBlocked('session')) {
    e.dataTransfer.dropEffect = 'none'
    return
  }
  e.dataTransfer.dropEffect = 'copy'
  dropZone.classList.add('drag-over')
})

dropZone.addEventListener('dragleave', e => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over')
  }
})

dropZone.addEventListener('drop', async e => {
  e.preventDefault()
  if (_isInteractionBlocked('session')) return
  dropZone.classList.remove('drag-over')

  const file = e.dataTransfer.files[0]
  if (!file || !_isAudioFile(file.name)) {
    _flashDropMessage('✕ Not a supported audio file')
    return
  }

  const arrayBuffer = await file.arrayBuffer()
  const objectUrl = window.api.getPathForFile?.(file)
  await loadAudio(arrayBuffer, objectUrl || file.name, file.name)
})

// ─── File picker (button + Ctrl+O) ───────────────────────────────────────────
async function _openFilePicker() {
  const generation = ++_audioLoadGeneration
  if (_isInteractionBlocked('session')) return
  const result = await window.api.openAudioFile()
  if (!result) return
  if (_isLoadStale(generation)) {
    _revokeBlobUrl(result.filePath, '')
    return
  }

  // result.buffer arrives as Uint8Array via structured clone (contextBridge)
  const u8  = result.buffer instanceof Uint8Array ? result.buffer : new Uint8Array(Object.values(result.buffer))
  const ab  = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
  await loadAudio(ab, result.filePath, result.fileName, { generation })
}

btnOpenAudio.addEventListener('click', _openFilePicker)
document.getElementById('studio-track')?.addEventListener('click', _openFilePicker)

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey

  if (e.key === 'F11') { e.preventDefault(); _toggleFullscreen() }

  if (e.key === 'Escape') {
    document.getElementById('error-modal')?.classList.add('hidden')
    document.getElementById('about-modal')?.classList.add('hidden')
    // Desktop only: Escape cancels a running FFmpeg export. Web keeps recording
    // on Escape by design — its exports are cancelled from the mission menu.
    if (!isWeb() && isExporting()) cancelExport()
  }

  const isPlaybackShortcut = e.key === ' ' && !e.target.matches('input, textarea, select')
  // Ignore all editing, playback, and session shortcuts while the studio is hidden
  const studio = document.getElementById('studio')
  if (studio && studio.hidden) return

  if (ctrl && e.key === 'n') { e.preventDefault(); _newSession() }
  if (!isWeb() && ctrl && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); _resetToDefaults() }
  if (ctrl && e.key === 'o') { e.preventDefault(); _openFilePicker() }
  if (ctrl && e.key === 's') { e.preventDefault(); _saveProject() }
  if (ctrl && e.key === 'e') { e.preventDefault(); if (appState.loaded) _startExportFromUi() }
  if (ctrl && e.key === 'z') { e.preventDefault(); _undo() }
  if (ctrl && e.key === 'y') { e.preventDefault(); _redo() }
  if (ctrl && e.key === 'q') {
    e.preventDefault()
    if (!isWeb()) window.api.quit()
  }

  if (isPlaybackShortcut) {
    e.preventDefault()
    _togglePlayback()
  }
})

btnPlay.addEventListener('click', _togglePlayback)

volumeSlider?.addEventListener('input', e => _setPlaybackVolume(e.target.value / 100))
btnVolume?.addEventListener('click', () => {
  const current = Number(volumeSlider?.value || 0) / 100
  _setPlaybackVolume(current > 0 ? 0 : 1)
})

// ─── Fullscreen ──────────────────────────────────────────────────────────────
function _toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen()
}

document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement
  document.body.classList.toggle('video-playmode', isFs)
  btnFullscreen?.querySelector('.icon-fs-enter')?.classList.toggle('hidden', isFs)
  btnFullscreen?.querySelector('.icon-fs-exit')?.classList.toggle('hidden', !isFs)
  btnFullscreen?.setAttribute('title', isFs ? 'Exit Fullscreen (F11)' : 'Toggle Fullscreen (F11)')
})

btnFullscreen?.addEventListener('click', _toggleFullscreen)

// ─── Collapsible inspector ────────────────────────────────────────────────────
const rightPanelEl = document.getElementById('right-panel')
let _rightPanelCollapsed = false

function _applyPanelWidths() {
  const r = _rightPanelCollapsed ? '0px' : 'var(--panel-inspector-width)'
  if (appLayout) appLayout.style.gridTemplateColumns = `minmax(0, 1fr) ${r}`
}

// Wait for the collapse transition to finish before re-measuring canvas-area —
// clientWidth still reports the pre-transition size if read synchronously.
appLayout?.addEventListener('transitionend', e => {
  if (e.propertyName === 'grid-template-columns') canvasEngine.refitPreview()
})

// Same reasoning as above — collapsing the top menu bar (Feature I) frees up
// vertical space the canvas area can grow into.
document.getElementById('app-menu-bar')?.addEventListener('transitionend', e => {
  if (e.propertyName === 'height') canvasEngine.refitPreview()
})

function _setInspectorCollapsed(collapsed) {
  _rightPanelCollapsed = collapsed
  _applyPanelWidths()
  rightPanelEl?.classList.toggle('collapsed', collapsed)
  rightPanelEl?.setAttribute('aria-hidden', collapsed ? 'true' : 'false')
  toggleRightPanel?.classList.toggle('collapsed', collapsed)
  const label = collapsed ? 'Expand inspector' : 'Collapse inspector'
  if (toggleRightPanel) {
    toggleRightPanel.title = label
    toggleRightPanel.setAttribute('aria-expanded', String(!collapsed))
    toggleRightPanel.setAttribute('aria-label', label)
  }
  requestAnimationFrame(() => canvasEngine.refitPreview())
}

function _toggleInspector() {
  _setInspectorCollapsed(!_rightPanelCollapsed)
}

toggleRightPanel?.addEventListener('click', _toggleInspector)

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _isAudioFile(name) {
  return /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(name)
}

function _fmtTime(secs) {
  if (!isFinite(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function _setDropMessage(msg, showSpinner) {
  const title = dropOverlay.querySelector('.drop-title')
  const sub   = dropOverlay.querySelector('.drop-sub')
  const fmts  = dropOverlay.querySelector('.drop-formats')
  const svg   = dropOverlay.querySelector('svg')
  if (title)  title.textContent  = msg
  if (sub)    sub.classList.toggle('hidden', showSpinner)
  if (fmts)   fmts.classList.toggle('hidden', showSpinner)
  if (svg)    svg.classList.toggle('hidden', showSpinner)
  dropOverlay.classList.remove('hidden')
}

function _resetDropMessage() {
  const title = dropOverlay.querySelector('.drop-title')
  const sub   = dropOverlay.querySelector('.drop-sub')
  const fmts  = dropOverlay.querySelector('.drop-formats')
  const svg   = dropOverlay.querySelector('svg')
  if (title)  title.textContent  = 'Drop audio here'
  if (sub)    sub.classList.remove('hidden')
  if (fmts)   fmts.classList.remove('hidden')
  if (svg)    svg.classList.remove('hidden')
}

function _flashDropMessage(msg) {
  _setDropMessage(msg, false)
  setTimeout(_resetDropMessage, 2000)
}

// ─── History: undo/redo ───────────────────────────────────────────────────────
let _historyTimer = null  // debounce window for grouping rapid control changes

// Snapshot visualizerState and apply a restored snapshot back to state + DOM.
function _snapshotVS() { return historyManager.snapshot(visualizerState) }

function _applySnapshot(snap) {
  Object.assign(visualizerState, {
    mode: snap.mode, color: snap.color, opacity: snap.opacity, glow: snap.glow,
    barWidth: snap.barWidth, barGap: snap.barGap, numBars: snap.numBars, mirrorLR: snap.mirrorLR,
    mirrorPeakCenter: snap.mirrorPeakCenter, lineWidth: snap.lineWidth,
    padding: snap.padding, smoothing: snap.smoothing,
    sensitivity: snap.sensitivity ?? 1.0,
    centerVertically: snap.centerVertically, yOffset: snap.yOffset,
    channelMode: snap.channelMode, stereoLayout: snap.stereoLayout,
    independentChannelColors: snap.independentChannelColors,
    colorL: snap.colorL, colorR: snap.colorR,
  })
  Object.assign(visualizerState.background, snap.background)
  visualizerState.background.imageEl = null
  visualizerState.background.videoEl = null
  Object.assign(visualizerState.overlay, snap.overlay)
  backgroundRenderer.reloadFromState(visualizerState.background)
  _syncDomFromState(visualizerState, exportSettings)
}

function _undo() {
  if (_isInteractionBlocked('editor')) return
  const snap = historyManager.undo(_snapshotVS())
  if (!snap) return
  _applySnapshot(snap)
  _syncDirtyFromHistory()
  _syncHistoryButtons()
}

function _redo() {
  if (_isInteractionBlocked('editor')) return
  const snap = historyManager.redo(_snapshotVS())
  if (!snap) return
  _applySnapshot(snap)
  _syncDirtyFromHistory()
  _syncHistoryButtons()
}

function _syncHistoryButtons() {
  const undo = document.getElementById('btn-undo')
  const redo = document.getElementById('btn-redo')
  if (undo) undo.disabled = !historyManager.canUndo()
  if (redo) redo.disabled = !historyManager.canRedo()
}

document.getElementById('btn-undo')?.addEventListener('click', _undo)
document.getElementById('btn-redo')?.addEventListener('click', _redo)

// Combined handler: snapshot before the change, then mark dirty.
// Runs in capture phase so visualizerState still holds the PRE-change value.
function _onPanelControlChange() {
  if (!_historyTimer) historyManager.push(_snapshotVS())
  clearTimeout(_historyTimer)
  _historyTimer = setTimeout(() => { _historyTimer = null }, 500)
  _setDirty()
  _syncHistoryButtons()
}

// ─── Project: dirty tracking & title bar ─────────────────────────────────────
// Snapshot only the export fields that serialize into a project file — outputPath
// and askOnExport are session-only and must NOT mark the session dirty.
function _snapshotExportSettings() {
  return {
    width:     exportSettings.width,
    height:    exportSettings.height,
    fps:       exportSettings.fps,
    codec:     exportSettings.codec,
    encoder:   exportSettings.encoder,
    audioMode: exportSettings.audioMode,
    bitrate:   exportSettings.bitrate,
    filename:  exportSettings.filename,
  }
}

function _sessionFingerprint() {
  return JSON.stringify({
    vs: _snapshotVS(),
    es: _snapshotExportSettings(),
    audio: appState.filePath || appState.fileName || '',
  })
}

function _syncDirtyFromHistory() {
  if (_webClean && _sessionFingerprint() === _webClean) {
    _isDirty = false
  } else {
    _isDirty = true
  }
  _updateTitleBar()
  _updateWebSessionAlert()
}

function _updateWebSessionAlert() {
  const el = document.getElementById('web-session-bar')
  if (!el) return
  if (!isWeb() || document.getElementById('studio')?.hidden) {
    el.classList.add('hidden')
    el.textContent = ''
    el.removeAttribute('data-state')
    return
  }

  if (_isDirty) {
    el.classList.remove('hidden')
    el.dataset.state = 'unsaved'
    el.textContent = 'Unsaved'
    return
  }
  if (_webSessionKind === 'saved') {
    el.classList.remove('hidden')
    el.dataset.state = 'saved'
    el.textContent = 'Saved'
    return
  }
  if (_webSessionKind === 'imported') {
    el.classList.remove('hidden')
    el.dataset.state = 'imported'
    el.textContent = 'Project imported'
    return
  }
  if (_webSessionKind === 'opened') {
    el.classList.remove('hidden')
    el.dataset.state = 'opened'
    el.textContent = 'Project opened'
    return
  }
  if (appState.loaded) {
    el.classList.remove('hidden')
    el.dataset.state = 'unsaved'
    el.textContent = 'Unsaved'
    return
  }
  el.classList.add('hidden')
  el.textContent = ''
  el.removeAttribute('data-state')
}

function _setDirty() {
  if (_isDirty) return
  _isDirty = true
  _updateTitleBar()
  _updateWebSessionAlert()
}

function _clearDirty({ exported = false, imported = false, opened = false } = {}) {
  _isDirty = false
  _webClean = _sessionFingerprint()
  if (exported)      _webSessionKind = 'saved'
  else if (imported) _webSessionKind = 'imported'
  else if (opened)  _webSessionKind = 'opened'
  else               _webSessionKind = null
  _updateTitleBar()
  _updateWebSessionAlert()
}

// ─── Auto-save last-used settings (debounced, global "last session") ─────────
// Persists a device-level snapshot on every settings change — includes whatever
// project (if any) is currently open via _currentLastSessionPayload(), so a
// relaunch restores that project's identity too, not just bare setting values.
let _autoSaveTimer = null
function _scheduleAutoSaveLastSession() {
  clearTimeout(_autoSaveTimer)
  _autoSaveTimer = setTimeout(() => {
    window.api.saveLastSession(_currentLastSessionPayload())
  }, 800)
}

function _updateTitleBar() {
  if (!_projectFilePath) { document.title = 'SPulse'; return }
  const name = _projectFilePath.replace(/.*[\\/]/, '').replace(/\.(spx|spulse)$/i, '')
  document.title = _isDirty ? `${name}* — SPulse` : `${name} — SPulse`
}

// ─── Project: sync DOM controls from state after load ─────────────────────────
function _syncDomFromState(vs, es) {
  const $   = id  => document.getElementById(id)
  const set = (id, v) => { const el = $(id); if (el) el.value = String(v) }
  const chk = (id, v) => { const el = $(id); if (el) el.checked = Boolean(v) }
  const txt = (id, v) => { const el = $(id); if (el) el.textContent = String(v) }

  // Style picker
  document.querySelectorAll('#style-picker .style-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === vs.mode)
  })
  canvasEngine.setMode(vs.mode)
  updateBarWidthVisibility(vs.mode)

  // Waveform color + hex
  set('waveform-color', vs.color)
  set('waveform-color-hex', vs.color.toUpperCase())

  // Waveform sliders
  const opPct = Math.round(vs.opacity * 100)
  set('waveform-opacity', opPct); txt('waveform-opacity-val', `${opPct}%`)
  set('waveform-glow', vs.glow); txt('waveform-glow-val', `${vs.glow}%`)
  set('bar-width', vs.barWidth); txt('bar-width-val', `${vs.barWidth}px`)
  set('bar-gap', vs.barGap); txt('bar-gap-val', `${vs.barGap}px`)
  set('bar-count', vs.numBars); txt('bar-count-val', `${vs.numBars}`)
  chk('mirror-lr', vs.mirrorLR)
  chk('mirror-peak-center', vs.mirrorPeakCenter)
  $('mirror-peak-center-group')?.classList.toggle('hidden', !vs.mirrorLR)

  // Channel Mode (Stereo)
  document.querySelectorAll('[name="channel-mode"]').forEach(r => { r.checked = r.value === vs.channelMode })
  $('stereo-controls')?.classList.toggle('hidden', vs.channelMode !== 'stereo')
  set('stereo-layout', vs.stereoLayout)
  chk('independent-channel-colors', vs.independentChannelColors)
  $('channel-color-controls')?.classList.toggle('hidden', !vs.independentChannelColors)
  set('waveform-color-l', vs.colorL)
  set('waveform-color-r', vs.colorR)
  set('line-width', vs.lineWidth); txt('line-width-val', `${vs.lineWidth}px`)
  set('canvas-padding', vs.padding); txt('canvas-padding-val', `${vs.padding}px`)
  set('smoothing', vs.smoothing); txt('smoothing-val', `${vs.smoothing}%`)
  appState.analyser?.setSmoothingTimeConstant(vs.smoothing / 100)
  const sensPct = Math.round((vs.sensitivity ?? 1) * 100)
  set('sensitivity', sensPct); txt('sensitivity-val', `${sensPct}%`)
  chk('waveform-center', vs.centerVertically)
  set('y-offset', vs.yOffset); txt('y-offset-val', `${Math.round(vs.yOffset)}px`)

  // Background
  const bg = vs.background
  document.querySelectorAll('[name="bg-type"]').forEach(r => { r.checked = r.value === bg.type })
  const bgSections = { solid: 'bg-solid-controls', gradient: 'bg-gradient-controls', image: 'bg-image-controls', video: 'bg-video-controls' }
  Object.entries(bgSections).forEach(([type, id]) => $(id)?.classList.toggle('hidden', type !== bg.type))
  set('bg-color', bg.color)
  set('bg-gradient-a', bg.gradientA); set('bg-gradient-b', bg.gradientB)
  set('bg-gradient-angle', bg.gradientAngle); txt('bg-angle-val', `${bg.gradientAngle}°`)
  set('bg-image-blur', bg.imageBlur); txt('bg-blur-val', `${bg.imageBlur}px`)
  set('bg-image-darken', bg.imageDarken); txt('bg-darken-val', `${bg.imageDarken}%`)
  if ($('bg-image-name')) $('bg-image-name').textContent = bg.imagePath ? bg.imagePath.replace(/.*[\\/]/, '') : 'No file'
  if ($('bg-video-name')) $('bg-video-name').textContent = bg.videoPath ? bg.videoPath.replace(/.*[\\/]/, '') : 'No file'

  // Background fit/position
  set('bg-fit-mode', bg.fitMode ?? 'cover')
  const bgScalePct = Math.round((bg.scale ?? 1) * 100)
  set('bg-scale', bgScalePct); txt('bg-scale-val', `${bgScalePct}%`)
  $('bg-position-section')?.classList.toggle('hidden', bg.type !== 'image' && bg.type !== 'video')

  // Overlay
  const ov = vs.overlay
  chk('overlay-enabled', ov.enabled)
  const ctrlEl = $('overlay-controls')
  if (ctrlEl) {
    if (ov.enabled) {
      ctrlEl.removeAttribute('data-disabled')
      ctrlEl.querySelectorAll('input, select').forEach(el => { el.disabled = false })
    } else {
      ctrlEl.setAttribute('data-disabled', 'true')
      ctrlEl.querySelectorAll('input, select').forEach(el => { el.disabled = true })
    }
  }
  set('overlay-title', ov.title); set('overlay-artist', ov.artist)
  set('overlay-font-title', ov.titleFont); set('overlay-font-artist', ov.artistFont)
  set('overlay-position', ov.position)
  $('overlay-xy-group')?.classList.toggle('hidden', ov.position !== 'custom')
  set('overlay-x', ov.x); set('overlay-y', ov.y)
  set('overlay-color', ov.color)
  const szPct = Math.round(ov.opacity * 100)
  set('overlay-size-title', ov.titleSize); txt('overlay-size-title-val', `${ov.titleSize}px`)
  set('overlay-size-artist', ov.artistSize); txt('overlay-size-artist-val', `${ov.artistSize}px`)
  set('overlay-opacity', szPct); txt('overlay-opacity-val', `${szPct}%`)

  // Export settings
  const presetKey = `${es.width}x${es.height}`
  const knownPresets = new Set(['1920x1080', '3840x2160', '1080x1920', '1440x2560', '1080x1080'])
  const presetEl = $('resolution-preset')
  if (presetEl) {
    presetEl.value = knownPresets.has(presetKey) ? presetKey : 'custom'
    const isCustom = !knownPresets.has(presetKey)
    $('custom-res-group')?.classList.toggle('hidden', !isCustom)
    if (isCustom) { set('custom-width', es.width); set('custom-height', es.height) }
  }
  canvasEngine.setPreviewAspect(es.width, es.height)

  set('export-fps', es.fps); set('export-codec', es.codec); set('export-encoder', es.encoder || 'auto'); set('audio-mode', es.audioMode)
  _updateEncoderBadge()
  const isManual = es.bitrate !== null
  document.querySelectorAll('[name="bitrate-mode"]').forEach(r => { r.checked = r.value === (isManual ? 'manual' : 'auto') })
  $('bitrate-manual-group')?.classList.toggle('hidden', !isManual)
  if (isManual) set('manual-bitrate', es.bitrate)

  const filenameEl = $('output-filename')
  if (filenameEl) filenameEl.value = es.filename || 'spulse.mp4'
}

// ─── Project: save ────────────────────────────────────────────────────────────
async function _saveProject() {
  // Saving only serializes current state and is safe mid-export on web (the
  // export runs off a frozen snapshot + background recording), so keep Ctrl+S
  // working while a web video export is in progress. Desktop stays blocked via
  // the progress modal.
  if (_isInteractionBlocked('session') && !isWeb()) return

  // Web: Save downloads a file, so ask for the format (see ui/formatDialog.js).
  // Desktop: Save always writes the native .spx.
  let format = 'spx'
  if (isWeb()) {
    format = await chooseProjectFormat({ title: 'Save Project' })
    if (!format) return   // cancelled
  }

  const defaultPath = isWeb()
    ? (appState.fileName
        ? appState.fileName.replace(/\.[^.]+$/, '') + `.${format}`
        : `project.${format}`)
    : (_projectFilePath
        ? _projectFilePath.replace(/\.(spx|spulse)$/i, '') + '.spx'
        : (appState.fileName
            ? appState.fileName.replace(/\.[^.]+$/, '') + '.spx'
            : 'project.spx'))
  const data = isWeb()
    ? (format === 'spx'
        ? serializeState(appState.filePath || '')
        : await serializePortableState(appState.filePath || ''))
    : serializeState(appState.filePath || '')
  const savedPath = isWeb()
    ? await window.api.exportProject(data, defaultPath)
    : await window.api.saveProject(data, defaultPath)
  if (!savedPath) return   // user cancelled
  _projectFilePath = savedPath
  _clearDirty({ exported: isWeb() })
  _updateTitleBar()
  window.api.recordRecentProject?.(savedPath)
  window.api.saveLastSession(_currentLastSessionPayload())
  const hint = document.getElementById('project-hint')
  if (hint) { hint.textContent = isWeb() ? 'Downloaded' : 'Saved'; setTimeout(() => { hint.textContent = _defaultProjectHint() }, 2000) }
}

// ─── Project: export (portable .spulse; web may choose .spx) ─────────────────
// Distinct from _saveProject(): does not touch _projectFilePath/dirty tracking, since
// the exported file is a copy, not the user's currently-open project file.
// Desktop always exports the portable .spulse (Save already covers .spx); only the
// web build asks, since its Save and Export both end up as a download.
async function _exportProject() {
  // Same rationale as _saveProject(): exporting is read-only over state, so it
  // can run during a web video export without affecting the recording.
  if (_isInteractionBlocked('session') && !isWeb()) return

  let format = 'spulse'
  if (isWeb()) {
    format = await chooseProjectFormat({ title: 'Export Project' })
    if (!format) return   // cancelled
  }

  const base = appState.fileName
    ? appState.fileName.replace(/\.[^.]+$/, '')
    : 'project'
  const defaultPath = `${base}.${format}`
  const data = format === 'spx'
    ? serializeState(appState.filePath || '')
    : await serializePortableState(appState.filePath || '')
  const savedPath = await window.api.exportProject(data, defaultPath)
  if (!savedPath) return   // user cancelled
  if (isWeb()) _clearDirty({ exported: true })
  const hint = document.getElementById('project-hint')
  if (hint) { hint.textContent = 'Exported ✓'; setTimeout(() => { hint.textContent = _defaultProjectHint() }, 2000) }
}

// ─── Audio: reload from an explicit path (project restore, of any kind) ──────
// Shared by _applyProjectData() and the last-session startup restore below —
// both need the exact same "read the file, decode it, or show a not-found
// hint" behavior for a project's referenced audio file.
async function _reloadAudioFromPath(audioPath) {
  if (!audioPath) return
  const audioResult = await window.api.loadAudioPath(audioPath)
  if (audioResult?.error) {
    const hint = document.getElementById('project-hint')
    if (hint) hint.textContent = `Audio not found: ${audioPath.replace(/.*[\\/]/, '')}`
  } else if (audioResult) {
    const u8 = audioResult.buffer instanceof Uint8Array
      ? audioResult.buffer
      : new Uint8Array(Object.values(audioResult.buffer))
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
    await loadAudio(ab, audioResult.filePath, audioResult.fileName, { markDirty: false })
  }
}

// ─── Last-session persistence (Ctrl-independent auto-save, restore on launch) ─
// Includes projectFilePath alongside serializeState()'s own fields — kept as a
// sibling field, not part of serializeState() itself, since a project FILE
// should never embed a self-referential path (the file could be moved/renamed
// and that stale path would then be wrong for anyone else opening it).
function _currentLastSessionPayload() {
  return { ...serializeState(appState.filePath || ''), projectFilePath: _projectFilePath }
}

// ─── Project: shared "apply loaded/imported .spx data" logic ──────────────────
// Used by both _loadProject() (legacy manual load) and _importProject() (task-9,
// portable v2.0 support) — deserializeState() already transparently branches on
// `data.version`, so both formats flow through this one path.
// deserializeState() must run BEFORE audio loading: for a portable (v2.0) file, the raw
// `data.audioPath` is always '' (the real audio lives in `data.audioAsset`) — only
// deserializeState()'s returned `audioPath` (resolved to a temp file) is usable. For a
// legacy v1.0 file this ordering is a no-op change (deserializeState doesn't touch audio).
async function _applyProjectData(projectPath, data, { recordRecent = true, webOpened = false } = {}) {
  // Start from a clean slate first — otherwise a field missing from `data` (e.g. an
  // older-schema project file) would silently inherit whatever was live in memory from
  // the previous session instead of falling back to a proper default, and any
  // previously-loaded audio would keep playing/lingering if the new project has none.
  _unloadAudio()
  _resetAudioUI()
  resetVisualizerStateToDefaults()
  resetExportSettingsToDefaults()

  const { audioPath } = await deserializeState(data)
  if (isWeb()) capWebExport(exportSettings)
  await _reloadAudioFromPath(audioPath)

  // Sync all DOM controls to the restored state
  _syncDomFromState(visualizerState, exportSettings)

  // Reload background image/video from stored paths
  backgroundRenderer.reloadFromState(visualizerState.background)

  _projectFilePath = projectPath
  if (isWeb() && webOpened === 'imported') _clearDirty({ imported: true })
  else if (isWeb() && webOpened === 'opened') _clearDirty({ opened: true })
  else _clearDirty()
  _updateTitleBar()

  // Persist immediately (not the debounced settings-change path) so quitting
  // right after opening a project — before touching any control — still
  // restores this exact project on next launch, not a stale earlier session.
  window.api.saveLastSession(_currentLastSessionPayload())

  // Recent-projects list (Feature H) — Load and OS-triggered open both funnel
  // through here; Import explicitly opts out (see _importProject()), since a
  // portable-share import is often a one-off, not an ongoing project.
  if (recordRecent) window.api.recordRecentProject?.(projectPath)
}

// ─── Project: load ────────────────────────────────────────────────────────────
async function _loadProject() {
  if (_isInteractionBlocked('session')) return
  const result = await window.api.loadProject()
  if (!result) return   // user cancelled
  await _applyProjectData(result.filePath, result.data, { webOpened: isWeb() ? 'opened' : false })
  const hint = document.getElementById('project-hint')
  if (hint) { hint.textContent = 'Project loaded ✓'; setTimeout(() => { hint.textContent = _defaultProjectHint() }, 2000) }
}

// ─── Project: open from an OS-triggered file (double-click, "Open with", or a
// second launch attempt while SPulse is already running — see main.js) ────────
// Same underlying restore path as _loadProject()/_importProject(): deserializeState()
// transparently handles both legacy v1.0 and portable v2.0 files. Unlike those two
// (user-initiated via a dialog they just confirmed), this can arrive at any time, so
// it checks for unsaved changes first — same confirm() pattern as _newSession().
async function _openProjectFile({ filePath, data }) {
  if (_isInteractionBlocked('session')) return
  if (_isDirty) {
    const name = filePath.replace(/.*[\\/]/, '')
    if (!confirm(`Discard unsaved changes and open "${name}"?`)) return
  }
  await _applyProjectData(filePath, data, { webOpened: isWeb() ? 'opened' : false })
  const hint = document.getElementById('project-hint')
  if (hint) { hint.textContent = 'Project opened ✓'; setTimeout(() => { hint.textContent = _defaultProjectHint() }, 2000) }
}

// ─── Project: import (portable — see Feature C, base64-embedded assets) ───────
// Same underlying restore path as _loadProject(): deserializeState() transparently
// handles both legacy v1.0 and portable v2.0 files, so this differs from Load only in
// its dialog title and hint text (kept distinct for the same UX-clarity reason as
// _exportProject() vs _saveProject()).
async function _importProject() {
  if (_isInteractionBlocked('session')) return false
  const result = await window.api.importProject()
  if (!result) return false
  await _applyProjectData(result.filePath, result.data, { recordRecent: false, webOpened: isWeb() ? 'imported' : false })
  const hint = document.getElementById('project-hint')
  if (hint) { hint.textContent = 'Project imported ✓'; setTimeout(() => { hint.textContent = _defaultProjectHint() }, 2000) }
  return true
}

// ─── Project: reset visualizer/export settings to their hardcoded defaults ────
// Also overwrites last-session.json immediately (not the debounced auto-save path)
// so a relaunch right after reset doesn't restore the pre-reset state.
function _resetToDefaults() {
  if (_isInteractionBlocked('editor')) return
  const alreadyAtDefaults = isVisualizerStateAtDefaults() && isExportSettingsAtDefaults()
  resetExportSettingsToDefaults()
  resetVisualizerStateToDefaults()
  _syncDomFromState(visualizerState, exportSettings)
  clearTimeout(_autoSaveTimer)
  window.api.saveLastSession(_currentLastSessionPayload())
  if (!alreadyAtDefaults) {
    _setDirty()
  }
  const hint = document.getElementById('project-hint')
  if (hint) { hint.textContent = 'Reset to default ✓'; setTimeout(() => { hint.textContent = _defaultProjectHint() }, 2000) }
}

// ─── Project: new session (unload audio + reset settings + clear project file) ─
// A superset of _resetToDefaults(): also unloads whatever audio is currently loaded
// and clears the open-project association, for a true "start from scratch" reset.
function _newSession() {
  if (_isInteractionBlocked('session')) return
  if (_isDirty && !confirm('Discard unsaved changes and start a new session?')) return

  _unloadAudio()
  _resetAudioUI()

  // Clear undo/redo history and the open-project association BEFORE resetting —
  // _resetToDefaults() immediately persists last-session.json, and it must see
  // _projectFilePath already cleared, not the just-abandoned project's path.
  historyManager.clear()
  _projectFilePath = null
  _webSessionKind = null
  _webClean = null
  _syncHistoryButtons()

  // Reset visualizer/export settings to defaults — reuses the existing Reset to
  // Default flow (including its immediate last-session.json overwrite).
  _resetToDefaults()

  _clearDirty()
  _updateTitleBar()
  const hint = document.getElementById('project-hint')
  if (hint) hint.textContent = 'New session ✓'
  if (isWeb()) enterHome()
}

// ─── Register visualizer modes ────────────────────────────────────────────────
canvasEngine.registerMode('bar_mirror',    drawBarMirror)
canvasEngine.registerMode('line_smooth',   drawLineSmooth)
canvasEngine.registerMode('line_fill',     drawLineFill)
canvasEngine.registerMode('radial_pulse',  drawRadialPulse)
canvasEngine.registerMode('spectrum_glow', drawSpectrumGlow)

// ─── Wire canvas engine ───────────────────────────────────────────────────────
canvasEngine.setUpdateScrubber(_updateScrubber)

// ─── Wire style picker ────────────────────────────────────────────────────────
initStylePicker(canvasEngine)

// ─── Wire background file pickers ─────────────────────────────────────────────
backgroundRenderer.initFilePickers(visualizerState.background)

// ─── Wire text overlay controls ───────────────────────────────────────────────
// textOverlay import sets window.textOverlay — canvasEngine picks it up automatically.
initOverlayControls(visualizerState.overlay)

// ─── Wire export button ───────────────────────────────────────────────────────
document.getElementById('btn-export')?.addEventListener('click', () => {
  if (!appState.loaded) return
  _startExportFromUi()
})

function enterHome() {
  const home = document.getElementById('home-screen')
  const studio = document.getElementById('studio')
  if (home) home.hidden = false
  if (studio) studio.hidden = true
  document.body.classList.add('home-active')
  document.body.classList.remove('studio-active')
  document.getElementById('web-session-bar')?.classList.add('hidden')
  document.getElementById('skip-link')?.setAttribute('href', '#home-new')
}

function enterStudio() {
  const home = document.getElementById('home-screen')
  const studio = document.getElementById('studio')
  if (home) home.hidden = true
  if (studio) studio.hidden = false
  document.body.classList.remove('home-active')
  document.body.classList.add('studio-active')
  _updateWebSessionAlert()
  document.getElementById('skip-link')?.setAttribute('href', '#center-panel')
  requestAnimationFrame(() => canvasEngine.refitPreview())
}

function applyWebChrome() {
  if (!isWeb()) {
    enterStudio()
    return
  }
  document.body.dataset.platform = 'web'
  document.querySelectorAll('.desktop-only').forEach(el => el.classList.add('hidden'))
  const label = document.getElementById('btn-export-label')
  if (label) label.textContent = 'Export video'
  const exportHintEl = document.getElementById('export-hint')
  if (exportHintEl && !appState.loaded) {
    exportHintEl.textContent = 'Load an audio file to export WebM'
    btnExport.title = exportHintEl.textContent
  }
  const hint = document.getElementById('project-hint')
  if (hint) hint.textContent = _defaultProjectHint()
  document.getElementById('about-web-note')?.classList.remove('hidden')
  document.getElementById('about-edition')?.classList.remove('hidden')
  document.getElementById('project-web-caption')?.classList.remove('hidden')

  const menuSave = document.querySelector('[data-action="save-project"]')
  const menuLoad = document.querySelector('[data-action="load-project"]')
  if (menuSave) menuSave.textContent = 'Export Project'
  if (menuLoad) menuLoad.textContent = 'Open Project'

  const btnSave = document.getElementById('btn-save-project')
  const btnLoad = document.getElementById('btn-load-project')
  if (btnSave) btnSave.textContent = 'Export'
  if (btnLoad) btnLoad.textContent = 'Open'

  applyWebExportLimitsToDom()
  enterHome()
}

window.addEventListener('beforeunload', e => {
  if (!isWeb()) return
  if (_isDirty) {
    e.preventDefault()
    e.returnValue = ''
  }
})

applyWebChrome()
_syncExportButtonState()

document.getElementById('home-new')?.addEventListener('click', () => enterStudio())
document.getElementById('home-import')?.addEventListener('click', async () => {
  if (await _importProject()) enterStudio()
})

// ─── Wire right-panel export settings controls ────────────────────────────────
function _initExportControls() {
  const presetEl    = document.getElementById('resolution-preset')
  const customGrp   = document.getElementById('custom-res-group')
  const customWEl   = document.getElementById('custom-width')
  const customHEl   = document.getElementById('custom-height')
  const bitrateGrp  = document.getElementById('bitrate-manual-group')
  const bitrateEl   = document.getElementById('manual-bitrate')

  // Resolution preset
  function _applyPreset() {
    const val = presetEl.value
    if (val === 'custom') {
      customGrp.classList.remove('hidden')
      exportSettings.width  = parseInt(customWEl.value)  || 1920
      exportSettings.height = parseInt(customHEl.value)  || 1080
    } else {
      customGrp.classList.add('hidden')
      const [w, h] = val.split('x').map(Number)
      exportSettings.width  = w
      exportSettings.height = h
    }
    canvasEngine.setPreviewAspect(exportSettings.width, exportSettings.height)
  }

  presetEl.addEventListener('change', _applyPreset)
  customWEl.addEventListener('input',   _applyPreset)
  customHEl.addEventListener('input',   _applyPreset)

  // Frame rate
  document.getElementById('export-fps')?.addEventListener('change', e => {
    exportSettings.fps = parseInt(e.target.value) || 30
  })

  // Codec
  document.getElementById('export-codec')?.addEventListener('change', e => {
    exportSettings.codec = e.target.value
  })

  // Encoder override
  document.getElementById('export-encoder')?.addEventListener('change', e => {
    exportSettings.encoder = e.target.value
    _updateEncoderBadge()
  })

  // Audio mode
  document.getElementById('audio-mode')?.addEventListener('change', e => {
    exportSettings.audioMode = e.target.value
  })

  // Bitrate mode radios
  document.querySelectorAll('[name="bitrate-mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const isManual = e.target.value === 'manual'
      bitrateGrp.classList.toggle('hidden', !isManual)
      exportSettings.bitrate = isManual
        ? (parseInt(bitrateEl.value) || 8000)
        : null
    })
  })
  bitrateEl?.addEventListener('input', e => {
    exportSettings.bitrate = parseInt(e.target.value) || null
  })

  // Output path picker — opens a save dialog
  document.getElementById('btn-pick-output')?.addEventListener('click', async () => {
    const filename   = outputFilename?.value || exportSettings.filename || 'spulse.mp4'
    const audioDir   = appState.filePath
      ? appState.filePath.replace(/[\\/][^\\/]+$/, '')
      : ''
    const defaultPath = audioDir ? `${audioDir}/${filename}` : filename
    const picked = await window.api.pickOutputPath(defaultPath)
    if (picked) {
      exportSettings.outputPath = picked
      if (outputFilename) outputFilename.value = picked.replace(/.*[\\/]/, '')
    }
  })

  // If user edits filename inline, clear the explicit output path override
  outputFilename?.addEventListener('input', () => {
    exportSettings.outputPath = ''
  })

  // Ask-on-export toggle
  document.getElementById('ask-on-export')?.addEventListener('change', e => {
    exportSettings.askOnExport = e.target.checked
  })
}

// ─── GPU encoder badge ────────────────────────────────────────────────────────
let _detectedGpu = { label: 'CPU' }

function _updateEncoderBadge() {
  const badge = document.getElementById('encoder-badge')
  if (!badge) return
  const pref  = exportSettings.encoder || 'auto'
  const label = pref === 'auto' ? _detectedGpu.label : pref.toUpperCase()
  badge.textContent = label
  badge.classList.toggle('hw', label !== 'CPU')
}

// ─── Wire export settings controls ───────────────────────────────────────────
_initExportControls()

// ─── Wire project buttons ─────────────────────────────────────────────────────
document.getElementById('btn-save-project')?.addEventListener('click', _saveProject)
document.getElementById('btn-load-project')?.addEventListener('click', _loadProject)
document.getElementById('btn-export-project')?.addEventListener('click', _exportProject)
document.getElementById('btn-import-project')?.addEventListener('click', _importProject)
document.getElementById('btn-reset-defaults')?.addEventListener('click', _resetToDefaults)

// ─── Track changes + history (capture = runs before target listener) ──────────
const _capturePassive = { capture: true, passive: true }
// Left panel: visualizerState changes → history + dirty
document.getElementById('left-panel')?.addEventListener('change', _onPanelControlChange, _capturePassive)
document.getElementById('left-panel')?.addEventListener('input',  _onPanelControlChange, _capturePassive)
// Style picker mode switch (click, not input) → history + dirty
document.getElementById('style-picker')?.addEventListener('click', _onPanelControlChange, _capturePassive)
// Right panel: export/overlay controls → dirty only (not visualizerState, so no history)
document.getElementById('right-panel')?.addEventListener('change', _setDirty, _capturePassive)
document.getElementById('right-panel')?.addEventListener('input',  _setDirty, _capturePassive)

// Auto-save last-used settings on any of the same control changes (debounced).
document.getElementById('left-panel')?.addEventListener('change', _scheduleAutoSaveLastSession, _capturePassive)
document.getElementById('left-panel')?.addEventListener('input',  _scheduleAutoSaveLastSession, _capturePassive)
document.getElementById('style-picker')?.addEventListener('click', _scheduleAutoSaveLastSession, _capturePassive)
document.getElementById('right-panel')?.addEventListener('change', _scheduleAutoSaveLastSession, _capturePassive)
document.getElementById('right-panel')?.addEventListener('input',  _scheduleAutoSaveLastSession, _capturePassive)

// ─── Wire left panel controls ─────────────────────────────────────────────────
initLeftPanel(appState, visualizerState)

// ─── Wire panel tab bars ──────────────────────────────────────────────────────
initPanelTabs(document.getElementById('right-panel'))

// ─── Wire app menu → renderer actions ────────────────────────────────────────
window.api.onMenuNewSession?.(_newSession)
window.api.onMenuResetSettings?.(_resetToDefaults)
window.api.onMenuOpenAudio?.(_openFilePicker)
window.api.onMenuSaveProject?.(_saveProject)
window.api.onMenuLoadProject?.(_loadProject)
window.api.onMenuExportProject?.(_exportProject)
window.api.onMenuImportProject?.(_importProject)
window.api.onOpenProjectFile?.(_openProjectFile)
window.api.onMenuUndo?.(_undo)
window.api.onMenuRedo?.(_redo)

// ─── Custom in-app menu bar (Windows/Linux only) ─────────────────────────────
initMenuBar({
  newSession:             _newSession,
  resetSettings:          _resetToDefaults,
  openFilePicker:         _openFilePicker,
  saveProject:            _saveProject,
  loadProject:            _loadProject,
  exportProject:          _exportProject,
  importProject:          _importProject,
  quit:                   () => window.api.quit(),
  undo:                   _undo,
  redo:                   _redo,
  showAbout:              showAbout,
  checkForUpdatesManually: checkForUpdatesManually,
  openProjectFile:        _openProjectFile,
})

// ─── Init UI components ───────────────────────────────────────────────────────
initErrorDialog()
initAboutScreen()
initConfirmDialog()
initFormatDialog()
initTheme()
_syncHistoryButtons()

// ─── Detect GPU encoders on startup ──────────────────────────────────────────
initUpdateBanner()
if (!isWeb()) {
  window.api.detectGpuEncoders?.().then(info => {
    if (info) { _detectedGpu = info; _updateEncoderBadge() }
  })
}

// ─── Sync DOM + reload audio/background for the auto-loaded session (if any) ─
// Runs last, after every control-wiring call above and after all module-level
// `let`/`const` bindings are initialized (see the auto-load block near the top).
if (_lastSession) {
  _syncDomFromState(visualizerState, exportSettings)
  backgroundRenderer.reloadFromState(visualizerState.background)
  // loadAudio() (inside _reloadAudioFromPath) unconditionally marks state dirty —
  // correct when the user opens new audio, wrong here since we're restoring
  // exactly what was already saved. _clearDirty() after, matching how
  // _applyProjectData() ends every one of its own restore paths the same way.
  await _reloadAudioFromPath(_lastSessionAudioPath)
  _clearDirty()
  _updateTitleBar()
} else if (isWeb()) {
  // Browser refresh is a clean-session boundary: reset the model first, then
  // sync every inspector control so stale browser state cannot leak into the UI.
  resetVisualizerStateToDefaults()
  resetExportSettingsToDefaults()
  _syncDomFromState(visualizerState, exportSettings)
  backgroundRenderer.reloadFromState(visualizerState.background)
  _clearDirty()
  _updateTitleBar()
}
