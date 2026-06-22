// Binds a range input to a display element and fires onChange with the numeric value.
// fmt: (value: number) => string  — formats the display label (e.g. v => `${v}px`)
// Returns a setter for programmatic updates (e.g. project load, undo/redo).
export function setupSlider(inputEl, displayEl, fmt, onChange) {
  const push = () => {
    const v = parseFloat(inputEl.value)
    if (displayEl) displayEl.textContent = fmt(v)
    onChange(v)
  }

  inputEl.addEventListener('input', push)
  // Initialize display from the HTML default value
  if (displayEl) displayEl.textContent = fmt(parseFloat(inputEl.value))

  return (val) => {
    inputEl.value = val
    if (displayEl) displayEl.textContent = fmt(val)
  }
}
