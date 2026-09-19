# Outcome — Frame Cloud briefs, create

## T01 — Create in the pure core

Added `LIMITS`, `buildCreateInput`, `normalizeLinks`, `createBrief`, `addAttachment` and `createWithLinks` to `src/main/cloud/cloudBriefs.js`, and rewrote its header to "reads, and creates". `buildCreateInput` drops priority from a proposal, fills `medium` for Work when priority is absent, and refuses an unknown one. `createWithLinks` treats a created brief with no id or number as a failure (`other`). Covered in `test/cloudBriefs.test.js` (14 tests).

_Captured: 2026-09-19 · 2 file change(s)_

---

## T02 — Service and channel

Added `CLOUD_BRIEF_CREATE` to `src/shared/ipcChannels.js`, and `create(folderPath, request)` with its handler to `src/main/cloud/cloudBriefsService.js`. An unconnected path returns `notConnected`, and a bad field or link returns `badRequest` with `field`, both before any request. Otherwise the service runs `createWithLinks` through `cloudProjectsService.call` and rebuilds the result without the brief id. The plan lists no service test; this was checked once with stubbed modules, not committed.

_Captured: 2026-09-19 · 2 file change(s)_

---

## T03 — Pure draft module

Added `src/renderer/cloudBriefsDraft.js`: a rule-for-rule port of the web's `linkService`, plus `emptyDraft`, `addLink` (returns null on a non-`http(s)` text), `validateDraft` (`{ ok, titleError, untitledKeys }`) and `toRequest`. The draft also holds `nextKey` for row keys, which the plan's shape did not list. Tests are in `test/cloudBriefsDraft.test.js`.

_Captured: 2026-09-19 · 2 file change(s)_

---

## T04 — Copy

Added the New brief copy to `src/renderer/cloudBriefsCopy.js`: the form's title and description, the links title, hint and invalid-link sentences, the two validation sentences, `submitLabel`, `createErrorMessage` and `attachmentNotice`. The header now says creating is the one write. `attachmentNotice` reads `notFound` as "This brief does not exist." rather than the project sentence, because an attachment is refused on the brief. The empty-state copy stays in the panel, for T06. Tests are in `test/cloudBriefsCopy.test.js`.

_Captured: 2026-09-19 · 2 file change(s)_

---

