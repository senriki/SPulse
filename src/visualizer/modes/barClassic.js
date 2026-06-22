// bar_classic: vertical frequency bars, equalizer style (Canvas 2D fillRect)
// freqData: Uint8Array[1024] from AnalyserNode.getByteFrequencyData (fftSize=2048)
// state: visualizerState
// W, H: canvas logical resolution (1280×720 in preview)
// timeData unused here — present to satisfy the shared draw fn signature
export function drawBarClassic(ctx, freqData, timeData, state, W, H) {
  const { padding, barWidth, barGap, color, opacity, glow, centerVertically, yOffset } = state

  const step    = barWidth + barGap
  const availW  = W - padding * 2
  const numBars = Math.max(1, Math.floor(availW / step))

  // Baseline: where bars start (growing upward from here)
  const baseline  = centerVertically ? H / 2 + yOffset : H - padding + yOffset
  const maxBarH   = centerVertically ? H / 2 - padding : H - padding * 2

  // Only use lower 75% of frequency bins — upper range is high-freq noise for typical music
  const usableBins = Math.floor(freqData.length * 0.75)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle   = color

  if (glow > 0) {
    ctx.shadowColor = color
    ctx.shadowBlur  = (glow / 100) * 30
  }

  for (let i = 0; i < numBars; i++) {
    const binIdx = Math.floor((i / numBars) * usableBins)
    const mag    = freqData[binIdx] / 255
    const barH   = Math.max(2, mag * maxBarH)
    const x      = padding + i * step
    ctx.fillRect(x, baseline - barH, barWidth, barH)
  }

  ctx.restore()
}
