# AGENTS.md

## Scope
This file defines instructions for the `audio-visualizer` subproject only.

SPulse is a cross-platform Electron desktop app that imports audio files and exports MP4 waveform visualizer videos. It runs fully offline — no cloud, no accounts, no telemetry.

## Tech Stack
| Layer | Technology |
|---|---|
| App shell | Electron ^30 |
| UI | Vanilla JS + HTML5 (no framework unless complexity demands React) |
| Audio | Web Audio API (native browser) |
| Visualization | Canvas 2D (primary); WebGL only if Canvas 2D proves too slow for radial mode |
| Export | ffmpeg-static ^5 + fluent-ffmpeg ^2 (bundled — no external FFmpeg install) |
| Packaging | electron-builder ^24 |

## Project Structure
```
audio-visualizer/
├── main.js                  # Electron main process — window, IPC, FFmpeg subprocess
├── preload.js               # contextBridge — whitelisted window.api surface only
├── package.json
├── src/
│   ├── index.html           # App shell (3-panel layout)
│   ├── renderer.js          # Renderer entry — event wiring, state management
│   ├── styles/
│   │   ├── main.css         # Dark theme + layout
│   │   └── controls.css     # Shared control component styles
│   ├── audio/
│   │   ├── audioLoader.js   # File → ArrayBuffer → Float32Array decode
│   │   └── audioAnalyser.js # AnalyserNode + FFT frequency data
│   ├── visualizer/
│   │   ├── canvasEngine.js  # Animation loop orchestrator
│   │   ├── visualizerState.js # Central config state (color, mode, position, etc.)
│   │   ├── renderer2d.js    # Canvas 2D context wrapper
│   │   └── modes/           # One file per waveform mode
│   │       ├── barClassic.js
│   │       ├── barMirror.js
│   │       ├── lineSmooth.js
│   │       ├── lineFill.js
│   │       ├── radialPulse.js
│   │       └── spectrumGlow.js
│   ├── background/
│   │   ├── backgroundRenderer.js
│   │   ├── solidColor.js
│   │   ├── gradient.js
│   │   ├── staticImage.js
│   │   └── videoBackground.js
│   ├── overlay/
│   │   └── textOverlay.js
│   ├── export/
│   │   ├── exportPipeline.js  # Renderer-side frame loop + IPC
│   │   ├── exportSettings.js  # Resolution, fps, codec, bitrate state
│   │   ├── frameWriter.js     # Main-process disk frame writer (4K/long export)
│   │   └── progressModal.js   # Export progress UI
│   ├── controls/
│   │   ├── colorPicker.js
│   │   ├── sliders.js
│   │   └── stylePicker.js
│   ├── history/
│   │   └── historyManager.js  # Undo/redo stack for style changes
│   ├── project/
│   │   └── projectManager.js  # .spx JSON save/load
│   ├── ui/
│   │   ├── errorDialog.js
│   │   └── aboutScreen.js
│   └── fonts/                 # Bundled fonts: Inter, JetBrains Mono
├── build/                     # electron-builder assets (icons)
└── AGENTS.md
```

## Architecture Rules

### IPC Security
- The renderer process communicates with the main process **only** through `contextBridge` — never via `require('electron').remote` or `nodeIntegration: true`.
- `preload.js` exposes a minimal `window.api` object. Any new IPC channel must be added explicitly to the allowlist in `preload.js`.

### Process Responsibilities
- **Main process** (`main.js`): file I/O, FFmpeg subprocess, OS dialogs, app menu, window lifecycle.
- **Renderer process** (`src/`): Web Audio API, canvas rendering, UI state, IPC calls to main.
- Never run FFmpeg in the renderer. Never do file I/O directly from the renderer.

### Canvas Rendering
- Preview canvas always renders at **720p** (1280×720). Full-resolution only during export.
- The animation loop uses `requestAnimationFrame` and must stop when playback is paused.
- Draw order per frame: background → waveform → text overlay.
- Each waveform mode is a standalone module in `src/visualizer/modes/` that exports a single `draw(ctx, data, state)` function.

### Export Pipeline
- Default: stream canvas frames via IPC to main → pipe to FFmpeg stdin (memory pipe).
- For 4K exports **or** audio tracks longer than 3 minutes: write PNG frames to a temp directory on disk, then pass the sequence to FFmpeg. Clean up temp files on completion or cancel.
- Audio is passed through by default (no re-encode). Only re-encode if the user selects AAC 320kbps.
- Export must never fail silently. On FFmpeg error, show error dialog with truncated log.

### Visual Design
Dark-mode only. Never introduce light-mode styles.

| Role | Hex |
|---|---|
| App Background | `#0D1117` |
| Panel Background | `#161B22` |
| Accent / Active | `#00D4FF` |
| Text Primary | `#E6EDF3` |
| Text Secondary | `#8B949E` |
| Destructive Action | `#FF6B35` |

### State Management
All visualizer configuration lives in `src/visualizer/visualizerState.js` as a single plain object. Controls mutate this object; the canvas engine reads from it each frame. This object is also what gets serialized to `.spx` project files.

## Key Constraints
- **Fully offline** — no external HTTP calls at runtime. Do not add any analytics, telemetry, or remote fetch calls.
- **Installer size < 250MB** — use ASAR packaging; do not bundle unnecessary assets.
- **FFmpeg license** — `ffmpeg-static` uses an LGPL build. Do not modify FFmpeg source. The About screen must acknowledge the LGPL license.
- **No silent failures** — all export errors must surface to the user with actionable messaging.
- **Keyboard accessible** — all primary actions must be reachable via keyboard shortcuts (see PRD §5.3).

## Commit Message Convention

All commits to this repo must follow the keyword convention below.
The GitHub Actions release workflow and the `/changelog` skill both parse these prefixes to auto-generate release notes.

| Prefix | When to use | Category in release notes |
|---|---|---|
| `Add …` | New feature, new control, new mode | Features |
| `Fix …` | Bug fix, crash, incorrect behaviour | Bug Fixes |
| `Update …` | Change to existing feature | Improvements |
| `Improve …` | Performance or UX refinement | Improvements |
| `Refactor …` | Internal rewrite, no behaviour change | Improvements |
| `Bump version to X.Y.Z` | Version bump only | *(skipped in notes)* |
| `Docs …` | README, AGENTS.md, comments only | *(skipped in notes)* |

Rules:
- Subject line ≤ 72 characters, imperative mood, no trailing period.
- One logical change per commit. Version bumps are their own commit.
- Do not mix feature + fix in a single commit.

## Release Flow

Two GitHub Actions pipelines share one reusable workflow (`.github/workflows/build-release.yml`), which is a `workflow_call` that builds Win/Mac/Linux and creates the GitHub Release. What differs is only which **tag pattern** triggers which caller workflow — branches themselves are irrelevant to CI, only the tag name matters.

| Caller workflow | Tag pattern | `prerelease` | Icon channel |
|---|---|---|---|
| `release.yml` | `v*` minus `v*-*` (e.g. `v1.1.0`) | `false` | `stable` — cyan |
| `release-rc.yml` | `v*-rc*` (e.g. `v1.1.0-rc.1`) | `true` | `rc` — amber |

RC builds publish as GitHub pre-releases. `electron-updater`'s `allowPrerelease` is left at its default (`false`) in `main.js`, so stable users are never offered an RC update.

### Cutting a release candidate

Work on a short-lived branch (e.g. `release/1.1`) so `main` stays deployable. Don't merge to `main` until the RC is validated.

```bash
# on release/1.1 — edit package.json: "version": "1.1.0-rc.1"
git commit -m "Bump version to 1.1.0-rc.1"
git push origin release/1.1
git tag v1.1.0-rc.1
git push origin v1.1.0-rc.1
```

Iterate (`1.1.0-rc.2`, `rc.3`, …) on the same branch until it's stable.

### Promoting to stable

```bash
git checkout main
git merge release/1.1
# edit package.json: "version": "1.1.0"   (drop the -rc suffix)
git commit -m "Bump version to 1.1.0"
git push origin main
git tag v1.1.0
git push origin v1.1.0
```

The tag with no suffix is what `release.yml` matches — this is the one that becomes "Latest Release."

### Icon channel

`scripts/gen-icon.js --channel=rc` swaps the bar gradient from cyan (`#20eaff → #0080aa`) to amber (`#ffb020 → #aa5500`) — same shape, different accent color, so an RC build is visually distinct in the dock/taskbar. The reusable workflow passes `--channel=rc` automatically when `prerelease: true`; no manual step needed. Run without the flag (or omit it) for the stable cyan icon.

## Open Questions (Defer Until Specified Phase)
| ID | Question | Deferred To |
|---|---|---|
| OQ-01 | Vanilla JS vs React? | Phase 1 — default is Vanilla JS |
| OQ-02 | Memory pipe vs disk frames for export? | Phase 2 — hybrid: memory by default, disk for 4K/long |
| OQ-04 | WebGL (Three.js or raw) for Radial mode? | Phase 4 — default is Canvas 2D polar coords |
