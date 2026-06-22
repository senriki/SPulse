// Resolves the FFmpeg binary path (CommonJS — required by main.js and gpuDetect.js).
// asarUnpack copies ffmpeg-static's binary out to app.asar.unpacked on disk, but
// require('ffmpeg-static') still resolves to the path inside app.asar. Electron's
// patched fs module transparently redirects reads for unpacked files, but
// child_process.spawn() does not go through that layer — it needs a real path,
// and app.asar is a single archive file, not a real directory, so exec fails
// with ENOENT unless we rewrite the path ourselves.
const path    = require('path')
const rawPath = require('ffmpeg-static')

module.exports = rawPath.replace(
  `${path.sep}app.asar${path.sep}`,
  `${path.sep}app.asar.unpacked${path.sep}`
)
