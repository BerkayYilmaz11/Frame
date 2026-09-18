## T01 — Add `src/main/cloud/cloudBriefs.js` with `test/cloudBriefs.test.js`

Added the pure read core: `listBriefs` (sends `includeClosed` only when true), `listMilestones`, `getBrief` (`brief.getByNumber` by project slug and number, parts sorted by position), `briefEvents` and `buildBriefWebUrl` (project URL + `/briefs/<n>`, built on `cloudProjects.buildWebUrl`, so its origin and slug guards apply). The normalizers keep only the fields the view draws (no `assigneeId`, `version`, `decidedAt`), fold unknown enum values to safe defaults and drop rows without an id. 16 tests cover input shapes, normalization, the `BRIEF_NOT_FOUND` → `notFound` path and URL guards. Files: `src/main/cloud/cloudBriefs.js`, `test/cloudBriefs.test.js`.

_Captured: 2026-09-18 · 2 file change(s)_

---
