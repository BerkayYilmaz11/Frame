# Outcome — Frame Cloud brief manual Done

## T01 — Read the Done fields and add the two moves in cloudBriefs.js

Added `doneAt`, `doneBy`, `doneReason` (string or null) and `readyForDone` (true only when the server sends `true`) to `normalizeBrief`, so the detail carries them through its spread, and replaced brief-done's `doneAt` exclusion test as D15 says. Added `MOVE_REFUSALS`, `moveToDone` and `moveBackToActive`, both of which send `{ id }` plus the trimmed reason only when it is not blank. Added `moveThrough`, shaped like `decideThrough`, which refuses an unknown `to` as `badRequest` and a blank move back as `reasonRequired` before anything is sent. Rewrote the header's write list to say Done is now a person's move. Files: `src/main/cloud/cloudBriefs.js`, `test/cloudBriefs.test.js`.

_Captured: 2026-11-08 · 2 file change(s)_

---
