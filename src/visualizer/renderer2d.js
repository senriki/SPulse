// Thin Canvas 2D wrapper providing shared draw utilities for all visualizer modes.
export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas
    // No willReadFrequently hint (removed — was forcing a software rasterizer for
    // the whole canvas, which meant every draw call, not just pixel reads, ran on
    // CPU). Export no longer calls getImageData()/toDataURL() — it uses
    // canvas.toBlob() (see toArrayBuffer() below), which Chromium already encodes
    // off the main thread, so the synchronous-readback problem this hint used to
    // guard against doesn't apply to the current export path. Letting the canvas
    // stay GPU-accelerated speeds up drawing itself (glow/shadowBlur in particular).
    this.ctx    = canvas.getContext('2d')
  }

  get width()  { return this.canvas.width }
  get height() { return this.canvas.height }

  // Fill the entire canvas with a solid color
  clear(color = '#000') {
    this.ctx.fillStyle = color
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  // Apply glow — call clearGlow() when done to avoid bleeding into next draw call
  setGlow(color, blurPx) {
    this.ctx.shadowColor = color
    this.ctx.shadowBlur  = blurPx
  }

  clearGlow() {
    this.ctx.shadowBlur  = 0
    this.ctx.shadowColor = 'transparent'
  }

  // Helpers used by export pipeline to snapshot a frame
  toDataURL(type = 'image/png', quality) {
    return quality !== undefined
      ? this.canvas.toDataURL(type, quality)
      : this.canvas.toDataURL(type)
  }

  toBlob(cb, type = 'image/png', quality) {
    this.canvas.toBlob(cb, type, quality)
  }

  // Export pipeline uses this instead of toDataURL() — skips the ~33% size bloat
  // and extra encode/decode pass that base64 round-tripping through IPC costs,
  // since ArrayBuffer is structured-clonable across contextBridge as-is.
  toArrayBuffer(type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(blob => {
        if (!blob) { reject(new Error('canvas.toBlob() returned null')); return }
        blob.arrayBuffer().then(resolve, reject)
      }, type, quality)
    })
  }
}
