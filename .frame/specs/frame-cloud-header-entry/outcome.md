## T01 — The entry rule: cloudEntry.entryFor and its strings

Added `entryCall`, `entryEarly` and `entryJoined` to `cloudEarlyAccess.COPY` and wrote the pure `src/renderer/cloudEntry.js` (`entryFor`) with `test/cloudEntry.test.js` (12 tests). Diverged from plan.md: `cloudRoles.workspaceName` is not exported and `cloudRoles.js` is outside the footprint, so the name comes from `cloudNoWorkspace.workspaceRow(workspace).value`; the tooltip reuses the existing `COPY.join` and `COPY.joinedTitle`. `npm test` is deferred to the end of the run at the user's instruction.
Followup: `test/serverConnection.test.js` and `test/specManagerServer.test.js` pass every subtest but never exit, so `npm test` hangs on this machine.

_Captured: 2026-11-16 · 3 file change(s)_

---
