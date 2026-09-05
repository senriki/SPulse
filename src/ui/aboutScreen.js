// About screen modal — opened via Help > About (native menu on macOS via IPC,
// or the in-app menu bar on Windows/Linux via a direct call to showAbout()).
export function showAbout() {
  document.getElementById('about-modal')?.classList.remove('hidden')
}

export function initAboutScreen() {
  const modal = document.getElementById('about-modal')
  if (!modal) return

  document.getElementById('about-modal-close')?.addEventListener('click', () => modal.classList.add('hidden'))
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden') })

  // Populate version from package.json via app.getVersion() (main process)
  window.api.getAppVersion?.().then(v => {
    const el = document.getElementById('about-version')
    if (el) el.textContent = `Version ${v}`
  })

  window.api.onShowAbout?.(showAbout)
}
