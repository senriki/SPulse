// Main-process utility for writing export frames to a temp directory.
// Used for the disk-based export path (4K or audio > 3 minutes).
// CommonJS module — required by main.js.
'use strict'

const fs   = require('fs')
const os   = require('os')
const path = require('path')

class FrameWriter {
  constructor() {
    this.dir   = null
    this.count = 0
  }

  // Create temp directory; returns its path
  init() {
    this.dir   = fs.mkdtempSync(path.join(os.tmpdir(), 'waveexport-'))
    this.count = 0
    return this.dir
  }

  // Write one frame (base64 JPEG/PNG data URL) to disk
  writeFrame(dataURL) {
    if (!this.dir) throw new Error('FrameWriter not initialized')
    const base64  = dataURL.replace(/^data:image\/\w+;base64,/, '')
    const buf     = Buffer.from(base64, 'base64')
    const outPath = path.join(this.dir, `frame${String(this.count).padStart(8, '0')}.jpg`)
    fs.writeFileSync(outPath, buf)
    this.count++
    return outPath
  }

  get frameCount() { return this.count }
  get directory()  { return this.dir }

  // Delete temp directory — always call after export completes or fails
  cleanup() {
    if (this.dir) {
      try { fs.rmSync(this.dir, { recursive: true, force: true }) } catch {}
      this.dir   = null
      this.count = 0
    }
  }
}

module.exports = { FrameWriter }
