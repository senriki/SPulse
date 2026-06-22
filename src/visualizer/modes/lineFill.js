// line_fill: smooth amplitude line with filled area beneath — like a waveform editor
export function drawLineFill(ctx, freqData, timeData, state, W, H) {
  const { padding, lineWidth, color, opacity, glow, centerVertically, yOffset } = state

  const centerY   = centerVertically ? H / 2 + yOffset : H * 0.65 + yOffset
  const amplitude = (centerVertically ? H / 2 : H * 0.3) - padding

  const numPts  = 256
  const srcLen  = timeData.length
  const usableW = W - padding * 2
  const pts     = new Array(numPts)

  for (let i = 0; i < numPts; i++) {
    const srcIdx = Math.floor((i / numPts) * srcLen)
    const v = (timeData[srcIdx] - 128) / 128
    pts[i] = {
      x: padding + (i / (numPts - 1)) * usableW,
      y: centerY - v * amplitude
    }
  }

  ctx.save()
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = (glow / 100) * 30 }

  // Build the curve path (reused for both fill and stroke)
  const buildPath = () => {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, centerY)
    ctx.lineTo(pts[0].x, pts[0].y)
    for (let i = 1; i < numPts - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    ctx.lineTo(pts[numPts - 1].x, pts[numPts - 1].y)
    ctx.lineTo(pts[numPts - 1].x, centerY)
    ctx.closePath()
  }

  // Fill (semi-transparent)
  buildPath()
  ctx.fillStyle   = color
  ctx.globalAlpha = opacity * 0.35
  ctx.fill()

  // Stroke outline (full opacity)
  buildPath()
  ctx.strokeStyle = color
  ctx.lineWidth   = lineWidth
  ctx.lineJoin    = 'round'
  ctx.globalAlpha = opacity
  ctx.stroke()

  ctx.restore()
}
