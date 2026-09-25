# Outcome — Frame Cloud brief start

## T01 — Read started briefs

Added `startedAt`/`recordRef` normalizing, `startBrief`, `START_REFUSALS` (seven codes, including `RECORD_REF_TAKEN`) and `startThrough` (returns `{ ok, detail }`) to `cloudBriefs.js`. Added the `started` history sentence and `startedLine` to `cloudBriefsCopy.js`, both checked against FrameCloud `feat/brief-start` (`data.count`). The Parts tab joins Shaped and Started on one line and shows `recordRef` as muted text on each part row, reusing existing classes, so no CSS changed yet. Files: cloudBriefs.js, cloudBriefsCopy.js, cloudBriefsPanel.js, and both test files.

_Captured: 2026-09-25 · 5 file change(s)_

---

