# Outcome — How to Use Frame guide

## T01 — Create the pure guide content module with chapter 1

Added `src/renderer/guide/guideContent.js`: CHAPTERS, SKETCH_KINDS (20), ACTION_IDS, STAY_IDS, `flattenPages`, `validate`, and chapter 1 (`start.what`, `start.agent`, `start.open`) written against aiToolManager's tool registry and first-run probe. Beyond the plan, exported `parseInline` (splits `{kbd:id}` and backtick code out of plain text) so the host's only text parsing is pure and testable; ACTION_IDS holds the full allowlist for all chapters up front instead of growing per chapter. 1 file.

_Captured: 2026-09-15 · 1 file change(s)_

---

## T02 — Write the guide content test suite

Added `test/guideContent.test.js` (19 tests): the shipped content validates clean with unique ids, known sketch kinds and allowlisted commands; `flattenPages` order across chapters; `parseInline` segments; and a sound fixture broken one rule at a time proves `validate` reports each mistake. Also pins SKETCH_KINDS at twenty and the first page as `start.what`. 1 file.

_Captured: 2026-09-15 · 1 file change(s)_

---

## T03 — Add the guide modal frame, stylesheet and wide modal token

Added the static `#guide-overlay` frame to `index.html` beside Welcome (header with ×, `#guide-tree` nav, `#guide-page` with `#guide-sketch` slot, footer with the launch checkbox, Back, counter, Next), `src/renderer/styles/components/guide.css` imported from `main.css`, and `--modal-width-wide: 1040px` in `variables.css` with a comment naming the guide as its only user. The CSS also carries the page typography, action buttons, note and kbd styles T04 renders into, plus a reduced-motion rule the plan did not mention. 4 files.

_Captured: 2026-09-15 · 4 file change(s)_

---

## T04 — Build the guide modal host and register help.guide

Added `src/renderer/guideModal.js`: renders the tree (numbered chapters, expanded by default, collapsible, auto-expanding on navigation), the page (chapter eyebrow, title, Claude-only chip, blocks with escaped text, `{kbd:id}` from the registry via `formatShortcut`, actions), Back / counter / Next→Done, ←/→, Escape, × and backdrop close, dialog focus and terminal focus restore; action links close with `via: 'action'` then `runById`, `stay` links run in place, unregistered ids render disabled with one `console.error`. Registered `help.guide` in `index.js`. Diverged: the sketch slot stays empty (CSS hides it) rather than drawing a placeholder, `close` notifies `onClose` listeners (the hook T06 uses), and buttons keep default tab order instead of the app's usual `tabindex=-1` so the dialog is keyboard reachable; also fixed a doubled full stop in `start.open`. Verified in an isolated dev Frame via Playwright. 3 files.

_Captured: 2026-09-15 · 3 file change(s)_

---

## T05 — Add the guide's entry points and the plugins.open command

Registered `plugins.open` (Plugins, category Help, `pluginsPanel.toggle()`) in `index.js`, added Help › How to Use Frame (`help.guide`) above Welcome in `src/main/menu.js`, and added `#guide-btn` as the last rail-foot button under the gear with a CircleHelp icon and a "How to Use Frame" tooltip that runs `help.guide`. The icon is inline SVG in `index.html` like the other rail buttons, not rendered through lucide at runtime as the task wording suggested; the paths are lucide's CircleHelp. Verified live: the button sits below the gear, opens and closes the guide, and an action link closed the guide and opened Open Project. 3 files.

_Captured: 2026-09-15 · 3 file change(s)_

---

## T06 — Move the launch trigger to the guide and add the launch checkbox

`guideModal.init({ onLaunchDone })` now owns the first `WORKSPACE_DATA`: it opens the guide unless `guideHideOnLaunch` is true (and opens it when the setting cannot be read), persists the "Don't show this on launch" checkbox on change, syncs it on every open, and runs `onLaunchDone` once when the launch-opened guide closes by ×, Escape, backdrop or Done, or at once when the guide is off; an action-link close skips it. `welcomeOverlay.js` lost its listener and `launchTriggerFired` and exports `showOnLaunch`, wired in `index.js`. The listener is registered before the element check so a missing guide cannot swallow Welcome; also reworded `start.open` so it no longer says Welcome opens after every close. Verified live on isolated profiles: fresh launch, Escape→Welcome, tick→relaunch skips guide, untick→guide returns, action link skips Welcome. 4 files.

_Captured: 2026-09-15 · 4 file change(s)_

---

## T07 — Add the sketch system with the agents and shell kinds

Added `src/renderer/guide/guideSketches.js`: `render(kind, focus)` returning HTML or null, primitives (frame, region, bar, label, chip with status dot, terminal lines), comma-separated focus, and the `agents` (three CLIs + own sign-in into a Frame window with lane chips and context files) and `shell` (header, rail with split foot buttons, nav, terminal grid, dock, status bar) kinds; the `.gs-*` vocabulary and a focus rule that accents the named region and fades the rest went into `guide.css`. `guideModal.js` now renders sketches and logs an undrawn kind once. Rail-foot buttons became individual regions so a single one (e.g. `rail-guide`) can be focused, and the focus CSS uses `:has()` so a focused child is never dimmed by its parent. Checked in dark and light themes in an isolated instance. 3 files.

_Captured: 2026-09-15 · 3 file change(s)_

---

## T08 — Write chapters 2–3 and their sketches

Added the Projects chapter (Initialize a project, Share it or keep it local, The sidebar, Two kinds of settings) and the Terminals & agents chapter (Open terminals, Start the agent, Talk to the agent, Know which agent needs you, Home) to `guideContent.js`, each checked against index.html's init modal and settings markup, `terminalManager`'s nine-terminal cap, `laneStatus` labels, `agentDispatch`'s start and busy-terminal flow and the Home widgets. Added the `fileTree` (tag-based focus), `gitSharing`, `settings`, `terminalGrid` (with a `prompt` variant), `laneStates` and `home` sketches plus shared toggle/select controls. Diverged: Home's first card is titled Terminals in code (not Agents, as the plan said), so copy and sketch use that; no test changes were needed because the suite checks every page generically. 3 files.

_Captured: 2026-09-15 · 3 file change(s)_

---

## T09 — Write chapters 4–5 and their sketches

Added the Specs chapter (Why specs, The flow, Start a spec, Plan it then break it down, Implement, Where specs and tasks live) and the Orchestration (Beta) chapter (What Orchestration does, It needs specs, Run it) to `guideContent.js`, with labels taken from `specNextAction`, `implementModeModal`, `specPanel`'s New Spec modal, `agentDispatch`'s Spec Creator lane and `orchestrator.js` (assignable phases, pipeline stages, Start Orchestrator, Approve/Remove). Added the `specFlow` (with a `gate` marker for assignable steps), `implementModes`, `boards` and `orchestrator` sketches. Dropped one drafted sentence claiming specs without a footprint cannot be scheduled, which the code does not establish. 3 files.

_Captured: 2026-09-15 · 3 file change(s)_

---

