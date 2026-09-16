# Outcome — First-run guided tour

## T01 — Pure step module and its tests

Added `src/renderer/tour/tourSteps.js` (steps, copy, auto-start rule, step resolution, `placeCard`, `validate`) and `test/tourSteps.test.js` (19 tests). Diverged from plan.md: `placement` and `needsNav` live on each target rather than on the step, so the terminals step's nav-row fallback can sit to the right while the tab-bar chip gets a card below; `isLastStep` was added for the host's Done label. `validate` also enforces the spec's two-sentence limit on card bodies.

_Captured: 2026-09-16 · 2 file change(s)_

---

## T02 — Tour stylesheet

Added `src/renderer/styles/components/tour.css` and its `main.css` import (8b, after the guide). The dim is the hole's own 9999px box-shadow and the ring a 2px shadow on the same box; Next/Done reuse `.primary-btn` from `ui.css`. Beyond plan.md: a `.tour-card-measuring` state (opacity 0, no transition) for the frame before a card is positioned, and a `.tour-card-hint` line for step 1, which has no Next button.

_Captured: 2026-09-16 · 2 file change(s)_

---

