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

## T04 — Add the move words and rules to cloudBriefsCopy.js

Ported the web's manual-Done copy verbatim from FrameCloud `feat/brief-manual-done` (`lib/brief.ts`, `brief-move.tsx`, and `brief-decisions.tsx` for the Done line): the new Done hint, every move label, dialog and toast string, `missingParts`, `needsReason`, `doneLine`, `moveErrorMessage`, and the `done` / `done-reverted` History sentences, with `isObserved` dropping the actor from an old automatic `done` (not from `part-merged`, per D8). Added the web's `done-reverted` fallback with no reason ("moved this brief back to Active"), which the plan's table leaves out, and made the copy guard an empty target ("not merged." instead of "not merged into ."). `partStatus` takes `done` and then returns `run: null` with every label kept; the old body became the private `partStatusOf`. Files: `src/renderer/cloudBriefsCopy.js`, `test/cloudBriefsCopy.test.js`.

_Captured: 2026-11-08 · 2 file change(s)_

---

## T05 — Show Done facts in the panel

An Active card now shows a "Ready for Done" badge (`.cloud-briefs-ready`, success colours) beside its kind badge when `readyForDone` is true. As an extra guard beyond the plan, the badge is also hidden when the brief's `mergeTracking` is `needs_github`, so the spec's "absent when untracked" holds even if a server sent both. The detail header shows `copy.doneLine(brief)` where a closed brief's `endingLine` sits, and the card still shows no reason (D4). `partFacts` passes `done: brief.status === 'done'` to `partStatus`, so a Done brief's rows keep their words but lose Begin and Run (D7). Files: `src/renderer/cloudBriefsPanel.js`, `src/renderer/styles/components/cloud-briefs.css`.

_Captured: 2026-11-08 · 2 file change(s)_

---

## T06 — Add the move buttons and the reason dialog

`moveButton` puts "Move to Done" on Active started work and "Move back to Active" on Done work, appended after an open brief lane's link on the card and after Go to the lane in the detail (D9). Backlog, proposal and closed briefs get neither. `openMoveDialog({ brief, to })` copies Move to Work's backdrop, Esc and pending handling, and adds a `textarea.cloud-briefs-input` reason (maxlength 10000, the server's limit) that holds confirm until it is not blank, plus the missing parts with `partFacts(...).status.label` for a move to Done. A move to Done with no dialog is sent directly for now through a `moving` set that shows a disabled "Moving to Done…". A landed move reloads the board and any open detail, and a stale refusal (`STALE_MOVE_REASONS`, which includes `reasonRequired` until T07) shows its sentence and reloads, while a failure to reach the cloud leaves the board as it is and is not retried. Files: `src/renderer/cloudBriefsPanel.js`, `src/renderer/styles/components/cloud-briefs.css`.

_Captured: 2026-11-08 · 2 file change(s)_

---
