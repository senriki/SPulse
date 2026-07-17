const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Audio
  openAudioFile: () =>
    ipcRenderer.invoke('open-audio-file'),
  loadAudioPath: (filePath) =>
    ipcRenderer.invoke('load-audio-path', filePath),

  // Generic file picker (background images, videos)
  openFileDialog: (opts) =>
    ipcRenderer.invoke('open-file-dialog', opts),

  // Export pipeline
  exportVideo: (config) =>
    ipcRenderer.invoke('export-video', config),
  exportFrame: (frameData, frameIndex) =>
    ipcRenderer.invoke('export-frame', { frameData, frameIndex }),
  exportCancel: () =>
    ipcRenderer.invoke('export-cancel'),
  exportDone: () =>
    ipcRenderer.invoke('export-done'),

  // App control
  quit: () =>
    ipcRenderer.invoke('quit'),
  revealInFolder: (filePath) =>
    ipcRenderer.invoke('reveal-in-folder', filePath),

  // GPU encoder detection
  detectGpuEncoders: () =>
    ipcRenderer.invoke('detect-gpu-encoders'),

  // Output path save dialog
  pickOutputPath: (defaultPath) =>
    ipcRenderer.invoke('pick-output-path', { defaultPath }),

  // Project file
  saveProject: (data, defaultPath) =>
    ipcRenderer.invoke('save-project', { data, defaultPath }),
  loadProject: () =>
    ipcRenderer.invoke('load-project'),

  // Main → Renderer events (export progress)
  onExportProgress: (cb) =>
    ipcRenderer.on('export-progress', (event, data) => cb(data)),
  onExportComplete: (cb) =>
    ipcRenderer.on('export-complete', (event, data) => cb(data)),
  onExportError: (cb) =>
    ipcRenderer.on('export-error', (event, data) => cb(data)),
  removeExportListeners: () => {
    ipcRenderer.removeAllListeners('export-progress')
    ipcRenderer.removeAllListeners('export-complete')
    ipcRenderer.removeAllListeners('export-error')
  },

  // Main → Renderer: app menu events & About screen
  onShowAbout:       (cb) => ipcRenderer.on('show-about',          () => cb()),
  onMenuOpenAudio:   (cb) => ipcRenderer.on('menu-open-audio',     () => cb()),
  onMenuSaveProject: (cb) => ipcRenderer.on('menu-save-project',   () => cb()),
  onMenuUndo:        (cb) => ipcRenderer.on('menu-undo',           () => cb()),
  onMenuRedo:        (cb) => ipcRenderer.on('menu-redo',           () => cb()),
  onMenuCheckUpdates:(cb) => ipcRenderer.on('menu-check-updates',  () => cb()),

  // Auto-updater
  onUpdateAvailable:    (cb) => ipcRenderer.on('update-available',     (_, d) => cb(d)),
  onUpdateProgress:     (cb) => ipcRenderer.on('update-progress',      (_, d) => cb(d)),
  onUpdateDownloaded:   (cb) => ipcRenderer.on('update-downloaded',    (_, d) => cb(d)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', () => cb()),
  getAppVersion:     ()   => ipcRenderer.invoke('get-app-version'),
  checkForUpdates:   ()   => ipcRenderer.invoke('check-for-updates'),
  installUpdate:     ()   => ipcRenderer.invoke('install-update'),
  downloadUpdate:    ()   => ipcRenderer.invoke('download-update'),
})
