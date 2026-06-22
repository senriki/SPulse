// Wires the style-picker icon grid in the left panel to the canvas engine.
// Handles active-state highlighting and mode switching.
export function initStylePicker(engine) {
  const buttons = document.querySelectorAll('#style-picker .style-btn')

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode
      if (!mode) return
      engine.setMode(mode)
      buttons.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })
}
