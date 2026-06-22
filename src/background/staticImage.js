// Draws a static image background with optional blur and darken overlay.
// Scale-to-fill (CSS object-fit: cover equivalent on canvas).
export function drawStaticImage(ctx, W, H, bgState) {
  const img = bgState.imageEl
  if (!img || !img.naturalWidth || !img.naturalHeight) return

  // Scale to cover the canvas, center-crop
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  const dw = img.naturalWidth  * scale
  const dh = img.naturalHeight * scale
  const dx = (W - dw) / 2
  const dy = (H - dh) / 2

  ctx.save()

  if (bgState.imageBlur > 0) {
    // Expand draw region by blur amount to prevent transparent edge fringing
    const bleed = bgState.imageBlur * 2.5
    ctx.filter = `blur(${bgState.imageBlur}px)`
    ctx.drawImage(img, dx - bleed, dy - bleed, dw + bleed * 2, dh + bleed * 2)
    ctx.filter = 'none'
  } else {
    ctx.drawImage(img, dx, dy, dw, dh)
  }

  // Semi-transparent black darken overlay
  if (bgState.imageDarken > 0) {
    ctx.fillStyle = `rgba(0,0,0,${bgState.imageDarken / 100})`
    ctx.fillRect(0, 0, W, H)
  }

  ctx.restore()
}
