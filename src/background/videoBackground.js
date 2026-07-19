// Manages an offscreen HTMLVideoElement for video backgrounds.
// The video is muted and looping; it plays independently of audio transport.
// For export (task-9): video renders from its current position each frame.
import { computeFitRect } from './fitHelpers.js'
import { exportSettings } from '../export/exportSettings.js'

export class VideoBackground {
  constructor() {
    this.el     = null
    this.loaded = false
    this._path  = null
  }

  // onError is optional — called once if the video fails to load (missing file,
  // unsupported codec, or corrupt data). Used by backgroundRenderer.reloadFromState()
  // to surface a "not found" hint; the manual file-picker path doesn't need it since
  // the user gets immediate visual feedback there (no thumbnail/preview appears).
  load(filePath, onError) {
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
      onError?.()
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

    // See staticImage.js for why this compensating scale is needed — preview
    // always renders on a fixed 1280x720 bitmap regardless of the selected
    // resolution, and gets CSS-stretched to the real aspect ratio afterward.
    const targetW = exportSettings.width  || W
    const targetH = exportSettings.height || H

    try {
      ctx.save()
      ctx.scale(W / targetW, H / targetH)

      if (mode === 'blur-fill') {
        const bg = computeFitRect(vw, vh, targetW, targetH, 'cover', 1.15, 0, 0)
        const bleed = 40
        ctx.filter = 'blur(40px)'
        ctx.drawImage(this.el, bg.dx - bleed, bg.dy - bleed, bg.dw + bleed * 2, bg.dh + bleed * 2)
        ctx.filter = 'none'
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(0, 0, targetW, targetH)
      } else if (mode === 'contain') {
        ctx.fillStyle = bgState.color || '#0D1117'
        ctx.fillRect(0, 0, targetW, targetH)
      }

      const fgMode = mode === 'cover' ? 'cover' : 'contain'
      const fg = computeFitRect(vw, vh, targetW, targetH, fgMode, scale, offX, offY)
      ctx.drawImage(this.el, fg.dx, fg.dy, fg.dw, fg.dh)

      ctx.restore()
    } catch {
      // Silently ignore frame-not-ready errors (happens on first frames)
    }
  }

  get path() { return this._path }

  // Deterministically position the video for one export frame instead of letting it
  // autoplay in real time. Export's per-frame wall-clock cost doesn't track 1:1 with
  // the exported timeline (worse at higher fps, since more frames must be generated
  // per second of content) — an autoplaying video drifts further from the intended
  // position the longer export takes, which is what made exported video backgrounds
  // play back sped up. `t` loops via modulo against the video's own duration, matching
  // the element's `loop = true` behavior.
  seekTo(t) {
    if (!this.el || !this.loaded || !this.el.duration) return Promise.resolve()
    const target = t % this.el.duration
    if (Math.abs(this.el.currentTime - target) < 0.001) return Promise.resolve()
    return new Promise(resolve => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        this.el.removeEventListener('seeked', finish)
        resolve()
      }
      this.el.addEventListener('seeked', finish)
      this.el.currentTime = target
      // Safety net — some codecs/drivers can fail to fire 'seeked' in rare cases;
      // don't let one bad seek hang the whole export.
      setTimeout(finish, 500)
    })
  }

  // Export brackets — pause real-time autoplay before driving position via seekTo(),
  // resume normal autoplay afterward so live preview behaves as it always has.
  pauseForExport()   { this.el?.pause() }
  resumeAfterExport() {
    if (this.el && this.loaded) this.el.play().catch(() => {})
  }
}

function _toFileURL(filePath) {
  if (filePath.startsWith('file://')) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}
