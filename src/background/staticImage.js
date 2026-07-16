// Draws a static image background per bgState.fitMode:
//   'cover'     — scale-to-fill, center-crop (default, matches pre-1.1 behavior)
//   'contain'   — scale-to-fit, no crop; gaps filled with the solid bg color
//   'blur-fill' — scale-to-fit sharp foreground over a blurred cover-fit backdrop
import { computeFitRect } from './fitHelpers.js'

export function drawStaticImage(ctx, W, H, bgState) {
  const img = bgState.imageEl
  if (!img || !img.naturalWidth || !img.naturalHeight) return

  const mode  = bgState.fitMode ?? 'cover'
  const scale = bgState.scale   ?? 1
  const offX  = bgState.offsetX ?? 0
  const offY  = bgState.offsetY ?? 0

  ctx.save()

  if (mode === 'blur-fill') {
    // Backdrop: heavily blurred, always cover-fit so it fills every corner
    const bg = computeFitRect(img.naturalWidth, img.naturalHeight, W, H, 'cover', 1.15, 0, 0)
    const bleed = 40
    ctx.filter = 'blur(40px)'
    ctx.drawImage(img, bg.dx - bleed, bg.dy - bleed, bg.dw + bleed * 2, bg.dh + bleed * 2)
    ctx.filter = 'none'
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, W, H)
  } else if (mode === 'contain') {
    ctx.fillStyle = bgState.color || '#0D1117'
    ctx.fillRect(0, 0, W, H)
  }

  // Foreground: sharp layer at the user's fit mode / zoom / pan
  const fgMode = mode === 'cover' ? 'cover' : 'contain'
  const fg = computeFitRect(img.naturalWidth, img.naturalHeight, W, H, fgMode, scale, offX, offY)

  if (bgState.imageBlur > 0) {
    // Expand draw region by blur amount to prevent transparent edge fringing
    const bleed = bgState.imageBlur * 2.5
    ctx.filter = `blur(${bgState.imageBlur}px)`
    ctx.drawImage(img, fg.dx - bleed, fg.dy - bleed, fg.dw + bleed * 2, fg.dh + bleed * 2)
    ctx.filter = 'none'
  } else {
    ctx.drawImage(img, fg.dx, fg.dy, fg.dw, fg.dh)
  }

  // Semi-transparent black darken overlay
  if (bgState.imageDarken > 0) {
    ctx.fillStyle = `rgba(0,0,0,${bgState.imageDarken / 100})`
    ctx.fillRect(0, 0, W, H)
  }

  ctx.restore()
}
