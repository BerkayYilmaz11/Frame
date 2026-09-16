# Outcome — First-run guided tour

## T01 — Pure step module and its tests

Added `src/renderer/tour/tourSteps.js` (steps, copy, auto-start rule, step resolution, `placeCard`, `validate`) and `test/tourSteps.test.js` (19 tests). Diverged from plan.md: `placement` and `needsNav` live on each target rather than on the step, so the terminals step's nav-row fallback can sit to the right while the tab-bar chip gets a card below; `isLastStep` was added for the host's Done label. `validate` also enforces the spec's two-sentence limit on card bodies.

_Captured: 2026-09-16 · 2 file change(s)_

---

