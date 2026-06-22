// Export progress modal — shown during the FFmpeg export pipeline.
export const progressModal = {
  _overlay: null,
  _fill:    null,
  _stats:   null,
  _eta:     null,
  _startTs: 0,
  _onCancel: null,

  init(onCancel) {
    this._overlay  = document.getElementById('export-modal')
    this._fill     = document.getElementById('export-progress-fill')
    this._stats    = document.getElementById('export-progress-stats')
    this._eta      = document.getElementById('export-progress-eta')
    this._onCancel = onCancel

    document.getElementById('btn-export-cancel')?.addEventListener('click', () => {
      this._onCancel?.()
    })
  },

  show(totalFrames) {
    this._startTs = performance.now()
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

  hide() { this._overlay?.classList.add('hidden') },
}
