// Shared bar-layout math for bar_classic, bar_mirror, and spectrum_glow.
// Extracted so Feature B (configurable bar count) and Feature C (LR mirror) only
// need to change this math in one place instead of three copies.

// Today's exact existing formula — bar count is derived from barWidth/barGap/padding.
export function computeBarLayout({ targetW, padding, barWidth, barGap }) {
  const step    = barWidth + barGap
  const availW  = targetW - padding * 2
  const numBars = Math.max(1, Math.floor(availW / step))
  return { numBars, step }
}

// Inverse of computeBarLayout: given a fixed numBars, derive the barWidth needed to
// make exactly numBars bars (at the given barGap) fill the available width.
export function deriveBarWidth({ targetW, padding, numBars, barGap }) {
  const availW = targetW - padding * 2
  return availW / numBars - barGap
}

// Resolves which frequency bin a bar at position `i` should draw (Feature C).
// mirrorLR: false — today's unchanged behavior, linear left-to-right bin mapping.
// mirrorLR: true — the bar range is split into a left half (leftCount = ceil(numBars/2),
// indices 0..leftCount-1, using the full usable bin range compressed into just that
// half) and a right half that reuses the left half's bin values in reverse order,
// counting inward from the center. This makes the two halves true mirror images of
// each other; odd numBars gives the left side the one unmirrored extra bar. Bar
// X-position is unaffected — every bar still sits at its normal linear position;
// only which bin gets drawn there changes.
export function resolveBinIndex({ i, numBars, usableBins, mirrorLR }) {
  if (!mirrorLR) return Math.floor((i / numBars) * usableBins)

  const leftCount = Math.ceil(numBars / 2)
  if (i < leftCount) {
    return Math.floor((i / leftCount) * usableBins)
  }
  const j = i - leftCount                    // 0-based offset into the right half
  const mirroredLeftIndex = leftCount - 1 - j
  return Math.floor((mirroredLeftIndex / leftCount) * usableBins)
}

// Simple boxcar moving average — used to soften computeCenterPeakMagnitudes'
// sorted output. Averaging a non-decreasing sequence stays non-decreasing (each
// window shift adds one larger element and drops one smaller one), so this
// preserves the ascending-toward-center shape while rounding off sharp jumps.
function _movingAverage(arr, radius) {
  const n   = arr.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0, count = 0
    for (let k = -radius; k <= radius; k++) {
      const idx = i + k
      if (idx >= 0 && idx < n) { sum += arr[idx]; count++ }
    }
    out[i] = sum / count
  }
  return out
}

// "Peak at center" variant of the mirrorLR bin mapping: instead of a fixed
// position→bin mapping (resolveBinIndex above), this samples the same set of
// evenly-spaced bins across the left half, reorders their *current* magnitudes
// ascending (quietest at the outer edge, loudest adjacent to the center), then
// smooths that sorted sequence with a small moving average before mirroring it
// into the right half. The smoothing softens two artifacts of a raw sort: a
// single much-louder-than-its-neighbor bin creating an isolated spike right at
// the center, and the un-smoothed per-bin FFT magnitude producing a jagged
// staircase along the ramp. Returns magnitudes directly (0–255, same scale as
// freqData) rather than bin indices — callers should read a bar's height from
// this array instead of looking it up in freqData. Must be computed once per
// frame (not per-bar) since it depends on live freqData — call it once before
// the per-bar loop, not inside it.
export function computeCenterPeakMagnitudes({ numBars, usableBins, freqData, smoothingRadius = 3 }) {
  const leftCount = Math.ceil(numBars / 2)
  const leftMags  = new Array(leftCount)
  for (let k = 0; k < leftCount; k++) {
    const bin = Math.floor((k / leftCount) * usableBins)
    leftMags[k] = freqData[bin]
  }
  leftMags.sort((a, b) => a - b)   // quietest first

  const smoothed = smoothingRadius > 0 ? _movingAverage(leftMags, smoothingRadius) : leftMags

  const magnitudes = new Array(numBars)
  for (let i = 0; i < leftCount; i++) magnitudes[i] = smoothed[i]
  for (let i = leftCount; i < numBars; i++) {
    const j = i - leftCount
    magnitudes[i] = smoothed[leftCount - 1 - j]   // mirror, loudest at center
  }
  return magnitudes
}
