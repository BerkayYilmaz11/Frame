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
