// Thin Canvas 2D wrapper providing shared draw utilities for all visualizer modes.
export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas
    // willReadFrequently: export (pipe mode) calls getImageData() once per frame.
    // Without this hint, Chromium keeps the canvas GPU-accelerated and getImageData
    // forces a synchronous GPU->CPU framebuffer readback on every call — slow enough
    // to starve the hardware video encoder of frames all over again, just via a
    // different bottleneck than the JPEG round trip this was meant to fix. This hint
    // makes Chromium back the canvas with a software rasterizer instead, so reads are
    // cheap; drawing simple 2D waveform shapes in software is not a meaningful cost.
    this.ctx    = canvas.getContext('2d', { willReadFrequently: true })
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
}
