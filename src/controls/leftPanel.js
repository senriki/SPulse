import { setupColorPicker } from './colorPicker.js'
import { setupSlider }      from './sliders.js'

// Modes whose bar count is fully derived from numBars (Feature B) — for these, the
// Bar Width slider has no effect on layout anymore, so it's hidden.
const BAR_MODES = ['bar_classic', 'bar_mirror', 'spectrum_glow']

// Shared by stylePicker.js's mode-switch handler and initial load (renderer.js's
// _syncDomFromState) — toggles the Bar Width control-group based on active mode.
export function updateBarWidthVisibility(mode) {
  document.getElementById('bar-width-group')?.classList.toggle('hidden', BAR_MODES.includes(mode))
}

// Wire all left-panel controls to visualizerState.
// appState is passed in to avoid a circular import with renderer.js.
// All setters returned by setupColorPicker/setupSlider are collected for
// project-load (task-11) to restore state without firing side effects.
export function initLeftPanel(appState, visualizerState) {
  const $ = id => document.getElementById(id)
  const $$ = sel => document.querySelectorAll(sel)

  // ─── Waveform Color ────────────────────────────────────────────────────────
  setupColorPicker(
    $('waveform-color'),
    $('waveform-color-hex'),
    v => { visualizerState.color = v }
  )

  // ─── Opacity ───────────────────────────────────────────────────────────────
  setupSlider(
    $('waveform-opacity'), $('waveform-opacity-val'),
    v => `${v}%`,
    v => { visualizerState.opacity = v / 100 }
  )

  // ─── Glow ──────────────────────────────────────────────────────────────────
  setupSlider(
    $('waveform-glow'), $('waveform-glow-val'),
    v => `${v}%`,
    v => { visualizerState.glow = v }
  )

  // ─── Bar Width ─────────────────────────────────────────────────────────────
  setupSlider(
    $('bar-width'), $('bar-width-val'),
    v => `${v}px`,
    v => { visualizerState.barWidth = Math.round(v) }
  )

  // ─── Bar Gap ───────────────────────────────────────────────────────────────
  setupSlider(
    $('bar-gap'), $('bar-gap-val'),
    v => `${v}px`,
    v => { visualizerState.barGap = Math.round(v) }
  )

  // ─── Bar Count ─────────────────────────────────────────────────────────────
  const setBarCount = setupSlider(
    $('bar-count'), $('bar-count-val'),
    v => `${Math.round(v)}`,
    v => { visualizerState.numBars = Math.round(v) }
  )
  // Sync the slider's initial position to numBars' programmatically-computed
  // default (not the markup's literal `value=`, which is just a fallback).
  setBarCount(visualizerState.numBars)

  // ─── Bar Width visibility (hidden for numBars-driven bar modes) ──────────────
  updateBarWidthVisibility(visualizerState.mode)

  // ─── Mirror Left/Right ─────────────────────────────────────────────────────
  const mirrorPeakCenterGroupEl = $('mirror-peak-center-group')
  $('mirror-lr').addEventListener('change', e => {
    visualizerState.mirrorLR = e.target.checked
    mirrorPeakCenterGroupEl?.classList.toggle('hidden', !e.target.checked)
  })
  mirrorPeakCenterGroupEl?.classList.toggle('hidden', !visualizerState.mirrorLR)

  // ─── Mirror Peak at Center (sub-option of Mirror Left/Right) ──────────────
  $('mirror-peak-center')?.addEventListener('change', e => {
    visualizerState.mirrorPeakCenter = e.target.checked
  })

  // ─── Channel Mode (Stereo) ─────────────────────────────────────────────────
  const stereoControlsEl       = $('stereo-controls')
  const channelColorControlsEl = $('channel-color-controls')

  $$('[name="channel-mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return
      visualizerState.channelMode = e.target.value
      stereoControlsEl?.classList.toggle('hidden', e.target.value !== 'stereo')
    })
  })

  $('stereo-layout')?.addEventListener('change', e => {
    visualizerState.stereoLayout = e.target.value
  })

  $('independent-channel-colors')?.addEventListener('change', e => {
    visualizerState.independentChannelColors = e.target.checked
    channelColorControlsEl?.classList.toggle('hidden', !e.target.checked)
  })

  setupColorPicker(
    $('waveform-color-l'), null,
    v => { visualizerState.colorL = v }
  )
  setupColorPicker(
    $('waveform-color-r'), null,
    v => { visualizerState.colorR = v }
  )

  // Sync initial section visibility to state (matches markup defaults today, but
  // stays correct if the hardcoded defaults ever change).
  stereoControlsEl?.classList.toggle('hidden', visualizerState.channelMode !== 'stereo')
  channelColorControlsEl?.classList.toggle('hidden', !visualizerState.independentChannelColors)

  // ─── Line Width ────────────────────────────────────────────────────────────
  setupSlider(
    $('line-width'), $('line-width-val'),
    v => `${v}px`,
    v => { visualizerState.lineWidth = v }
  )

  // ─── Canvas Padding ────────────────────────────────────────────────────────
  setupSlider(
    $('canvas-padding'), $('canvas-padding-val'),
    v => `${v}px`,
    v => { visualizerState.padding = Math.round(v) }
  )

  // ─── Smoothing ────────────────────────────────────────────────────────────
  setupSlider(
    $('smoothing'), $('smoothing-val'),
    v => `${v}%`,
    v => {
      visualizerState.smoothing = v
      appState.analyser?.setSmoothingTimeConstant(v / 100)
    }
  )

  // ─── Sensitivity ─────────────────────────────────────────────────────────
  setupSlider(
    $('sensitivity'), $('sensitivity-val'),
    v => `${v}%`,
    v => { visualizerState.sensitivity = v / 100 }
  )

  // ─── Waveform Position ────────────────────────────────────────────────────
  $('waveform-center').addEventListener('change', e => {
    visualizerState.centerVertically = e.target.checked
  })

  setupSlider(
    $('y-offset'), $('y-offset-val'),
    v => `${Math.round(v)}px`,
    v => { visualizerState.yOffset = Math.round(v) }
  )

  // ─── Background Type Selector ─────────────────────────────────────────────
  const bgSections = {
    solid:    $('bg-solid-controls'),
    gradient: $('bg-gradient-controls'),
    image:    $('bg-image-controls'),
    video:    $('bg-video-controls'),
  }
  const bgPositionSection = $('bg-position-section')

  $$('[name="bg-type"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return
      const type = e.target.value
      visualizerState.background.type = type
      Object.entries(bgSections).forEach(([key, el]) => {
        if (el) el.classList.toggle('hidden', key !== type)
      })
      bgPositionSection?.classList.toggle('hidden', type !== 'image' && type !== 'video')
    })
  })

  // ─── Background Fit Mode + Zoom ───────────────────────────────────────────
  $('bg-fit-mode')?.addEventListener('change', e => {
    visualizerState.background.fitMode = e.target.value
  })

  setupSlider(
    $('bg-scale'), $('bg-scale-val'),
    v => `${Math.round(v)}%`,
    v => { visualizerState.background.scale = v / 100 }
  )

  // ─── Solid Background Color ───────────────────────────────────────────────
  setupColorPicker(
    $('bg-color'), null,
    v => { visualizerState.background.color = v }
  )

  // ─── Gradient Colors + Angle ──────────────────────────────────────────────
  setupColorPicker(
    $('bg-gradient-a'), null,
    v => { visualizerState.background.gradientA = v }
  )
  setupColorPicker(
    $('bg-gradient-b'), null,
    v => { visualizerState.background.gradientB = v }
  )
  setupSlider(
    $('bg-gradient-angle'), $('bg-angle-val'),
    v => `${Math.round(v)}°`,
    v => { visualizerState.background.gradientAngle = Math.round(v) }
  )

  // ─── Image Background: Blur + Darken ─────────────────────────────────────
  // File picker wired in task-7; these sliders are ready immediately
  setupSlider(
    $('bg-image-blur'), $('bg-blur-val'),
    v => `${v}px`,
    v => { visualizerState.background.imageBlur = v }
  )
  setupSlider(
    $('bg-image-darken'), $('bg-darken-val'),
    v => `${v}%`,
    v => { visualizerState.background.imageDarken = v }
  )
}
