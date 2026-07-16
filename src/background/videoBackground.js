// Manages an offscreen HTMLVideoElement for video backgrounds.
// The video is muted and looping; it plays independently of audio transport.
// For export (task-9): video renders from its current position each frame.
import { computeFitRect } from './fitHelpers.js'

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

  // bgState carries fitMode/scale/offsetX/offsetY/color — same shape as the
  // image background state so both share computeFitRect() sizing logic.
  draw(ctx, W, H, bgState = {}) {
    if (!this.el || !this.loaded || this.el.readyState < 2) return
    const vw = this.el.videoWidth
    const vh = this.el.videoHeight
    if (!vw || !vh) return

    const mode  = bgState.fitMode ?? 'cover'
    const scale = bgState.scale   ?? 1
    const offX  = bgState.offsetX ?? 0
    const offY  = bgState.offsetY ?? 0

    try {
      ctx.save()

      if (mode === 'blur-fill') {
        const bg = computeFitRect(vw, vh, W, H, 'cover', 1.15, 0, 0)
        const bleed = 40
        ctx.filter = 'blur(40px)'
        ctx.drawImage(this.el, bg.dx - bleed, bg.dy - bleed, bg.dw + bleed * 2, bg.dh + bleed * 2)
        ctx.filter = 'none'
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(0, 0, W, H)
      } else if (mode === 'contain') {
        ctx.fillStyle = bgState.color || '#0D1117'
        ctx.fillRect(0, 0, W, H)
      }

      const fgMode = mode === 'cover' ? 'cover' : 'contain'
      const fg = computeFitRect(vw, vh, W, H, fgMode, scale, offX, offY)
      ctx.drawImage(this.el, fg.dx, fg.dy, fg.dw, fg.dh)

      ctx.restore()
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
