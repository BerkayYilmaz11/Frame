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

## T02 — Add `getShellInitTemplate` to `src/shared/frameTemplates.js`

Generated the POSIX and fish init files: `FRAME_BIN` exported, `.frame/bin`
moved rather than duplicated to the front of an exported `PATH`, and one
function per configured tool delegating to `"$FRAME_BIN/<id>"` with a
`command <id>` fallback; unparseable tool ids are skipped rather than
escaped. Rebuilt `PATH` with prefix/suffix removal instead of splitting on
`:` — zsh does not word-split unquoted parameters, so the obvious
`for e in $PATH` would have seen one entry there. Beside the string cases,
`test/frameTemplates.test.js` now sources the real file in bash, sh and zsh
and checks routing, PATH order, subshell reach and the missing-wrapper
fallback. Files: `src/shared/frameTemplates.js`, `test/frameTemplates.test.js`.

_Captured: 2026-08-02 · 2 file changes_

---
