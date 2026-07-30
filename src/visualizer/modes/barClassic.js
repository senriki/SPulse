import { exportSettings } from '../../export/exportSettings.js'
import { deriveBarWidth, resolveBinIndex, computeCenterPeakMagnitudes } from './_barLayout.js'

// bar_classic: vertical frequency bars, equalizer style (Canvas 2D fillRect)
// freqData: Uint8Array[1024] from AnalyserNode.getByteFrequencyData (fftSize=2048)
// state: visualizerState
// W, H: canvas logical resolution (matches target aspect ratio; the real export
//       size during export, a scaled-down equivalent during preview)
// timeData unused here — present to satisfy the shared draw fn signature
export function drawBarClassic(ctx, freqData, timeData, state, W, H) {
  const { padding, numBars, barGap, color, opacity, glow, centerVertically, yOffset, sensitivity = 1, mirrorLR, mirrorPeakCenter } = state

  // Layout math happens in real target-resolution space, then gets scaled down to
  // actual canvas pixel space — same pattern as backgroundRenderer/textOverlay.
  // Without this, fixed-px style values (padding, barWidth, glow blur) would render
  // at different relative proportions between preview (capped canvas size) and
  // export (true target size), so preview wouldn't match the exported output.
  const targetW = exportSettings.width  || W
  const targetH = exportSettings.height || H

  // numBars is authoritative (Feature B) — barWidth derives from it instead of the
  // other way around, so exactly numBars bars fill the available width.
  const barWidth = deriveBarWidth({ targetW, padding, numBars, barGap })
  const step     = barWidth + barGap

  // Baseline: where bars start (growing upward from here)
  const baseline  = centerVertically ? targetH / 2 + yOffset : targetH - padding + yOffset
  const maxBarH   = centerVertically ? targetH / 2 - padding : targetH - padding * 2

  // Only use lower 75% of frequency bins — upper range is high-freq noise for typical music
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

  if (glow > 0) {
    ctx.shadowColor = color
    ctx.shadowBlur  = (glow / 100) * 30
  }

  for (let i = 0; i < numBars; i++) {
    const rawMag = peakMagnitudes
      ? peakMagnitudes[i]
      : freqData[resolveBinIndex({ i, numBars, usableBins, mirrorLR })]
    const mag    = Math.min(rawMag / 255 * sensitivity, 1)
    const barH   = Math.max(2, mag * maxBarH)
    const x      = padding + i * step
    ctx.fillRect(x, baseline - barH, barWidth, barH)
  }

  ctx.restore()
}
