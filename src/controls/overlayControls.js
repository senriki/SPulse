import { setupColorPicker } from './colorPicker.js'
import { setupSlider }      from './sliders.js'

// Wire all right-panel Text Overlay controls to visualizerState.overlay.
// Called from renderer.js with the overlay sub-object.
export function initOverlayControls(overlayState) {
  const $ = id => document.getElementById(id)

  const toggle   = $('overlay-enabled')
  const controls = $('overlay-controls')

  // ── Toggle ──────────────────────────────────────────────────────────────────
  toggle?.addEventListener('change', e => {
    const on = e.target.checked
    overlayState.enabled = on
    if (on) controls?.removeAttribute('data-disabled')
    else    controls?.setAttribute('data-disabled', 'true')
    controls?.querySelectorAll('input, select').forEach(el => {
      el.disabled = !on
    })
  })

  // ── Text fields ──────────────────────────────────────────────────────────────
  $('overlay-title')?.addEventListener('input', e => {
    overlayState.title = e.target.value
  })

  $('overlay-artist')?.addEventListener('input', e => {
    overlayState.artist = e.target.value
  })

  // ── Font picker ───────────────────────────────────────────────────────────────
  $('overlay-font')?.addEventListener('change', e => {
    overlayState.font = e.target.value
  })

  // ── Position selector ─────────────────────────────────────────────────────────
  $('overlay-position')?.addEventListener('change', e => {
    overlayState.position = e.target.value
    $('overlay-xy-group')?.classList.toggle('hidden', e.target.value !== 'custom')
  })

  // ── Custom XY inputs ──────────────────────────────────────────────────────────
  $('overlay-x')?.addEventListener('input', e => {
    overlayState.x = Math.max(0, parseInt(e.target.value) || 0)
  })

  $('overlay-y')?.addEventListener('input', e => {
    overlayState.y = Math.max(0, parseInt(e.target.value) || 0)
  })

  // ── Color ─────────────────────────────────────────────────────────────────────
  setupColorPicker($('overlay-color'), null, v => { overlayState.color = v })

  // ── Size ──────────────────────────────────────────────────────────────────────
  setupSlider(
    $('overlay-size'), $('overlay-size-val'),
    v => `${v}px`,
    v => { overlayState.size = Math.round(v) }
  )

  // ── Opacity ───────────────────────────────────────────────────────────────────
  setupSlider(
    $('overlay-opacity'), $('overlay-opacity-val'),
    v => `${v}%`,
    v => { overlayState.opacity = v / 100 }
  )
}
