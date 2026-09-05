// Custom in-app menu bar (Windows/Linux only — macOS keeps its native menu,
// see main.js's createMenu()). Pure re-skin of the native File/Edit/Help menu:
// same items, same order, each wired directly to the same renderer-side
// function the native menu's IPC round-trip used to call — no IPC needed here.
const ACTION_KEYS = {
  'new-session':    'newSession',
  'reset-settings': 'resetSettings',
  'open-audio':     'openFilePicker',
  'save-project':   'saveProject',
  'load-project':   'loadProject',
  'export-project': 'exportProject',
  'import-project': 'importProject',
  'quit':           'quit',
  'undo':           'undo',
  'redo':           'redo',
  'about':          'showAbout',
  'check-updates':  'checkForUpdatesManually',
}

export function initMenuBar(actions) {
  const bar = document.getElementById('menu-bar')
  if (!bar) return
  if (window.api.platform === 'darwin') return // stays hidden — native menu owns macOS

  bar.classList.remove('hidden')

  const items = [...bar.querySelectorAll('.menu-item')]

  function closeAll() {
    items.forEach(item => item.classList.remove('active'))
  }

  items.forEach(item => {
    item.querySelector('.menu-trigger')?.addEventListener('click', e => {
      e.stopPropagation()
      const wasActive = item.classList.contains('active')
      closeAll()
      if (!wasActive) item.classList.add('active')
    })
  })

  bar.querySelectorAll('.menu-action').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAll()
      const key = ACTION_KEYS[btn.dataset.action]
      actions[key]?.()
    })
  })

  document.addEventListener('click', closeAll)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll() })
}
