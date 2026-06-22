// Export settings state singleton.
// Updated by right-panel controls (renderer.js); consumed by exportPipeline.js.
export const exportSettings = {
  width:      1920,
  height:     1080,
  fps:        30,
  codec:      'h264',
  audioMode:  'passthrough',
  bitrate:    null,   // null = auto CRF; number = manual kbps
  outputPath: '',     // explicit full path from save dialog; empty = auto-derive from audio dir
  filename:   'waveexport.mp4',
}
