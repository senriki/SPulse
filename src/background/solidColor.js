export function drawSolidColor(ctx, W, H, bgState) {
  ctx.fillStyle = bgState.color || '#0D1117'
  ctx.fillRect(0, 0, W, H)
}
