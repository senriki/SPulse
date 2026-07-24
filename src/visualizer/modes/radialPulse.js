import { exportSettings } from '../../export/exportSettings.js'

// radial_pulse: circular frequency waveform radiating from center using polar coords
export function drawRadialPulse(ctx, freqData, timeData, state, W, H) {
  const { padding, lineWidth, color, opacity, glow, yOffset, sensitivity = 1 } = state

  // See barClassic.js — layout in real target-resolution space, scaled down to
  // actual canvas pixel space, so preview matches export regardless of canvas size.
  const targetW = exportSettings.width  || W
  const targetH = exportSettings.height || H

  const cx = targetW / 2
  const cy = targetH / 2 + yOffset
  const dim = Math.min(targetW, targetH)
  const baseR = dim * 0.12
  const maxR  = dim * 0.38 - padding

  const numBins    = Math.floor(freqData.length * 0.75)
  const glowBlur   = (glow / 100) * 40

  ctx.save()
  ctx.scale(W / targetW, H / targetH)
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
