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

// ─── Recent Projects (Feature H) ───────────────────────────────────────────
async function _renderRecentProjects(container, separator, actions) {
  const list = await window.api.loadRecentProjects()
  container.innerHTML = ''

  if (list.length === 0) {
    separator.hidden = true
    const empty = document.createElement('div')
    empty.className = 'menu-action menu-recent-empty'
    empty.textContent = 'No recent projects'
    container.appendChild(empty)
    return
  }

  separator.hidden = false
  for (const entry of list) {
    const row = document.createElement('button')
    row.className = 'menu-action menu-recent-item'
    row.textContent = entry.name
    row.dataset.recentPath = entry.filePath
    container.appendChild(row)
  }

  const clear = document.createElement('button')
  clear.className = 'menu-action menu-recent-clear'
  clear.textContent = 'Clear Recent'
  clear.dataset.recentClear = 'true'
  container.appendChild(clear)
}

async function _handleRecentClick(target, container, separator, actions) {
  if (target.dataset.recentClear) {
    await window.api.clearRecentProjects()
    await _renderRecentProjects(container, separator, actions)
    return
  }

  const filePath = target.dataset.recentPath
  if (!filePath) return

  const result = await window.api.loadProjectFromPath(filePath)
  if (result.error) {
    await window.api.removeRecentProject(filePath)
    await _renderRecentProjects(container, separator, actions)
    const hint = document.getElementById('project-hint')
    if (hint) hint.textContent = `${target.textContent} not found — removed from Recent`
    return
  }

  await actions.openProjectFile?.(result)
}

// Collapsed/expanded state (VS Code-style toggle) survives restarts, same
// localStorage pattern already used for the dismissed-update-version key.
const COLLAPSED_KEY = 'spulse-menubar-collapsed'

export function initMenuBar(actions) {
  const wrap = document.getElementById('app-menu-bar')
  const bar  = document.getElementById('menu-bar')
  if (!wrap || !bar) return
  if (window.api.platform === 'darwin') return // stays hidden — native menu owns macOS

  wrap.classList.remove('hidden')

  const toggle = document.getElementById('app-menu-toggle')
  const collapsed = localStorage.getItem(COLLAPSED_KEY) === 'true'
  bar.classList.toggle('collapsed', collapsed)
  toggle?.addEventListener('click', () => {
    const nowCollapsed = bar.classList.toggle('collapsed')
    localStorage.setItem(COLLAPSED_KEY, nowCollapsed)
  })

  const items = [...bar.querySelectorAll('.menu-item')]
  const recentContainer = document.getElementById('menu-recent-projects')
  const recentSeparator = document.getElementById('menu-recent-separator')

  function closeAll() {
    items.forEach(item => item.classList.remove('active'))
  }

  items.forEach(item => {
    item.querySelector('.menu-trigger')?.addEventListener('click', e => {
      e.stopPropagation()
      const wasActive = item.classList.contains('active')
      closeAll()
      if (!wasActive) {
        item.classList.add('active')
        if (item.dataset.menu === 'file') _renderRecentProjects(recentContainer, recentSeparator, actions)
      }
    })
  })

  bar.querySelectorAll('.menu-action').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAll()
      const key = ACTION_KEYS[btn.dataset.action]
      actions[key]?.()
    })
  })

  recentContainer?.addEventListener('click', e => {
    const target = e.target.closest('.menu-recent-item, .menu-recent-clear')
    if (!target) return
    e.stopPropagation()
    _handleRecentClick(target, recentContainer, recentSeparator, actions)
    if (target.dataset.recentPath) closeAll()
  })

  document.addEventListener('click', closeAll)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll() })
}
