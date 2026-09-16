# Plan — First-run guided tour

## Architecture

### Resolved plan-time decisions

**Business**

- **Who sees the tour automatically → everyone, once** (asked; the user chose
  this over "fresh users only"). The tour starts after the boot splash leaves,
  for any user whose `guidedTourDone` setting is unset: users with projects
  land at step 2, users without projects at step 1. **This overrides the
  spec's success criterion "a user who already has projects… no tour
  appears".** The rest of that criterion still holds: a user who has finished
  or skipped the tour does not see it again.
- **Orchestration's "more than one spec" → copy only** (asked). The card says
  orchestration runs specs in parallel and needs more than one spec with tasks
  to be useful. `orchestrator.js` is not changed.
- **Agents and terminals → two steps** (asked; the user chose this over one).
  Step 3 covers the header launcher, step 4 covers terminals. The tour
  therefore has **8 steps**, not the 7 in the spec's Goal.
- **Highlight look → light dim with a cutout** (asked). The rest of the window
  dims slightly and the target sits in a clear hole with an accent ring. The
  dim layer never captures clicks, so the target and the whole app stay usable.
- **An interrupted tour is not resumed** (silent). Only Skip, Escape or Done
  write the setting. Quitting mid-tour leaves it unset, so the next launch
  starts from the first step that applies.
- **Re-runnable** (silent): palette command `help.tour` ("Take the Frame
  Tour") and Help › Take the Frame Tour. A manual run ignores the setting and
  writes it again on skip or finish.
- **The last step links to the guide** (silent, allowed by the spec's C1).
  "How to Use Frame" closes the tour as finished, then runs `help.guide`.

**Technical**

- **Mechanism → a new tour module** (asked). The Initialize Frame spotlight
  (`state.js:282`, `#spotlight-overlay`) is left untouched.
- **Test posture → pure logic only** (asked, and it matches the testing
  record's convention). Step data, step resolution, the auto-start rule and
  card placement live in a dependency-free module with a test file. The DOM
  host is not tested.
- **The trigger lives in `appLoader`, not `onboarding`** (silent, forced by
  "everyone once"). The onboarding screen only exists when there are zero
  projects, but the tour must also start when the splash fades straight to the
  app. Both paths end in `appLoader.park()`, so `appLoader` gains
  `onBootLeave(cb)`, which fires once, on the first park. The file is in
  `audit-q3-performance-resources`'s footprint only for its init-once guard,
  which is already in place. This is an additive export and does not collide.
- **The overlay is built in JS and appended to `body`** (silent). This keeps
  the heavily edited `index.html` out of the footprint, the way the init
  spotlight builds its backdrop.
- **Targets are re-queried on every reposition** (silent).
  `terminalTabBar._renderLeftSection` replaces `.lane-bar-left`'s innerHTML on
  each render, so a held element reference goes stale.
- **Each step lists target selectors in order; the first visible one wins**
  (silent). Step 4 prefers the tab bar's `.lane-bar-terminals` and falls back
  to the Terminals nav row, because the user can remove Terminals from the bar
  (`terminalsInStrip`). A step with no visible candidate is skipped with
  `console.error`.
- **Nav-row steps reveal what hides them** (silent). If the sidebar is
  collapsed or showing another rail tab, the host calls the
  `revealProjectsTab` hook, which is `index.js`'s existing
  `revealSidebarTab('projects')`. That call persists the sidebar as shown, and
  ⌘B undoes it. If the row's nav group is collapsed,
  `projectListUI.revealNavItem(view)` expands the group **without** saving
  that state.
- **Keyboard stays out of the terminal's way** (silent). Enter / → / Escape
  act only when focus is inside the tour card; each step moves focus to the
  card's primary button. A user typing in an agent terminal is never
  interrupted.
- **Layering** (silent). The tour sits at z-index 8000: above the app and the
  status bar, below every modal (10000+), notices (9000+), tooltips (9600) and
  the app loader (100000). A modal opened mid-tour covers the tour and stays
  usable.
- **Setting read fails → no auto-start; write fails → the user is told**
  (silent, per `audit-q3-ux-error-feedback`). A failed read logs
  `console.error` and skips the automatic start, because a tour that
  reappears on every launch is worse than one missed once. A failed write
  calls `notify.error` to say the tour may show again.
- **Step 1 advances on a project, not on Next** (silent). While step 1 is
  active, `state.onProjectChange(path)` with a truthy path moves to step 2
  after two animation frames, so `projectListUI` and the header have
  rendered the new project first.

### Components

**`src/renderer/tour/tourSteps.js`** (pure, no `require` of electron or DOM):

```js
SETTING_KEY = 'guidedTourDone'
STEPS = [
  { id, title, body,              // English copy, 1–2 sentences
    targets: [selector, …],       // ordered candidates
    placement: 'bottom'|'right'|'top',
    needsNav: 'specs'|null,       // nav-row view to reveal first
    advance: 'next'|'project',    // step 1 is 'project'
    requiresProject: bool,        // false only for step 1
    requiresNoProject: bool }     // true only for step 1
]
shouldAutoStart({ done, readFailed }) → bool
firstStepIndex({ hasProject }) → index
nextStepIndex(from, { hasProject, isAvailable: (step) => bool }) → index | -1
placeCard(targetRect, cardSize, viewport, placement, { gap, margin }) → { top, left, placement }
validate(steps) → string[]          // unique ids, non-empty copy, known placement
```

The 8 steps: `project` (`.lane-board-empty-start .project-start`),
`switcher` (`#sidebar-current-project-wrap`), `agent`
(`#app-header .lane-bar-launcher`), `terminals` (`.lane-bar-terminals`, then
`.workspace-nav-item[data-view="terminals"]`), `specs`, `tasks` (nav rows),
`settings` (`#frame-settings-btn`), `orchestration` (nav row
`orchestrator`). The `agent` and `terminals` copy carries the terminal-first
message: bring your own agent (Claude Code, Codex), and drive the work from
its terminal. `orchestration` says it is in beta and needs more than one spec
with tasks. Its card also has the closing line and the guide link. Every claim
in the copy is checked against the code when it is written.

**`src/renderer/guidedTour.js`** (DOM host, like `guideModal.js` /
`onboarding.js`):
- `init({ revealProjectsTab })`: init-once; reads `SETTING_KEY` via
  `GET_USER_SETTING`; registers `appLoader.onBootLeave` to auto-start when
  `shouldAutoStart`; subscribes to `state.onProjectChange`.
- `start()`: builds `#guided-tour` (`.tour-hole`, `.tour-card`) on first use,
  goes to `firstStepIndex`, and binds resize listeners while open (window
  `resize`, `sidebarResize.onChange`, a `ResizeObserver` on
  `#terminal-container`, capture-phase `scroll`). They are unbound on close,
  so a closed tour costs nothing.
- `show(index)`: reveals the nav row if needed, resolves the first visible
  target, positions the hole (target rect + 6px) and the card via
  `placeCard`, and renders the counter "n of N", Next / Done, Skip tour, and
  the guide link on the last step. If no target is visible, it logs and moves
  to `nextStepIndex`.
- `finish(outcome)`: removes the overlay, unbinds listeners and writes
  `{ outcome, at }` to `SETTING_KEY`.

**Styles** in `tour.css`: `.tour-hole` uses `box-shadow: 0 0 0 9999px` with a
light dim from `color-mix` over black, plus an accent outline. `.tour-card`
uses design tokens (`--bg-secondary`, `--border-default`, `--radius-lg`) in
both themes. Hole and card move with a short transition, removed under
`prefers-reduced-motion`. The root has `pointer-events: none`; the card has
`pointer-events: auto`.

## Files

- `src/renderer/tour/tourSteps.js` — **New**: step data and copy, auto-start rule, step resolution, card placement, validation.
- `test/tourSteps.test.js` — **New**: shipped steps validate; first/next step resolution with and without a project and with unavailable steps; `shouldAutoStart`; `placeCard` flips and clamps inside the viewport.
- `src/renderer/guidedTour.js` — **New**: the DOM host (overlay, step rendering, positioning, keyboard, reveal, persistence, auto-start).
- `src/renderer/styles/components/tour.css` — **New**: hole, dim, ring, card, transitions, reduced motion.
- `src/renderer/styles/main.css` — **Modified**: import `components/tour.css`.
- `src/renderer/appLoader.js` — **Modified**: `onBootLeave(cb)` fired once on the first `park()`.
- `src/renderer/projectListUI.js` — **Modified**: export `revealNavItem(view)`, which expands the row's group without persisting and returns the row or null.
- `src/renderer/index.js` — **Modified**: `guidedTour.init({ revealProjectsTab })` before `appLoader.init()`; register `help.tour`.
- `src/main/menu.js` — **Modified**: Help › Take the Frame Tour → `help.tour`.

## Footprint

- src/renderer/tour/tourSteps.js
- test/tourSteps.test.js
- src/renderer/guidedTour.js
- src/renderer/styles/components/tour.css
- src/renderer/styles/main.css
- src/renderer/appLoader.js
- src/renderer/projectListUI.js
- src/renderer/index.js
- src/main/menu.js

## Dependencies

None.

## Sequencing

1. **Pure step module and its tests.** Write `tour/tourSteps.js` with the 8
   steps and their copy (each claim checked against the code: launcher,
   terminal chips and ×, spec → plan → tasks hand-off, task dispatch, Frame
   Settings contents, orchestrator beta and parallel specs),
   `shouldAutoStart`, `firstStepIndex`, `nextStepIndex`, `placeCard` and
   `validate`. Add `test/tourSteps.test.js` covering each.
2. **Tour stylesheet.** Add `components/tour.css` (root, hole with dim and
   ring, card, buttons, counter, transitions, reduced motion, both themes) and
   import it in `main.css`.
3. **Tour host with manual start.** Add `guidedTour.js`: build the overlay,
   show a step on its first visible target, position it with `placeCard`,
   reposition on resize, sidebar change and scroll, handle focus-scoped
   Enter / → / Escape, and Skip / Done writing `guidedTourDone` (with
   `notify.error` on a failed write). Wire `guidedTour.init` and register
   `help.tour` in `index.js`. Steps whose targets are always in the chrome
   (switcher, agent, terminals chip, settings) work end to end from the
   palette.
4. **Nav-row steps.** Add `projectListUI.revealNavItem(view)` and pass
   `revealProjectsTab` from `index.js`. Before showing a `needsNav` step, the
   host reveals the sidebar and the Projects tab and expands a collapsed
   group. The Terminals fallback, Specs, Tasks and Orchestration steps work
   with the sidebar collapsed, on another rail tab, or with a group
   collapsed.
5. **Step 1 and the project advance.** Show `project` only with no open
   project, on Home's project-start block, with no Next button. Move to step 2
   when `state.onProjectChange` reports a project, two frames later.
6. **Automatic start after boot.** Add `appLoader.onBootLeave(cb)`, fired once
   on the first `park()` (the splash fade and onboarding's Skip or project
   both end there). In `guidedTour.init`, read the setting and start when
   `shouldAutoStart`. A failed read logs and does not start.
7. **Help menu entry.** Add Help › Take the Frame Tour (`help.tour`) in
   `src/main/menu.js`, beside How to Use Frame.
