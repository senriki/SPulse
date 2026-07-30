import { exportSettings } from '../../export/exportSettings.js'
import { deriveBarWidth, resolveBinIndex, computeCenterPeakMagnitudes } from './_barLayout.js'

// bar_mirror: Classic bars reflected symmetrically above AND below the center axis
export function drawBarMirror(ctx, freqData, timeData, state, W, H) {
  const { padding, numBars, barGap, color, opacity, glow, yOffset, sensitivity = 1, mirrorLR, mirrorPeakCenter } = state

  // See barClassic.js — layout in real target-resolution space, scaled down to
  // actual canvas pixel space, so preview matches export regardless of canvas size.
  const targetW = exportSettings.width  || W
  const targetH = exportSettings.height || H

  // numBars is authoritative (Feature B) — it's the total count of bar positions
  // along X, not halved/doubled for the top/bottom mirror (that's orthogonal).
  const barWidth = deriveBarWidth({ targetW, padding, numBars, barGap })
  const step     = barWidth + barGap
  const centerY = targetH / 2 + yOffset
  const maxHalf = targetH / 2 - padding
  const usableBins = Math.floor(freqData.length * 0.75)

  // "Peak at center" reorders + smooths bars by live magnitude, so it must be
  // precomputed once per frame (not per-bar like resolveBinIndex) — see _barLayout.js.
  const peakMagnitudes = (mirrorLR && mirrorPeakCenter)
    ? computeCenterPeakMagnitudes({ numBars, usableBins, freqData })
    : null

  ctx.save()
  ctx.scale(W / targetW, H / targetH)
  ctx.globalAlpha = opacity
  ctx.fillStyle   = color
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = (glow / 100) * 30 }

  for (let i = 0; i < numBars; i++) {
    const rawMag = peakMagnitudes
      ? peakMagnitudes[i]
      : freqData[resolveBinIndex({ i, numBars, usableBins, mirrorLR })]
    const mag    = Math.min(rawMag / 255 * sensitivity, 1)
    const h      = Math.max(2, mag * maxHalf)
    const x      = padding + i * step
    ctx.fillRect(x, centerY - h, barWidth, h)   // above center
    ctx.fillRect(x, centerY,     barWidth, h)   // below center (mirror)
  }

  ctx.restore()
}
