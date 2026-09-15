## T01 — Add the pure zoom ladder with its unit test

Wrote `src/shared/uiZoom.js` as planned: `MIN_STEP`/`MAX_STEP`/`DEFAULT_STEP`, a frozen `LADDER` (0.85 / 0.92 / 1.00 / 1.10 / 1.20), `clampStep`, `parseStep`, `factorFor`, `percentFor`, `labelFor`, plus a `STEPS` array the Settings select will iterate — the one addition beyond the plan's list. `parseStep` accepts only an in-range integer; `clampStep` truncates floats and maps non-numbers to the default. `test/uiZoom.test.js` pins all of it (5 tests).

_Captured: 2026-09-15 · 2 file change(s)_

---
## T02 — Add the zoom IPC channels and the main-process zoom owner

Added `UI_ZOOM_GET` / `UI_ZOOM_SET` / `UI_ZOOM_CHANGED` beside the user-setting channels in `ipcChannels.js` and wrote `src/main/uiZoom.js` as planned: `init` parses `uiZoomStep`, `currentFactor` seeds the window, `attachWindow` re-applies on `did-finish-load`, snaps `zoom-changed` ±1 and registers the handlers, `setStep` clamps / early-returns / applies / persists / broadcasts. One detail beyond the plan: the `zoom-changed` handler re-applies the ladder factor even when the step did not change, because at the ends of the ladder Chromium may already have moved its own factor before the event arrives. Not yet wired into `index.js` (T03), so nothing changes at runtime from this commit alone.

_Captured: 2026-09-15 · 2 file change(s)_

---
## T03 — Wire the zoom owner into the main-process startup

Wired `src/main/index.js` exactly as planned: `uiZoom.init()` after `userSettings.init()`, `webPreferences.zoomFactor: uiZoom.currentFactor()` in `createWindow`, `uiZoom.attachWindow(mainWindow)` beside the other window-bound attaches (before `pty.init`) so `did-finish-load` is hooked before `loadFile`. From here a stored `uiZoomStep` is honoured at launch and trackpad / wheel zoom snaps to the ladder; no user-facing control exists yet.

_Captured: 2026-09-15 · 1 file change(s)_

---
## T04 — Register the zoom commands and refit terminals on a change

Registered `view.zoomIn` / `view.zoomOut` / `view.zoomReset` in `registerCommands()` after the theme block, with the planned shortcuts; In/Out read `UI_ZOOM_GET`, clamp ±1 through `src/shared/uiZoom.js` and invoke `UI_ZOOM_SET`, Reset sends `DEFAULT_STEP`. The `UI_ZOOM_CHANGED` listener refits on the next frame via `terminal.fitTerminal()` — the wrapper `index.js` already requires and the dock already uses — rather than requiring `terminalManager` directly as the plan wrote; it ends in the same `fitAll()`. Palette and cheat sheet list the commands from this commit; the View menu still shows the stock roles until T06.

_Captured: 2026-09-15 · 1 file change(s)_

---
## T05 — Pass the zoom chords through xterm's key handler

Added one passthrough to the custom key handler in `_initializeTerminal`: modifier + `=`, `-` or `0` returns `false`, placed beside the `[` / `]` project-navigation passthrough. No deviation from the plan.

_Captured: 2026-09-15 · 1 file change(s)_

---
## T06 — Replace the stock zoom roles in the View menu with Frame's commands

Replaced the three stock roles in `src/main/menu.js` with `cmd(...)` items on `CmdOrCtrl+=`, `CmdOrCtrl+-`, `CmdOrCtrl+0` in the same position, plus the `visible: false` `CmdOrCtrl+Shift+=` alias for Zoom In (spread over a `cmd()` result). Built the template against an electron stub to confirm the four entries and accelerators; whether the hidden alias actually fires on macOS is left to the live pass after T09 — the task's "drop it if it does not" clause is still open until then.

_Captured: 2026-09-15 · 1 file change(s)_

---
## T07 — Add the Appearance section to the Frame Settings modal

Added the Appearance section as the first section of the Frame Settings modal in `index.html`: an "Interface size" row with a `.settings-select` left empty for T08 to fill. One deviation: the description names Zoom In / Zoom Out / Reset Zoom instead of the plan's ⌘ symbols, so it is not wrong on Windows and Linux, where the accelerator is Ctrl.

_Captured: 2026-09-15 · 1 file change(s)_

---
## T08 — Wire the Interface size select in Frame Settings

Wired `#settings-ui-zoom` in `frameSettingsModal.js`: options filled from `uiZoom.STEPS` as "Label (N%)", `change` invokes `UI_ZOOM_SET`, the value is read from `UI_ZOOM_GET` on every open by hooking into `syncToggleFromSettings` (the overlay's existing on-open callback), and a `UI_ZOOM_CHANGED` listener follows changes from any entry point. One `npm test` run right after the change reported a single failure that did not reproduce in five further runs; no test covers this module.

_Captured: 2026-09-15 · 1 file change(s)_

---
