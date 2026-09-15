## T01 — Add the pure zoom ladder with its unit test

Wrote `src/shared/uiZoom.js` as planned: `MIN_STEP`/`MAX_STEP`/`DEFAULT_STEP`, a frozen `LADDER` (0.85 / 0.92 / 1.00 / 1.10 / 1.20), `clampStep`, `parseStep`, `factorFor`, `percentFor`, `labelFor`, plus a `STEPS` array the Settings select will iterate — the one addition beyond the plan's list. `parseStep` accepts only an in-range integer; `clampStep` truncates floats and maps non-numbers to the default. `test/uiZoom.test.js` pins all of it (5 tests).

_Captured: 2026-09-15 · 2 file change(s)_

---
## T02 — Add the zoom IPC channels and the main-process zoom owner

Added `UI_ZOOM_GET` / `UI_ZOOM_SET` / `UI_ZOOM_CHANGED` beside the user-setting channels in `ipcChannels.js` and wrote `src/main/uiZoom.js` as planned: `init` parses `uiZoomStep`, `currentFactor` seeds the window, `attachWindow` re-applies on `did-finish-load`, snaps `zoom-changed` ±1 and registers the handlers, `setStep` clamps / early-returns / applies / persists / broadcasts. One detail beyond the plan: the `zoom-changed` handler re-applies the ladder factor even when the step did not change, because at the ends of the ladder Chromium may already have moved its own factor before the event arrives. Not yet wired into `index.js` (T03), so nothing changes at runtime from this commit alone.

_Captured: 2026-09-15 · 2 file change(s)_

---
