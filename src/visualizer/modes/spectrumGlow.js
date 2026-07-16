// spectrum_glow: bars with frequency-mapped color gradient (bass=warm, treble=cool) + bloom
export function drawSpectrumGlow(ctx, freqData, timeData, state, W, H) {
  const { padding, barWidth, barGap, opacity, glow, centerVertically, yOffset, sensitivity = 1 } = state

  const step       = barWidth + barGap
  const numBars    = Math.max(1, Math.floor((W - padding * 2) / step))
  const baseline   = centerVertically ? H / 2 + yOffset : H - padding + yOffset
  const maxBarH    = centerVertically ? H / 2 - padding : H - padding * 2
  const usableBins = Math.floor(freqData.length * 0.75)
  const glowBase   = (glow / 100) * 35

  ctx.save()
  ctx.globalAlpha = opacity

  for (let i = 0; i < numBars; i++) {
    const binIdx = Math.floor((i / numBars) * usableBins)
    const mag    = Math.min(freqData[binIdx] / 255 * sensitivity, 1)
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
