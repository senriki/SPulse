// About screen modal — opened via Help > About menu (main → renderer IPC).
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

  window.api.onShowAbout?.(() => modal.classList.remove('hidden'))
}
