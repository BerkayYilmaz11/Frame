## T01 — Read `off` and the PR facts in the core

Added `off` to `MERGE_TRACKING`, read the five PR fields in `normalizePart` with D10's guards (`prUrl` through `isHttpUrl`, non-string folded first) and carried them in `partRow`. Added `mergeTrackingOf` (needs_github → off → ready, tolerant of a non-array) and `buildSettingsWebUrl` to `src/main/cloud/cloudBriefs.js` and exported both; the service's local `mergeTrackingOf` stays until T02. `test/cloudBriefs.test.js` gains the PR-field, `mergeTrackingOf` and Settings-URL cases, and the `addPartCounts` row assertion now includes the five fields.

_Captured: 2026-11-15 · 2 file change(s)_

---
## T02 — Use them in main

Swapped `list` to `core.mergeTrackingOf` and deleted the service's own copy. Split the auth lookup into `webInputs` so `webUrl` and the new `settingsWebUrl` share it, and made `openOnWeb(folderPath, target)` open Settings for `'settings'`, the brief for a number, the project for `undefined`/`null`, and nothing otherwise; the handler, the header and the `CLOUD_BRIEFS_OPEN_ON_WEB` comment follow. Files: `src/main/cloud/cloudBriefsService.js`, `src/shared/ipcChannels.js`; no service tests exist, as before.

_Captured: 2026-11-15 · 2 file change(s)_

---
## T03 — The row order in the copy

Gave `partStatus`/`partStatusOf` a `tracking` (default `'ready'`) and Flow 1's order in `src/renderer/cloudBriefsCopy.js`: the lane check now runs before the PR rows (new `prStatus`, `REVIEW_LABELS`, `prLabel`), the record's own state after them, then a new `completionSha` → "Implemented" row; PR rows carry `pr: { number, url, kind, base }` (url and base null when absent) and the record's Run. Ported the labels from FrameCloud's `partRow` source, and exported `prLabel`/`REVIEW_LABELS` (not named in the plan) so the panel can split "PR #N" from "· state" in T04. Twelve new cases in `test/cloudBriefsCopy.test.js`; every existing row assertion is unchanged.

_Captured: 2026-11-15 · 2 file change(s)_

---
