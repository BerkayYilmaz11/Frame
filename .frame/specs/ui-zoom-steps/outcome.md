## T01 — Add the pure zoom ladder with its unit test

Wrote `src/shared/uiZoom.js` as planned: `MIN_STEP`/`MAX_STEP`/`DEFAULT_STEP`, a frozen `LADDER` (0.85 / 0.92 / 1.00 / 1.10 / 1.20), `clampStep`, `parseStep`, `factorFor`, `percentFor`, `labelFor`, plus a `STEPS` array the Settings select will iterate — the one addition beyond the plan's list. `parseStep` accepts only an in-range integer; `clampStep` truncates floats and maps non-numbers to the default. `test/uiZoom.test.js` pins all of it (5 tests).

_Captured: 2026-09-15 · 2 file change(s)_

---
