import { setupColorPicker } from './colorPicker.js'
import { setupSlider }      from './sliders.js'

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

  $$('[name="bg-type"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (!e.target.checked) return
      const type = e.target.value
      visualizerState.background.type = type
      Object.entries(bgSections).forEach(([key, el]) => {
        if (el) el.classList.toggle('hidden', key !== type)
      })
    })
  })

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
