// Syncs a native <input type="color"> with an optional text hex field.
// Returns a setter for programmatic updates (e.g. project load).
export function setupColorPicker(colorEl, hexEl, onChange) {
  const push = (hex) => {
    if (hexEl) hexEl.value = hex.toUpperCase()
    onChange(hex)
  }

  colorEl.addEventListener('input', () => push(colorEl.value))

  if (hexEl) {
    hexEl.addEventListener('input', () => {
      const v = hexEl.value.trim()
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        colorEl.value = v
        onChange(v)
      }
    })
    hexEl.addEventListener('blur', () => {
      // Revert malformed input to the current color
      if (!/^#[0-9A-Fa-f]{6}$/.test(hexEl.value.trim())) {
        hexEl.value = colorEl.value.toUpperCase()
      }
    })
    hexEl.value = colorEl.value.toUpperCase()
  }

  return (hex) => {
    colorEl.value = hex
    if (hexEl) hexEl.value = hex.toUpperCase()
  }
}
