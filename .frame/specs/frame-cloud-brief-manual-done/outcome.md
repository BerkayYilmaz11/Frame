# Outcome — Frame Cloud brief manual Done

## T01 — Read the Done fields and add the two moves in cloudBriefs.js

Added `doneAt`, `doneBy`, `doneReason` (string or null) and `readyForDone` (true only when the server sends `true`) to `normalizeBrief`, so the detail carries them through its spread, and replaced brief-done's `doneAt` exclusion test as D15 says. Added `MOVE_REFUSALS`, `moveToDone` and `moveBackToActive`, both of which send `{ id }` plus the trimmed reason only when it is not blank. Added `moveThrough`, shaped like `decideThrough`, which refuses an unknown `to` as `badRequest` and a blank move back as `reasonRequired` before anything is sent. Rewrote the header's write list to say Done is now a person's move. Files: `src/main/cloud/cloudBriefs.js`, `test/cloudBriefs.test.js`.

_Captured: 2026-11-08 · 2 file change(s)_

---

## T02 — Write the move hold

Added `src/shared/cloudMoveHold.js` with `HOLD_MS = 5000` and `createMoveHold({ holdMs, setTimer, clearTimer })`, which returns `hold`, `undo`, `flush({ timeoutMs })` and `size` and never rejects (a throwing or rejecting `run` answers `other`). Beyond the plan, `flush` also waits for sends already under way, not only the ones it starts, so the quit flush and the flush before an unheld move also cover a move whose 5 seconds ran out just before. It resolves `true` when every send settled and `false` when the timeout came first. `test/cloudMoveHold.test.js` covers every case in the plan on a hand-rolled fake clock passed in through `setTimer`/`clearTimer`. Files: `src/shared/cloudMoveHold.js`, `test/cloudMoveHold.test.js`.

_Captured: 2026-11-08 · 2 file change(s)_

---

## T03 — Wire the moves through main

Added `CLOUD_BRIEF_MOVE` and `CLOUD_BRIEF_MOVE_UNDO`, plus `move`, `undoMove` and `flushMoves` on one `createMoveHold()` in `cloudBriefsService.js`. Diverged from the plan's order: `move` reads the brief id (`getBrief`) inside the send instead of before holding, so the hold starts the moment the renderer asks, an Undo pressed during that first read still finds the move, and an undone move sends no request at all; the flush before an unheld move reuses the quit flush's 3000 ms cap. `before-quit` now runs `Promise.allSettled([analytics.shutdown(), cloudBriefsService.flushMoves()])`, and `FINAL_REFUSALS`' comment no longer says `ALREADY_DONE` never changes, with behaviour unchanged. Smoke-tested the shell with stubbed cloud calls (instant Undo sends nothing, flush and a later unheld move send the held one first, a real 5 s hold answers `reasonRequired`, a blank move back is refused). Files: `src/shared/ipcChannels.js`, `src/main/cloud/cloudBriefsService.js`, `src/main/index.js`, `src/main/cloud/cloudDoneService.js`.

_Captured: 2026-11-08 · 4 file change(s)_

---
