# Outcome — Frame Cloud brief start

## T01 — Read started briefs

Added `startedAt`/`recordRef` normalizing, `startBrief`, `START_REFUSALS` (seven codes, including `RECORD_REF_TAKEN`) and `startThrough` (returns `{ ok, detail }`) to `cloudBriefs.js`. Added the `started` history sentence and `startedLine` to `cloudBriefsCopy.js`, both checked against FrameCloud `feat/brief-start` (`data.count`). The Parts tab joins Shaped and Started on one line and shows `recordRef` as muted text on each part row, reusing existing classes, so no CSS changed yet. Files: cloudBriefs.js, cloudBriefsCopy.js, cloudBriefsPanel.js, and both test files.

_Captured: 2026-09-25 · 5 file change(s)_

---

## T02 — The pure builders

Wrote `cloudStart.js` with the pure builders and exported `TRANSLITERATE` from `cloudProjects.js`, tested in the new `test/cloudStart.test.js`. Deviations from plan.md: `specFiles` takes `slug`, which the required status.json needs; `-2`/`-3` spec slugs are shortened to stay within 48 characters; the definition splitter skips `## ` lines inside code fences; the fallback part number counts from 1. Also exported `taskTitle` (the 60-character cut) so it is tested on its own.

_Captured: 2026-09-25 · 3 file change(s)_

---

## T03 — The prepare view and the request handler

Added `pickBase`, `prepareView` and `handleStartRequest` to `cloudStart.js`, tested with fakes, including that the refs sent equal the refs written. Deviations: `prepareView` takes no `specSlugs`/`taskIds` (the dialog shows no refs); the handler reads the brief itself through `call`, and an unknown `beginPartId` is a `badRequest` refusal. `stash: true` on a clean folder stashes nothing, and `stashMessage` is then null. Refusals carry `detail` (the branch name, the target branch, or the parse reason) for the copy to name.

_Captured: 2026-09-25 · 2 file change(s)_

---

