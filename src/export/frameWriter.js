// Main-process utility for writing export frames to disk.
// Used for the disk-based export path (4K or audio > 3 minutes).
// CommonJS module — required by main.js.
'use strict'

const fs   = require('fs')
const os   = require('os')
const path = require('path')

class FrameWriter {
  constructor() {
    this.dir   = null
    this.path  = null
    this.fd    = null
    this.count = 0
  }

  // Create temp dir + open a single append-only stream file for the whole export.
  // Every frame is appended to this ONE file as raw JPEG bytes, back to back —
  // FFmpeg's mjpeg demuxer finds each frame's boundary from its own SOI/EOI
  // markers, so no per-frame filename/index is needed. Deliberately NOT one file
  // per frame (the previous approach): a single flat folder holding thousands of
  // small files gets progressively slower on NTFS as it grows (directory metadata
  // operations, e.g. 8.3 short-name generation, aren't O(1) per file), which showed
  // up as export throughput degrading over the course of a long export. Returns
  // the temp directory path (unchanged call signature — main.js only uses it for
  // logging/cleanup bookkeeping, not the actual FFmpeg input anymore).
  init() {
    this.dir   = fs.mkdtempSync(path.join(os.tmpdir(), 'spulse-'))
    this.path  = path.join(this.dir, 'frames.mjpeg')
    this.fd    = fs.openSync(this.path, 'w')
    this.count = 0
    return this.dir
  }

  // Append one frame (raw JPEG bytes, already a Buffer — see main.js export-frame).
  writeFrame(buf) {
    if (this.fd === null) throw new Error('FrameWriter not initialized')
    let written = 0
    while (written < buf.length) {
      written += fs.writeSync(this.fd, buf, written, buf.length - written)
    }
    this.count++
  }

  get frameCount() { return this.count }
  // The single .mjpeg file FFmpeg should read as its video input (disk mode).
  get filePath()   { return this.path }

  // Close the stream file and delete the temp directory — always call after
  // export completes or fails.
  cleanup() {
    if (this.fd !== null) {
      try { fs.closeSync(this.fd) } catch {}
      this.fd = null
    }
    if (this.dir) {
      try { fs.rmSync(this.dir, { recursive: true, force: true }) } catch {}
      this.dir   = null
      this.path  = null
      this.count = 0
    }
  }
}

module.exports = { FrameWriter }
