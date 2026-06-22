# AGENTS.md

## Scope
This file defines instructions for the `audio-visualizer` subproject only.

WaveExport is a cross-platform Electron desktop app that imports audio files and exports MP4 waveform visualizer videos. It runs fully offline — no cloud, no accounts, no telemetry.

PRD: `WaveExport_PRD_v1.0.docx` (in this directory)
Implementation plan: `~/.claude/tasks/noble-dawn-96/` (session `noble-dawn-96`)

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
│   │   └── projectManager.js  # .wvx JSON save/load
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
All visualizer configuration lives in `src/visualizer/visualizerState.js` as a single plain object. Controls mutate this object; the canvas engine reads from it each frame. This object is also what gets serialized to `.wvx` project files.

## Key Constraints
- **Fully offline** — no external HTTP calls at runtime. Do not add any analytics, telemetry, or remote fetch calls.
- **Installer size < 250MB** — use ASAR packaging; do not bundle unnecessary assets.
- **FFmpeg license** — `ffmpeg-static` uses an LGPL build. Do not modify FFmpeg source. The About screen must acknowledge the LGPL license.
- **No silent failures** — all export errors must surface to the user with actionable messaging.
- **Keyboard accessible** — all primary actions must be reachable via keyboard shortcuts (see PRD §5.3).

## Open Questions (Defer Until Specified Phase)
| ID | Question | Deferred To |
|---|---|---|
| OQ-01 | Vanilla JS vs React? | Phase 1 — default is Vanilla JS |
| OQ-02 | Memory pipe vs disk frames for export? | Phase 2 — hybrid: memory by default, disk for 4K/long |
| OQ-04 | WebGL (Three.js or raw) for Radial mode? | Phase 4 — default is Canvas 2D polar coords |
