import { drawSolidColor }  from './solidColor.js'
import { drawGradient }    from './gradient.js'
import { drawStaticImage } from './staticImage.js'
import { VideoBackground } from './videoBackground.js'

function _toFileURL(filePath) {
  if (filePath.startsWith('file://')) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

function _drawImageThumb(img, canvasId) {
  const thumb = document.getElementById(canvasId)
  if (!thumb) return
  thumb.width = 160; thumb.height = 90
  const tc = thumb.getContext('2d')
  const scale = Math.max(160 / img.naturalWidth, 90 / img.naturalHeight)
  const sw = img.naturalWidth * scale, sh = img.naturalHeight * scale
  tc.drawImage(img, (160 - sw) / 2, (90 - sh) / 2, sw, sh)
  thumb.classList.remove('hidden')
}

function _captureVideoThumb(vidEl, canvasId) {
  const capture = () => {
    const thumb = document.getElementById(canvasId)
    if (!thumb) return
    try {
      thumb.width = 160; thumb.height = 90
      thumb.getContext('2d').drawImage(vidEl, 0, 0, 160, 90)
      thumb.classList.remove('hidden')
    } catch {}
    window.canvasEngine?.stop()
  }
  if (vidEl.readyState >= 2) {
    capture()
  } else {
    vidEl.addEventListener('canplay', capture, { once: true })
  }
}

class BackgroundRenderer {
  constructor() {
    this._videoBg = new VideoBackground()
  }

  // Called every canvas frame by canvasEngine (via window.backgroundRenderer hook)
  draw(ctx, W, H, bgState) {
    switch (bgState.type) {
      case 'gradient':
        drawGradient(ctx, W, H, bgState)
        break
      case 'image':
        if (bgState.imageEl) drawStaticImage(ctx, W, H, bgState)
        else                  drawSolidColor(ctx, W, H, bgState)
        break
      case 'video':
        if (this._videoBg.loaded) this._videoBg.draw(ctx, W, H)
        else                      drawSolidColor(ctx, W, H, bgState)
        break
      default: // 'solid' and fallback
        drawSolidColor(ctx, W, H, bgState)
    }
  }

  // Reload image/video elements from stored paths (called after project load).
  reloadFromState(bgState) {
    if (bgState.imagePath) {
      const img = new Image()
      img.src = _toFileURL(bgState.imagePath)
      img.onload = () => {
        bgState.imageEl = img
        _drawImageThumb(img, 'bg-image-thumb')
        window.canvasEngine?.stop()
      }
      img.onerror = () => console.warn('Could not reload background image:', bgState.imagePath)
    }
    if (bgState.videoPath) {
      this._videoBg.load(bgState.videoPath)
      const vidEl = this._videoBg.el
      if (vidEl) _captureVideoThumb(vidEl, 'bg-video-thumb')
    }
  }

  // Wire file picker buttons. Called from renderer.js after DOM is ready.
  initFilePickers(bgState) {
    // ── Image picker ────────────────────────────────────────────────────────
    const btnImg  = document.getElementById('btn-pick-bg-image')
    const imgName = document.getElementById('bg-image-name')

    btnImg?.addEventListener('click', async () => {
      const filePath = await window.api.openFileDialog({
        title:      'Choose Background Image',
        extensions: ['jpg', 'jpeg', 'png', 'webp'],
      })
      if (!filePath) return

      if (imgName) imgName.textContent = filePath.split(/[\\/]/).pop()

      const img = new Image()
      img.src = _toFileURL(filePath)
      img.onload = () => {
        bgState.imageEl   = img
        bgState.imagePath = filePath
        _drawImageThumb(img, 'bg-image-thumb')
        window.canvasEngine?.stop()
      }
      img.onerror = () => console.warn('Failed to load background image:', filePath)
    })

    // ── Video picker ────────────────────────────────────────────────────────
    const btnVid  = document.getElementById('btn-pick-bg-video')
    const vidName = document.getElementById('bg-video-name')

    btnVid?.addEventListener('click', async () => {
      const filePath = await window.api.openFileDialog({
        title:      'Choose Background Video',
        extensions: ['mp4', 'mov', 'webm'],
      })
      if (!filePath) return

      this._videoBg.load(filePath)
      bgState.videoPath = filePath
      if (vidName) vidName.textContent = filePath.split(/[\\/]/).pop()

      const vidEl = this._videoBg.el
      if (vidEl) _captureVideoThumb(vidEl, 'bg-video-thumb')
    })
  }
}

export const backgroundRenderer = new BackgroundRenderer()

// Expose as global so canvasEngine._drawFrame can find it without a circular import
window.backgroundRenderer = backgroundRenderer
