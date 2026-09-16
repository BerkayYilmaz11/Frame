## T01 — Add the pure notice tray model with tests

Added `src/renderer/statusBar/noticeTrayModel.js` (`add`, `dismiss`, `clear`, `markAllRead`, `indicator`, `sourceLabel`, `moveFocus`, `MAX_NOTICES = 50`) and `test/noticeTrayModel.test.js` (12 tests). `add` takes `{ now, id }` as its third argument rather than two positional values; unknown severities normalise to `error`, and a missing source becomes `unknown`. No deviation from plan.md.

_Captured: 2026-09-16 · 2 file change(s)_

---
## T02 — Add the notice tray host with the indicator button

Added `src/renderer/statusBar/noticeTray.js` with `init({ slotEl })` building the `.sb-notices` button (CircleAlert, count, info dot) and `push()` recording notices through `noticeTrayModel.add`, usable before `init()`. The button's tone classes and count come from `indicator()`. Divergence: plan.md had the tooltip describe the state, but `tooltip.attach` only takes fixed text, so the tooltip says "Notices" and the state goes in the aria-label and the count. Not mounted yet (T06).

_Captured: 2026-09-16 · 1 file change(s)_

---
