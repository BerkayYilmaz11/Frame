## T01 — check-freshness runs without structure helpers

Made `structure-read` and `structure-switch` optional requires in `scripts/check-freshness.js`; `mapEnabled` now needs both present plus the project's opt-in, otherwise only the notes/tasks/quickstart checks run. Dropped `check-freshness.js` from `ENTRY_REQUIRES` in `src/main/structureBootstrap.js` and updated the activation test in `test/structureBootstrap.test.js` that encoded the old dependency. Added a helper-less copy test to `test/structureSwitch.test.js`.

_Captured: 2026-10-22 · 4 file change(s)_

---
