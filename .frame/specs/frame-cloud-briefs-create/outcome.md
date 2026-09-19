# Outcome — Frame Cloud briefs, create

## T01 — Create in the pure core

Added `LIMITS`, `buildCreateInput`, `normalizeLinks`, `createBrief`, `addAttachment` and `createWithLinks` to `src/main/cloud/cloudBriefs.js`, and rewrote its header to "reads, and creates". `buildCreateInput` drops priority from a proposal, fills `medium` for Work when priority is absent, and refuses an unknown one. `createWithLinks` treats a created brief with no id or number as a failure (`other`). Covered in `test/cloudBriefs.test.js` (14 tests).

_Captured: 2026-09-19 · 2 file change(s)_

---

## T02 — Service and channel

Added `CLOUD_BRIEF_CREATE` to `src/shared/ipcChannels.js`, and `create(folderPath, request)` with its handler to `src/main/cloud/cloudBriefsService.js`. An unconnected path returns `notConnected`, and a bad field or link returns `badRequest` with `field`, both before any request. Otherwise the service runs `createWithLinks` through `cloudProjectsService.call` and rebuilds the result without the brief id. The plan lists no service test; this was checked once with stubbed modules, not committed.

_Captured: 2026-09-19 · 2 file change(s)_

---

