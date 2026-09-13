# Plan — Boards done window

## Architecture

### Resolved plan-time decisions

- **D1 · A window on done items only, never on live ones** (business,
  decided in conversation before the spec). Pending, In Progress and Active
  are shown in full whatever their age; only Completed tasks and done specs
  are windowed. A generic today / this week / date-range filter was rejected:
  it hides a sixty-day-old pending task, which is exactly the card the board
  exists to show.
- **D2 · A default with one reveal control, not a filter the user picks**
  (business, decided in conversation). Done items inside the window render;
  the rest sit behind "Show N older" (tasks column foot) or a ghost tile
  "N older done specs · Show" (spec grid). The reveal is session state on
  the open project. A period selector in the toolbar was rejected: it is one
  more control on a row the user already called crowded, and its default
  state would have to be explained anyway.
- **D3 · Two values under one Project Setting: 7 days for tasks, 30 for
  specs** (business, proposed and accepted). `settings.doneWindow =
  { tasks: 7, specs: 30 }` in `.frame/config.json`, options 7 / 30 / 90 /
  all (`0`). Specs live longer than tasks, so a single number would be
  wrong for one of them. A machine-wide Frame Setting was rejected: cadence
  differs per project, and settings-by-scope put project-shaped choices in
  Project Settings.
- **D4 · Phase chips live under Active** (business, decided in conversation).
  Every phase chip is a subset of Active, so the row shows them only when
  Active is selected; All and Done keep the segmented control and the
  search field. This also removes the state where a phase pick left the
  segmented control with no active segment.
- **D5 · Search bypasses the window** (business, silent). A query is
  explicit intent; a spec that matches it is shown whatever its age, and no
  ghost tile renders while a query is active. The alternative — windowing
  the matches — would make "why isn't my search finding it" a support
  question.
- **D6 · Specs are windowed on `updated_at`, tasks on `completedAt` with
  `updatedAt` as fallback; a done item with no usable date counts as
  recent** (technical, silent). The renderer's spec payload carries
  `updated_at` but not `last_phase_at` (`specManager.listSpecs`), and
  adding a field would grow every `SPEC_DATA` push for a distinction the
  user cannot see. A missing date must never hide an item.
- **D7 · Pure window logic in `src/shared/doneWindow.js`; the specs filter
  model in `src/renderer/specs/filterModel.js`; the tasks column stays
  inline** (technical, silent). The shared module is used by main (to
  normalise the setting) and by both boards (to partition); it is
  dependency-free. The specs board's scope × phase × window × search logic
  is a pure function over the spec list, which is what makes it testable
  and keeps `specsDashboard.js` to rendering. The tasks column's partition
  is one call into the shared module inside `render()`, so no third module.
  `src/renderer/specs/` is new but follows the `home/`, `github/`,
  `statusBar/`, `dock/` precedent of a pure module beside its host.
- **D8 · A small renderer store, `src/renderer/doneWindow.js`, owns the
  setting on the renderer side** (technical, silent). It loads on init and
  on `state.onProjectChange`, exposes `get()` / `set(board, days)` /
  `onChange(cb)`, and is the one writer through IPC. The Settings modal
  calls `set`, both dashboards subscribe. Having each dashboard invoke IPC
  itself, or the modal reach into the dashboards, was rejected: three
  readers of one value need one owner.
- **D9 · Two new invoke channels, `GET_DONE_WINDOW` and `SET_DONE_WINDOW`,
  mirroring the git-sharing pair** (technical, silent). `ipcChannels.js` is
  in `audit-q3-cross-platform`'s planned footprint and `frameProject.js` in
  `audit-q3-performance-resources`'s; both edits are appended blocks next
  to the git-sharing ones, so a merge is a clean union. Reusing
  `SET_USER_SETTING` was rejected — that store is machine-wide
  (`userSettings.js`), and this is the project's setting.
- **D10 · Test posture: pure logic and data transforms only** (technical,
  the project's recorded convention). `doneWindow.js` and `filterModel.js`
  get `node --test` files; the dashboards, the store and the modal are
  DOM- or Electron-coupled and are not tested.
- **D11 · Hidden older tasks stay in the DOM** (technical, silent).
  `render()` already keeps filtered cards in the DOM so drag-and-drop
  reorder commits the full file order (`tasksDashboard.js:255`). Older
  completed cards get `.done-older` and are hidden by CSS until the column
  carries `.show-older`, on the same principle. Not rendering them would
  make a reorder drop them to the end of `tasks.json`.

### Data shapes

`.frame/config.json`:

```json
"settings": { "doneWindow": { "tasks": 7, "specs": 30 } }
```

`src/shared/doneWindow.js` (pure):

```js
DEFAULT_DONE_WINDOW = { tasks: 7, specs: 30 }
WINDOW_OPTIONS      = [7, 30, 90, 0]              // 0 = all
normalizeDoneWindow(raw) → { tasks, specs }       // any input → valid days
isWithinWindow(iso, days, now = Date.now())        // days 0 → true; bad iso → true
partitionDone(items, { days, now, dateOf })        // → { recent: [], older: [] }, order kept
```

`src/renderer/specs/filterModel.js` (pure):

```js
buildGridModel({ specs, scope, phase, searchMatches, windowDays, showOlder, now })
  → { visible: Spec[], olderCount: number, counts: { all, active, done, [`phase:${p}`] } }
// scope 'all' | 'active' | 'done'; phase honoured only when scope === 'active'
// searchMatches: Set<slug> | null — non-null disables the window
// counts follow the search pool and, for all/done, the window (older excluded)
```

`src/renderer/doneWindow.js` (store):

```js
init()                      // loads for the current project; re-loads on project change
get()      → { tasks, specs }
set(board, days) → Promise  // invokes SET_DONE_WINDOW, updates, notifies
onChange(cb)                // cb({ tasks, specs })
```

IPC (`src/shared/ipcChannels.js`), handlers in `frameProject.js` beside git
sharing:

```
GET_DONE_WINDOW: 'get-done-window'   // invoke(projectPath) → { tasks, specs } (normalised)
SET_DONE_WINDOW: 'set-done-window'   // invoke({ projectPath, board, days }) → { tasks, specs }
```

### Tasks board

`render()` partitions `buckets.completed` through `partitionDone` with
`dateOf = t => t.completedAt || t.updatedAt`. Cards in `older` get
`.done-older`; the column element gets `.show-older` when the module-level
`showOlderDone` flag is set. The count badge shows `recent.length` (or the
full length when revealed, or `visible/total` when the filter popover is
active, as today). The header's `title` states "N shown · M older hidden".
When `older.length > 0` a footer button `.tasks-dashboard-column-more`
renders after the cards: "Show N older" / "Hide older"; clicking toggles the
flag and re-renders. `showOlderDone` resets in `_load()` when the project
path differs from the last one loaded.

### Specs board

State becomes `scope` and `phase` (replacing `activeFilter`) plus
`showOlderDone`. `renderFilters()` renders the segmented control always and
the phase chips only when `scope === 'active'`; clicking a segment sets
`scope` and clears `phase`; clicking a chip sets `phase` (or clears it when
already active). `renderGrid()` calls `buildGridModel` and renders
`visible`, then, when `olderCount > 0`, a trailing `.specs-card-older` tile
whose click sets `showOlderDone = true`. `showOlderDone` resets on scope
change and on project change (in `show()` / the `SPEC_DATA` path when the
project path changes). Counts and tooltips come from the model.

### Project Settings

A `Boards` section after `Workflow` with two rows in the `.settings-row` /
`.settings-select` idiom: "Completed tasks shown" (`#settings-done-window-tasks`)
and "Done specs shown" (`#settings-done-window-specs`), each with the four
options. `sync` reads `doneWindow.get()`; `change` calls
`doneWindow.set(board, Number(value))`; the no-project state disables both
and shows the same note the spec-driven row uses.

## Files

- `src/shared/doneWindow.js` — **New**. Pure window logic and the setting's defaults / normaliser.
- `test/doneWindow.test.js` — **New**. Boundary at exactly N days, `0` = all, missing / invalid dates count as recent, normaliser on missing / null / out-of-set values, partition keeps order.
- `src/renderer/specs/filterModel.js` — **New**. Pure specs grid model: scope × phase × window × search → visible, older count, counts.
- `test/specsFilterModel.test.js` — **New**. Scope and phase combinations, phase ignored outside Active, counts, older split in all / done and none in active, search bypass, showOlder.
- `src/renderer/doneWindow.js` — **New**. Renderer-side owner of the setting: load, get, set, onChange.
- `src/shared/ipcChannels.js` — **Modified**. `GET_DONE_WINDOW`, `SET_DONE_WINDOW` beside the git-sharing pair.
- `src/main/frameProject.js` — **Modified**. `getDoneWindow` / `setDoneWindow` on `.frame/config.json` and their two `ipcMain.handle`s beside git sharing.
- `src/renderer/index.js` — **Modified**. `doneWindow.init()` at boot next to the other module inits.
- `src/renderer/tasksDashboard.js` — **Modified**. Windowed Completed column, footer reveal, count / tooltip, project-change reset, `doneWindow.onChange` → `render()`.
- `src/renderer/styles/components/tasks-dashboard.css` — **Modified**. `.done-older` hidden unless `.show-older`; `.tasks-dashboard-column-more` footer button.
- `src/renderer/specsDashboard.js` — **Modified**. `scope` / `phase` state, phase chips under Active, model-driven grid, ghost tile, resets, `doneWindow.onChange` → `renderGrid()`.
- `src/renderer/styles/components/panels.css` — **Modified**. `.specs-card-older` ghost tile.
- `src/renderer/projectSettingsModal.js` — **Modified**. Boards rows: sync on open and project change, change handlers, inert state.
- `index.html` — **Modified**. Boards section in `#project-settings-overlay`.

## Footprint

- src/shared/doneWindow.js
- test/doneWindow.test.js
- src/renderer/specs/filterModel.js
- test/specsFilterModel.test.js
- src/renderer/doneWindow.js
- src/shared/ipcChannels.js
- src/main/frameProject.js
- src/renderer/index.js
- src/renderer/tasksDashboard.js
- src/renderer/styles/components/tasks-dashboard.css
- src/renderer/specsDashboard.js
- src/renderer/styles/components/panels.css
- src/renderer/projectSettingsModal.js
- index.html

## Dependencies

None.

## Sequencing

1. Add `src/shared/doneWindow.js` (defaults, options, `normalizeDoneWindow`, `isWithinWindow`, `partitionDone`) with `test/doneWindow.test.js`.
2. Add the two IPC constants and, in `frameProject.js`, `getDoneWindow(projectPath)` / `setDoneWindow(projectPath, board, days)` reading and atomically writing `settings.doneWindow` through the existing config helpers, plus their handlers beside git sharing.
3. Add `src/renderer/doneWindow.js` (store) and call `init()` from `index.js`.
4. Add `src/renderer/specs/filterModel.js` with `test/specsFilterModel.test.js`.
5. Tasks board: window the Completed column in `render()`, footer reveal button, count and tooltip, reset on project change, subscribe to the store; CSS for `.done-older` / `.show-older` / the footer button.
6. Specs board: replace `activeFilter` with `scope` + `phase`, render phase chips only under Active, drive the grid from `buildGridModel`, ghost tile with reveal, resets, subscribe to the store; CSS for `.specs-card-older`.
7. Project Settings: Boards section markup in `index.html`, sync / change handlers and the inert state in `projectSettingsModal.js`.
