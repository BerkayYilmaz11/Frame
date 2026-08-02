# Outcome — Terminal Session Setup

## T01 — Add pure `src/main/shellSetup.js`

Added the pure delivery table: `shellFamily()` (zsh/bash/sh/dash/ksh → `posix`,
fish → `fish`, everything else → none), `shellInitPath()` as the single spelling
of `.frame/runtime/shell/`, `mintMarker()` per terminal and attempt,
`deliveryFor()` returning fish `-C` args / the typed POSIX line / `none` behind
the win32, no-project and not-a-Frame-project gates, and `splitOnMarker()`.
Kept plan.md's positional `deliveryFor(shellPath, platform, projectPath)` and
added a trailing options argument for the two things a pure module cannot
derive — the minted marker and the fs-answered `isFrameProject`. Files:
`src/main/shellSetup.js`, `test/shellSetup.test.js`.

_Captured: 2026-08-02 · 2 file changes_

---
