// Dismissible error dialog with optional FFmpeg log excerpt.
// HTML elements must be present in index.html (#error-modal, etc.)

export function showErrorDialog(title, message, log = '') {
  const modal   = document.getElementById('error-modal')
  const titleEl = document.getElementById('error-modal-title')
  const msgEl   = document.getElementById('error-modal-msg')
  const logEl   = document.getElementById('error-modal-log')
  if (!modal) return
  if (titleEl) titleEl.textContent = title
  if (msgEl)   msgEl.textContent   = message
  if (logEl) {
    logEl.textContent = log
    logEl.classList.toggle('hidden', !log.trim())
  }
  modal.classList.remove('hidden')
}

export function initErrorDialog() {
  const modal = document.getElementById('error-modal')
  if (!modal) return
  document.getElementById('error-modal-close')?.addEventListener('click', () => modal.classList.add('hidden'))
  // Dismiss on backdrop click
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden') })
}
