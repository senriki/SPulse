// Precomputes accurate per-frame FFT frequency + time-domain data for the whole
// track ahead of export, using OfflineAudioContext + AnalyserNode suspend/resume
// sampling — this mirrors exactly what the live AnalyserNode (audioAnalyser.js)
// produces during real-time preview playback, so exported visuals match what was
// previewed. Replaces exportPipeline's old synthetic amplitude-modulated
// approximation (a single time-domain peak value per frame, not real per-bin FFT
// magnitude), which consistently produced much shorter bars in export than preview.

const FFT_SIZE = 2048   // matches AudioAnalyser's analyserNode.fftSize

// Resolves with an array of { freqData, timeData } (Uint8Array, same shape as
// AnalyserNode.getByteFrequencyData()/getByteTimeDomainData()), one entry per
// frame at the given fps across the buffer's full duration. A frame that couldn't
// be captured (isolated failure, or aborted) is left undefined — callers should
// fall back to silence data for those indices rather than assume every index is
// populated.
// shouldAbort is polled per frame so export cancel drains the remaining scheduled
// suspend points quickly instead of doing unnecessary capture work for all of them.
export function analyzeOffline(audioBuffer, fps, smoothingTimeConstant, shouldAbort) {
  return new Promise((resolve, reject) => {
    const duration    = audioBuffer.duration
    const totalFrames = Math.max(1, Math.ceil(duration * fps))

    let oac
    try {
      oac = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        Math.ceil(duration * audioBuffer.sampleRate),
        audioBuffer.sampleRate
      )
    } catch (err) {
      reject(err)
      return
    }

    const source = oac.createBufferSource()
    source.buffer = audioBuffer

    const analyser = oac.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = Math.max(0, Math.min(0.99, smoothingTimeConstant))

    source.connect(analyser)
    // Analyser must be part of the graph OfflineAudioContext actually renders
    // (i.e. reachable from destination) or its internal FFT state won't update.
    analyser.connect(oac.destination)
    source.start(0)

    const results = new Array(totalFrames)
    let settled = 0

    const done = () => {
      if (++settled >= totalFrames) resolve(results)
    }

    // Register every suspend point BEFORE rendering starts, rather than one at a
    // time as each previous one resolves. Scheduling them just-in-time left a
    // window, after resume() but before the next suspend() call landed, where a
    // fast render pass could race past the next requested time entirely — once
    // that happens the rejected suspend (previously) killed the whole capture
    // chain, silencing every frame from that point on. Pre-registering all of
    // them means the engine already knows every stop point before it starts, so
    // there's nothing to race.
    for (let i = 0; i < totalFrames; i++) {
      // Clamp away from exactly 0 and from the very end — both are known edge
      // cases for suspend() in some implementations.
      const t = Math.min(Math.max(i / fps, 0.0001), Math.max(duration - 0.0005, 0))
      oac.suspend(t).then(() => {
        if (shouldAbort?.()) { oac.resume(); done(); return }
        try {
          const freqData = new Uint8Array(analyser.frequencyBinCount)
          const timeData = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(freqData)
          analyser.getByteTimeDomainData(timeData)
          results[i] = { freqData, timeData }
        } catch (err) {
          console.warn(`analyzeOffline: capture failed at frame ${i} (t=${t.toFixed(3)}s):`, err)
        }
        oac.resume()
        done()
      }).catch(err => {
        // An isolated suspend rejection shouldn't silence every frame after it —
        // just leave this one uncaptured and let the rest proceed normally.
        console.warn(`analyzeOffline: suspend failed at frame ${i} (t=${t.toFixed(3)}s):`, err)
        done()
      })
    }

    // startRendering() drives the offline context's clock forward; we don't need
    // its resolved (fully rendered) audio buffer, only the analyser snapshots
    // taken along the way via the suspend/resume points registered above.
    oac.startRendering().catch(() => {})
  })
}
