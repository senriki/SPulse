// Manages an offscreen HTMLVideoElement for video backgrounds.
// The video is muted and looping; it plays independently of audio transport.
// For export (task-9): video renders from its current position each frame.
import { computeFitRect } from './fitHelpers.js'
import { exportSettings } from '../export/exportSettings.js'

// Cap on how many frames prepareExportLoopCache() will pre-decode for a single
// pass through the background video's own duration. A background loop video
// longer than this (e.g. 60s at 60fps) falls back to the old per-export-frame
// seekTo() path instead — still correct, just without the export speedup.
const EXPORT_LOOP_CACHE_MAX_FRAMES = 3600

export class VideoBackground {
  constructor() {
    this.el     = null
    this.loaded = false
    this._path  = null

    // Cached copy of the last successfully-decoded video frame, used as a draw
    // fallback when the live element's readyState transiently dips below
    // HAVE_CURRENT_DATA (happens right as the native `loop` restart seeks back
    // to time 0) — keeps the background visually continuous through that gap
    // instead of skipping the frame outright.
    this._frameCache = null
    this._cacheCtx   = null
    this._cacheW     = 0
    this._cacheH     = 0

    // Export-only: one pass through the video's own (shorter-than-audio) duration,
    // pre-captured as compressed JPEG Blobs (NOT decoded ImageBitmaps — those hold
    // full raw RGBA pixel data, e.g. ~8MB each at 1080p, which adds up to gigabytes
    // for a multi-hundred-frame loop). Built once up front by prepareExportLoopCache()
    // so the per-export-frame loop can look up a frame instead of calling the
    // expensive seekTo()+await('seeked') path thousands of times for a looping
    // background. Only ONE frame is ever decoded to a live ImageBitmap at a time
    // (_decodedIdx/_decodedBitmap below), decoded lazily in selectExportFrame().
    this._exportBlobs       = null
    this._exportCacheFps    = 0
    this._exportCacheW      = 0
    this._exportCacheH      = 0
    this._decodedIdx        = -1
    this._decodedBitmap     = null
    this._activeExportFrame = null
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

    // A new video's first frames must never show the previous video's last cached frame.
    this._frameCache = null
    this._cacheCtx   = null
    this._cacheW     = 0
    this._cacheH     = 0
    this.clearExportLoopCache()

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
    if (!this.el || !this.loaded) return

    // Export fast path: prepareExportLoopCache() + selectExportFrame() (called
    // from exportPipeline's per-frame loop) already picked the right pre-decoded
    // frame — use it directly instead of touching the live element at all.
    const useExportCache = !!this._activeExportFrame

    // readyState can transiently drop below HAVE_CURRENT_DATA right as the
    // native `loop` restart seeks back to time 0. Fall back to the last
    // successfully-decoded frame instead of skipping the paint outright —
    // otherwise the canvas keeps last frame's already-fully-composited pixels,
    // and the waveform/overlay drawn after this get double-composited on top.
    const liveReady = !useExportCache && this.el.readyState >= 2 && this.el.videoWidth && this.el.videoHeight
    const img = useExportCache ? this._activeExportFrame : (liveReady ? this.el : this._frameCache)
    if (!img) return   // nothing drawable yet (only possible before the very first frame)

    const vw = useExportCache ? img.width  : (liveReady ? this.el.videoWidth  : this._cacheW)
    const vh = useExportCache ? img.height : (liveReady ? this.el.videoHeight : this._cacheH)

    const mode  = bgState.fitMode ?? 'cover'
    const scale = bgState.scale   ?? 1
    const offX  = bgState.offsetX ?? 0
    const offY  = bgState.offsetY ?? 0

    // See staticImage.js for why this scale is needed — preview renders on a
    // canvas that matches the target resolution's aspect ratio but may be smaller
    // (capped for performance), so fit math computed in real-target-size space
    // needs a uniform scale down to actual canvas pixel space.
    const targetW = exportSettings.width  || W
    const targetH = exportSettings.height || H

    try {
      ctx.save()
      ctx.scale(W / targetW, H / targetH)

      if (mode === 'blur-fill') {
        const bg = computeFitRect(vw, vh, targetW, targetH, 'cover', 1.15, 0, 0)
        const bleed = 40
        ctx.filter = 'blur(40px)'
        ctx.drawImage(img, bg.dx - bleed, bg.dy - bleed, bg.dw + bleed * 2, bg.dh + bleed * 2)
        ctx.filter = 'none'
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(0, 0, targetW, targetH)
      } else if (mode === 'contain') {
        ctx.fillStyle = bgState.color || '#0D1117'
        ctx.fillRect(0, 0, targetW, targetH)
      }

      const fgMode = mode === 'cover' ? 'cover' : 'contain'
      const fg = computeFitRect(vw, vh, targetW, targetH, fgMode, scale, offX, offY)
      ctx.drawImage(img, fg.dx, fg.dy, fg.dw, fg.dh)

      if (liveReady) this._captureFrameToCache(vw, vh)
    } catch {
      // Silently ignore frame-not-ready errors (happens on first frames)
    } finally {
      // Always balance ctx.save() — an unrestored transform/filter would
      // otherwise leak into every subsequent draw call this frame and beyond.
      ctx.restore()
    }
  }

  // Snapshot the current live video frame into an offscreen canvas so draw()
  // has something to fall back to during a transient readyState dip.
  _captureFrameToCache(vw, vh) {
    if (!this._frameCache || this._cacheW !== vw || this._cacheH !== vh) {
      this._frameCache = document.createElement('canvas')
      this._frameCache.width  = vw
      this._frameCache.height = vh
      this._cacheCtx = this._frameCache.getContext('2d')
      this._cacheW = vw
      this._cacheH = vh
    }
    try {
      this._cacheCtx.drawImage(this.el, 0, 0, vw, vh)
    } catch {
      // Transient decode error — leave the previous cached frame in place
      // rather than corrupt it with a partial/blank draw.
    }
  }

  // ── Export loop cache ──────────────────────────────────────────────────────
  // Background videos are shorter than the audio and loop, but exportPipeline's
  // per-frame seekVideoTo() was calling the expensive currentTime-seek+await
  // path once per EXPORTED frame (e.g. ~12000 times for a 3-3.5min 60fps export)
  // instead of once per LOOP frame. Pre-capturing one full pass through the
  // video's own duration up front turns that into a few hundred seeks plus cheap
  // lookups for the rest of the export. Frames are kept as compressed JPEG Blobs
  // (tens/hundreds of KB each) rather than decoded ImageBitmaps (full raw RGBA,
  // ~8MB each at 1080p) — decoding happens lazily, one frame at a time, in
  // selectExportFrame(), so resident memory stays bounded regardless of loop length.

  // Called once before the export frame loop starts. Returns true if the cache
  // was built and selectExportFrame() can be used; false means the caller should
  // keep using the old per-frame seekVideoTo() path (e.g. loop too long to cache).
  // shouldAbort is polled between frames so a user cancel during this (potentially
  // several-second) prep phase takes effect immediately instead of after it finishes.
  async prepareExportLoopCache(fps, shouldAbort) {
    this.clearExportLoopCache()
    if (!this.el || !this.loaded || !this.el.duration || !this.el.videoWidth || !this.el.videoHeight) {
      return false
    }

    const duration   = this.el.duration
    const frameCount = Math.max(1, Math.round(duration * fps))
    if (frameCount > EXPORT_LOOP_CACHE_MAX_FRAMES) return false

    // Cache at whichever is smaller of the video's native resolution and the
    // export target resolution — caching above the target is pure waste since
    // draw() never composites more pixels than that, and background videos are
    // often shot at a higher resolution than a given export target (e.g. a 4K
    // stock clip behind a 1080p export).
    const nativeW = this.el.videoWidth
    const nativeH = this.el.videoHeight
    const targetW = exportSettings.width  || nativeW
    const targetH = exportSettings.height || nativeH
    const scale   = Math.min(1, targetW / nativeW, targetH / nativeH)
    const vw = Math.max(1, Math.round(nativeW * scale))
    const vh = Math.max(1, Math.round(nativeH * scale))

    const scratch    = document.createElement('canvas')
    scratch.width    = vw
    scratch.height   = vh
    const scratchCtx = scratch.getContext('2d')

    const blobs = new Array(frameCount)
    for (let i = 0; i < frameCount; i++) {
      if (shouldAbort?.()) break   // leftover entries stay undefined — selectExportFrame()
                                    // reports a miss for them, which is moot once cancelled
      const t = Math.min(i / fps, Math.max(duration - 0.001, 0))
      await this.seekTo(t)
      try {
        scratchCtx.drawImage(this.el, 0, 0, vw, vh)
        blobs[i] = await new Promise(resolve => scratch.toBlob(resolve, 'image/jpeg', 0.85))
      } catch {
        blobs[i] = null   // leave this loop position uncached — selectExportFrame() will
                           // report a miss for it and the caller falls back to seekVideoTo()
      }
    }

    // If nothing captured successfully, don't pretend the cache is usable.
    if (blobs.every(b => !b)) return false

    this._exportBlobs    = blobs
    this._exportCacheFps = fps
    this._exportCacheW   = vw
    this._exportCacheH   = vh
    return true
  }

  // Point draw() at the pre-captured frame for timeline position `t`, decoding it
  // first if it isn't the one already decoded. Returns false (no cache, or this
  // exact loop position wasn't captured) — the caller should fall back to
  // seekVideoTo(t) in that case. Async because decode (createImageBitmap) is.
  async selectExportFrame(t) {
    this._activeExportFrame = null
    if (!this._exportBlobs || !this.el?.duration) return false
    const idx = Math.min(
      this._exportBlobs.length - 1,
      Math.floor((t % this.el.duration) * this._exportCacheFps)
    )
    const blob = this._exportBlobs[idx]
    if (!blob) return false

    // Consecutive export frames very often land on the same loop-cache index
    // (whenever the video's effective frame rate is lower than the export fps) —
    // skip re-decoding in that case instead of paying the decode cost every time.
    if (this._decodedIdx !== idx) {
      try {
        const bitmap = await createImageBitmap(blob)
        this._decodedBitmap?.close?.()
        this._decodedBitmap = bitmap
        this._decodedIdx    = idx
      } catch {
        this._decodedBitmap = null
        this._decodedIdx    = -1
        return false
      }
    }

    this._activeExportFrame = this._decodedBitmap
    return true
  }

  // Free the pre-captured frames — call once export finishes (success, failure, or cancel).
  clearExportLoopCache() {
    this._decodedBitmap?.close?.()
    this._exportBlobs       = null
    this._exportCacheFps    = 0
    this._exportCacheW      = 0
    this._exportCacheH      = 0
    this._decodedIdx        = -1
    this._decodedBitmap     = null
    this._activeExportFrame = null
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
