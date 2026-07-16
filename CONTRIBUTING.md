# Contributing to SPulse

Thanks for considering a contribution. This doc covers everything you need to set up, make a change, and submit it — no prior context required.

For a deeper architecture reference (project structure, IPC rules, canvas rendering pipeline, release flow), see [`AGENTS.md`](./AGENTS.md). It was written for AI coding agents but is equally useful for humans; this doc is the shorter, contributor-facing version.

## Requirements

- Node.js 18+
- npm 9+
- A display — Windows or macOS host. WSL2 headless is not supported for running the app itself (you can still edit code there).

## Getting Started

```bash
git clone <your fork URL>
cd audio-visualizer
npm install
make run
```

`make run` starts the app in development mode (`electron .`). No build step is needed to iterate — edit a file in `src/`, close and reopen the app to see the change (there's no hot-reload).

## Project Layout

Quick orientation — see `AGENTS.md` → Project Structure for the full annotated tree.

| Directory | What lives there |
|---|---|
| `main.js`, `preload.js` | Electron main process + IPC bridge |
| `src/` | Renderer process — UI, canvas rendering, audio, export |
| `src/visualizer/modes/` | One file per waveform style (bar, line, radial, etc.) |
| `scripts/` | Build-time tooling (icon generation) |
| `.github/workflows/` | CI + release pipelines |

## Code Style & Architecture Rules

No linter or formatter is enforced — match the existing style: 2-space indent, no semicolons, single quotes. A few rules are load-bearing and checked in review:

- **No frameworks.** Vanilla JS + HTML5 only, unless a change is complex enough that the maintainer explicitly agrees to add one.
- **IPC only through `contextBridge`.** Never enable `nodeIntegration` or use `require('electron').remote`. Any new IPC channel must be added to the allowlist in `preload.js`.
- **Main vs renderer separation.** File I/O and the FFmpeg subprocess belong in `main.js`. Never do either directly from `src/`.
- **Dark mode only.** Don't introduce light-mode styles.
- **Fully offline.** No analytics, telemetry, or runtime HTTP calls beyond the existing auto-updater (which only talks to GitHub Releases).
- **No silent failures.** Errors — especially export/FFmpeg errors — must surface to the user with an actionable message, not just a console log.

Full detail on all of the above lives in `AGENTS.md` → Architecture Rules.

## Testing Your Change

There's no automated test suite yet. Before opening a PR:

1. Run `make run` and manually exercise the feature you touched — load an audio file, try the golden path and at least one edge case.
2. If you touched the export pipeline, run an actual export and confirm the output MP4 plays correctly.
3. CI (`ci.yml`) runs a syntax check (`node --check`) on the main-process files on every push and PR — it won't catch logic bugs, just parse errors.

## Commit Messages

Commits follow a keyword-prefix convention — CI parses these to auto-generate release notes, so please stick to it:

| Prefix | When to use | Shows up as |
|---|---|---|
| `Add …` | New feature, control, or mode | Features |
| `Fix …` | Bug fix, crash, incorrect behaviour | Bug Fixes |
| `Update …` | Change to an existing feature | Improvements |
| `Improve …` | Performance or UX refinement | Improvements |
| `Refactor …` | Internal rewrite, no behaviour change | Improvements |
| `Docs …` | README/AGENTS.md/comments only | *(omitted from release notes)* |

Rules:
- Subject line ≤ 72 characters, imperative mood ("Add", not "Added"), no trailing period.
- One logical change per commit — don't mix a feature and a fix.
- Don't bump `package.json`'s version yourself; the maintainer handles versioning and tagging as part of the release flow.

## Submitting a Pull Request

1. Fork the repo, branch off `main` (e.g. `fix/export-modal-cancel`).
2. Make your change, following the commit convention above.
3. Push and open a PR against `main`. Describe what changed and why — link an issue if one exists.
4. Wait for the CI syntax check to pass and for a maintainer review.

Small, focused PRs are much easier to review than large ones — if your change touches several unrelated things, consider splitting it up.

## Reporting Bugs / Suggesting Features

Open a GitHub Issue. For bugs, include: OS + version, SPulse version (Help → About), steps to reproduce, and what you expected vs what happened. Screenshots or a short screen recording help a lot for visual/rendering issues.

## Release Process (maintainer-only)

Contributors don't need to worry about this — it's documented here so it's not forgotten. Tagging and releases are handled by the maintainer per `AGENTS.md` → Release Flow (stable vs release-candidate pipelines, icon channel, etc.).

## License

By contributing, you agree your changes are licensed under the project's [MIT License](./LICENSE).
