// Serializes and deserializes app state to/from the .wvx project file format (JSON).
// Does NOT touch the DOM — caller handles DOM sync after deserializeState().
import { visualizerState } from '../visualizer/visualizerState.js'
import { exportSettings }  from '../export/exportSettings.js'

export const WVX_VERSION = '1.0'

// Build a plain serializable object from current runtime state.
export function serializeState(audioFilePath) {
  const { background: bg, overlay: ov } = visualizerState
  return {
    version: WVX_VERSION,
    audioPath: audioFilePath || '',
    visualizer: {
      mode:             visualizerState.mode,
      color:            visualizerState.color,
      opacity:          visualizerState.opacity,
      glow:             visualizerState.glow,
      barWidth:         visualizerState.barWidth,
      barGap:           visualizerState.barGap,
      lineWidth:        visualizerState.lineWidth,
      padding:          visualizerState.padding,
      smoothing:        visualizerState.smoothing,
      centerVertically: visualizerState.centerVertically,
      yOffset:          visualizerState.yOffset,
      background: {
        type:          bg.type,
        color:         bg.color,
        gradientA:     bg.gradientA,
        gradientB:     bg.gradientB,
        gradientAngle: bg.gradientAngle,
        imageBlur:     bg.imageBlur,
        imageDarken:   bg.imageDarken,
        imagePath:     bg.imagePath || null,
        videoPath:     bg.videoPath || null,
      },
      overlay: {
        enabled:  ov.enabled,
        title:    ov.title,
        artist:   ov.artist,
        font:     ov.font,
        size:     ov.size,
        color:    ov.color,
        opacity:  ov.opacity,
        position: ov.position,
        x:        ov.x,
        y:        ov.y,
      },
    },
    export: {
      width:     exportSettings.width,
      height:    exportSettings.height,
      fps:       exportSettings.fps,
      codec:     exportSettings.codec,
      audioMode: exportSettings.audioMode,
      bitrate:   exportSettings.bitrate,
      filename:  exportSettings.filename,
    },
  }
}

// Apply data from a parsed .wvx JSON to the runtime state singletons.
// Returns { audioPath } so the caller can re-load the audio file.
export function deserializeState(data) {
  const vs = data.visualizer || {}
  const bg = vs.background   || {}
  const ov = vs.overlay      || {}
  const ex = data.export     || {}

  // Visualizer top-level fields
  ;['mode','color','opacity','glow','barWidth','barGap','lineWidth','padding',
    'smoothing','centerVertically','yOffset'].forEach(k => {
    if (vs[k] !== undefined) visualizerState[k] = vs[k]
  })

  // Background (imageEl/videoEl are null — reloaded by backgroundRenderer.reloadFromState)
  ;['type','color','gradientA','gradientB','gradientAngle','imageBlur','imageDarken'].forEach(k => {
    if (bg[k] !== undefined) visualizerState.background[k] = bg[k]
  })
  visualizerState.background.imagePath = bg.imagePath || null
  visualizerState.background.videoPath = bg.videoPath || null
  visualizerState.background.imageEl   = null
  visualizerState.background.videoEl   = null

  // Overlay
  ;['enabled','title','artist','font','size','color','opacity','position','x','y'].forEach(k => {
    if (ov[k] !== undefined) visualizerState.overlay[k] = ov[k]
  })

  // Export settings (outputPath is session-only — never persisted)
  ;['width','height','fps','codec','audioMode','bitrate','filename'].forEach(k => {
    if (ex[k] !== undefined) exportSettings[k] = ex[k]
  })
  exportSettings.outputPath = ''

  return { audioPath: data.audioPath || null }
}
