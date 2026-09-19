# Outcome — Frame Cloud briefs, create

## T01 — Create in the pure core

Added `LIMITS`, `buildCreateInput`, `normalizeLinks`, `createBrief`, `addAttachment` and `createWithLinks` to `src/main/cloud/cloudBriefs.js`, and rewrote its header to "reads, and creates". `buildCreateInput` drops priority from a proposal, fills `medium` for Work when priority is absent, and refuses an unknown one. `createWithLinks` treats a created brief with no id or number as a failure (`other`). Covered in `test/cloudBriefs.test.js` (14 tests).

_Captured: 2026-09-19 · 2 file change(s)_

---

