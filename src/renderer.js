import { AudioLoader }     from './audio/audioLoader.js'
import { AudioAnalyser }   from './audio/audioAnalyser.js'
import { canvasEngine }    from './visualizer/canvasEngine.js'
import { visualizerState } from './visualizer/visualizerState.js'
import { initLeftPanel }   from './controls/leftPanel.js'
import { initPanelTabs }   from './controls/panelTabs.js'
import { initStylePicker }      from './controls/stylePicker.js'
import { backgroundRenderer }   from './background/backgroundRenderer.js'
import { textOverlay }          from './overlay/textOverlay.js'
import { initOverlayControls }  from './controls/overlayControls.js'
import { startExport }               from './export/exportPipeline.js'
import { exportSettings }            from './export/exportSettings.js'
import { serializeState, deserializeState } from './project/projectManager.js'
import { historyManager }                  from './history/historyManager.js'
import { initErrorDialog }                 from './ui/errorDialog.js'
import { initAboutScreen }                 from './ui/aboutScreen.js'
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

// ─── Project state ────────────────────────────────────────────────────────────
let _projectFilePath = null   // path of the currently open .spx file
let _isDirty         = false  // true when state has changed since last save/load

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
const exportHint    = document.getElementById('export-hint')
const audioInfoEmpty = document.getElementById('audio-info-empty')
const btnFullscreen = document.getElementById('btn-fullscreen')
const toggleLeftPanel  = document.getElementById('toggle-left-panel')
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
async function loadAudio(arrayBuffer, filePath) {
  _setDropMessage('⟳ Decoding…', true)

  try {
    const loader = new AudioLoader()
    await loader.load(arrayBuffer, filePath)

    const analyser = new AudioAnalyser(loader.audioContext)
    analyser.setBuffer(loader.audioBuffer)
    analyser.onEnded = () => _onPlaybackEnded()

    appState.loaded      = true
    appState.filePath    = filePath
    appState.fileName    = loader.fileName
    appState.audioLoader = loader
    appState.analyser    = analyser

    _updateMetaUI(loader)
    _enableTransport(loader.duration)
    dropOverlay.classList.add('hidden')

    // Pre-fill overlay text fields with parsed metadata
    // Setting .value directly doesn't fire 'input', so mirror into state too
    if (overlayTitle  && loader.metadata.title) {
      overlayTitle.value = loader.metadata.title
      visualizerState.overlay.title = loader.metadata.title
    }
    if (overlayArtist && loader.metadata.artist) {
      overlayArtist.value = loader.metadata.artist
      visualizerState.overlay.artist = loader.metadata.artist
    }

    // Suggest default output filename and sync exportSettings
    const baseName = loader.fileName.replace(/\.[^.]+$/, '')
    const defaultFilename = `${baseName}-spulse.mp4`
    if (outputFilename) outputFilename.value = defaultFilename
    exportSettings.filename    = defaultFilename
    exportSettings.outputPath  = ''   // clear any previous explicit path

    // Notify canvas engine (task-4 listens for this)
    window.dispatchEvent(new CustomEvent('audio-loaded', { detail: appState }))
    _setDirty()
  } catch (err) {
    console.error('Audio decode failed:', err)
    _setDropMessage('✕ Could not decode file', false)
    setTimeout(() => _resetDropMessage(), 2500)
  }
}

// ─── Metadata UI update ───────────────────────────────────────────────────────
function _updateMetaUI(loader) {
  metaTitle.textContent    = loader.metadata.title  || '—'
  metaArtist.textContent   = loader.metadata.artist || '—'
  metaFormat.textContent   = loader.metadata.format
  metaDuration.textContent = _fmtTime(loader.duration)
  audioInfoEmpty.classList.add('hidden')
  audioMeta.classList.remove('hidden')
}

function _enableTransport(duration) {
  btnPlay.disabled   = false
  btnExport.disabled = false
  exportHint.textContent = 'Ready to export'
  timeTotal.textContent  = _fmtTime(duration)
  timeCurrent.textContent = '0:00'
}

// ─── Play / Pause ─────────────────────────────────────────────────────────────
function _togglePlayback() {
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
  if (!appState.analyser?.isPlaying) return
  appState.analyser.pause()
  canvasEngine.stop()
  _syncPlayIcon(false)
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
}

let _scrubbing = false
scrubberTrack.addEventListener('mousedown', e => {
  if (!appState.analyser) return
  _scrubbing = true
  _seekFromEvent(e)
})
document.addEventListener('mousemove', e => {
  if (!_scrubbing) return
  _seekFromEvent(e)
})
document.addEventListener('mouseup', () => { _scrubbing = false })

function _seekFromEvent(e) {
  const rect = scrubberTrack.getBoundingClientRect()
  const pct  = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
  const time = pct * (appState.audioLoader?.duration ?? 0)
  appState.analyser.seek(time)
  _updateScrubber(time, appState.audioLoader?.duration ?? 0)
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
    // space (see staticImage.js / videoBackground.js), not the raw 1280x720
    // preview bitmap — convert the screen-pixel drag delta accordingly.
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
  dropZone.classList.remove('drag-over')

  const file = e.dataTransfer.files[0]
  if (!file || !_isAudioFile(file.name)) {
    _flashDropMessage('✕ Not a supported audio file')
    return
  }

  const arrayBuffer = await file.arrayBuffer()
  // Electron exposes file.path for dropped files
  await loadAudio(arrayBuffer, file.path || file.name)
})

// ─── File picker (button + Ctrl+O) ───────────────────────────────────────────
async function _openFilePicker() {
  const result = await window.api.openAudioFile()
  if (!result) return

  // result.buffer arrives as Uint8Array via structured clone (contextBridge)
  const u8  = result.buffer instanceof Uint8Array ? result.buffer : new Uint8Array(Object.values(result.buffer))
  const ab  = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
  await loadAudio(ab, result.filePath)
}

btnOpenAudio.addEventListener('click', _openFilePicker)

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey

  if (ctrl && e.key === 'o') { e.preventDefault(); _openFilePicker() }
  if (ctrl && e.key === 's') { e.preventDefault(); _saveProject() }
  if (ctrl && e.key === 'e') { e.preventDefault(); if (appState.loaded) { _pauseForExport(); startExport() } }
  if (ctrl && e.key === 'z') { e.preventDefault(); _undo() }
  if (ctrl && e.key === 'y') { e.preventDefault(); _redo() }
  if (ctrl && e.key === 'q') { e.preventDefault(); window.api.quit() }
  if (e.key === 'F11') { e.preventDefault(); _toggleFullscreen() }

  if (e.key === ' ' && !e.target.matches('input, textarea, select')) {
    e.preventDefault()
    _togglePlayback()
  }
  if (e.key === 'Escape') {
    document.getElementById('error-modal')?.classList.add('hidden')
    document.getElementById('about-modal')?.classList.add('hidden')
  }
})

btnPlay.addEventListener('click', _togglePlayback)

// ─── Fullscreen ──────────────────────────────────────────────────────────────
function _toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen()
}

document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement
  btnFullscreen?.querySelector('.icon-fs-enter')?.classList.toggle('hidden', isFs)
  btnFullscreen?.querySelector('.icon-fs-exit')?.classList.toggle('hidden', !isFs)
  btnFullscreen?.setAttribute('title', isFs ? 'Exit Fullscreen (F11)' : 'Toggle Fullscreen (F11)')
})

btnFullscreen?.addEventListener('click', _toggleFullscreen)

// ─── Collapsible side panels ──────────────────────────────────────────────────
const leftPanelEl  = document.getElementById('left-panel')
const rightPanelEl = document.getElementById('right-panel')
let _leftPanelCollapsed  = false
let _rightPanelCollapsed = false

function _applyPanelWidths() {
  const l = _leftPanelCollapsed  ? '0px' : 'var(--panel-left-width)'
  const r = _rightPanelCollapsed ? '0px' : 'var(--panel-right-width)'
  if (appLayout) appLayout.style.gridTemplateColumns = `${l} 1fr ${r}`
}

// Wait for the collapse transition to finish before re-measuring canvas-area —
// clientWidth still reports the pre-transition size if read synchronously.
appLayout?.addEventListener('transitionend', e => {
  if (e.propertyName === 'grid-template-columns') canvasEngine.refitPreview()
})

toggleLeftPanel?.addEventListener('click', () => {
  _leftPanelCollapsed = !_leftPanelCollapsed
  _applyPanelWidths()
  leftPanelEl?.classList.toggle('collapsed', _leftPanelCollapsed)
  toggleLeftPanel.classList.toggle('collapsed', _leftPanelCollapsed)
  toggleLeftPanel.title = _leftPanelCollapsed ? 'Expand panel' : 'Collapse panel'
})

toggleRightPanel?.addEventListener('click', () => {
  _rightPanelCollapsed = !_rightPanelCollapsed
  _applyPanelWidths()
  rightPanelEl?.classList.toggle('collapsed', _rightPanelCollapsed)
  toggleRightPanel.classList.toggle('collapsed', _rightPanelCollapsed)
  toggleRightPanel.title = _rightPanelCollapsed ? 'Expand panel' : 'Collapse panel'
})

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
    barWidth: snap.barWidth, barGap: snap.barGap, lineWidth: snap.lineWidth,
    padding: snap.padding, smoothing: snap.smoothing,
    sensitivity: snap.sensitivity ?? 1.0,
    centerVertically: snap.centerVertically, yOffset: snap.yOffset,
  })
  Object.assign(visualizerState.background, snap.background)
  visualizerState.background.imageEl = null
  visualizerState.background.videoEl = null
  Object.assign(visualizerState.overlay, snap.overlay)
  backgroundRenderer.reloadFromState(visualizerState.background)
  _syncDomFromState(visualizerState, exportSettings)
}

function _undo() {
  const snap = historyManager.undo(_snapshotVS())
  if (!snap) return
  _applySnapshot(snap)
  _setDirty()
}

function _redo() {
  const snap = historyManager.redo(_snapshotVS())
  if (!snap) return
  _applySnapshot(snap)
  _setDirty()
}

// Combined handler: snapshot before the change, then mark dirty.
// Runs in capture phase so visualizerState still holds the PRE-change value.
function _onPanelControlChange() {
  if (!_historyTimer) historyManager.push(_snapshotVS())
  clearTimeout(_historyTimer)
  _historyTimer = setTimeout(() => { _historyTimer = null }, 500)
  _setDirty()
}

// ─── Project: dirty tracking & title bar ─────────────────────────────────────
function _setDirty() {
  if (_isDirty) return
  _isDirty = true
  _updateTitleBar()
}

function _clearDirty() {
  _isDirty = false
  _updateTitleBar()
}

function _updateTitleBar() {
  if (!_projectFilePath) { document.title = 'SPulse'; return }
  const name = _projectFilePath.replace(/.*[\\/]/, '').replace(/\.spx$/i, '')
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

  // Waveform color + hex
  set('waveform-color', vs.color)
  set('waveform-color-hex', vs.color.toUpperCase())

  // Waveform sliders
  const opPct = Math.round(vs.opacity * 100)
  set('waveform-opacity', opPct); txt('waveform-opacity-val', `${opPct}%`)
  set('waveform-glow', vs.glow); txt('waveform-glow-val', `${vs.glow}%`)
  set('bar-width', vs.barWidth); txt('bar-width-val', `${vs.barWidth}px`)
  set('bar-gap', vs.barGap); txt('bar-gap-val', `${vs.barGap}px`)
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
  const defaultPath = _projectFilePath || (
    appState.fileName
      ? appState.fileName.replace(/\.[^.]+$/, '') + '.spx'
      : 'project.spx'
  )
  const data      = serializeState(appState.filePath || '')
  const savedPath = await window.api.saveProject(data, defaultPath)
  if (!savedPath) return   // user cancelled
  _projectFilePath = savedPath
  _clearDirty()
  const hint = document.getElementById('project-hint')
  if (hint) { hint.textContent = 'Saved ✓'; setTimeout(() => { hint.textContent = 'Ctrl+S to save' }, 2000) }
}

// ─── Project: load ────────────────────────────────────────────────────────────
async function _loadProject() {
  const result = await window.api.loadProject()
  if (!result) return   // user cancelled

  const { filePath: projectPath, data } = result

  // Re-load the audio file stored in the project (no dialog)
  if (data.audioPath) {
    const audioResult = await window.api.loadAudioPath(data.audioPath)
    if (audioResult?.error) {
      const hint = document.getElementById('project-hint')
      if (hint) hint.textContent = `Audio not found: ${data.audioPath.replace(/.*[\\/]/, '')}`
    } else if (audioResult) {
      const u8 = audioResult.buffer instanceof Uint8Array
        ? audioResult.buffer
        : new Uint8Array(Object.values(audioResult.buffer))
      const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
      await loadAudio(ab, audioResult.filePath)
    }
  }

  // Restore all visualizer + export state (overrides anything loadAudio defaulted)
  deserializeState(data)

  // Sync all DOM controls to the restored state
  _syncDomFromState(visualizerState, exportSettings)

  // Reload background image/video from stored paths
  backgroundRenderer.reloadFromState(visualizerState.background)

  _projectFilePath = projectPath
  _clearDirty()
  const hint = document.getElementById('project-hint')
  if (hint) { hint.textContent = 'Project loaded ✓'; setTimeout(() => { hint.textContent = 'Ctrl+S to save' }, 2000) }
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
document.getElementById('btn-export')?.addEventListener('click', () => { _pauseForExport(); startExport() })

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

// ─── Wire left panel controls ─────────────────────────────────────────────────
initLeftPanel(appState, visualizerState)

// ─── Wire panel tab bars ──────────────────────────────────────────────────────
initPanelTabs(document.getElementById('left-panel'))
initPanelTabs(document.getElementById('right-panel'))

// ─── Wire app menu → renderer actions ────────────────────────────────────────
window.api.onMenuOpenAudio?.(_openFilePicker)
window.api.onMenuSaveProject?.(_saveProject)
window.api.onMenuLoadProject?.(_loadProject)
window.api.onMenuUndo?.(_undo)
window.api.onMenuRedo?.(_redo)

// ─── Init UI components ───────────────────────────────────────────────────────
initErrorDialog()
initAboutScreen()

// ─── Detect GPU encoders on startup ──────────────────────────────────────────
window.api.detectGpuEncoders?.().then(info => {
  if (info) { _detectedGpu = info; _updateEncoderBadge() }
})

// ─── Auto-update banner ───────────────────────────────────────────────────────
;(function _initUpdateBanner() {
  const bar         = document.getElementById('update-bar')
  const msgEl       = document.getElementById('update-msg')
  const progressWrap= document.getElementById('update-progress-wrap')
  const progressFill= document.getElementById('update-progress-fill')
  const btnUpdateNow= document.getElementById('btn-update-now')
  const btnInstall  = document.getElementById('btn-update-install')
  const btnDismiss  = document.getElementById('btn-update-dismiss')
  if (!bar) return

  const DISMISSED_KEY = 'spulse-dismissed-update-version'
  // Set while a banner is showing an available-but-not-yet-downloading update —
  // dismissing in that state remembers the version so it doesn't nag again.
  let _pendingVersion = null
  // A manual "Check for Updates…" click always shows the result, even for a
  // version the user previously dismissed on auto-check.
  let _manualCheck = false

  function _show(msg) {
    msgEl.textContent = msg
    bar.classList.remove('hidden')
  }

  btnDismiss.addEventListener('click', () => {
    if (_pendingVersion) {
      localStorage.setItem(DISMISSED_KEY, _pendingVersion)
      _pendingVersion = null
    }
    bar.classList.add('hidden')
  })

  btnUpdateNow.addEventListener('click', () => {
    _pendingVersion = null
    btnUpdateNow.classList.add('hidden')
    progressWrap.classList.remove('hidden')
    msgEl.textContent = 'Mengunduh update… 0%'
    window.api.downloadUpdate?.()
  })

  btnInstall.addEventListener('click', () => window.api.installUpdate?.())

  let _dismissTimer = null
  function _autoDismiss(ms = 3000) {
    clearTimeout(_dismissTimer)
    _dismissTimer = setTimeout(() => bar.classList.add('hidden'), ms)
  }

  window.api.onUpdateNotAvailable?.(() => {
    _manualCheck = false
    progressWrap.classList.add('hidden')
    btnUpdateNow.classList.add('hidden')
    btnInstall.classList.add('hidden')
    _show('Sudah versi terbaru')
    _autoDismiss(3000)
  })

  window.api.onUpdateAvailable?.(({ version }) => {
    clearTimeout(_dismissTimer)
    if (!_manualCheck && localStorage.getItem(DISMISSED_KEY) === version) return
    _manualCheck = false

    _pendingVersion = version
    _show(`Versi ${version} tersedia`)
    progressWrap.classList.add('hidden')
    btnInstall.classList.add('hidden')
    btnUpdateNow.classList.remove('hidden')
  })

  window.api.onUpdateProgress?.(({ percent }) => {
    progressFill.style.width = `${percent}%`
    msgEl.textContent = `Mengunduh update… ${percent}%`
  })

  window.api.onUpdateDownloaded?.(({ version }) => {
    progressWrap.classList.add('hidden')
    btnUpdateNow.classList.add('hidden')
    btnInstall.classList.remove('hidden')
    _show(`Update ${version} siap diinstall`)
  })

  window.api.onMenuCheckUpdates?.(() => {
    _pendingVersion = null
    _manualCheck = true
    _show('Memeriksa update…')
    bar.classList.remove('hidden')
    progressWrap.classList.add('hidden')
    btnUpdateNow.classList.add('hidden')
    btnInstall.classList.add('hidden')
    window.api.checkForUpdates?.()
  })
}())
