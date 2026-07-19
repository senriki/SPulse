export class AudioAnalyser {
  constructor(audioContext) {
    this.audioContext = audioContext

    this.analyserNode = audioContext.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8
    this.analyserNode.connect(audioContext.destination)

    this._sourceNode   = null
    this._audioBuffer  = null
    this._startTime    = 0   // audioContext.currentTime when play() was called
    this._startOffset  = 0   // audio position (seconds) when play() was called
    this._isPlaying    = false

    this._freqBuf = new Uint8Array(this.analyserNode.frequencyBinCount)
    this._timeBuf = new Uint8Array(this.analyserNode.frequencyBinCount)

    // Callers may assign: analyser.onEnded = () => { ... }
    this.onEnded = null
  }

  get isPlaying()  { return this._isPlaying }
  get duration()   { return this._audioBuffer?.duration ?? 0 }
  get frequencyBinCount() { return this.analyserNode.frequencyBinCount }

  get currentTime() {
    if (!this._isPlaying) return this._startOffset
    const elapsed = this.audioContext.currentTime - this._startTime
    return Math.min(this._startOffset + elapsed, this.duration)
  }

  setBuffer(audioBuffer) {
    this.stop()
    this._audioBuffer = audioBuffer
    this._startOffset = 0
  }

  setSmoothingTimeConstant(value) {
    this.analyserNode.smoothingTimeConstant = Math.max(0, Math.min(0.99, value))
  }

  play() {
    if (this._isPlaying || !this._audioBuffer) return
    if (this.audioContext.state === 'suspended') this.audioContext.resume()
    this._buildSource()
    this._startTime = this.audioContext.currentTime
    this._sourceNode.start(0, this._startOffset)
    this._isPlaying = true

    // Capture this call's node so a stale 'ended' event from an old, manually-stopped
    // node (e.g. seek() stops the old node then immediately starts a new one) can't
    // corrupt playback state for whatever node is actually current by the time the
    // (async) 'ended' event fires — AudioBufferSourceNode.stop() fires 'ended' too,
    // not just natural end-of-buffer, and that event doesn't arrive synchronously.
    const node = this._sourceNode
    this._sourceNode.onended = () => {
      if (node !== this._sourceNode) return   // stale — superseded by a newer node
      if (!this._isPlaying) return            // stopped manually
      this._isPlaying = false
      this._startOffset = 0
      this.onEnded?.()
    }
  }

  pause() {
    if (!this._isPlaying) return
    this._startOffset = this.currentTime
    this._sourceNode?.stop()
    this._isPlaying = false
  }

  stop() {
    if (this._isPlaying) {
      this._sourceNode?.stop()
      this._isPlaying = false
    }
    this._startOffset = 0
  }

  seek(time) {
    const was = this._isPlaying
    if (was) {
      this._sourceNode?.stop()
      this._isPlaying = false
    }
    this._startOffset = Math.max(0, Math.min(time, this.duration))
    if (was) this.play()
  }

  // Returns live FFT frequency magnitude data (0–255 per bin)
  getFrequencyData() {
    this.analyserNode.getByteFrequencyData(this._freqBuf)
    return this._freqBuf
  }

  // Returns live time-domain waveform data (0–255, 128 = silence)
  getTimeDomainData() {
    this.analyserNode.getByteTimeDomainData(this._timeBuf)
    return this._timeBuf
  }

  _buildSource() {
    if (this._sourceNode) {
      try { this._sourceNode.disconnect() } catch {}
    }
    this._sourceNode = this.audioContext.createBufferSource()
    this._sourceNode.buffer = this._audioBuffer
    this._sourceNode.connect(this.analyserNode)
  }
}
