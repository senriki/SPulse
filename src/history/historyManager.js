// Undo/redo history stack for visualizerState style changes.
// Snapshots are plain objects (no DOM references, no imageEl/videoEl).

function _snapshot(vs) {
  return {
    mode:             vs.mode,
    color:            vs.color,
    opacity:          vs.opacity,
    glow:             vs.glow,
    barWidth:         vs.barWidth,
    barGap:           vs.barGap,
    lineWidth:        vs.lineWidth,
    padding:          vs.padding,
    smoothing:        vs.smoothing,
    sensitivity:      vs.sensitivity,
    centerVertically: vs.centerVertically,
    yOffset:          vs.yOffset,
    background: {
      type:          vs.background.type,
      color:         vs.background.color,
      gradientA:     vs.background.gradientA,
      gradientB:     vs.background.gradientB,
      gradientAngle: vs.background.gradientAngle,
      imageBlur:     vs.background.imageBlur,
      imageDarken:   vs.background.imageDarken,
      imagePath:     vs.background.imagePath,
      videoPath:     vs.background.videoPath,
    },
    overlay: { ...vs.overlay },
  }
}

class HistoryManager {
  constructor(maxSteps = 20) {
    this._undo = []
    this._redo = []
    this._max  = maxSteps
  }

  // Capture the current state — returns a plain object for storage
  snapshot(vs) { return _snapshot(vs) }

  // Push a snapshot onto the undo stack; clears redo
  push(snap) {
    this._undo.push(snap)
    if (this._undo.length > this._max) this._undo.shift()
    this._redo = []
  }

  // Undo: save currentSnap to redo stack, return the previous state or null
  undo(currentSnap) {
    if (this._undo.length === 0) return null
    this._redo.push(currentSnap)
    if (this._redo.length > this._max) this._redo.shift()
    return this._undo.pop()
  }

  // Redo: save currentSnap to undo stack, return the next state or null
  redo(currentSnap) {
    if (this._redo.length === 0) return null
    this._undo.push(currentSnap)
    return this._redo.pop()
  }

  canUndo() { return this._undo.length > 0 }
  canRedo() { return this._redo.length > 0 }
  clear()   { this._undo = []; this._redo = [] }
}

export const historyManager = new HistoryManager()
