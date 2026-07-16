// bar_mirror: Classic bars reflected symmetrically above AND below the center axis
export function drawBarMirror(ctx, freqData, timeData, state, W, H) {
  const { padding, barWidth, barGap, color, opacity, glow, yOffset, sensitivity = 1 } = state

  const step    = barWidth + barGap
  const numBars = Math.max(1, Math.floor((W - padding * 2) / step))
  const centerY = H / 2 + yOffset
  const maxHalf = H / 2 - padding
  const usableBins = Math.floor(freqData.length * 0.75)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle   = color
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = (glow / 100) * 30 }

  for (let i = 0; i < numBars; i++) {
    const binIdx = Math.floor((i / numBars) * usableBins)
    const mag    = Math.min(freqData[binIdx] / 255 * sensitivity, 1)
    const h      = Math.max(2, mag * maxHalf)
    const x      = padding + i * step
    ctx.fillRect(x, centerY - h, barWidth, h)   // above center
    ctx.fillRect(x, centerY,     barWidth, h)   // below center (mirror)
  }

  ctx.restore()
}
