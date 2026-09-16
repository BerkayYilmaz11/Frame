# Outcome — First-run onboarding screen

## T01 — the gate, with its tests

Added `src/renderer/onboarding/onboardingGate.js`: `decide({ trigger, projects })` returns `{ show, dismissible }`, with `command` always showing and always dismissible, and `launch` showing only for an empty array — a non-array payload counts as unknown, not empty, so a malformed push cannot put a first-run screen in front of a user who has projects. `test/onboardingGate.test.js` (6 tests) pins that rule, the launch-is-never-dismissible invariant, and that the gate keeps no memory between calls. 2 files.

_Captured: 2026-09-16 · 2 file change(s)_

---

## T02 — the panel's markup, inside the splash

Added `#onboarding` to `index.html` as the last child of `#app-loader`, after the brand lockup: three `.onboarding-box` buttons (Open a folder / Create a new project / Clone from GitHub, each with the icon the retired modal used plus a one-line hint), the default-agent row `onboarding.js` fills, and a foot carrying Skip and the How to Use Frame link, with a `×` that only the palette path binds. Rewrote the element's comment to explain why the panel lives inside the loader rather than beside it (D1/D3). 1 file.

_Captured: 2026-09-16 · 1 file change(s)_

---

## T03 — the panel's stylesheet, and holding the lockup

Added `onboarding.css` (boxes, agent chips carried over from the retired card, foot, a `×` that only appears with `.onboarding-dismissible`, single-column under 700px) and swapped the `main.css` import. Deviation from the plan: the panel is positioned from the surface's centre downward rather than placed in the loader's flex flow — flow re-centres the column and carries the lockup upward, which is exactly what D1 forbids — with a `max-height: 640px` fallback that gives the hold up rather than push Skip off-screen. Also split the reduced-motion override into its own block after the animation, since the earlier block sat before it and lost on source order. 3 files.

_Captured: 2026-09-16 · 3 file change(s)_

---

## T04 — the host: agent chips and failure reporting

Added `src/renderer/onboarding.js`, owning `#onboarding` inside the loader's surface: agent chips rendered from `GET_AI_TOOL_CONFIG`, kept in sync on `AI_TOOL_CHANGED`, persisted through `SET_AI_TOOL`. The selection does not move until main answers true — a chip lighting up on a failed write would tell the user they chose something they did not — and every failure path (read, write, a resolve of false) reports through `notify.error` on top of the `console.error`. Carries the same init-once guard the other surfaces took from audit-q3-performance-resources T06. 1 file.

_Captured: 2026-09-16 · 1 file change(s)_

---

## T05 — the host: routes, Skip, and the two ways out

Wired the three boxes in `onboarding.js` to `state.selectProjectFolder()`, `state.createNewProject()` and `openProjectModal.open({ clone: true })` — each closes the screen first, then runs the route that already exists, so no project-entry flow is forked. Skip and the guide link close it the same way; `×` and Escape answer only when the gate returned `dismissible`, which is the palette path alone. `takeOver(projects)` asks the gate and returns whether it took the surface, so the loader knows not to park it. 1 file.

_Captured: 2026-09-16 · 1 file change(s)_

---

## T06 — the hand-off, and a failure state that survives it

`appLoader.js` keeps the first `WORKSPACE_DATA` payload, and where it would have left it asks `onboarding.takeOver(projects)`; on a take-over it clears its timers and stays, otherwise it fades and parks. `hide()` no longer removes the node — `park()` hides it, so the palette reuses this surface and its lockup. Unplanned but forced by the task: `showFailureState()` used to replace the surface's innerHTML, which would now destroy the lockup and the panel that a successful retry needs, so it appends the error and hides the rest by class, and `hideWhenReady` clears it. Verified live on two isolated profiles — empty workspace ends on the screen with both agent chips, seeded workspace parks as before. 3 files.

_Captured: 2026-09-16 · 3 file change(s)_

---

## T07 — the welcome modal is gone

Deleted `src/renderer/welcomeOverlay.js`, `src/renderer/styles/components/welcome-overlay.css` and the 57-line `#welcome-overlay` block from `index.html`; `index.js` now requires `onboarding` in its place, drops the separate `welcomeOverlay.init()` (appLoader initializes it with the parker hook), and `help.welcome` runs `onboarding.open()` — which resolves dismissible through the gate's command branch, so the summoned screen gets its × and Escape. The `onboardingDismissed` user setting is now read by nothing; left in place deliberately, per the plan's deferral. 4 files.

_Captured: 2026-09-16 · 4 file change(s)_

---

## T08 — the sweep, and one order-dependent rule

Renamed Help › Welcome to "Start with a Project" and the palette command's title to "Show the Start Screen" (the id `help.welcome` stays — `guideContent.js` lists it, and ids are references), corrected the two guide strings this spec falsified, and rewrote the stale Welcome comments in `appLoader.js`, `openProjectModal.js`, `telemetryNotice.js`, `guideModal.js` and three stylesheets, including a `.welcome-tool-option` pointer in `panels.css` that named a deleted class. The sweep also caught a real defect: `.app-loader-failed`'s hide rule tied with onboarding.css's reveal rule on specificity and only won on `@import` order, so it is now two classes deep. 10 files.

_Captured: 2026-09-16 · 10 file change(s)_

---

## Follow-up — two defects the final pass found

Summoning the screen from the palette exposed both. The `×` sat inside `#onboarding`, which the reveal animation transforms — and a transformed ancestor becomes the containing block for `position: fixed` — so it rendered over the third box instead of the window corner; it now lives on the surface beside the panel, with `.app-loader-dismissible` moved there too. And un-parking the surface restarted every animation on it (leaving `display: none` starts them from zero), so the mark re-swept on every summon; `.app-loader-complete` now freezes the lockup and the panel at their end state for the command path, which the boot path never takes. 4 files.

_Captured: 2026-09-16 · 4 file change(s)_

---

## Follow-up — the guide link is gone (overturns D6)

The user asked for the How to Use Frame link to come off the first-run screen, which reverses plan decision D6 — a silent one, where I had kept the retired modal's footer link on the grounds that it was a first run's only visible pointer to the guide. Removed the button from `index.html`, its handler (and with it this module's only `commandRegistry` use) from `onboarding.js`, and the `.onboarding-link` rules that had one user. The foot keeps its row layout for Skip alone. Constraint C1 still holds either way: it forbade the screen opening the guide by itself, and it now does not link to it at all. 3 files.

_Captured: 2026-09-16 · 3 file change(s)_

---

## Follow-up — the screen outlives the routes it starts (revises T05)

The three boxes closed the screen before running their route, so cancelling the folder picker or backing out of the clone form dropped the user into the empty app they were trying to leave — with no way back except the palette. They now start the route and leave the screen standing; `state.onProjectChange` closes it when a project actually opens, which covers all three routes without the screen knowing which one the user took. Two things that made the old shape necessary also had to be fixed: `.modal-overlay` sits at z-index 1000 against this surface's 100000, so the clone form would have opened behind the screen that asked for it (lifted while `body.onboarding-active`), and a summoned screen's Escape would have closed both the modal and the screen, so it now bails while a visible modal is on top. 2 files.

_Captured: 2026-09-16 · 2 file change(s)_

---

## Follow-up — the screen clones for itself (revises T05, retires an entry point)

"Clone from GitHub" opened the Open a Project modal, which answered a choice the user had just made by offering the same three choices again. The box now reveals an inline row under the boxes — URL field, Clone, Cancel, an inline error and a quiet busy state while main works — and `onboarding.handleCloneResult()` takes the result before the modal does, so a failure is reported where the user is looking. Success needs no special case: `setProjectPath` fires `onProjectChange` and the screen leaves by the same path the other two routes use. `openProjectModal.open()` lost its `{ clone: true }` parameter with its only caller, the `body.onboarding-active` z-index lift went with the modal it was lifting, and the clone-failure `alert()` in `index.js` — which blocks the renderer and every IPC behind it — became `notify.error`. 5 files.

_Captured: 2026-09-16 · 5 file change(s)_

---

## Follow-up — one block, two surfaces, and an empty sidebar that gets out of the way

Home's no-project state offered a lone "Add New Project" button into the Open a Project modal — a third, differently-worded answer to the question the first-run screen had just asked properly. Extracted the three ways in (boxes + inline clone) into `src/renderer/projectStart.js` and `project-start.css`, which the first-run screen and Home both mount, so the two cannot drift; `index.js` routes `CLONE_GITHUB_REPO_RESULT` to the block rather than to the screen, and the block tracks which instance sent the clone. Removed the sidebar's pinned "Add new Project" CTA with the rest of `projectSection`'s old job, and put the opposite behaviour in its place: with no project the panel has nothing to show, so the sidebar collapses to its rail and unfolds when one opens — through a new `{ persist: false }` option on `sidebarResize.hide/show`, because a rule the app applies on the user's behalf must not come back as their own stored setting. The Work / Context groups needed no change: `placeWorkspaceNav` already drops them without an active project. 11 files.

_Captured: 2026-09-16 · 11 file change(s)_

---
