# Outcome — Frame Cloud milestones

## T01 — Read the whole milestone in the core

Extended `normalizeMilestone` in `src/main/cloud/cloudBriefs.js` to keep `goal`, `targetDate`, `targetBranch`, `startedAt`, `closedAt` and `briefs`, and added `buildMilestoneWebUrl` (`{project url}/milestones/{encoded id}`, null for an empty id or under `buildWebUrl`'s guards). Went one step past D18: `targetDate` must be a real calendar day, not only `YYYY-MM-DD`-shaped, so `2026-02-30` reads as null. Rewrote the `listMilestones` test for the full shape and added cases for an older server, bad counts, bad dates and the URL builder in `test/cloudBriefs.test.js`.

_Captured: 2026-11-15 · 2 file change(s)_

---

## T02 — Serve milestones from main

Added `milestones(folderPath)` to `src/main/cloud/cloudBriefsService.js` (one `milestone.list` through `call`, `NOT_CONNECTED` for an unconnected folder) and registered it on the new `IPC.CLOUD_MILESTONES_LIST` in `src/shared/ipcChannels.js`, placed right after `CLOUD_BRIEFS_OPEN_ON_WEB` as planned. `openOnWeb` now opens `buildMilestoneWebUrl` for a `{ milestoneId: string }` target; the service header and the channel comment say so. No test, per D14 (the service is the Electron shell).

_Captured: 2026-11-15 · 2 file change(s)_

---
