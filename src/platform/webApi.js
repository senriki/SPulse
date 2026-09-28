// Browser stand-in for preload.js's window.api.
// Installed only when Electron's contextBridge did not run (plain Chromium).
// Method names match preload.js so renderer.js can stay mostly platform-agnostic.

const AUDIO_EXT = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']
const PROJECT_EXT = ['spulse', 'spx']

const blobNames = new Map()

function _remember(url, name) {
  if (url && name) blobNames.set(url, name)
  return url
}

export function isWeb() {
  return window.api?.platform === 'web'
}

export function isElectron() {
  return typeof window.api?.platform === 'string' && window.api.platform !== 'web'
}

function _noop() {}
function _asyncNull() { return Promise.resolve(null) }
function _asyncFalse() { return Promise.resolve(undefined) }

function _basename(p) {
  return String(p || 'download').replace(/.*[/\\]/, '') || 'download'
}

function _extList(exts) {
  return (exts || []).map(e => `.${String(e).replace(/^\./, '')}`).join(',')
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function _pickFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true })
    // Chromium fires `cancel` when the dialog is dismissed with no file.
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

async function _fileToU8(file) {
  const buf = await file.arrayBuffer()
  return new Uint8Array(buf)
}

function _u8ToBase64(u8) {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function _base64ToU8(b64) {
  const binary = atob(b64)
  const u8 = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i)
  return u8
}

async function _readProjectFile() {
  const file = await _pickFile(_extList(PROJECT_EXT) + ',application/json')
  if (!file) return null
  try {
    const text = await file.text()
    return { filePath: file.name, data: JSON.parse(text) }
  } catch (err) {
    alert(`Could not read project file:\n${err.message}`)
    return null
  }
}

function createWebApi() {
  const bus = _makeBus()
  return {
    platform: 'web',

    getPathForFile: (file) => {
      if (!file) return ''
      return _remember(URL.createObjectURL(file), file.name)
    },

    openAudioFile: async () => {
      const file = await _pickFile(AUDIO_EXT.map(e => `.${e}`).join(',') + ',audio/*')
      if (!file) return null
      const buffer = await _fileToU8(file)
      return {
        buffer,
        filePath: _remember(URL.createObjectURL(file), file.name),
        fileName: file.name,
      }
    },

    loadAudioPath: async (filePath) => {
      if (!filePath) return null
      try {
        const res = await fetch(filePath)
        if (!res.ok) return { error: `HTTP ${res.status}` }
        const buffer = new Uint8Array(await res.arrayBuffer())
        return { buffer, filePath, fileName: blobNames.get(filePath) }
      } catch (err) {
        return { error: err.message }
      }
    },

    readFileAsBase64: async (filePath) => {
      if (!filePath) return null
      try {
        const res = await fetch(filePath)
        if (!res.ok) return { error: `HTTP ${res.status}` }
        const u8 = new Uint8Array(await res.arrayBuffer())
        return { data: _u8ToBase64(u8) }
      } catch (err) {
        return { error: err.message }
      }
    },

    writeTempFile: async (filename, data) => {
      const u8 = typeof data === 'string' ? _base64ToU8(data) : data
      const blob = new Blob([u8])
      return _remember(URL.createObjectURL(blob), filename)
    },

    openFileDialog: async (opts = {}) => {
      const file = await _pickFile(_extList(opts.extensions) || '*')
      if (!file) return null
      return _remember(URL.createObjectURL(file), file.name)
    },

    exportVideo: async () => ({ ok: false, error: 'FFmpeg is not available in the browser.' }),
    exportFrame: _asyncFalse,
    exportCancel: _asyncFalse,
    exportDone: _asyncFalse,
    quit: _noop,
    revealInFolder: _asyncFalse,
    detectGpuEncoders: async () => ({ label: 'CPU' }),
    pickOutputPath: async (_defaultPath) => _defaultPath || null,

    saveProject: async (data, defaultPath) => {
      const filename = _basename(defaultPath).replace(/\.(spx|spulse)$/i, '') + '.spulse'
      _downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), filename)
      return filename
    },
    exportProject: async (data, defaultPath) => {
      const filename = _basename(defaultPath) || 'project.spulse'
      _downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), filename)
      return filename
    },
    loadProject: _readProjectFile,
    importProject: _readProjectFile,
    loadProjectFromPath: _asyncNull,

    saveLastSession: _asyncFalse,
    loadLastSession: _asyncNull,
    recordRecentProject: _asyncFalse,
    loadRecentProjects: async () => [],
    removeRecentProject: _asyncFalse,
    clearRecentProjects: _asyncFalse,

    onExportProgress: _noop,
    onExportComplete: _noop,
    onExportError: _noop,
    removeExportListeners: _noop,
    onShowAbout: _noop,
    onMenuOpenAudio: _noop,
    onMenuNewSession: _noop,
    onMenuResetSettings: _noop,
    onMenuSaveProject: _noop,
    onMenuLoadProject: _noop,
    onMenuExportProject: _noop,
    onMenuImportProject: _noop,
    onOpenProjectFile: _noop,
    onMenuUndo: _noop,
    onMenuRedo: _noop,
    onMenuCheckUpdates: _noop,
    onUpdateAvailable: (cb) => bus.on('update-available', cb),
    onUpdateProgress: _noop,
    onUpdateDownloaded: _noop,
    onUpdateNotAvailable: (cb) => bus.on('update-not-available', cb),
    getAppVersion: async () => {
      try {
        const r = await fetch('/api/version')
        if (r.ok) {
          const j = await r.json()
          if (j.version) return j.version
        }
      } catch { /* fall through */ }
      return document.querySelector('meta[name="app-version"]')?.content || 'web'
    },
    checkForUpdates: async () => {
      try {
        const [localRes, upRes] = await Promise.all([
          fetch('/api/version'),
          fetch('/api/upstream'),
        ])
        if (!localRes.ok || !upRes.ok) {
          bus.emit('update-not-available', { error: !upRes.ok })
          return
        }
        const local = await localRes.json()
        const up = await upRes.json()
        const remote = up?.version
        const current = local?.version
        if (remote && current && _cmpSemver(remote, current) > 0) {
          bus.emit('update-available', { version: remote })
        } else {
          bus.emit('update-not-available')
        }
      } catch {
        bus.emit('update-not-available', { error: true })
      }
    },
    installUpdate: _asyncFalse,
    downloadUpdate: async () => {
      // A plain reload can serve the stale bundle from the HTTP cache. Bust the
      // cache with a unique query param so the freshly deployed build actually loads.
      const url = new URL(window.location.href)
      url.searchParams.set('_reload', String(Date.now()))
      window.location.replace(url)
    },

    downloadBlob: _downloadBlob,
    assetName: (filePath) => blobNames.get(filePath) || '',
  }
}

function _cmpSemver(a, b) {
  const parse = v => {
    const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
    if (!m) return { n: [0, 0, 0], pre: String(v) }
    return { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' }
  }
  const A = parse(a)
  const B = parse(b)
  for (let i = 0; i < 3; i++) {
    if (A.n[i] !== B.n[i]) return A.n[i] - B.n[i]
  }
  if (!A.pre && B.pre) return 1
  if (A.pre && !B.pre) return -1
  if (A.pre === B.pre) return 0
  return A.pre < B.pre ? -1 : 1
}

function _makeBus() {
  const map = new Map()
  return {
    on(name, cb) {
      if (typeof cb !== 'function') return
      if (!map.has(name)) map.set(name, [])
      map.get(name).push(cb)
    },
    emit(name, data) {
      for (const cb of map.get(name) || []) cb(data)
    },
  }
}

export function ensurePlatformApi() {
  if (window.api) return window.api
  window.api = createWebApi()
  return window.api
}

export { createWebApi }
