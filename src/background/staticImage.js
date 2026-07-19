// Draws a static image background per bgState.fitMode:
//   'cover'     — scale-to-fill, center-crop (default, matches pre-1.1 behavior)
//   'contain'   — scale-to-fit, no crop; gaps filled with the solid bg color
//   'blur-fill' — scale-to-fit sharp foreground over a blurred cover-fit backdrop
import { computeFitRect } from './fitHelpers.js'
import { exportSettings } from '../export/exportSettings.js'

export function drawStaticImage(ctx, W, H, bgState) {
  const img = bgState.imageEl
  if (!img || !img.naturalWidth || !img.naturalHeight) return

  const mode  = bgState.fitMode ?? 'cover'
  const scale = bgState.scale   ?? 1
  const offX  = bgState.offsetX ?? 0
  const offY  = bgState.offsetY ?? 0

  // Live preview renders on a canvas that always matches the selected resolution's
  // aspect ratio, but is capped to PREVIEW_MAX_DIM on its longest side for performance
  // (see canvasEngine._resizePreviewCanvas) — so W/H can be smaller than the real target
  // resolution while sharing its exact aspect ratio. Do all fit math against the real
  // target size, then uniformly scale down to actual canvas pixel space with ctx.scale().
  // During export W/H already equal the target size 1:1, so this is a no-op there.
  const targetW = exportSettings.width  || W
  const targetH = exportSettings.height || H

  ctx.save()
  ctx.scale(W / targetW, H / targetH)

  if (mode === 'blur-fill') {
    // Backdrop: heavily blurred, always cover-fit so it fills every corner
    const bg = computeFitRect(img.naturalWidth, img.naturalHeight, targetW, targetH, 'cover', 1.15, 0, 0)
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

  // Foreground: sharp layer at the user's fit mode / zoom / pan
  const fgMode = mode === 'cover' ? 'cover' : 'contain'
  const fg = computeFitRect(img.naturalWidth, img.naturalHeight, targetW, targetH, fgMode, scale, offX, offY)

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
    ctx.fillRect(0, 0, targetW, targetH)
  }

  ctx.restore()
}
