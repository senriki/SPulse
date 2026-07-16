// Shared fit-rect math for background image/video rendering.
// Computes the destination rect for drawing mediaW x mediaH content into a
// W x H target box, honoring fit mode plus user zoom/pan.
export function computeFitRect(mediaW, mediaH, W, H, mode, scale = 1, offsetX = 0, offsetY = 0) {
  const baseScale = mode === 'contain'
    ? Math.min(W / mediaW, H / mediaH)
    : Math.max(W / mediaW, H / mediaH)   // 'cover'
  const s  = baseScale * scale
  const dw = mediaW * s
  const dh = mediaH * s
  const dx = (W - dw) / 2 + offsetX
  const dy = (H - dh) / 2 + offsetY
  return { dx, dy, dw, dh }
}
