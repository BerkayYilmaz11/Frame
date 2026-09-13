## T01 — Pure done-window model

Added `src/shared/doneWindow.js`: `DEFAULT_DONE_WINDOW { tasks: 7, specs: 30 }`, `WINDOW_OPTIONS [7, 30, 90, 0]`, `normalizeDoneWindow` (per-key fallback, numeric strings in the set accepted), `isWithinWindow` (inclusive at exactly N days, 0 = all, absent or unparseable date = recent) and `partitionDone` keeping input order. `test/doneWindow.test.js` pins each rule; 13 tests, full suite 737 pass. No deviation from plan.md.

_Captured: 2026-09-13 · 2 file change(s)_

---
## T02 — GET_DONE_WINDOW / SET_DONE_WINDOW channels and main-side get/set on .frame/config.json

Added `GET_DONE_WINDOW` / `SET_DONE_WINDOW` to `src/shared/ipcChannels.js` beside the git-sharing pair. In `src/main/frameProject.js` added `getDoneWindow` (normalised read of `settings.doneWindow`) and `setDoneWindow` (rejects an unknown board or a value outside `WINDOW_OPTIONS`, merges the one key, writes through `writeFrameConfig`, returns the stored object), plus their `ipcMain.handle`s answering `{ error: 'not a Frame project' }` like git sharing. No deviation from plan.md.

_Captured: 2026-09-13 · 2 file change(s)_

---
## T03 — Renderer done-window store (src/renderer/doneWindow.js) initialised from index.js

Added `src/renderer/doneWindow.js` — `init` (load now, re-load on `state.onProjectChange`, stale-answer guard), `get` (defaults until loaded or with no project), `set` (invokes `SET_DONE_WINDOW`, throws main's error text, notifies) and `onChange`. `src/renderer/index.js` requires it and calls `init()` just before `tasksDashboard.init()`. No deviation from plan.md.

_Captured: 2026-09-13 · 2 file change(s)_

---
## T04 — Pure specs filter model (src/renderer/specs/filterModel.js) with tests

Added `src/renderer/specs/filterModel.js` (`SCOPES`, `PHASES`, `buildGridModel`) and `test/specsFilterModel.test.js` (15 tests). The model returns the effective `scope` / `phase` too, so the host can render the row from the same answer it renders the grid from — a small addition to plan.md's shape. Counts follow the search pool and the window; `doneTotal` carries the unwindowed count for the tooltip.

_Captured: 2026-09-13 · 2 file change(s)_

---
