# Plan — UI zoom steps

## Architecture

### Resolved plan-time decisions

- **D1 · Ladder values (asked).** Steps −2…+2 map to factors
  `0.85 / 0.92 / 1.00 / 1.10 / 1.20`. Rejected `0.80 / 0.90 / 1.00 / 1.15 /
  1.30`. Rationale: the tight ladder keeps sidebar + center + dock inside the
  900px minimum window at +2 (750 CSS px against 280 + 36 + 400 minimums) and
  keeps −2 at 10.2px effective base text, which is still readable.
- **D2 · Status bar indicator (asked).** When the step is not 0, the status
  bar's right end shows the percentage (e.g. `110%`); clicking it resets.
  Rejected: no indicator. Rationale: the `status-bar` spec reserved the right
  end for glanceable readouts, and a zoomed UI with no visible cause is the
  exact confusion the spec's Problem describes.
- **D3 · Minimum window size (asked).** `900×600` stays fixed at every step.
  Rejected: scaling the minimum with the factor via `setMinimumSize`.
  Rationale: no code, no surprise growth on small screens; +2 at the minimum
  window is cramped but usable under D1.
- **D4 · Test posture (asked).** Pure logic only: the step→factor mapping,
  clamping and stored-value parsing live in a dependency-free module under
  `src/shared/` with a unit test in `test/`. Rejected: no tests. Rationale:
  matches the testing record — `src/shared/` is covered, DOM-coupled renderer
  code is not.
- **D5 · Zoom is owned by the main process (silent).** One module,
  `src/main/uiZoom.js`, reads the stored step, applies the factor to the
  window and persists changes; the renderer only asks for a step. Rejected:
  `webFrame.setZoomFactor` from the renderer. Rationale: the factor must exist
  before the window is created (`webPreferences.zoomFactor`), Chromium's
  `zoom-changed` is a `webContents` event, and `userSettings` is main-side —
  a renderer owner would split boot apply and runtime apply across two owners.
- **D6 · Three commands, one channel (silent).** Menu items are
  `cmd('Zoom In', 'view.zoomIn', 'CmdOrCtrl+=')` etc., routed through the
  existing `RUN_APP_COMMAND` path to registry commands, exactly as every other
  View item is wired (`dock-panel-readonly-views` D12). The registry commands
  compute the next step with the shared module and call one IPC channel,
  `UI_ZOOM_SET(step)`. Main applies, persists and broadcasts
  `UI_ZOOM_CHANGED {step, factor}` to every subscriber (terminals, status bar,
  settings).
- **D7 · Settings control is a `<select>` (silent).** The Appearance row reuses
  `.settings-select` — the Git sharing row's pattern for "named modes, not
  on/off" — with five named options. Rejected: a new segmented control, which
  would be the only one of its kind in the app.
- **D8 · Stale Chromium level is overridden on every load (silent).**
  `webPreferences.zoomFactor` seeds the first paint, and `did-finish-load`
  re-applies `setZoomFactor(factor)` so a per-origin level Chromium kept from
  the old native roles never wins. The boot splash (`appLoader`) covers the UI
  until init completes, so the re-apply is not visible.
- **D9 · Pinch / Ctrl+wheel snap to the ladder (silent).** `zoom-changed`
  (direction `in` / `out`) steps ±1 through the ladder and re-applies the
  ladder factor, overriding whatever Chromium set. Rejected: ignoring the
  event, which would leave Chromium's free value in place.
- **D10 · Plus key alias (silent).** Beside the visible `CmdOrCtrl+=` item, the
  View menu carries a `visible: false` item on `CmdOrCtrl+Shift+=` so ⌘+ on
  layouts where `+` is shifted `=` also zooms in — the same trick Electron's
  own `zoomIn` role uses. The registry shows one shortcut, `CmdOrCtrl+=`.
- **D11 · In-flight footprints (silent).** `audit-q3-performance-resources`
  (implementing, untouched since 2026-08-26) and `audit-q3-cross-platform`
  (planned, since 2026-07-20) declare `src/main/index.js`, `index.html`,
  `src/renderer/index.js`, `src/renderer/terminalManager.js` and
  `src/shared/ipcChannels.js`. Neither has a worktree. This spec is
  implemented directly in the main checkout, not through the orchestrator's
  conflict guard; the edits are additive and touch none of the audit specs'
  concerns.

### Design

**The ladder** — `src/shared/uiZoom.js` (New, pure):

```js
const MIN_STEP = -2, MAX_STEP = 2, DEFAULT_STEP = 0;
const LADDER = { '-2': 0.85, '-1': 0.92, '0': 1.0, '1': 1.10, '2': 1.20 };
clampStep(n)          // integer within [-2, 2]
parseStep(raw)        // stored value → step; anything not an integer in range → 0
factorFor(step)       // LADDER[clampStep(step)]
percentFor(step)      // Math.round(factorFor(step) * 100)  → 85, 92, 100, 110, 120
labelFor(step)        // 'Smallest' | 'Smaller' | 'Default' | 'Larger' | 'Largest'
```

**The owner** — `src/main/uiZoom.js` (New). Holds `step` in memory,
loaded from `userSettings.get('uiZoomStep')` through `parseStep` at `init()`.

- `currentFactor()` — what `createWindow` passes as `webPreferences.zoomFactor`.
- `attachWindow(win)` — on `did-finish-load` re-applies `setZoomFactor`
  (D8); on `zoom-changed` steps ±1 and applies (D9).
- `setStep(step)` — clamp, `webContents.setZoomFactor(factor)`,
  `userSettings.set('uiZoomStep', step)` (delete-on-null semantics mean step 0
  is still written as `0`; `parseStep` treats absent and `0` alike), then
  `webContents.send(UI_ZOOM_CHANGED, { step, factor })`.
- IPC: `ipcMain.handle(UI_ZOOM_GET)` → `{ step, factor }`;
  `ipcMain.handle(UI_ZOOM_SET, (e, step))` → `setStep`.

**Entry points** — all end in `UI_ZOOM_SET`:

| Entry point | Path |
| --- | --- |
| View menu / ⌘= ⌘- ⌘0 | `menu.js cmd()` → `RUN_APP_COMMAND` → registry `view.zoomIn/zoomOut/zoomReset` |
| Command Palette, cheat sheet | registry (automatic) |
| Renderer keydown (Win/Linux, or menu absent) | `commandRegistry.bindKeyboard` matches `CmdOrCtrl+=` etc. |
| Frame Settings select | `frameSettingsModal` `change` handler |
| Status bar `110%` button | runs `view.zoomReset` |
| Pinch / Ctrl+wheel | `zoom-changed` inside the owner (D9) |

The registry commands read the current step via `UI_ZOOM_GET`, compute
`clampStep(step ± 1)` (or `0`), and call `UI_ZOOM_SET`. Clamping at the ends
makes a further press a no-op (`setStep` returns early when the step is
unchanged — no broadcast, no write).

**Subscribers of `UI_ZOOM_CHANGED`:**

- `src/renderer/index.js` — `requestAnimationFrame(() => terminalManager.fitAll())`.
  Page zoom changes every pane's CSS-px size, so `terminalsView`'s
  `ResizeObserver` fits too; `_sendResize`'s last-sent guard dedupes the PTY
  message (C6).
- `src/renderer/statusBar.js` — shows/hides the `.sb-zoom` button and sets its
  text to `percentFor(step) + '%'`.
- `src/renderer/frameSettingsModal.js` — sets the select's value.

**Terminal focus** — `terminalManager._initializeTerminal`'s custom key
handler gains one passthrough: modifier + `=`, `-` or `0` returns `false`, so
xterm neither types nor swallows the chord and the document-level registry
handler sees it. On macOS the native accelerator fires first regardless; the
passthrough is what makes S2 true on Windows/Linux.

**Markup** — Frame Settings gains an *Appearance* section above *Privacy &
Analytics* in `index.html`: one `.settings-row` with label "Interface size",
a description ("Scales text, icons and spacing together. ⌘= and ⌘- step it;
⌘0 resets."), and `<select id="settings-ui-zoom" class="settings-select">`
with five options valued `-2…2`, labelled via `labelFor` plus the percentage.
The status bar indicator is built in JS (`_buildZoom()` inserted before
`#app-version`), no static markup.

**What does not change** — no stylesheet value, no font size, no `--space-*`
token, no xterm `fontSize` (C1). The only CSS added is `.sb-zoom` in
`status-bar.css` (a small readout-styled button, hidden at step 0).

## Files

- **New** `src/shared/uiZoom.js` — the ladder: steps, factors, clamp, parse, labels. Pure, required by main and renderer.
- **New** `test/uiZoom.test.js` — pins the ladder values, clamping at both ends, `parseStep` on bad stored values, labels/percents.
- **New** `src/main/uiZoom.js` — the owner: boot factor, apply, persist, `zoom-changed` snap, IPC handlers, broadcast.
- **Modified** `src/shared/ipcChannels.js` — `UI_ZOOM_GET`, `UI_ZOOM_SET`, `UI_ZOOM_CHANGED`.
- **Modified** `src/main/index.js` — `uiZoom.init()` after `userSettings.init()`; `webPreferences.zoomFactor: uiZoom.currentFactor()`; `uiZoom.attachWindow(mainWindow)`.
- **Modified** `src/main/menu.js` — the three stock roles become `cmd(...)` items with `CmdOrCtrl+=`, `CmdOrCtrl+-`, `CmdOrCtrl+0`, plus the hidden `CmdOrCtrl+Shift+=` alias (D10).
- **Modified** `src/renderer/index.js` — registers `view.zoomIn`, `view.zoomOut`, `view.zoomReset` (category View, shortcuts as above); subscribes to `UI_ZOOM_CHANGED` for `terminalManager.fitAll()`.
- **Modified** `src/renderer/terminalManager.js` — key passthrough for modifier + `=` / `-` / `0`.
- **Modified** `src/renderer/frameSettingsModal.js` — Appearance select: read on open, apply on change, follow `UI_ZOOM_CHANGED`.
- **Modified** `index.html` — Appearance section in the Frame Settings modal.
- **Modified** `src/renderer/statusBar.js` — `_buildZoom()`: the `.sb-zoom` readout button, hidden at step 0, click runs `view.zoomReset`.
- **Modified** `src/renderer/styles/components/status-bar.css` — `.sb-zoom` styling beside `.sb-version`.

## Footprint

- src/shared/uiZoom.js
- test/uiZoom.test.js
- src/main/uiZoom.js
- src/shared/ipcChannels.js
- src/main/index.js
- src/main/menu.js
- src/renderer/index.js
- src/renderer/terminalManager.js
- src/renderer/frameSettingsModal.js
- index.html
- src/renderer/statusBar.js
- src/renderer/styles/components/status-bar.css

## Dependencies

None.

## Sequencing

1. **The ladder, with its test.** Write `src/shared/uiZoom.js` (`MIN_STEP`,
   `MAX_STEP`, `DEFAULT_STEP`, `LADDER`, `clampStep`, `parseStep`,
   `factorFor`, `percentFor`, `labelFor`) and `test/uiZoom.test.js` covering
   the five factors, clamping at −2 and +2, `parseStep` on `null`, strings,
   floats and out-of-range integers, and the five labels/percents.
2. **The owner, applied at boot.** Add the three channels to
   `ipcChannels.js`; write `src/main/uiZoom.js` (`init`, `currentFactor`,
   `attachWindow` with the `did-finish-load` re-apply and the `zoom-changed`
   snap, `setStep`, the two `ipcMain.handle`s and the broadcast); wire
   `src/main/index.js` (`init` after `userSettings.init()`,
   `webPreferences.zoomFactor`, `attachWindow`). Verifiable now: set
   `"uiZoomStep": 2` in `user-settings.json`, launch, the first frame is at
   120% (S6, S8); pinch or Ctrl+wheel moves one ladder step (C3).
3. **The commands.** In `src/renderer/index.js` register `view.zoomIn`,
   `view.zoomOut`, `view.zoomReset` (category `View`, shortcuts
   `CmdOrCtrl+=`, `CmdOrCtrl+-`, `CmdOrCtrl+0`) that read `UI_ZOOM_GET`,
   compute the next step with the shared module and call `UI_ZOOM_SET`;
   subscribe to `UI_ZOOM_CHANGED` and `fitAll()` the terminals on the next
   frame. Add the `=` / `-` / `0` passthrough to `terminalManager`'s custom
   key handler. Verifiable: palette and cheat sheet list the three commands
   (S9); the shortcuts step and clamp with a terminal focused (S2, S3);
   `tput cols` changes after a step (S5).
4. **The View menu.** In `src/main/menu.js` replace `{ role: 'zoomIn' }`,
   `{ role: 'zoomOut' }`, `{ role: 'resetZoom' }` with the three `cmd(...)`
   items in the same position, plus the hidden `CmdOrCtrl+Shift+=` alias.
   Verifiable: the View menu shows Zoom In / Zoom Out / Reset Zoom with their
   accelerators above Toggle Full Screen (S10, G4), and ⌘+ zooms in.
5. **Frame Settings › Appearance.** Add the section to `index.html` and wire
   the select in `frameSettingsModal.js`: populate options from the shared
   module, read the current step when the overlay opens (alongside
   `syncToggleFromSettings`), apply on `change`, follow `UI_ZOOM_CHANGED`.
   Verifiable: the select shows the current step and choosing another
   applies immediately (S7, G5).
6. **Status bar indicator.** `_buildZoom()` in `statusBar.js` inserts the
   `.sb-zoom` button before `#app-version`, hidden at step 0, text
   `110%`, tooltip "Reset zoom (⌘0)", click runs `view.zoomReset`; style it
   in `status-bar.css` beside `.sb-version`. Verifiable: the readout appears
   only away from step 0 and clicking it returns to 100% (D2).
