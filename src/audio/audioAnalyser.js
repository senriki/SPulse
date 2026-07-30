export class AudioAnalyser {
  constructor(audioContext) {
    this.audioContext = audioContext

    this.analyserNode = audioContext.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8
    this.analyserNode.connect(audioContext.destination)

    // Stereo analysis (Feature A) — additive to the mono path above, which stays
    // the default/fallback and remains the only path connected for actual playback.
    this.splitterNode = audioContext.createChannelSplitter(2)
    this.analyserL = audioContext.createAnalyser()
    this.analyserL.fftSize = 2048
    this.analyserL.smoothingTimeConstant = 0.8
    this.analyserR = audioContext.createAnalyser()
    this.analyserR.fftSize = 2048
    this.analyserR.smoothingTimeConstant = 0.8
    this.splitterNode.connect(this.analyserL, 0)
    this.splitterNode.connect(this.analyserR, 1)

    // analyserL/analyserR need to be reachable from destination for their FFT state
    // to keep updating, but must not produce any audible output — the mono
    // analyserNode above already drives real playback. Route them through a
    // zero-gain node instead of connecting directly to destination.
    this._stereoGain = audioContext.createGain()
    this._stereoGain.gain.value = 0
    this.analyserL.connect(this._stereoGain)
    this.analyserR.connect(this._stereoGain)
    this._stereoGain.connect(audioContext.destination)

    this._sourceNode   = null
    this._audioBuffer  = null
    this._startTime    = 0   // audioContext.currentTime when play() was called
    this._startOffset  = 0   // audio position (seconds) when play() was called
    this._isPlaying    = false

    this._freqBuf = new Uint8Array(this.analyserNode.frequencyBinCount)
    this._timeBuf = new Uint8Array(this.analyserNode.frequencyBinCount)
    this._freqBufL = new Uint8Array(this.analyserL.frequencyBinCount)
    this._freqBufR = new Uint8Array(this.analyserR.frequencyBinCount)
    this._timeBufL = new Uint8Array(this.analyserL.frequencyBinCount)
    this._timeBufR = new Uint8Array(this.analyserR.frequencyBinCount)

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
    const v = Math.max(0, Math.min(0.99, value))
    this.analyserNode.smoothingTimeConstant = v
    this.analyserL.smoothingTimeConstant = v
    this.analyserR.smoothingTimeConstant = v
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

  // Returns live per-channel FFT frequency magnitude data (0–255 per bin)
  getFrequencyDataStereo() {
    this.analyserL.getByteFrequencyData(this._freqBufL)
    this.analyserR.getByteFrequencyData(this._freqBufR)
    return { left: this._freqBufL, right: this._freqBufR }
  }

  // Returns live per-channel time-domain waveform data (0–255, 128 = silence)
  getTimeDomainDataStereo() {
    this.analyserL.getByteTimeDomainData(this._timeBufL)
    this.analyserR.getByteTimeDomainData(this._timeBufR)
    return { left: this._timeBufL, right: this._timeBufR }
  }

  _buildSource() {
    if (this._sourceNode) {
      try { this._sourceNode.disconnect() } catch {}
    }
    this._sourceNode = this.audioContext.createBufferSource()
    this._sourceNode.buffer = this._audioBuffer
    this._sourceNode.connect(this.analyserNode)
    this._sourceNode.connect(this.splitterNode)
  }
}
