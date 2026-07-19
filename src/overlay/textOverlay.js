// Text overlay singleton — drawn as the top-most layer each canvas frame.
// Set as window.textOverlay so canvasEngine can call it without a circular import.
import { exportSettings } from '../export/exportSettings.js'

const MARGIN = 40  // px from the target resolution's edges

export const textOverlay = {
  draw(ctx, W, H, overlayState) {
    const { title, artist, titleFont, artistFont, titleSize, artistSize, color, opacity, position, x, y } = overlayState
    if (!title && !artist) return

    // Live preview renders on a canvas matching the target resolution's aspect ratio
    // but possibly smaller (capped for performance — see staticImage.js for the full
    // explanation). Position/size math needs to happen against the real target
    // resolution, then get scaled down uniformly to actual canvas pixel space.
    const targetW = exportSettings.width  || W
    const targetH = exportSettings.height || H

    const lineGap = Math.round(titleSize * 0.2)

    // Resolve anchor coordinates and text alignment from position setting
    let tx, tyTitle, tyArtist, align

    switch (position) {
      case 'top-left':
        tx       = MARGIN
        tyTitle  = MARGIN + titleSize
        tyArtist = tyTitle + lineGap + artistSize
        align    = 'left'
        break

      case 'top-center':
        tx       = targetW / 2
        tyTitle  = MARGIN + titleSize
        tyArtist = tyTitle + lineGap + artistSize
        align    = 'center'
        break

      case 'bottom-center':
        tx       = targetW / 2
        tyArtist = targetH - MARGIN
        tyTitle  = tyArtist - lineGap - artistSize
        align    = 'center'
        break

      case 'custom':
        tx       = x
        tyTitle  = y
        tyArtist = y + titleSize + lineGap
        align    = 'left'
        break

      default: // 'bottom-left'
        tx       = MARGIN
        tyArtist = targetH - MARGIN
        tyTitle  = tyArtist - lineGap - artistSize
        align    = 'left'
    }

    // When no artist, keep title at bottom edge
    if (!artist && (position === 'bottom-left' || position === 'bottom-center')) {
      tyTitle = targetH - MARGIN
    }

    ctx.save()
    ctx.scale(W / targetW, H / targetH)
    ctx.textBaseline  = 'alphabetic'
    ctx.textAlign     = align
    // Drop-shadow for legibility on any background
    ctx.shadowColor   = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur    = 14
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 2

    if (title) {
      ctx.globalAlpha = opacity
      ctx.fillStyle   = color
      ctx.font        = `600 ${titleSize}px ${titleFont}`
      ctx.fillText(title, tx, tyTitle)
    }

    if (artist) {
      ctx.globalAlpha = opacity * 0.78
      ctx.fillStyle   = color
      ctx.font        = `400 ${artistSize}px ${artistFont}`
      ctx.fillText(artist, tx, tyArtist)
    }

    ctx.restore()
  }
}

window.textOverlay = textOverlay
