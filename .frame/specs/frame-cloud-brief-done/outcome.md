# Outcome — Frame Cloud brief done

## T01 — Read the Done fields in cloudBriefs.js

Added the six Done fields to `normalizePart` (`branch`, `completionSha`, `mergedAt`, `mergedBase`, `droppedAt`, `dropReason`, each string or null) and carried them through `partRow`; `normalizeBrief` reads `mergeTracking` (`ready` unless the server says `needs_github`), so the detail has it too. Added `recordBranch` and `recordCompletion`, each a POST that returns the normalized detail and lets the server's refusals (`PART_DROPPED`, `PART_MERGED`, …) surface as CloudErrors for the caller to read. `mergeSha`, `mergeEvidence` and `doneAt` stay unread (D17), and the module header and `addPartCounts`' comment now say so. Files: `src/main/cloud/cloudBriefs.js`, `test/cloudBriefs.test.js`.

_Captured: 2026-11-04 · 2 file change(s)_

---
