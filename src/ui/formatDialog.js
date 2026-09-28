// Project format chooser — web only. The web build has no separate "this device"
// save, so Save and Export Project both ask: .spx (file links only) or portable
// .spulse (assets embedded as base64). Desktop never shows this: Save writes .spx
// and Export writes .spulse directly. Mirrors confirmDialog.js.

let _resolver = null
let _returnFocus = null

function _getEls() {
  return {
    modal:     document.getElementById('project-format-modal'),
    title:     document.getElementById('project-format-title'),
    spxBtn:    document.getElementById('project-format-spx'),
    spulseBtn: document.getElementById('project-format-spulse'),
    cancelBtn: document.getElementById('project-format-cancel'),
  }
}

function _settle(value) {
  const { modal } = _getEls()
  if (!modal || !_resolver) return
  modal.classList.add('hidden')
  const resolve = _resolver
  _resolver = null
  _returnFocus?.focus?.()
  _returnFocus = null
  resolve(value)
}

export function initFormatDialog() {
  const { modal, spxBtn, spulseBtn, cancelBtn } = _getEls()
  if (!modal) return

  spxBtn?.addEventListener('click', () => _settle('spx'))
  spulseBtn?.addEventListener('click', () => _settle('spulse'))
  cancelBtn?.addEventListener('click', () => _settle(null))

  // Dismiss on backdrop click
  modal.addEventListener('click', e => {
    if (e.target === modal) _settle(null)
  })

  document.addEventListener('keydown', e => {
    if (modal.classList.contains('hidden')) return
    // Dismiss on Escape
    if (e.key === 'Escape') { _settle(null); return }
    // Keep Tab focus inside the dialog
    if (e.key !== 'Tab') return
    const focusable = [spxBtn, spulseBtn, cancelBtn].filter(Boolean)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  })
}

// Resolves to 'spx', 'spulse', or null when cancelled. Falls back to 'spulse' if
// the markup is missing, preserving the portable-only default.
export function chooseProjectFormat({ title = 'Export Project' } = {}) {
  const { modal, title: titleEl, cancelBtn } = _getEls()
  if (!modal) return Promise.resolve('spulse')
  if (titleEl) titleEl.textContent = title
  _returnFocus = document.activeElement
  modal.classList.remove('hidden')
  cancelBtn?.focus()
  return new Promise(resolve => { _resolver = resolve })
}
