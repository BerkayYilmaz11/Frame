# Outcome — Frame Cloud brief done

## T01 — Read the Done fields in cloudBriefs.js

Added the six Done fields to `normalizePart` (`branch`, `completionSha`, `mergedAt`, `mergedBase`, `droppedAt`, `dropReason`, each string or null) and carried them through `partRow`; `normalizeBrief` reads `mergeTracking` (`ready` unless the server says `needs_github`), so the detail has it too. Added `recordBranch` and `recordCompletion`, each a POST that returns the normalized detail and lets the server's refusals (`PART_DROPPED`, `PART_MERGED`, …) surface as CloudErrors for the caller to read. `mergeSha`, `mergeEvidence` and `doneAt` stay unread (D17), and the module header and `addPartCounts`' comment now say so. Files: `src/main/cloud/cloudBriefs.js`, `test/cloudBriefs.test.js`.

_Captured: 2026-11-04 · 2 file change(s)_

---

## T02 — Make part rows read the cloud in cloudBriefsCopy.js

Added `countsAsMerged(part, target)` and gave `partStatus` a `target` and Flow 3's order: dropped ("Dropped · <reason>", or "Dropped" with no reason) → merged ("Merged into <target>", tone `done`, no Run) → the local record, where a live lane still wins and a finished spec or task now reads "Implemented" (tone `implemented`) → the cloud `branch` unless `branchGone` → `begunBranch` → Not started with Begin. `partsSummary` now reads "<merged> of <live> merged", keeps the in-progress and elsewhere pieces, and ends with "· N dropped". `countsAsMerged` also refuses an empty target, so a brief without one never shows a merge; the panel passes no `target` until T04, so merged rows appear only from then. Files: `src/renderer/cloudBriefsCopy.js`, `test/cloudBriefsCopy.test.js`.

_Captured: 2026-11-04 · 2 file change(s)_

---

## T03 — Add branchGone to withBegunBranches

`withBegunBranches` now sets `branchGone` on each part: true only when this machine's begun entry is dropped for a missing local branch and that branch is also the part's cloud `branch`. A cloud branch with no entry here (another machine's), or one that differs from this machine's older entry (another machine's re-Begin), is never gone, and without a local branch list nothing is. Files: `src/main/cloud/cloudStart.js`, `test/cloudStart.test.js`.

_Captured: 2026-11-04 · 2 file change(s)_

---
