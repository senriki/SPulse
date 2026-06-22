// line_smooth: amplitude drawn as a smooth bezier curve using time-domain data
// Uses getByteTimeDomainData (0–255, 128 = silence) downsampled to 256 pts for perf.
export function drawLineSmooth(ctx, freqData, timeData, state, W, H) {
  const { padding, lineWidth, color, opacity, glow, centerVertically, yOffset } = state

  const centerY   = centerVertically ? H / 2 + yOffset : H * 0.65 + yOffset
  const amplitude = (centerVertically ? H / 2 : H * 0.3) - padding

  // Downsample timeData to 256 points
  const numPts  = 256
  const srcLen  = timeData.length
  const pts     = new Array(numPts)
  const usableW = W - padding * 2

  for (let i = 0; i < numPts; i++) {
    const srcIdx = Math.floor((i / numPts) * srcLen)
    const v = (timeData[srcIdx] - 128) / 128   // -1..+1
    pts[i] = {
      x: padding + (i / (numPts - 1)) * usableW,
      y: centerY - v * amplitude
    }
  }

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.strokeStyle = color
  ctx.lineWidth   = lineWidth
  ctx.lineJoin    = 'round'
  ctx.lineCap     = 'round'
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = (glow / 100) * 30 }

  // Smooth curve: quadratic bezier through midpoints
  ctx.beginPath()
  ctx.moveTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2)
  for (let i = 1; i < numPts - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
  }
  ctx.lineTo(pts[numPts - 1].x, pts[numPts - 1].y)
  ctx.stroke()

  ctx.restore()
}
