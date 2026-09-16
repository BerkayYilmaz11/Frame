# Outcome — First-run guided tour

## T01 — Pure step module and its tests

Added `src/renderer/tour/tourSteps.js` (steps, copy, auto-start rule, step resolution, `placeCard`, `validate`) and `test/tourSteps.test.js` (19 tests). Diverged from plan.md: `placement` and `needsNav` live on each target rather than on the step, so the terminals step's nav-row fallback can sit to the right while the tab-bar chip gets a card below; `isLastStep` was added for the host's Done label. `validate` also enforces the spec's two-sentence limit on card bodies.

_Captured: 2026-09-16 · 2 file change(s)_

---

## T02 — Tour stylesheet

Added `src/renderer/styles/components/tour.css` and its `main.css` import (8b, after the guide). The dim is the hole's own 9999px box-shadow and the ring a 2px shadow on the same box; Next/Done reuse `.primary-btn` from `ui.css`. Beyond plan.md: a `.tour-card-measuring` state (opacity 0, no transition) for the frame before a card is positioned, and a `.tour-card-hint` line for step 1, which has no Next button.

_Captured: 2026-09-16 · 2 file change(s)_

---

## T03 — Tour host with manual start

Added `src/renderer/guidedTour.js` (overlay built in JS, first-visible-target resolution re-queried on every reposition, card rendering, `placeCard` positioning, rAF-coalesced repositioning on resize, capture scroll, `sidebarResize.onChange` and ResizeObservers, all bound only while open) and wired `guidedTour.init()` plus the `help.tour` command in `src/renderer/index.js`. A target that vanishes mid-step is skipped like a missing one; the counter excludes step 1 when the tour starts with a project open. Skip and Done close without recording yet (T04).

_Captured: 2026-09-16 · 2 file change(s)_

---

## T04 — Tour persistence, keyboard and guide link

Added `finish(outcome)` to `src/renderer/guidedTour.js`, recording `{ outcome, at }` under `guidedTourDone` and reporting a failed write through `notify.error`; Skip tour and Escape record `skipped`, Done, the guide link and an exhausted step list record `finished`. Escape / → / Enter are handled on the card itself, and each step focuses its primary button. Beyond plan.md: the last card shows the guide link in Skip tour's place, and running out of on-screen steps finishes rather than silently closing.

_Captured: 2026-09-16 · 1 file change(s)_

---

## T05 — Nav-row steps reveal the sidebar

Added `revealNavItem(view)` to `src/renderer/projectListUI.js` (expands the row's group, not persisted) and a `revealProjectsTab` hook on `guidedTour.init`, passed from `src/renderer/index.js` as `revealSidebarTab('projects')`. `guidedTour.js` counts a hidden-but-present nav row as available and reveals it only when its step opens; repositioning never reveals, so collapsing the sidebar mid-step skips that step instead of fighting the user.

_Captured: 2026-09-16 · 3 file change(s)_

---

## T06 — Step 1 waits for a project

Wired step 1 in `src/renderer/guidedTour.js`: a `state.onProjectChange` handler advances from the project step two frames after a project arrives, and the card shows an 'Add a project to continue' hint instead of Next. Beyond plan.md: a reposition that finds the empty Home block gone also reaches step 2, so the handler re-checks the step inside its frame callback to avoid a double advance, and that expected disappearance is not logged as a missing target.

_Captured: 2026-09-16 · 1 file change(s)_

---

## T07 — Automatic start after boot

Added `onBootLeave(cb)` to `src/renderer/appLoader.js` (once, on the first `park()`) and the automatic start in `src/renderer/guidedTour.js`: read `guidedTourDone`, `shouldAutoStart`, then two frames. Diverged from plan.md after a live run: the auto-start also waits for the first-launch telemetry notice to close, since it covers the header targets of the first steps; the last-card check now uses the run's step order (step 1 had shown the guide link instead of Skip tour); and the dim in `tour.css` went from 38% to 50% because the dark theme barely showed it. Step 1's advance on a real added project was not driven live (it needs the native folder picker).

_Captured: 2026-09-16 · 3 file change(s)_

---

