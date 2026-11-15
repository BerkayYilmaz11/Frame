## T01 — Read `off` and the PR facts in the core

Added `off` to `MERGE_TRACKING`, read the five PR fields in `normalizePart` with D10's guards (`prUrl` through `isHttpUrl`, non-string folded first) and carried them in `partRow`. Added `mergeTrackingOf` (needs_github → off → ready, tolerant of a non-array) and `buildSettingsWebUrl` to `src/main/cloud/cloudBriefs.js` and exported both; the service's local `mergeTrackingOf` stays until T02. `test/cloudBriefs.test.js` gains the PR-field, `mergeTrackingOf` and Settings-URL cases, and the `addPartCounts` row assertion now includes the five fields.

_Captured: 2026-11-15 · 2 file change(s)_

---
