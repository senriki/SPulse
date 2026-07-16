// radial_pulse: circular frequency waveform radiating from center using polar coords
export function drawRadialPulse(ctx, freqData, timeData, state, W, H) {
  const { padding, lineWidth, color, opacity, glow, yOffset, sensitivity = 1 } = state

  const cx = W / 2
  const cy = H / 2 + yOffset
  const dim = Math.min(W, H)
  const baseR = dim * 0.12
  const maxR  = dim * 0.38 - padding

  const numBins    = Math.floor(freqData.length * 0.75)
  const glowBlur   = (glow / 100) * 40

  ctx.save()
  ctx.globalAlpha = opacity
  if (glowBlur > 0) { ctx.shadowColor = color; ctx.shadowBlur = glowBlur }

  // ── Outer waveform ring ───────────────────────────────────────────────────
  ctx.beginPath()
  for (let i = 0; i <= numBins; i++) {
    const angle = (i / numBins) * Math.PI * 2 - Math.PI / 2
    const mag   = Math.min(freqData[i % numBins] / 255 * sensitivity, 1)
    const r     = baseR + mag * maxR
    const x     = cx + Math.cos(angle) * r
    const y     = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else         ctx.lineTo(x, y)
  }
  ctx.closePath()

  // Thin semi-transparent fill
  ctx.fillStyle   = color
  ctx.globalAlpha = opacity * 0.12
  ctx.fill()

  // Stroke
  ctx.globalAlpha = opacity
  ctx.strokeStyle = color
  ctx.lineWidth   = lineWidth
  ctx.stroke()

  // ── Base circle ───────────────────────────────────────────────────────────
  ctx.globalAlpha = opacity * 0.25
  ctx.beginPath()
  ctx.arc(cx, cy, baseR, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}
