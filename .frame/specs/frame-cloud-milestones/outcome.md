# Outcome — Frame Cloud milestones

## T01 — Read the whole milestone in the core

Extended `normalizeMilestone` in `src/main/cloud/cloudBriefs.js` to keep `goal`, `targetDate`, `targetBranch`, `startedAt`, `closedAt` and `briefs`, and added `buildMilestoneWebUrl` (`{project url}/milestones/{encoded id}`, null for an empty id or under `buildWebUrl`'s guards). Went one step past D18: `targetDate` must be a real calendar day, not only `YYYY-MM-DD`-shaped, so `2026-02-30` reads as null. Rewrote the `listMilestones` test for the full shape and added cases for an older server, bad counts, bad dates and the URL builder in `test/cloudBriefs.test.js`.

_Captured: 2026-11-15 · 2 file change(s)_

---
