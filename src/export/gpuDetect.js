// Main-process GPU encoder detection (CommonJS — required by main.js).
// Runs `ffmpeg -encoders` once and caches the result for the app lifetime.
const { spawnSync } = require('child_process')
const ffmpegBin     = require('./ffmpegPath')

const _PRIORITY = [
  { label: 'NVENC', h264: 'h264_nvenc', h265: 'hevc_nvenc' },
  { label: 'AMF',   h264: 'h264_amf',   h265: 'hevc_amf'   },
  { label: 'QSV',   h264: 'h264_qsv',   h265: 'hevc_qsv'   },
]
const _CPU = { label: 'CPU', h264: 'libx264', h265: 'libx265' }

let _cached = null

function detectGpuEncoders() {
  if (_cached) return _cached
  try {
    const r   = spawnSync(ffmpegBin, ['-encoders', '-hide_banner'], { timeout: 8000 })
    const out = (r.stdout || '').toString()
    for (const enc of _PRIORITY) {
      if (out.includes(` ${enc.h264} `)) {
        _cached = enc
        return _cached
      }
    }
  } catch {}
  _cached = _CPU
  return _cached
}

module.exports = { detectGpuEncoders }
