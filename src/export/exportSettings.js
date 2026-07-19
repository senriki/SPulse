// Export settings state singleton.
// Updated by right-panel controls (renderer.js); consumed by exportPipeline.js.

// Single source of truth for the hardcoded defaults — see visualizerState.js's
// _createDefaultVisualizerState for the matching pattern used by "Reset to default".
function _createDefaultExportSettings() {
  return {
    width:      1920,
    height:     1080,
    fps:        30,
    codec:      'h264',
    encoder:    'auto', // 'auto' | 'nvenc' | 'amf' | 'qsv' | 'cpu'
    audioMode:  'passthrough',
    bitrate:    null,   // null = auto CRF; number = manual kbps
    outputPath:   '',     // explicit full path from save dialog; empty = auto-derive from audio dir
    filename:     'spulse.mp4',
    askOnExport:  false,  // if true, show save dialog every time Export is clicked
  }
}

export const exportSettings = _createDefaultExportSettings()

// Restore exportSettings to its original hardcoded defaults, in place.
export function resetExportSettingsToDefaults() {
  Object.assign(exportSettings, _createDefaultExportSettings())
}
