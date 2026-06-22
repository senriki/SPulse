export function drawGradient(ctx, W, H, bgState) {
  const { gradientA, gradientB, gradientAngle } = bgState
  // Convert angle to a gradient line through the canvas center
  const rad = (gradientAngle * Math.PI) / 180
  const cx  = W / 2
  const cy  = H / 2
  // Use the half-diagonal as radius so gradient covers corners at any angle
  const r   = Math.sqrt(W * W + H * H) / 2
  const x1  = cx - Math.cos(rad) * r
  const y1  = cy - Math.sin(rad) * r
  const x2  = cx + Math.cos(rad) * r
  const y2  = cy + Math.sin(rad) * r

  const grad = ctx.createLinearGradient(x1, y1, x2, y2)
  grad.addColorStop(0, gradientA || '#0D1117')
  grad.addColorStop(1, gradientB || '#1a2040')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
}
