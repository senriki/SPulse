import { exportSettings } from '../../export/exportSettings.js'

// bar_classic: vertical frequency bars, equalizer style (Canvas 2D fillRect)
// freqData: Uint8Array[1024] from AnalyserNode.getByteFrequencyData (fftSize=2048)
// state: visualizerState
// W, H: canvas logical resolution (matches target aspect ratio; the real export
//       size during export, a scaled-down equivalent during preview)
// timeData unused here — present to satisfy the shared draw fn signature
export function drawBarClassic(ctx, freqData, timeData, state, W, H) {
  const { padding, barWidth, barGap, color, opacity, glow, centerVertically, yOffset, sensitivity = 1 } = state

  // Layout math happens in real target-resolution space, then gets scaled down to
  // actual canvas pixel space — same pattern as backgroundRenderer/textOverlay.
  // Without this, fixed-px style values (padding, barWidth, glow blur) would render
  // at different relative proportions between preview (capped canvas size) and
  // export (true target size), so preview wouldn't match the exported output.
  const targetW = exportSettings.width  || W
  const targetH = exportSettings.height || H

  const step    = barWidth + barGap
  const availW  = targetW - padding * 2
  const numBars = Math.max(1, Math.floor(availW / step))

  // Baseline: where bars start (growing upward from here)
  const baseline  = centerVertically ? targetH / 2 + yOffset : targetH - padding + yOffset
  const maxBarH   = centerVertically ? targetH / 2 - padding : targetH - padding * 2

  // Only use lower 75% of frequency bins — upper range is high-freq noise for typical music
  const usableBins = Math.floor(freqData.length * 0.75)

  ctx.save()
  ctx.scale(W / targetW, H / targetH)
  ctx.globalAlpha = opacity
  ctx.fillStyle   = color

  if (glow > 0) {
    ctx.shadowColor = color
    ctx.shadowBlur  = (glow / 100) * 30
  }

  for (let i = 0; i < numBars; i++) {
    const binIdx = Math.floor((i / numBars) * usableBins)
    const mag    = Math.min(freqData[binIdx] / 255 * sensitivity, 1)
    const barH   = Math.max(2, mag * maxBarH)
    const x      = padding + i * step
    ctx.fillRect(x, baseline - barH, barWidth, barH)
  }

  ctx.restore()
}
