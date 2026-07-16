// Central visualizer configuration — all modules read from this object.
// Task-5 wires left-panel controls to mutate these values.
// Task-9 (export) reads this for per-frame rendering.
export const visualizerState = {
  mode: 'bar_classic',

  // Waveform appearance
  color:   '#00D4FF',
  opacity: 1.0,
  glow:    0,          // 0–100 maps to 0–30px shadowBlur

  // Bar / line dimensions
  barWidth:  4,
  barGap:    1,
  lineWidth: 2,
  padding:   16,

  // Smoothing (0–99 → 0.0–0.99 AnalyserNode.smoothingTimeConstant)
  smoothing: 80,

  // Sensitivity: amplitude multiplier applied to all visualizer modes (1.0 = default)
  sensitivity: 1.0,

  // Position
  centerVertically: true,
  yOffset: 0,

  // Background — task-7 populates and renders this
  background: {
    type:          'solid',
    color:         '#0D1117',
    gradientA:     '#0D1117',
    gradientB:     '#1a2040',
    gradientAngle: 135,
    imageBlur:     0,
    imageDarken:   0,
    imagePath:     null,
    videoPath:     null,
    imageEl:       null,   // HTMLImageElement — set by backgroundRenderer
    videoEl:       null,   // HTMLVideoElement — set by backgroundRenderer

    // Fit / position — applies to image and video backgrounds
    fitMode:  'cover',   // 'cover' | 'contain' | 'blur-fill'
    scale:    1,         // user zoom multiplier on top of the fit-mode base scale
    offsetX:  0,         // px pan offset (logical canvas px), drag-to-reposition
    offsetY:  0,
  },

  // Text overlay — task-8 populates and renders this
  overlay: {
    enabled:  false,
    title:    '',
    artist:   '',
    titleFont:  'Inter, system-ui, sans-serif',
    artistFont: 'Inter, system-ui, sans-serif',
    titleSize:  32,
    artistSize: 20,
    color:    '#E6EDF3',
    opacity:  1.0,
    position: 'bottom-left',
    x:        40,
    y:        40,
  },
}
