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
## T05 — Tasks board: windowed Completed column with a "Show N older" footer

In `src/renderer/tasksDashboard.js` `render()` now partitions Completed with `partitionDone` (`completedAt || updatedAt`, the store's `tasks` window): older cards carry `.done-older` and stay in the DOM, the cards container toggles `.show-older` from `showOlderDone`, the badge counts the shown set (keeping the `visible/shown` form under the filter popover), the header `title` says "N shown · M older hidden", and a `.tasks-dashboard-column-more` footer toggles the reveal. `_load()` resets the flag on a project change, `doneWindow.onChange` re-renders, and `getCardAfterY` skips hidden older cards so a drop never targets a card with no box — the one addition beyond plan.md. CSS in `tasks-dashboard.css`.

_Captured: 2026-09-13 · 2 file change(s)_

---
## T06 — Specs board: scope + phase state, chips under Active, model-driven grid with a ghost tile

`src/renderer/specsDashboard.js` now keeps `scope` / `phase` / `showOlderDone` instead of `activeFilter`; `renderFilters(model)` and `renderGrid()` are both painted from `buildGridModel` (the store's `specs` window), the phase chips render only under Active, and a `.specs-card-older` ghost tile closes the grid in All and Done. Added beyond plan.md: when every done spec is outside the window the grid shows "Nothing done in the last N days" above the tile instead of "No specs match", so the board is never blank without a way out. Reveal resets on scope pick, `show()` and `SPEC_DATA` on a project change. Tile styles in `panels.css`; verified in both themes with a headless render.

_Captured: 2026-09-13 · 2 file change(s)_

---
## T07 — Project Settings: Boards section with the two done-window selects

Added a **Boards** section to `#project-settings-overlay` in `index.html` — "Completed tasks shown" and "Done specs shown", each a `.settings-select` over Last 7 / 30 / 90 days / All. `src/renderer/projectSettingsModal.js` paints both from `doneWindow.get()` in `syncFromProject` and on `doneWindow.onChange`, writes through `doneWindow.set` with the git-sharing row's disabled-while-saving pattern, and goes inert with the config note when no project is open. No deviation from plan.md.

_Captured: 2026-09-13 · 2 file change(s)_

---
