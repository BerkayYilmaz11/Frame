# Outcome — First-run onboarding screen

## T01 — the gate, with its tests

Added `src/renderer/onboarding/onboardingGate.js`: `decide({ trigger, projects })` returns `{ show, dismissible }`, with `command` always showing and always dismissible, and `launch` showing only for an empty array — a non-array payload counts as unknown, not empty, so a malformed push cannot put a first-run screen in front of a user who has projects. `test/onboardingGate.test.js` (6 tests) pins that rule, the launch-is-never-dismissible invariant, and that the gate keeps no memory between calls. 2 files.

_Captured: 2026-09-16 · 2 file change(s)_

---
