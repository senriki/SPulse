import { exportSettings } from '../../export/exportSettings.js'
import { deriveBarWidth, resolveBinIndex, computeCenterPeakMagnitudes } from './_barLayout.js'

// spectrum_glow: bars with frequency-mapped color gradient (bass=warm, treble=cool) + bloom
export function drawSpectrumGlow(ctx, freqData, timeData, state, W, H) {
  const { padding, numBars, barGap, opacity, glow, centerVertically, yOffset, sensitivity = 1, mirrorLR, mirrorPeakCenter } = state

  // See barClassic.js — layout in real target-resolution space, scaled down to
  // actual canvas pixel space, so preview matches export regardless of canvas size.
  const targetW = exportSettings.width  || W
  const targetH = exportSettings.height || H

  // numBars is authoritative (Feature B) — barWidth derives from it. The hue-by-index
  // gradient below is unaffected since it's a ratio (i / numBars), not tied to width.
  const barWidth = deriveBarWidth({ targetW, padding, numBars, barGap })
  const step     = barWidth + barGap
  const baseline   = centerVertically ? targetH / 2 + yOffset : targetH - padding + yOffset
  const maxBarH    = centerVertically ? targetH / 2 - padding : targetH - padding * 2
  const usableBins = Math.floor(freqData.length * 0.75)
  const glowBase   = (glow / 100) * 35

  // "Peak at center" reorders + smooths bars by live magnitude, so it must be
  // precomputed once per frame (not per-bar like resolveBinIndex) — see _barLayout.js.
  const peakMagnitudes = (mirrorLR && mirrorPeakCenter)
    ? computeCenterPeakMagnitudes({ numBars, usableBins, freqData })
    : null

  ctx.save()
  ctx.scale(W / targetW, H / targetH)
  ctx.globalAlpha = opacity

  for (let i = 0; i < numBars; i++) {
    const rawMag = peakMagnitudes
      ? peakMagnitudes[i]
      : freqData[resolveBinIndex({ i, numBars, usableBins, mirrorLR })]
    const mag    = Math.min(rawMag / 255 * sensitivity, 1)
    const barH   = Math.max(2, mag * maxBarH)
    const x      = padding + i * step

    // Hue: 0° (red/bass) → 240° (blue/treble), with higher saturation + lightness in midrange
    const hue  = Math.round((i / numBars) * 240)
    const sat  = 80 + mag * 15          // 80–95%
    const lum  = 45 + mag * 20          // 45–65% — brighter at higher amplitude
    const col  = `hsl(${hue},${sat}%,${lum}%)`

    ctx.fillStyle = col

    if (glowBase > 0) {
      ctx.shadowColor = col
      ctx.shadowBlur  = glowBase * (0.3 + mag * 0.7)  // glow scales with amplitude
    }

    ctx.fillRect(x, baseline - barH, barWidth, barH)
  }

  ctx.restore()
}
