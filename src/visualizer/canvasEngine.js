import { visualizerState } from './visualizerState.js'
import { Renderer2D }      from './renderer2d.js'
import { drawBarClassic }  from './modes/barClassic.js'

// Mode registry — task-6 calls engine.registerMode() to add the remaining five modes
const MODES = {
  bar_classic: drawBarClassic,
}

class CanvasEngine {
  constructor() {
    this.r2d     = null   // Renderer2D — set after audio loads
    this.running = false
    this._rafId  = null
    this._appState = null

    // FPS tracking
    this._lastTs    = 0
    this._fpsFrames = 0
    this._fpsAccum  = 0
    this._fpsEl     = null  // resolved lazily after DOM ready

    // Registered by renderer.js to avoid circular import
    this._scrubberFn = null

    // Export-mode data override — set by exportPipeline.js during the frame loop
    this._exportFreqData = null
    this._exportTimeData = null

    // Preview aspect ratio override — set by resolution preset picker (task-10)
    this._previewW = null
    this._previewH = null

    window.addEventListener('audio-loaded', e => this._onAudioLoaded(e.detail))
  }

  // Called by renderer.js after its own _updateScrubber function is defined
  setUpdateScrubber(fn) { this._scrubberFn = fn }

  // Task-6 registers each additional mode here
  registerMode(id, fn) { MODES[id] = fn }

  // Switch the active visualizer mode (called by stylePicker + project load)
  setMode(modeId) { visualizerState.mode = modeId }

  // Update CSS preview aspect ratio without changing canvas pixel size (task-10)
  setPreviewAspect(w, h) {
    this._previewW = w
    this._previewH = h
    this._fitWrapper()
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    if (this.running || !this.r2d) return
    this.running = true
    this._lastTs = performance.now()
    this._loop()
  }

  stop() {
    this.running = false
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null }
    // Render one static frame so canvas shows current state while paused
    this._drawFrame(performance.now())
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  _onAudioLoaded(appState) {
    this._appState = appState
    const canvas = document.getElementById('waveform-canvas')
    canvas.width  = 1280
    canvas.height = 720
    this.r2d = new Renderer2D(canvas)
    this._fpsEl = document.getElementById('fps-counter')
    this._fitWrapper()
    window.addEventListener('resize', () => this._fitWrapper())
    // Draw one idle frame immediately so the canvas isn't black
    this._drawFrame(performance.now())
  }

  // Resize the CSS wrapper to fill the canvas-area while keeping the canvas
  // logical aspect ratio (changes when user picks 9:16 or 1:1 in task-10)
  _fitWrapper() {
    const wrapper = document.getElementById('canvas-wrapper')
    const area    = document.getElementById('canvas-area')
    if (!wrapper || !area || !this.r2d) return

    const aw = area.clientWidth  - 40   // 20px padding each side
    const ah = area.clientHeight - 40
    const ratio = (this._previewW ?? this.r2d.width) / (this._previewH ?? this.r2d.height)

    let w, h
    if (aw / ah > ratio) { h = ah; w = h * ratio }
    else                  { w = aw; h = w / ratio }

    wrapper.style.width  = `${Math.floor(w)}px`
    wrapper.style.height = `${Math.floor(h)}px`
  }

  _loop() {
    if (!this.running) return
    this._rafId = requestAnimationFrame(ts => {
      this._drawFrame(ts)
      this._loop()
    })
  }

  _drawFrame(ts) {
    if (!this.r2d || !this._appState) return
    const { analyser, audioLoader } = this._appState
    const { canvas, ctx } = this.r2d
    const W = canvas.width
    const H = canvas.height

    // ── FPS counter (updates every 500 ms) ─────────────────────────────────
    const dt = ts - this._lastTs
    this._lastTs = ts
    if (dt > 0) {
      this._fpsFrames++
      this._fpsAccum += dt
      if (this._fpsAccum >= 500) {
        const fps = Math.round((this._fpsFrames * 1000) / this._fpsAccum)
        if (this._fpsEl) this._fpsEl.textContent = `${fps} fps`
        this._fpsFrames = 0
        this._fpsAccum  = 0
      }
    }

    // ── Background ─────────────────────────────────────────────────────────
    // Task-7 replaces this branch with the full background renderer
    if (window.backgroundRenderer) {
      window.backgroundRenderer.draw(ctx, W, H, visualizerState.background)
    } else {
      ctx.fillStyle = visualizerState.background.color
      ctx.fillRect(0, 0, W, H)
    }

    // ── Waveform ───────────────────────────────────────────────────────────
    const freqData = this._exportFreqData || (analyser ? analyser.getFrequencyData()  : new Uint8Array(1024))
    const timeData = this._exportTimeData || (analyser ? analyser.getTimeDomainData() : new Uint8Array(1024).fill(128))
    const drawFn   = MODES[visualizerState.mode] || MODES.bar_classic
    drawFn(ctx, freqData, timeData, visualizerState, W, H)

    // ── Text overlay ───────────────────────────────────────────────────────
    // Task-8 replaces this with the full textOverlay renderer
    if (window.textOverlay && visualizerState.overlay.enabled) {
      window.textOverlay.draw(ctx, W, H, visualizerState.overlay)
    }

    // ── Scrubber + time ────────────────────────────────────────────────────
    if (this._scrubberFn && audioLoader) {
      this._scrubberFn(analyser ? analyser.currentTime : 0, audioLoader.duration)
    }
  }

  // ─── Export data override (used by exportPipeline.js) ────────────────────
  setExportData(freqData, timeData) {
    this._exportFreqData = freqData
    this._exportTimeData = timeData
  }

  clearExportData() {
    this._exportFreqData = null
    this._exportTimeData = null
  }

  // ─── Export helpers (used by task-9) ──────────────────────────────────────

  // Switch canvas to export resolution; call restorePreview() after export
  setExportResolution(w, h) {
    if (!this.r2d) return
    this.r2d.canvas.width  = w
    this.r2d.canvas.height = h
    this._fitWrapper()
  }

  restorePreviewResolution() {
    if (!this.r2d) return
    this.r2d.canvas.width  = 1280
    this.r2d.canvas.height = 720
    this._fitWrapper()
  }

  // Render one frame synchronously (export pipeline calls this per frame)
  renderSyncFrame() {
    this._drawFrame(performance.now())
  }
}

export const canvasEngine = new CanvasEngine()
window.canvasEngine = canvasEngine
