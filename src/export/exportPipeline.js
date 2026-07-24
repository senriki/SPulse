// Renderer-side export controller.
// Drives the canvas frame render loop, streams frames to Main via IPC,
// and signals when all frames are sent.
// Uses window.appState to avoid circular import with renderer.js.

import { progressModal }    from './progressModal.js'
import { canvasEngine }     from '../visualizer/canvasEngine.js'
import { exportSettings }   from './exportSettings.js'
import { showErrorDialog }  from '../ui/errorDialog.js'
import { visualizerState }  from '../visualizer/visualizerState.js'
import { analyzeOffline }   from '../audio/offlineFrequencyAnalyser.js'

// Silence fallback for any export frame whose real FFT data wasn't captured
// (export cancelled mid-analysis, or a rendering edge case at the very end of
// the track) — matches AnalyserNode.frequencyBinCount for fftSize=2048.
const SILENT_FREQ = new Uint8Array(1024)
const SILENT_TIME = new Uint8Array(1024).fill(128)

// ─── Read export settings from exportSettings state ───────────────────────────
function readExportSettings() {
  const { width: w, height: h, fps, codec, encoder, audioMode, bitrate, outputPath } = exportSettings
  // Filename is still read from the DOM so the user can edit it inline
  const outFilename = document.getElementById('output-filename')?.value?.trim()
    || exportSettings.filename
    || 'spulse.mp4'
  return { w, h, fps, codec, encoder, audioMode, bitrate, outFilename, outputPath }
}

// ─── Export state ─────────────────────────────────────────────────────────────
let _cancelled  = false
let _exporting  = false

export function isExporting() {
  return _exporting
}

export async function startExport() {
  const appState = window.appState
  if (!appState?.loaded) return
  // Guard against re-entrant calls (double-click, Ctrl+E while exporting) —
  // a second export-video call would kill the in-flight FFmpeg process mid-stream.
  if (_exporting) return
  _exporting  = true
  _cancelled  = false
  const btnExport = document.getElementById('btn-export')
  const btnPlay   = document.getElementById('btn-play-pause')
  if (btnExport) btnExport.disabled = true
  if (btnPlay)   btnPlay.disabled   = true
  const { w, h, fps, codec, encoder, audioMode, bitrate, outFilename, outputPath: pickedPath } = readExportSettings()
  const { audioLoader, filePath } = appState
  const duration    = audioLoader.duration
  const totalFrames = Math.ceil(duration * fps)
  const useDisk     = (w >= 3840 || duration >= 180)  // 4K or >3 min → disk frames

  // Determine output path — ask every time if the option is enabled
  const audioDir = filePath.replace(/[\\/][^\\/]+$/, '')
  let outputPath = pickedPath || `${audioDir}/${outFilename}`

  if (exportSettings.askOnExport) {
    const picked = await window.api.pickOutputPath(outputPath)
    if (!picked) {
      _exporting = false
      if (btnExport) btnExport.disabled = false
      if (btnPlay)   btnPlay.disabled   = false
      return
    }
    outputPath = picked
    exportSettings.outputPath = picked
    const filenameEl = document.getElementById('output-filename')
    if (filenameEl) filenameEl.value = picked.replace(/.*[\\/]/, '')
  }

  const config = {
    width: w, height: h, fps, codec, encoder, audioMode, bitrate,
    audioPath: filePath, outputPath, totalFrames, duration, useDisk,
    // Main auto-renames to avoid overwriting an existing file — unless the user just
    // explicitly confirmed this exact path via the save dialog above this run, which
    // already has its own native overwrite-confirmation prompt.
    confirmedPath: exportSettings.askOnExport,
  }

  // ── Progress modal ──────────────────────────────────────────────────────────
  progressModal.init(() => {
    _cancelled = true
    window.api.exportCancel()
  })
  progressModal.show(totalFrames)

  // Register main-process event handlers
  window.api.removeExportListeners()
  window.api.onExportProgress(d => progressModal.update(d.framesWritten, totalFrames))
  window.api.onExportComplete(d => {
    progressModal.complete(d.outputPath)
  })
  window.api.onExportError(d => {
    progressModal.hide()
    showErrorDialog('Export Failed', d.error || 'FFmpeg returned a non-zero exit code.', d.log || '')
  })

  try {
    // Start FFmpeg in main process
    const startResult = await window.api.exportVideo(config)
    if (!startResult?.ok) throw new Error(startResult?.error || 'Failed to start FFmpeg')

    // Switch canvas to export resolution, pause preview RAF
    canvasEngine.stop()
    canvasEngine.setExportResolution(w, h)

    // Video backgrounds normally autoplay in real time — stop that for export, since
    // per-frame wall-clock cost doesn't track the exported timeline 1:1 (see
    // videoBackground.js). Position is driven explicitly per frame below instead.
    window.backgroundRenderer?.prepareVideoForExport(visualizerState.background)

    // Pre-decode one pass through a looping video background's own duration so the
    // frame loop below can look up frames instead of seeking on every single one —
    // a background video loops many times over a full export, and seekTo() is far
    // too expensive to call once per exported frame. No-op for non-video backgrounds.
    // Run alongside the real per-frame FFT analysis below (independent resources —
    // video element vs. audio graph) so neither adds to the other's prep time.
    progressModal.setMessage('Preparing export…')
    const [, audioFrames] = await Promise.all([
      window.backgroundRenderer?.prepareVideoLoopForExport(visualizerState.background, fps, () => _cancelled),
      // Real FFT per frame via OfflineAudioContext — matches what the live
      // AnalyserNode produces during preview (same fftSize/smoothing), unlike the
      // old synthetic amplitude-modulated approximation this replaced, which
      // consistently produced much shorter bars in export than in preview.
      analyzeOffline(audioLoader.audioBuffer, fps, visualizerState.smoothing / 100, () => _cancelled),
    ])
    // Prep above can take several seconds on its own — reset the timer here so the
    // fps/ETA readout reflects only the per-frame loop below, not diluted by prep time.
    progressModal.resetTimer()
    progressModal.update(0, totalFrames)

    // ── Frame render loop ─────────────────────────────────────────────────────
    for (let frame = 0; frame < totalFrames; frame++) {
      if (_cancelled) break

      const t = frame / fps
      const { freqData, timeData } = audioFrames[frame] || { freqData: SILENT_FREQ, timeData: SILENT_TIME }
      canvasEngine.setExportData(freqData, timeData)
      // Try the pre-decoded loop cache first (cheap lookup); fall back to an
      // explicit seek only if it wasn't available for this position.
      const usedCache = await window.backgroundRenderer?.selectExportFrame(visualizerState.background, t)
      if (!usedCache) await window.backgroundRenderer?.seekVideoTo(visualizerState.background, t)
      canvasEngine.renderSyncFrame()

      // JPEG is much faster to encode than PNG; quality 0.92 is indistinguishable at target bitrate.
      // ArrayBuffer instead of a base64 dataURL — avoids the ~33% size bloat and the
      // extra encode/decode pass base64 costs on both sides of the IPC call.
      const buffer = await canvasEngine.r2d.toArrayBuffer('image/jpeg', 0.92)
      await window.api.exportFrame(buffer, frame)
      progressModal.update(frame + 1, totalFrames)
    }

    if (_cancelled) {
      progressModal.hide()
    } else {
      progressModal.setMessage('Encoding video…')
      await window.api.exportDone()
    }

  } catch (err) {
    progressModal.hide()
    showErrorDialog('Export Error', err.message)
    console.error('Export pipeline error:', err)
  } finally {
    canvasEngine.clearExportData()
    canvasEngine.restorePreviewResolution()
    window.backgroundRenderer?.resumeVideoAfterExport(visualizerState.background)
    _exporting = false
    if (btnExport) btnExport.disabled = false
    if (btnPlay)   btnPlay.disabled   = false
  }
}
