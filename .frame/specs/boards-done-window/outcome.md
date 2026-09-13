## T01 — Pure done-window model

Added `src/shared/doneWindow.js`: `DEFAULT_DONE_WINDOW { tasks: 7, specs: 30 }`, `WINDOW_OPTIONS [7, 30, 90, 0]`, `normalizeDoneWindow` (per-key fallback, numeric strings in the set accepted), `isWithinWindow` (inclusive at exactly N days, 0 = all, absent or unparseable date = recent) and `partitionDone` keeping input order. `test/doneWindow.test.js` pins each rule; 13 tests, full suite 737 pass. No deviation from plan.md.

_Captured: 2026-09-13 · 2 file change(s)_

---
