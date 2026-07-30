import { exportSettings } from '../export/exportSettings.js'
import { computeBarLayout } from './modes/_barLayout.js'

// Central visualizer configuration — all modules read from this object.
// Task-5 wires left-panel controls to mutate these values.
// Task-9 (export) reads this for per-frame rendering.

// Single source of truth for the hardcoded defaults — returns a fresh object each
// call so callers never share mutable state with each other or with `visualizerState`.
// Used both to build the initial `visualizerState` below and to power the
// "Reset to default" action (see resetVisualizerStateToDefaults).
function _createDefaultVisualizerState() {
  // Bar / line dimensions — defined here (not inline below) so numBars can be
  // derived from these exact values via computeBarLayout, instead of hardcoding
  // numBars as a magic number that could silently drift from barWidth/barGap/padding.
  const barWidth = 4
  const barGap   = 1
  const padding  = 16
  const { numBars } = computeBarLayout({ targetW: exportSettings.width, padding, barWidth, barGap })

  return {
    mode: 'bar_classic',

    // Waveform appearance
    color:   '#00D4FF',
    opacity: 1.0,
    glow:    0,          // 0–100 maps to 0–30px shadowBlur

    // Bar / line dimensions
    barWidth,
    barGap,
    numBars,             // primary control for bar_classic/bar_mirror/spectrum_glow — barWidth is derived from this (see _barLayout.js deriveBarWidth)
    mirrorLR: false,     // Feature C — mirror bar pattern around the vertical center axis; combinable with all bar modes
    mirrorPeakCenter: false, // sub-option of mirrorLR — reorders bars by live magnitude so the loudest is always at center, instead of a fixed frequency→position mapping
    lineWidth: 2,
    padding,

    // Smoothing (0–99 → 0.0–0.99 AnalyserNode.smoothingTimeConstant)
    smoothing: 80,

    // Sensitivity: amplitude multiplier applied to all visualizer modes (1.0 = default)
    sensitivity: 1.0,

    // Position
    centerVertically: true,
    yOffset: 0,

    // Stereo (Feature A) — mono is the unchanged default
    channelMode: 'mono',            // 'mono' | 'stereo'
    stereoLayout: 'stacked',        // 'stacked' | 'mirrored' — only meaningful when channelMode is 'stereo'
    independentChannelColors: false,
    colorL: '#00D4FF',              // matches the default `color`, so opting into stereo looks identical until independentChannelColors is enabled
    colorR: '#FF6B35',              // distinct accent so enabling independentChannelColors is immediately visible

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
}

export const visualizerState = _createDefaultVisualizerState()

// Restore visualizerState to its original hardcoded defaults, in place — mutates the
// existing object/sub-objects rather than replacing them, since other modules
// (canvasEngine, backgroundRenderer, etc.) hold direct references to
// visualizerState.background / visualizerState.overlay.
export function resetVisualizerStateToDefaults() {
  const { background: defaultBg, overlay: defaultOv, ...topLevelDefaults } = _createDefaultVisualizerState()
  // Only assign top-level (primitive) fields here — background/overlay are excluded
  // and merged into the EXISTING sub-objects below instead, so their identity never
  // changes. overlayControls.js/backgroundRenderer.js were handed these exact object
  // references once at startup (initOverlayControls(visualizerState.overlay) etc.); if
  // Object.assign(visualizerState, defaults) were used directly, it would silently swap
  // in new background/overlay objects and permanently disconnect those controls from
  // whatever canvasEngine actually reads from then on.
  Object.assign(visualizerState, topLevelDefaults)
  Object.assign(visualizerState.background, defaultBg)
  Object.assign(visualizerState.overlay, defaultOv)
}
