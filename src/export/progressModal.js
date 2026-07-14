// Export progress modal — shown during the FFmpeg export pipeline.
export const progressModal = {
  _overlay:    null,
  _fill:       null,
  _stats:      null,
  _eta:        null,
  _title:      null,
  _startTs:    0,
  _onCancel:   null,
  _outputPath: null,

  init(onCancel) {
    this._overlay  = document.getElementById('export-modal')
    this._fill     = document.getElementById('export-progress-fill')
    this._stats    = document.getElementById('export-progress-stats')
    this._eta      = document.getElementById('export-progress-eta')
    this._title    = document.getElementById('export-modal-title')
    this._onCancel = onCancel

    // Use onclick so repeated init() calls don't stack listeners
    const btnCancel = document.getElementById('btn-export-cancel')
    const btnClose  = document.getElementById('btn-export-close')
    const btnFolder = document.getElementById('btn-open-folder')
    if (btnCancel) btnCancel.onclick = () => this._onCancel?.()
    if (btnClose)  btnClose.onclick  = () => this.hide()
    if (btnFolder) btnFolder.onclick = () => {
      if (this._outputPath) window.api.revealInFolder(this._outputPath)
    }
  },

  show(totalFrames) {
    this._startTs    = performance.now()
    this._outputPath = null

    if (this._title) this._title.textContent = 'Exporting MP4…'
    document.getElementById('btn-export-cancel')?.classList.remove('hidden')
    document.getElementById('btn-export-close')?.classList.add('hidden')
    document.getElementById('btn-open-folder')?.classList.add('hidden')

    this._overlay?.classList.remove('hidden')
    this.update(0, totalFrames)
  },

  update(framesDone, totalFrames) {
    const pct = totalFrames > 0 ? Math.round((framesDone / totalFrames) * 100) : 0
    if (this._fill)  this._fill.style.width = `${pct}%`
    if (this._stats) this._stats.textContent = `Frame ${framesDone} / ${totalFrames} — ${pct}%`

    if (framesDone > 2 && this._eta) {
      const elapsed = (performance.now() - this._startTs) / 1000
      const rate    = framesDone / elapsed
      const rem     = (totalFrames - framesDone) / Math.max(rate, 0.1)
      this._eta.textContent = `~${Math.ceil(rem)}s remaining  (${rate.toFixed(1)} fps)`
    }
  },

  setMessage(msg) {
    if (this._stats) this._stats.textContent = msg
    if (this._eta)   this._eta.textContent   = ''
  },

  complete(outputPath) {
    this._outputPath = outputPath
    if (this._title) this._title.textContent = 'Export Complete'
    if (this._fill)  this._fill.style.width  = '100%'
    this.setMessage(`✓ Saved: ${outputPath.replace(/.*[\\/]/, '')}`)
    document.getElementById('btn-export-cancel')?.classList.add('hidden')
    document.getElementById('btn-export-close')?.classList.remove('hidden')
    document.getElementById('btn-open-folder')?.classList.remove('hidden')
  },

  hide() {
    this._overlay?.classList.add('hidden')
    this._outputPath = null
  },
}
