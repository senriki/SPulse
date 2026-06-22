export class AudioLoader {
  constructor() {
    this.audioContext = null
    this.audioBuffer = null
    this.amplitudeData = null   // Float32Array downsampled for overview (≤4096 pts)
    this.duration = 0
    this.sampleRate = 0
    this.numberOfChannels = 0
    this.filePath = ''
    this.fileName = ''
    this.metadata = { title: '', artist: '', format: '' }
  }

  async load(arrayBuffer, filePath) {
    this.filePath = filePath
    this.fileName = filePath.split(/[\\/]/).pop()
    const ext = this.fileName.split('.').pop().toLowerCase()

    // Parse metadata from raw bytes BEFORE decodeAudioData (which may detach the buffer)
    const rawBytes = new Uint8Array(arrayBuffer)
    const parsed = this._parseMetadata(rawBytes, ext)

    this.metadata = {
      format: ext.toUpperCase(),
      title:  parsed.title  || this.fileName.replace(/\.[^.]+$/, ''),
      artist: parsed.artist || ''
    }

    // Create/reuse AudioContext
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext()
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    // decodeAudioData may detach the buffer; pass a copy to be safe
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0))
    this.duration = this.audioBuffer.duration
    this.sampleRate = this.audioBuffer.sampleRate
    this.numberOfChannels = this.audioBuffer.numberOfChannels

    this.amplitudeData = this._buildOverview(this.audioBuffer)
    return this
  }

  // Downsampled peak amplitude overview for waveform background drawing
  _buildOverview(audioBuffer) {
    const len = audioBuffer.length
    const targetPoints = Math.min(4096, len)
    const blockSize = Math.max(1, Math.floor(len / targetPoints))
    const result = new Float32Array(targetPoints)
    const nCh = audioBuffer.numberOfChannels

    for (let i = 0; i < targetPoints; i++) {
      let peak = 0
      const off = i * blockSize
      for (let j = 0; j < blockSize; j++) {
        let mono = 0
        for (let c = 0; c < nCh; c++) mono += audioBuffer.getChannelData(c)[off + j] || 0
        const v = Math.abs(mono / nCh)
        if (v > peak) peak = v
      }
      result[i] = peak
    }
    return result
  }

  // ─── Metadata parsers ──────────────────────────────────────────────────────

  _parseMetadata(bytes, ext) {
    try {
      if (ext === 'mp3') return this._parseID3v2(bytes)
      if (ext === 'flac') return this._parseFLACVorbis(bytes)
      if (ext === 'ogg') return this._parseOggVorbis(bytes)
    } catch {}
    return {}
  }

  _parseID3v2(bytes) {
    const result = {}
    // ID3v2 marker: "ID3"
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return result

    const version = bytes[3]
    const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
                   ((bytes[8] & 0x7f) << 7)  |  (bytes[9] & 0x7f)

    let pos = 10
    while (pos < tagSize + 10 && pos + 10 < bytes.length) {
      const fid = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3])
      if (!fid.trim() || bytes[pos] === 0) break

      const flen = version >= 4
        ? ((bytes[pos+4]&0x7f)<<21)|((bytes[pos+5]&0x7f)<<14)|((bytes[pos+6]&0x7f)<<7)|(bytes[pos+7]&0x7f)
        : (bytes[pos+4]<<24)|(bytes[pos+5]<<16)|(bytes[pos+6]<<8)|bytes[pos+7]

      pos += 10
      if (flen <= 0 || pos + flen > bytes.length) break

      if (fid === 'TIT2' || fid === 'TPE1') {
        const enc = bytes[pos]
        const content = bytes.slice(pos + 1, pos + flen)
        let text = ''
        try {
          if (enc === 0)      text = new TextDecoder('iso-8859-1').decode(content)
          else if (enc === 1) text = new TextDecoder('utf-16').decode(content)
          else if (enc === 2) text = new TextDecoder('utf-16be').decode(content)
          else                text = new TextDecoder('utf-8').decode(content)
        } catch {
          text = String.fromCharCode(...content)
        }
        text = text.replace(/\0/g, '').trim()
        if (text) {
          if (fid === 'TIT2') result.title = text
          else                result.artist = text
        }
      }
      pos += flen
    }
    return result
  }

  _parseFLACVorbis(bytes) {
    // fLaC marker
    if (bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !== 0x43) return {}
    const result = {}
    let pos = 4
    while (pos + 4 < bytes.length) {
      const blockType = bytes[pos] & 0x7f
      const isLast   = (bytes[pos] & 0x80) !== 0
      const blockLen = (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3]
      pos += 4
      if (blockType === 4 && blockLen > 0) {
        this._readVorbisComment(bytes, pos, result)
        break
      }
      pos += blockLen
      if (isLast) break
    }
    return result
  }

  _parseOggVorbis(bytes) {
    // Ogg capture pattern: OggS
    if (bytes[0] !== 0x4f || bytes[1] !== 0x67 || bytes[2] !== 0x67 || bytes[3] !== 0x53) return {}
    const result = {}
    // Scan for vorbis comment header (0x03 + "vorbis")
    for (let i = 0; i < Math.min(bytes.length - 7, 65536); i++) {
      if (bytes[i] === 0x03 &&
          bytes[i+1] === 0x76 && bytes[i+2] === 0x6f && bytes[i+3] === 0x72 &&
          bytes[i+4] === 0x62 && bytes[i+5] === 0x69 && bytes[i+6] === 0x73) {
        this._readVorbisComment(bytes, i + 7, result)
        break
      }
    }
    return result
  }

  _readVorbisComment(bytes, pos, result) {
    if (pos + 4 >= bytes.length) return
    const vendorLen = bytes[pos] | (bytes[pos+1]<<8) | (bytes[pos+2]<<16) | (bytes[pos+3]<<24)
    pos += 4 + vendorLen
    if (pos + 4 >= bytes.length) return
    const numComments = bytes[pos] | (bytes[pos+1]<<8) | (bytes[pos+2]<<16) | (bytes[pos+3]<<24)
    pos += 4
    for (let i = 0; i < numComments && pos + 4 < bytes.length; i++) {
      const len = bytes[pos] | (bytes[pos+1]<<8) | (bytes[pos+2]<<16) | (bytes[pos+3]<<24)
      pos += 4
      if (pos + len > bytes.length) break
      const comment = new TextDecoder().decode(bytes.slice(pos, pos + len))
      const eq = comment.indexOf('=')
      if (eq > 0) {
        const key = comment.slice(0, eq).toUpperCase()
        const val = comment.slice(eq + 1).trim()
        if (key === 'TITLE'  && val) result.title  = val
        if (key === 'ARTIST' && val) result.artist = val
      }
      pos += len
    }
  }
}
