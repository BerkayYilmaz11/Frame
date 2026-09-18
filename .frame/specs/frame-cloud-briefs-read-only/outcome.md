## T01 — Add `src/main/cloud/cloudBriefs.js` with `test/cloudBriefs.test.js`

Added the pure read core: `listBriefs` (sends `includeClosed` only when true), `listMilestones`, `getBrief` (`brief.getByNumber` by project slug and number, parts sorted by position), `briefEvents` and `buildBriefWebUrl` (project URL + `/briefs/<n>`, built on `cloudProjects.buildWebUrl`, so its origin and slug guards apply). The normalizers keep only the fields the view draws (no `assigneeId`, `version`, `decidedAt`), fold unknown enum values to safe defaults and drop rows without an id. 16 tests cover input shapes, normalization, the `BRIEF_NOT_FOUND` → `notFound` path and URL guards. Files: `src/main/cloud/cloudBriefs.js`, `test/cloudBriefs.test.js`.

_Captured: 2026-09-18 · 2 file change(s)_

---

## T02 — Export `call` and add `connectedProject(path)` in `cloudProjectsService.js`

Exported the existing `call()` wrapper and added `connectedProject(path)`, which matches the folder against the cached `project.list` via `core.matchFolders` and returns `{id, slug, name}` or null. It reads the service's current `folders` without rescanning, so it answers exactly what the renderer's Connected mark was last pushed, and it returns null whenever the service is signed out. File: `src/main/cloud/cloudProjectsService.js`.

_Captured: 2026-09-18 · 1 file change(s)_

---

## T03 — Add `cloudBriefsService.js`, the three IPC channels and its `setupIPC`

Added `src/main/cloud/cloudBriefsService.js`: `list` runs `listBriefs` and `listMilestones` in parallel, `get` runs `getBrief` then `briefEvents`, and `openOnWeb` opens the project URL, or the brief URL when given a number. All calls go through `cloudProjectsService.call`, and a path that `connectedProject` does not resolve returns `{ok:false, reason:'notConnected'}` before any request. "You" comes from `cloudSession.getPublicState().user.id`, as the plan decided, not `auth.me`. `list`/`get` also return `canOpenWeb` so the panel can hide Open on web when no origin is known, which the plan did not name. Files: `cloudBriefsService.js`, `src/shared/ipcChannels.js`, `src/main/index.js`.

_Captured: 2026-09-18 · 3 file change(s)_

---

## T04 — Port the web's brief helpers into `cloudBriefsCopy.js`

Ported `groupByColumn`, the column copy from `brief-board.tsx`, `KIND_COPY`, `priorityLabel`, `endingFact`, `actorLabel`, `formatDate` and `eventSentence` from FrameCloud `lib/brief.ts` into pure CommonJS, and added `reasonMessage` for the panel's read failures. Beyond the port, the file adds `statusLabel` and `endingLine` for the detail header and cards, drops the write copy (Transform label, mutation error sentences, search params), and gives an unknown event or status a safe fallback where the web's TS relies on exhaustive types. 13 tests in `test/cloudBriefsCopy.test.js` cover grouping order, ending precedence, every event branch and You vs A workspace member.

_Captured: 2026-09-18 · 2 file change(s)_

---
