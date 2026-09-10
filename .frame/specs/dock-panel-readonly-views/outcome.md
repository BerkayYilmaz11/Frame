# Outcome — Dock panel — readonly views leave the sidebar nav

## T01 — Pure dock state module and its test

Wrote `src/renderer/dock/dockState.js` (`STORAGE_KEY`, `TABS`, `LIMITS`, `defaults`, `load`, `open`, `close`, `toggle`, `toggleTab`, `setPosition`, `resize`, `clampSize`, `serialize`) with no DOM or Electron import, and `test/dockState.test.js` (27 cases) covering defaults, garbage input, the three `toggleTab` transitions, both clamp ends on both sides and a serialize → load round-trip. Two additions beyond the plan's list: `toggle(state)` for `dock.toggle` so the host does not re-derive open/close, and `clampSize` exported so the host can re-clamp a stored size against the measured center on every apply. `load` takes either the raw localStorage string or a parsed object; the ceiling is only applied when `available` is passed, since the module cannot measure the center. `npm test`: 608 pass.

_Captured: 2026-09-10 · 2 file change(s)_

---

## T02 — Dock shell: markup, styles, host module and commands

Added the `#dock` shell to `index.html` inside `#terminal-container` (which now starts with `.dock-bottom`), `src/renderer/styles/components/dock.css` with its `main.css` import, and `src/renderer/dock.js`: tabs and slots built from `dockState.TABS`, state applied with a re-clamp against the measured center on every apply, persistence under `frame-dock`, drag-resize applying the size per animation frame and running one terminal refit plus the tab's `refit()` on mouseup, and `onChange` for the status bar. `index.js` calls `dock.init()` before `statusBar.init()` and registers `dock.toggle` (CmdOrCtrl+J), `dock.moveRight` and `dock.moveBottom` in a `View` category with `when` predicates so only the applicable move is listed. Deviations from plan.md: `DOCK_TABS` already carries each tab's lucide icon so T07's status bar reads one table rather than a second one, and `remountActive()` is exposed now for T06. The center gets `min-height: 0 / min-width: 0` only while the dock is open, so a closed dock leaves the existing layout byte-for-byte.

_Captured: 2026-09-10 · 5 file change(s)_

---

