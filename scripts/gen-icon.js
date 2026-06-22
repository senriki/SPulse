#!/usr/bin/env node
// Generates build/icon.png (512x512) from the waveform bar design.
// Source SVG: build/icon.svg
// Run: node scripts/gen-icon.js  OR  make icon

const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

const SIZE  = 512
const PAD   = 80
const INNER = SIZE - PAD * 2
const SCALE = INNER / 20

const BG = [0x0D, 0x11, 0x17]   // #0D1117 — app background
const AC = [0x00, 0xD4, 0xFF]   // #00D4FF — accent

// RGBA pixel buffer
const px = Buffer.alloc(SIZE * SIZE * 4)
for (let i = 0; i < SIZE * SIZE; i++) {
  px[i*4] = BG[0]; px[i*4+1] = BG[1]; px[i*4+2] = BG[2]; px[i*4+3] = 0xFF
}

function setPixel(x, y, r, g, b, a) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
  const i = (y * SIZE + x) * 4, al = a / 255
  px[i]   = Math.round(px[i]   * (1 - al) + r * al)
  px[i+1] = Math.round(px[i+1] * (1 - al) + g * al)
  px[i+2] = Math.round(px[i+2] * (1 - al) + b * al)
  px[i+3] = 0xFF
}

// Waveform bars (from 20×20 SVG viewbox — matches app icon in index.html)
const bars = [
  { x: 1,  y: 12, w: 2, h: 6  },
  { x: 4,  y: 8,  w: 2, h: 10 },
  { x: 7,  y: 5,  w: 2, h: 13 },
  { x: 10, y: 9,  w: 2, h: 9  },
  { x: 13, y: 6,  w: 2, h: 12 },
  { x: 16, y: 10, w: 2, h: 8  },
]

// Glow layer (wider, low opacity)
bars.forEach(b => {
  const x0 = Math.round(PAD + b.x * SCALE) - 6
  const y0 = Math.round(PAD + b.y * SCALE) - 6
  const x1 = Math.round(PAD + (b.x + b.w) * SCALE) + 6
  const y1 = Math.round(PAD + (b.y + b.h) * SCALE) + 6
  for (let py = y0; py < y1; py++)
    for (let px2 = x0; px2 < x1; px2++)
      setPixel(px2, py, AC[0], AC[1], AC[2], 22)
})

// Solid bars
bars.forEach(b => {
  const x0 = Math.round(PAD + b.x * SCALE)
  const y0 = Math.round(PAD + b.y * SCALE)
  const x1 = Math.round(PAD + (b.x + b.w) * SCALE)
  const y1 = Math.round(PAD + (b.y + b.h) * SCALE)
  for (let py = y0; py < y1; py++)
    for (let px2 = x0; px2 < x1; px2++)
      setPixel(px2, py, AC[0], AC[1], AC[2], 255)
})

// ── PNG encoder (zlib + no external deps) ─────────────────────────────────────
function crc32(buf) {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const tb  = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([tb, data])
  const crc  = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.allocUnsafe(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0  // 8-bit RGBA

const raw = Buffer.allocUnsafe(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0   // filter type: None
  px.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const out = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),  // PNG signature
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
  chunk('IEND', Buffer.alloc(0)),
])

const outPath = path.join(__dirname, '..', 'build', 'icon.png')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, out)
console.log(`✓ build/icon.png  ${SIZE}×${SIZE}px  ${out.length} bytes`)
