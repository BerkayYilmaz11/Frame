# Outcome — Dock panel — readonly views leave the sidebar nav

## T01 — Pure dock state module and its test

Wrote `src/renderer/dock/dockState.js` (`STORAGE_KEY`, `TABS`, `LIMITS`, `defaults`, `load`, `open`, `close`, `toggle`, `toggleTab`, `setPosition`, `resize`, `clampSize`, `serialize`) with no DOM or Electron import, and `test/dockState.test.js` (27 cases) covering defaults, garbage input, the three `toggleTab` transitions, both clamp ends on both sides and a serialize → load round-trip. Two additions beyond the plan's list: `toggle(state)` for `dock.toggle` so the host does not re-derive open/close, and `clampSize` exported so the host can re-clamp a stored size against the measured center on every apply. `load` takes either the raw localStorage string or a parsed object; the ceiling is only applied when `available` is passed, since the module cannot measure the center. `npm test`: 608 pass.

_Captured: 2026-09-10 · 2 file change(s)_

---

## T02 — Dock shell: markup, styles, host module and commands

Added the `#dock` shell to `index.html` inside `#terminal-container` (which now starts with `.dock-bottom`), `src/renderer/styles/components/dock.css` with its `main.css` import, and `src/renderer/dock.js`: tabs and slots built from `dockState.TABS`, state applied with a re-clamp against the measured center on every apply, persistence under `frame-dock`, drag-resize applying the size per animation frame and running one terminal refit plus the tab's `refit()` on mouseup, and `onChange` for the status bar. `index.js` calls `dock.init()` before `statusBar.init()` and registers `dock.toggle` (CmdOrCtrl+J), `dock.moveRight` and `dock.moveBottom` in a `View` category with `when` predicates so only the applicable move is listed. Deviations from plan.md: `DOCK_TABS` already carries each tab's lucide icon so T07's status bar reads one table rather than a second one, and `remountActive()` is exposed now for T06. The center gets `min-height: 0 / min-width: 0` only while the dock is open, so a closed dock leaves the existing layout byte-for-byte.

_Captured: 2026-09-10 · 5 file change(s)_

---

## T03 — Prompts, Activity and Feedback hosted in the dock

Added `panelTab()` to `src/renderer/dock.js` and used it for the Prompts, Activity and Feedback entries of `DOCK_TABS`: re-parent into the slot with `.dock-hosted`, call `show()`, observe `class` so the panel's own × closes the dock; `unmount` disconnects, calls `hide()` and returns the element home. Registered `dock.prompts` (CmdOrCtrl+Shift+L, replacing `panel.togglePrompts`), `dock.activity` and `dock.feedback` in `index.js` and moved `dock.init()` after the panels' `init()` so a dock restored open at boot can load. Removed the three entries from `PANEL_REGISTRY`, the `TOGGLE_HISTORY_PANEL` listener from `promptsPanel.js`, and rewrote `feedbackPanel.js`'s header. Deviation from plan.md: the width overrides are one `.dock-slot > .dock-hosted` rule in `dock.css` rather than three per-file rules in `panels.css` / `activity.css` / `feedback.css` — the same eight declarations for every re-parented panel belong in one place.

_Captured: 2026-09-10 · 6 file change(s)_

---

## T04 — Decisions hosted in the dock

Filled `DOCK_TABS.decisions` in `src/renderer/dock.js`: mount adds `.decisions-view-host` to the slot and calls `decisionsView.render(slot)`, unmount clears it; `dock.css` lets the rendered `.decisions-view` fill the slot by flex rather than by percentage height. Registered `dock.decisions` in `index.js`. Removed `showDecisions` / `hideDecisions` / `toggleDecisions`, the `isDecisionsVisible` flag with its seven guards, the `decisionsView` import and the `'decisions'` branch of `getActiveSurface()` from `multiTerminalUI.js`; rewrote `decisionsView.js`'s header. No deviation from plan.md. The nav's Decisions row and the palette's "Go to Decisions" still call the retired method until T08 / T10 remove them.

_Captured: 2026-09-10 · 5 file change(s)_

---

