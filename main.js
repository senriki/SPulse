const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path        = require('path')
const fs          = require('fs')
const os          = require('os')
const { spawn }   = require('child_process')
const ffmpegBin   = require('./src/export/ffmpegPath')
const { FrameWriter }       = require('./src/export/frameWriter')
const { detectGpuEncoders } = require('./src/export/gpuDetect')
const { autoUpdater }       = require('electron-updater')

let _mainWin = null

// ─── Auto-updater ─────────────────────────────────────────────────────────────
function _initAutoUpdater() {
  // Only runs in packaged app — skip silently in dev mode
  if (!app.isPackaged) return

  autoUpdater.autoDownload    = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', info => {
    _mainWin?.webContents.send('update-available', { version: info.version })
  })

  autoUpdater.on('download-progress', progress => {
    _mainWin?.webContents.send('update-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', info => {
    _mainWin?.webContents.send('update-downloaded', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    _mainWin?.webContents.send('update-not-available')
  })

  autoUpdater.on('error', () => {
    _mainWin?.webContents.send('update-not-available')
  })

  // Check 3 seconds after launch so it doesn't block startup
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)
}

function createWindow() {
  _mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0D1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  _mainWin.loadFile('src/index.html')
}

function createMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Session', accelerator: 'CmdOrCtrl+N', click: () => _mainWin?.webContents.send('menu-new-session') },
        { type: 'separator' },
        { label: 'Open Audio…', accelerator: 'CmdOrCtrl+O', click: () => _mainWin?.webContents.send('menu-open-audio') },
        { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => _mainWin?.webContents.send('menu-save-project') },
        { label: 'Load Project…', click: () => _mainWin?.webContents.send('menu-load-project') },
        { type: 'separator' },
        { label: 'Export Project…', click: () => _mainWin?.webContents.send('menu-export-project') },
        { label: 'Import Project…', click: () => _mainWin?.webContents.send('menu-import-project') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => _mainWin?.webContents.send('menu-undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: () => _mainWin?.webContents.send('menu-redo') },
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About SPulse', click: () => _mainWin?.webContents.send('show-about') },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => _mainWin?.webContents.send('menu-check-updates') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  createWindow()
  createMenu()
  _initAutoUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── App control ─────────────────────────────────────────────────────────────
ipcMain.handle('quit', () => app.quit())
ipcMain.handle('reveal-in-folder', (_, filePath) => shell.showItemInFolder(filePath))
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('check-for-updates', () => {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates().catch(() => {})
})
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall()
})
ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate().catch(() => {})
})

// ─── GPU encoder detection ────────────────────────────────────────────────────
ipcMain.handle('detect-gpu-encoders', () => detectGpuEncoders())

// ─── Audio file ───────────────────────────────────────────────────────────────
ipcMain.handle('open-audio-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Audio File',
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  const filePath = filePaths[0]
  const buffer = fs.readFileSync(filePath)
  return { filePath, buffer }
})

// ─── Generic file dialog ──────────────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async (event, { title, extensions }) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title,
    filters: [{ name: 'File', extensions }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

// ─── Project file ─────────────────────────────────────────────────────────────
ipcMain.handle('save-project', async (event, { data, defaultPath }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Project',
    defaultPath: defaultPath || 'project.spx',
    filters: [{ name: 'SPulse Project', extensions: ['spx'] }]
  })
  if (canceled || !filePath) return null
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  return filePath
})

ipcMain.handle('export-project', async (event, { data, defaultPath }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Project',
    defaultPath: defaultPath || 'project.spx',
    filters: [{ name: 'SPulse Project', extensions: ['spx'] }]
  })
  if (canceled || !filePath) return null
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  return filePath
})

ipcMain.handle('load-project', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Project',
    filters: [{ name: 'SPulse Project', extensions: ['spx'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  const filePath = filePaths[0]
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return { filePath, data }
})

// Same read logic as load-project — deserializeState() (renderer side) transparently
// handles both legacy v1.0 and portable v2.0 files, so this only differs in dialog title.
ipcMain.handle('import-project', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import Project',
    filters: [{ name: 'SPulse Project', extensions: ['spx'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  const filePath = filePaths[0]
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return { filePath, data }
})

// ─── Auto-persisted last-used settings (no dialog) ───────────────────────────
ipcMain.handle('save-last-session', (event, data) => {
  const filePath = path.join(app.getPath('userData'), 'last-session.json')
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
})

ipcMain.handle('load-last-session', () => {
  const filePath = path.join(app.getPath('userData'), 'last-session.json')
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
})

// ─── Load audio by explicit path (used by project load — no dialog) ──────────
ipcMain.handle('load-audio-path', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath)
    return { filePath, buffer }
  } catch (err) {
    return { error: err.message }
  }
})

// ─── Read a file as base64 (used for portable project export) ───────────────
ipcMain.handle('read-file-as-base64', (event, filePath) => {
  try {
    return { data: fs.readFileSync(filePath).toString('base64') }
  } catch (err) {
    return { error: err.message }
  }
})

// ─── Write base64 data to a uniquely-named temp file (portable project import) ──
// Each call gets its own temp subfolder so repeated imports / multiple assets in the
// same import never collide, and the original filename/extension is preserved.
ipcMain.handle('write-temp-file', (event, { filename, data }) => {
  const dir = path.join(app.getPath('temp'), `spulse-import-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename || 'asset')
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
  return filePath
})

// ─── Output path save dialog ─────────────────────────────────────────────────
ipcMain.handle('pick-output-path', async (event, { defaultPath }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save MP4 Video',
    defaultPath: defaultPath || 'spulse.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  })
  if (canceled || !filePath) return null
  return filePath
})

// ─── Export pipeline ──────────────────────────────────────────────────────────
// Active export session — shared between export-video / export-frame / export-done / export-cancel
let _session = null

function _resolveEncoder(userPref, isH265) {
  const gpu = detectGpuEncoders()
  if (!userPref || userPref === 'auto') return isH265 ? gpu.h265 : gpu.h264
  if (userPref === 'nvenc') return isH265 ? 'hevc_nvenc' : 'h264_nvenc'
  if (userPref === 'amf')   return isH265 ? 'hevc_amf'   : 'h264_amf'
  if (userPref === 'qsv')   return isH265 ? 'hevc_qsv'   : 'h264_qsv'
  return isH265 ? 'libx265' : 'libx264'
}

function _encoderQualityArgs(encoder, bitrate, isH265) {
  const crf = isH265 ? '28' : '23'
  if (bitrate) {
    if (encoder.includes('nvenc') || encoder.includes('amf')) return ['-rc', 'cbr', '-b:v', `${bitrate}k`]
    return ['-b:v', `${bitrate}k`]
  }
  if (encoder.includes('nvenc')) return ['-preset', 'p4', '-tune', 'hq', '-rc', 'vbr', '-cq', crf]
  if (encoder.includes('amf'))   return ['-quality', 'quality', '-rc', 'cqp', '-qp_i', crf, '-qp_p', String(Number(crf) + 2)]
  if (encoder.includes('qsv'))   return ['-global_quality', crf, '-look_ahead', '1']
  return ['-crf', crf, '-preset', 'medium']
}

function _buildFFmpegArgs(config, mode, frameDir) {
  const { width, height, fps, codec, audioMode, bitrate, audioPath, outputPath, encoder: userEncoder } = config
  const args = []

  if (mode === 'pipe') {
    args.push('-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0')
  } else {
    args.push('-framerate', String(fps), '-i', path.join(frameDir, 'frame%08d.jpg'))
  }

  // Audio input
  args.push('-i', audioPath)

  // Video codec + quality
  const isH265  = codec === 'h265'
  const encoder = _resolveEncoder(userEncoder, isH265)
  args.push('-c:v', encoder)
  if (isH265) args.push('-tag:v', 'hvc1')
  args.push(..._encoderQualityArgs(encoder, bitrate, isH265))

  // Pixel format (yuv420p = universal compatibility)
  args.push('-pix_fmt', 'yuv420p')

  // Audio
  if (audioMode === 'aac320') {
    args.push('-c:a', 'aac', '-b:a', '320k')
  } else {
    args.push('-c:a', 'copy')
  }

  // Mux options
  args.push('-shortest', '-movflags', '+faststart', '-y', outputPath)
  return args
}

// Bump the ffmpeg child process above normal priority — reduces the chance Windows'
// EcoQoS heuristics demote it into "Efficiency Mode" while it's mostly blocked waiting
// on stdin/disk I/O, which otherwise compounds export slowness once data does arrive.
function _bumpPriority(pid) {
  try {
    os.setPriority(pid, os.constants.priority.PRIORITY_ABOVE_NORMAL)
  } catch { /* non-fatal — can fail without elevated permissions on some setups */ }
}

// Append " (1)", " (2)", ... before the extension until the path doesn't collide with
// an existing file — same convention as Windows Explorer / most desktop apps.
function _resolveNonCollidingPath(desiredPath) {
  if (!fs.existsSync(desiredPath)) return desiredPath
  const dir  = path.dirname(desiredPath)
  const ext  = path.extname(desiredPath)
  const base = path.basename(desiredPath, ext)
  let n = 1
  let candidate
  do {
    candidate = path.join(dir, `${base} (${n})${ext}`)
    n++
  } while (fs.existsSync(candidate))
  return candidate
}

// Kill an export session's FFmpeg process (if any) and clean up after it — including
// deleting whatever partial/corrupt output file a killed (not gracefully finished)
// FFmpeg process leaves behind at its target path. Used both when export-video
// supersedes a stale session and when the user explicitly cancels.
function _abortSession(session) {
  if (!session) return
  const outputPath = session.config?.outputPath
  const proc = session.proc
  if (proc) {
    if (outputPath) {
      proc.once('close', () => {
        try { fs.unlinkSync(outputPath) } catch {}
      })
    }
    try { proc.kill('SIGKILL') } catch {}
  }
  session.frameWriter?.cleanup()
}

function _exportErrorMsg(code, log) {
  if (/permission denied|access is denied|EPERM/i.test(log)) {
    return 'Output folder is protected by Windows Controlled Folder Access. Choose a different output location, or go to Windows Security → Virus & threat protection → Ransomware protection → Allow an app through Controlled folder access → add SPulse.'
  }
  return `FFmpeg exited with code ${code}`
}

// export-video: validate config, spawn FFmpeg (pipe mode) or init disk writer
ipcMain.handle('export-video', async (event, config) => {
  // Clean up any previous session
  _abortSession(_session)
  _session = null

  // Auto-rename to avoid silently overwriting an existing file — unless the user just
  // explicitly confirmed this exact path via the native save dialog this run (which
  // already handles its own overwrite confirmation prompt).
  if (!config.confirmedPath) {
    config.outputPath = _resolveNonCollidingPath(config.outputPath)
  }

  const { useDisk, totalFrames } = config

  _session = {
    config,
    proc:        null,
    frameWriter: null,
    ffmpegLog:   '',
    framesReceived: 0,
    totalFrames,
    webContents: event.sender,
  }

  if (useDisk) {
    // Disk path: init frame writer now, FFmpeg spawned in export-done
    const fw = new FrameWriter()
    fw.init()
    _session.frameWriter = fw
  } else {
    // Memory pipe: spawn FFmpeg immediately, pipe frames to stdin
    const args = _buildFFmpegArgs(config, 'pipe', null)
    const proc = spawn(ffmpegBin, args)
    _bumpPriority(proc.pid)
    // Capture a stable reference — _session can be reset to null by export-cancel
    // or a superseding export-video call while this process is still winding down.
    const session = _session
    proc.stderr.on('data', d => { session.ffmpegLog += d.toString() })
    proc.on('close', code => {
      if (_session !== session) return
      if (code === 0) {
        event.sender.send('export-complete', { outputPath: config.outputPath })
      } else {
        const excerpt = session.ffmpegLog.slice(-800)
        event.sender.send('export-error', { error: _exportErrorMsg(code, excerpt), log: excerpt })
      }
      session.frameWriter?.cleanup()
      _session = null
    })
    proc.on('error', err => {
      if (_session !== session) return
      event.sender.send('export-error', { error: err.message, log: '' })
      _session = null
    })
    _session.proc = proc
  }

  return { ok: true, useDisk }
})

// export-frame: receive one rendered frame from renderer
ipcMain.handle('export-frame', async (event, { frameData, frameIndex }) => {
  if (!_session) return { ok: false }

  _session.framesReceived++
  const progress = _session.totalFrames > 0
    ? Math.round((_session.framesReceived / _session.totalFrames) * 100)
    : 0

  if (_session.frameWriter) {
    // Disk path: write to temp file
    _session.frameWriter.writeFrame(frameData)
  } else if (_session.proc) {
    // Pipe path: write decoded JPEG buffer to FFmpeg stdin
    const base64 = frameData.replace(/^data:image\/\w+;base64,/, '')
    const buf    = Buffer.from(base64, 'base64')
    const ok     = _session.proc.stdin.write(buf)
    // Respect backpressure — wait for drain if buffer is full
    if (!ok) await new Promise(res => _session.proc.stdin.once('drain', res))
  }

  event.sender.send('export-progress', {
    percent:       progress,
    framesWritten: _session.framesReceived,
    totalFrames:   _session.totalFrames,
  })

  return { ok: true, progress }
})

// export-done: all frames sent — close stdin (pipe) or run FFmpeg (disk)
ipcMain.handle('export-done', async (event) => {
  if (!_session) return { ok: false }

  if (_session.proc) {
    // Pipe mode: close stdin, FFmpeg will finish encoding and fire 'close' event
    _session.proc.stdin.end()
    return { ok: true }
  }

  if (_session.frameWriter) {
    // Disk mode: spawn FFmpeg on the collected frame sequence
    const { config, frameWriter } = _session
    const args = _buildFFmpegArgs(config, 'disk', frameWriter.directory)

    return new Promise(resolve => {
      const proc    = spawn(ffmpegBin, args)
      _bumpPriority(proc.pid)
      const session = _session
      proc.stderr.on('data', d => { session.ffmpegLog += d.toString() })

      proc.on('close', code => {
        frameWriter.cleanup()
        if (_session !== session) { resolve({ ok: false }); return }
        if (code === 0) {
          event.sender.send('export-complete', { outputPath: config.outputPath })
          resolve({ ok: true })
        } else {
          const excerpt = (session.ffmpegLog || '').slice(-800)
          event.sender.send('export-error', { error: _exportErrorMsg(code, excerpt), log: excerpt })
          resolve({ ok: false })
        }
        _session = null
      })

      proc.on('error', err => {
        frameWriter.cleanup()
        if (_session !== session) { resolve({ ok: false }); return }
        event.sender.send('export-error', { error: err.message, log: '' })
        resolve({ ok: false })
        _session = null
      })

      _session.proc = proc
    })
  }

  return { ok: false }
})

// export-cancel: kill FFmpeg, clean up (including any partial output file)
ipcMain.handle('export-cancel', async () => {
  if (!_session) return { ok: true }
  _abortSession(_session)
  _session = null
  return { ok: true }
})
