// About screen modal — opened via Help > About menu (main → renderer IPC).
export function initAboutScreen() {
  const modal = document.getElementById('about-modal')
  if (!modal) return

  document.getElementById('about-modal-close')?.addEventListener('click', () => modal.classList.add('hidden'))
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden') })

  // Main process sends 'show-about' when the user clicks Help > About
  window.api.onShowAbout?.(() => modal.classList.remove('hidden'))
}
