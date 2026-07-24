import { exportSettings } from '../../export/exportSettings.js'

// bar_mirror: Classic bars reflected symmetrically above AND below the center axis
export function drawBarMirror(ctx, freqData, timeData, state, W, H) {
  const { padding, barWidth, barGap, color, opacity, glow, yOffset, sensitivity = 1 } = state

  // See barClassic.js — layout in real target-resolution space, scaled down to
  // actual canvas pixel space, so preview matches export regardless of canvas size.
  const targetW = exportSettings.width  || W
  const targetH = exportSettings.height || H

  const step    = barWidth + barGap
  const numBars = Math.max(1, Math.floor((targetW - padding * 2) / step))
  const centerY = targetH / 2 + yOffset
  const maxHalf = targetH / 2 - padding
  const usableBins = Math.floor(freqData.length * 0.75)

  ctx.save()
  ctx.scale(W / targetW, H / targetH)
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
