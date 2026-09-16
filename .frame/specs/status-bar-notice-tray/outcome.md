## T01 — Add the pure notice tray model with tests

Added `src/renderer/statusBar/noticeTrayModel.js` (`add`, `dismiss`, `clear`, `markAllRead`, `indicator`, `sourceLabel`, `moveFocus`, `MAX_NOTICES = 50`) and `test/noticeTrayModel.test.js` (12 tests). `add` takes `{ now, id }` as its third argument rather than two positional values; unknown severities normalise to `error`, and a missing source becomes `unknown`. No deviation from plan.md.

_Captured: 2026-09-16 · 2 file change(s)_

---
