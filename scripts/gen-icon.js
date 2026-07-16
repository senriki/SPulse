#!/usr/bin/env node
// Generates build/icon.png (512×512), build/icon.ico (Windows), build/icon.icns (macOS)
// from the SPulse icon design. Zero external dependencies — Node.js built-ins only.
// Run: node scripts/gen-icon.js               (stable — cyan)
//      node scripts/gen-icon.js --channel=rc   (release candidate — amber)
//      make icon

'use strict'

const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

// ── Channel ───────────────────────────────────────────────────────────────────
// Same bar layout for every channel — only the accent color shifts, so RC/nightly
// builds are visually distinct in the dock/taskbar without a separate icon design.
const CHANNEL = (process.argv.find(a => a.startsWith('--channel='))?.split('=')[1]) || 'stable'

const PALETTES = {
  stable: { top: [0x20, 0xea, 0xff], bot: [0x00, 0x80, 0xaa] },  // #20eaff → #0080aa (cyan)
  rc:     { top: [0xff, 0xb0, 0x20], bot: [0xaa, 0x55, 0x00] },  // #ffb020 → #aa5500 (amber)
}
if (!PALETTES[CHANNEL]) throw new Error(`Unknown --channel: ${CHANNEL}`)

// ── Design ────────────────────────────────────────────────────────────────────
const BG  = [0x0D, 0x11, 0x17]   // #0D1117 app background
const TOP = PALETTES[CHANNEL].top
const BOT = PALETTES[CHANNEL].bot
const GLOW_A = 18                // glow layer alpha

// 6 bars at 512×512 (bottom-aligned at y=406)
const BARS = [
  { x: 55,  y: 266, w: 52, h: 140 },
  { x: 125, y: 176, w: 52, h: 230 },
  { x: 195, y: 106, w: 52, h: 300 },
  { x: 265, y: 196, w: 52, h: 210 },
  { x: 335, y: 126, w: 52, h: 280 },
  { x: 405, y: 221, w: 52, h: 185 },
]
const RX_512 = 9  // bar border-radius at 512×512

// ── Render ────────────────────────────────────────────────────────────────────
function renderIcon(size) {
  const sc = size / 512
  const px = Buffer.alloc(size * size * 4)

  for (let i = 0; i < size * size; i++) {
    px[i*4] = BG[0]; px[i*4+1] = BG[1]; px[i*4+2] = BG[2]; px[i*4+3] = 0xFF
  }

  function blend(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i  = (y * size + x) * 4
    const al = a / 255
    px[i]   = Math.round(px[i]   * (1-al) + r * al)
    px[i+1] = Math.round(px[i+1] * (1-al) + g * al)
    px[i+2] = Math.round(px[i+2] * (1-al) + b * al)
  }

  const rx = Math.max(2, Math.round(RX_512 * sc))
  const gp = Math.round(8 * sc)

  BARS.forEach(b => {
    const x0 = Math.round(b.x * sc), y0 = Math.round(b.y * sc)
    const x1 = Math.round((b.x + b.w) * sc), y1 = Math.round((b.y + b.h) * sc)
    const bw = x1 - x0, bh = y1 - y0

    // Glow
    for (let py = y0 - gp; py < y1 + gp; py++)
      for (let qx = x0 - gp; qx < x1 + gp; qx++)
        blend(qx, py, TOP[0], TOP[1], TOP[2], GLOW_A)

    // Bars with gradient + rounded corners
    for (let py = y0; py < y1; py++) {
      const t  = bh > 1 ? (py - y0) / (bh - 1) : 0
      const r  = Math.round(TOP[0] + (BOT[0] - TOP[0]) * t)
      const g  = Math.round(TOP[1] + (BOT[1] - TOP[1]) * t)
      const bv = Math.round(TOP[2] + (BOT[2] - TOP[2]) * t)
      for (let qx = x0; qx < x1; qx++) {
        const cx = qx - x0, cy = py - y0
        if (cx < rx    && cy < rx    && Math.hypot(cx-rx,    cy-rx)    > rx) continue
        if (cx>=bw-rx  && cy < rx    && Math.hypot(cx-(bw-rx),cy-rx)   > rx) continue
        if (cx < rx    && cy>=bh-rx  && Math.hypot(cx-rx,    cy-(bh-rx))>rx) continue
        if (cx>=bw-rx  && cy>=bh-rx  && Math.hypot(cx-(bw-rx),cy-(bh-rx))>rx) continue
        blend(qx, py, r, g, bv, 255)
      }
    }
  })

  return px
}

// ── PNG encoder ───────────────────────────────────────────────────────────────
const _CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = _CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const tb   = Buffer.from(type, 'ascii')
  const len  = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([tb, data])
  const crc  = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(rgba, size) {
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0  // 8-bit RGBA

  const raw = Buffer.allocUnsafe(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0
    rgba.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── ICO encoder ───────────────────────────────────────────────────────────────
function encodeICO(entries) {
  const n      = entries.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)   // reserved
  header.writeUInt16LE(1, 2)   // type = icon
  header.writeUInt16LE(n, 4)

  let offset = 6 + n * 16
  const dirs = entries.map(e => {
    const d = Buffer.alloc(16)
    d[0] = e.size >= 256 ? 0 : e.size   // 0 encodes as 256
    d[1] = e.size >= 256 ? 0 : e.size
    d[2] = 0; d[3] = 0
    d.writeUInt16LE(1, 4)                // planes
    d.writeUInt16LE(32, 6)              // bit depth
    d.writeUInt32LE(e.png.length, 8)
    d.writeUInt32LE(offset, 12)
    offset += e.png.length
    return d
  })

  return Buffer.concat([header, ...dirs, ...entries.map(e => e.png)])
}

// ── ICNS encoder ──────────────────────────────────────────────────────────────
// PNG-based ICNS, supported macOS 10.7+
const ICNS_OSTYPE = { 16: 'ic11', 32: 'ic12', 64: 'ic13', 128: 'ic07', 256: 'ic08', 512: 'ic09' }

function encodeICNS(entries) {
  const blocks = entries.filter(e => ICNS_OSTYPE[e.size]).map(e => {
    const hdr = Buffer.allocUnsafe(8)
    hdr.write(ICNS_OSTYPE[e.size], 0, 'ascii')
    hdr.writeUInt32BE(8 + e.png.length, 4)
    return Buffer.concat([hdr, e.png])
  })
  const body = Buffer.concat(blocks)
  const hdr  = Buffer.allocUnsafe(8)
  hdr.write('icns', 0, 'ascii')
  hdr.writeUInt32BE(8 + body.length, 4)
  return Buffer.concat([hdr, body])
}

// ── Main ──────────────────────────────────────────────────────────────────────
const ICO_SIZES  = [16, 32, 48, 256]
const ICNS_SIZES = [16, 32, 64, 128, 256, 512]
const ALL_SIZES  = [...new Set([...ICO_SIZES, ...ICNS_SIZES])].sort((a, b) => a - b)

const encoded = {}
for (const s of ALL_SIZES) {
  encoded[s] = { size: s, png: encodePNG(renderIcon(s), s) }
}

const buildDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(buildDir, { recursive: true })
console.log(`channel: ${CHANNEL}`)

fs.writeFileSync(path.join(buildDir, 'icon.png'), encoded[512].png)
console.log(`✓ build/icon.png   512×512  ${encoded[512].png.length} bytes`)

const icoBuf = encodeICO(ICO_SIZES.map(s => encoded[s]))
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf)
console.log(`✓ build/icon.ico   ${ICO_SIZES.join('/')}px  ${icoBuf.length} bytes`)

const icnsBuf = encodeICNS(ICNS_SIZES.map(s => encoded[s]))
fs.writeFileSync(path.join(buildDir, 'icon.icns'), icnsBuf)
console.log(`✓ build/icon.icns  ${ICNS_SIZES.join('/')}px  ${icnsBuf.length} bytes`)
