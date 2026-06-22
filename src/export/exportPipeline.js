// Renderer-side export controller.
// Drives the canvas frame render loop, streams frames to Main via IPC,
// and signals when all frames are sent.
// Uses window.appState to avoid circular import with renderer.js.

import { progressModal }   from './progressModal.js'
import { canvasEngine }    from '../visualizer/canvasEngine.js'
import { exportSettings }  from './exportSettings.js'
import { showErrorDialog } from '../ui/errorDialog.js'

// ─── Offline audio data for export frames ────────────────────────────────────
// Derives time-domain (accurate) and pseudo-frequency data from the raw
// AudioBuffer without requiring real-time AnalyserNode playback.
// Real FFT per-frame analysis is a v1.1 enhancement.
function getAudioDataAtTime(audioLoader, t) {
  const { audioBuffer, amplitudeData } = audioLoader
  const sampleRate  = audioBuffer.sampleRate
  const startSample = Math.floor(t * sampleRate)
  const binCount    = 1024
  const nCh         = audioBuffer.numberOfChannels
  const duration    = audioBuffer.duration

  // Time-domain: actual samples → accurate for line_smooth / line_fill
  const timeData = new Uint8Array(binCount).fill(128)
  for (let i = 0; i < binCount; i++) {
    let mono = 0
    for (let c = 0; c < nCh; c++) mono += audioBuffer.getChannelData(c)[startSample + i] || 0
    timeData[i] = Math.round(((mono / nCh) + 1) * 127.5)
  }

  // Frequency: amplitude-modulated spectral estimate (bass-heavy, like typical music)
  const ovIdx = Math.min(
    Math.floor((t / duration) * amplitudeData.length),
    amplitudeData.length - 1
  )
  const amp = amplitudeData[ovIdx] || 0
  const freqData = new Uint8Array(binCount)
  for (let bin = 0; bin < binCount; bin++) {
    const frac = bin / binCount
    const decay  = Math.exp(-frac * 3.5)                                    // bass rolloff
    const vari   = (Math.sin(bin * 7.3 + ovIdx * 0.13) + 1) / 2            // per-bin variation
    freqData[bin] = Math.min(255, Math.round(amp * (0.35 * decay + 0.65 * vari * decay) * 280))
  }
  return { freqData, timeData }
}

// ─── Read export settings from exportSettings state ───────────────────────────
function readExportSettings() {
  const { width: w, height: h, fps, codec, audioMode, bitrate, outputPath } = exportSettings
  // Filename is still read from the DOM so the user can edit it inline
  const outFilename = document.getElementById('output-filename')?.value?.trim()
    || exportSettings.filename
    || 'waveexport.mp4'
  return { w, h, fps, codec, audioMode, bitrate, outFilename, outputPath }
}

// ─── Export state ─────────────────────────────────────────────────────────────
let _cancelled = false

export async function startExport() {
  const appState = window.appState
  if (!appState?.loaded) return

  _cancelled = false
  const { w, h, fps, codec, audioMode, bitrate, outFilename, outputPath: pickedPath } = readExportSettings()
  const { audioLoader, filePath } = appState
  const duration    = audioLoader.duration
  const totalFrames = Math.ceil(duration * fps)
  const useDisk     = (w >= 3840 || duration >= 180)  // 4K or >3 min → disk frames

  // Use explicitly picked path (from save dialog), or derive from audio source dir
  const audioDir   = filePath.replace(/[\\/][^\\/]+$/, '')
  const outputPath = pickedPath || `${audioDir}/${outFilename}`

  const config = {
    width: w, height: h, fps, codec, audioMode, bitrate,
    audioPath: filePath, outputPath, totalFrames, duration, useDisk,
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
    progressModal.setMessage(`✓ Saved: ${d.outputPath}`)
    setTimeout(() => progressModal.hide(), 3000)
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

    // ── Frame render loop ─────────────────────────────────────────────────────
    for (let frame = 0; frame < totalFrames; frame++) {
      if (_cancelled) break

      const t = frame / fps
      const { freqData, timeData } = getAudioDataAtTime(audioLoader, t)
      canvasEngine.setExportData(freqData, timeData)
      canvasEngine.renderSyncFrame()

      // JPEG is much faster to encode than PNG; quality 0.92 is indistinguishable at target bitrate
      const dataURL = canvasEngine.r2d.toDataURL('image/jpeg', 0.92)
      await window.api.exportFrame(dataURL, frame)
      progressModal.update(frame + 1, totalFrames)
    }

    if (!_cancelled) {
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
  }
}
