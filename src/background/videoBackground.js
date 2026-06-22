// Manages an offscreen HTMLVideoElement for video backgrounds.
// The video is muted and looping; it plays independently of audio transport.
// For export (task-9): video renders from its current position each frame.
export class VideoBackground {
  constructor() {
    this.el     = null
    this.loaded = false
    this._path  = null
  }

  load(filePath) {
    // Clean up previous element
    if (this.el) {
      this.el.pause()
      this.el.src  = ''
      this.el.load()
    }

    this.loaded = false
    this._path  = filePath

    const video          = document.createElement('video')
    video.muted          = true
    video.loop           = true
    video.playsInline    = true
    video.preload        = 'auto'
    video.crossOrigin    = 'anonymous'
    video.src            = _toFileURL(filePath)

    video.addEventListener('canplay', () => {
      this.loaded = true
      video.play().catch(() => {})
    }, { once: true })

    video.addEventListener('error', e => {
      console.warn('Video background load error:', e)
    })

    video.load()
    this.el = video
  }

  draw(ctx, W, H) {
    if (!this.el || !this.loaded || this.el.readyState < 2) return
    try {
      ctx.drawImage(this.el, 0, 0, W, H)
    } catch {
      // Silently ignore frame-not-ready errors (happens on first frames)
    }
  }

  get path() { return this._path }
}

function _toFileURL(filePath) {
  if (filePath.startsWith('file://')) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}
