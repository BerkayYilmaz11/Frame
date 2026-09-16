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
