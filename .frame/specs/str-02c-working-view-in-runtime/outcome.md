# Outcome — STR-02c — Working-Tree Map in Runtime

## T01 — Point the write target and the read contract at the working view

`runAttempt`/`snapshot` accept `mapPath` (default: the owned tracked map), so any writer can publish another artifact with the same lock, recovery and atomic rules. `structure-read` gained `workingViewPath` (`.frame/runtime/structure/working.json`) and `resolveReadPath` (working view first, tracked map otherwise); without a working view freshness is `unknown` with reason `no-working-view`. Deviation: a receipt written before STR-02c that still matches the tracked file byte for byte is honored, so projects mid-upgrade (and every commit until T02 moves the writers) keep their freshness instead of all turning `unknown`. A hand edit of the tracked map is no longer reported as `artifact-changed` — the tracked file is where prose is edited now (D2); that STR-02 reader test was updated. Files touched: `scripts/structure-state.js`, `scripts/structure-read.js`, `test/structureState.test.js`, `test/structureRead.test.js`, `test/scriptsProjectRoot.test.js`.

_Captured: 2026-10-01 · 5 file change(s)_

---

## T02 — Build the working view in runtime; mirror only when the map is untracked

The lifecycle worker and `update-structure.js` (`--full`, explicit files, `--check`) now build into `.frame/runtime/structure/working.json`. The tracked map is the generation prior (D2), so prose, unknown fields and architecture notes written there reach the working view; the existing working view is only the byte/`lastUpdated` reference. `structure-state` gained `workingViewPath`, `mapTrackedByGit` (`git ls-files --error-unmatch`) and `mirrorToUntrackedMap`: when the map path is not in the index (no Git, before the first commit, local sharing) the working view's bytes are copied to it (D5), archiving the current file to recovery first when it is invalid. Deviation: a corrupt tracked map is refused as a delta baseline (kind `corrupt`) rather than silently replaced; a fresh project with no working view seeds its delta from the tracked map. The STR-02 reader test was updated — a tracked-map hand edit no longer changes freshness; removing the working view makes it `unknown`. Files touched: `scripts/structure-state.js`, `scripts/update-structure.js`, `scripts/structure-lifecycle.js`, `test/structureLifecycle.test.js`, `test/projectAgnostic.test.js`, `test/frameProjectInit.test.js`, `test/scriptsProjectRoot.test.js`.

_Captured: 2026-10-01 · 7 file change(s)_

---
