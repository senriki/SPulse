// Serializes and deserializes app state to/from the .spx project file format (JSON).
// Does NOT touch the DOM — caller handles DOM sync after deserializeState().
import { visualizerState } from '../visualizer/visualizerState.js'
import { exportSettings }  from '../export/exportSettings.js'

export const SPX_VERSION = '1.0'

// Portable export format (Feature C) — kept as a separate constant so serializeState()'s
// existing v1.0 behavior (manual project save/load) is entirely untouched by this bump.
export const SPX_PORTABLE_VERSION = '2.0'

// Build a plain serializable object from current runtime state.
export function serializeState(audioFilePath) {
  const { background: bg, overlay: ov } = visualizerState
  return {
    version: SPX_VERSION,
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
      sensitivity:      visualizerState.sensitivity,
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
        fitMode:       bg.fitMode,
        scale:         bg.scale,
        offsetX:       bg.offsetX,
        offsetY:       bg.offsetY,
      },
      overlay: {
        enabled:    ov.enabled,
        title:      ov.title,
        artist:     ov.artist,
        titleFont:  ov.titleFont,
        artistFont: ov.artistFont,
        titleSize:  ov.titleSize,
        artistSize: ov.artistSize,
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
      encoder:   exportSettings.encoder,
      audioMode: exportSettings.audioMode,
      bitrate:   exportSettings.bitrate,
      filename:  exportSettings.filename,
    },
  }
}

// Read a file via the main process and base64-encode it (renderer has no direct fs
// access — contextIsolation is on), returning enough metadata to reconstruct it on
// import. Returns null (not throw) if filePath is falsy or the read fails, so a missing
// asset degrades the export rather than aborting it.
async function _embedAsset(filePath) {
  if (!filePath) return null
  const result = await window.api.readFileAsBase64(filePath)
  if (!result || result.error) return null
  return { filename: filePath.replace(/.*[\\/]/, ''), data: result.data }
}

// Build a portable, device-independent export payload (Feature C, Option 1 from the
// PRD's Open Decisions): same shape as serializeState()'s output, but audio and
// background image/video are embedded as base64 instead of stored as raw absolute
// paths, and `version` is bumped to SPX_PORTABLE_VERSION. Does not mutate or otherwise
// affect serializeState() / SPX_VERSION — this is purely additive.
export async function serializePortableState(audioFilePath) {
  const data = serializeState(audioFilePath)
  data.version = SPX_PORTABLE_VERSION

  data.audioAsset = await _embedAsset(audioFilePath)
  data.audioPath  = ''

  const bg = data.visualizer.background
  bg.imageAsset = await _embedAsset(bg.imagePath)
  bg.videoAsset = await _embedAsset(bg.videoPath)
  bg.imagePath  = null
  bg.videoPath  = null

  return data
}

// Write an embedded asset ({ filename, data: base64 }) to a temp file via the main
// process (renderer has no direct fs access) and return the resulting path.
async function _writeTempAsset(asset) {
  return window.api.writeTempFile(asset.filename, asset.data)
}

// Portable v2.0 → v1.0-shaped bridge: decode embedded assets to temp files and return a
// shallow copy of `data` whose audioPath/imagePath/videoPath point at those temp files —
// letting the rest of deserializeState() treat v1.0 and v2.0 payloads identically.
async function _resolvePortableAssets(data) {
  const resolved = {
    ...data,
    visualizer: { ...data.visualizer, background: { ...data.visualizer?.background } },
  }
  if (data.audioAsset) resolved.audioPath = await _writeTempAsset(data.audioAsset)

  const bg = resolved.visualizer.background
  if (bg.imageAsset) bg.imagePath = await _writeTempAsset(bg.imageAsset)
  if (bg.videoAsset) bg.videoPath = await _writeTempAsset(bg.videoAsset)

  return resolved
}

// Apply data from a parsed .spx JSON to the runtime state singletons.
// Returns { audioPath } so the caller can re-load the audio file.
// Handles both the legacy v1.0 format (raw absolute paths, used as-is) and the portable
// v2.0 format (Feature C — base64-embedded assets, resolved to temp files first).
export async function deserializeState(data) {
  if (data.version === SPX_PORTABLE_VERSION) data = await _resolvePortableAssets(data)

  const vs = data.visualizer || {}
  const bg = vs.background   || {}
  const ov = vs.overlay      || {}
  const ex = data.export     || {}

  // Visualizer top-level fields
  ;['mode','color','opacity','glow','barWidth','barGap','lineWidth','padding',
    'smoothing','sensitivity','centerVertically','yOffset'].forEach(k => {
    if (vs[k] !== undefined) visualizerState[k] = vs[k]
  })

  // Background (imageEl/videoEl are null — reloaded by backgroundRenderer.reloadFromState)
  ;['type','color','gradientA','gradientB','gradientAngle','imageBlur','imageDarken',
    'fitMode','scale','offsetX','offsetY'].forEach(k => {
    if (bg[k] !== undefined) visualizerState.background[k] = bg[k]
  })
  visualizerState.background.imagePath = bg.imagePath || null
  visualizerState.background.videoPath = bg.videoPath || null
  visualizerState.background.imageEl   = null
  visualizerState.background.videoEl   = null

  // Overlay
  ;['enabled','title','artist','titleFont','artistFont','titleSize','artistSize',
    'color','opacity','position','x','y'].forEach(k => {
    if (ov[k] !== undefined) visualizerState.overlay[k] = ov[k]
  })
  // Back-compat: pre-1.1 .spx files stored a single shared `font`/`size` field
  if (ov.font !== undefined) {
    if (ov.titleFont === undefined)  visualizerState.overlay.titleFont  = ov.font
    if (ov.artistFont === undefined) visualizerState.overlay.artistFont = ov.font
  }
  if (ov.size !== undefined) {
    if (ov.titleSize === undefined)  visualizerState.overlay.titleSize  = ov.size
    if (ov.artistSize === undefined) visualizerState.overlay.artistSize = Math.round(ov.size * 0.62)
  }

  // Export settings (outputPath is session-only — never persisted)
  ;['width','height','fps','codec','encoder','audioMode','bitrate','filename'].forEach(k => {
    if (ex[k] !== undefined) exportSettings[k] = ex[k]
  })
  exportSettings.outputPath = ''

  return { audioPath: data.audioPath || null }
}
