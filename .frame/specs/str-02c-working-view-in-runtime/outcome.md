# Outcome — STR-02c — Working-Tree Map in Runtime

## T01 — Point the write target and the read contract at the working view

`runAttempt`/`snapshot` accept `mapPath` (default: the owned tracked map), so any writer can publish another artifact with the same lock, recovery and atomic rules. `structure-read` gained `workingViewPath` (`.frame/runtime/structure/working.json`) and `resolveReadPath` (working view first, tracked map otherwise); without a working view freshness is `unknown` with reason `no-working-view`. Deviation: a receipt written before STR-02c that still matches the tracked file byte for byte is honored, so projects mid-upgrade (and every commit until T02 moves the writers) keep their freshness instead of all turning `unknown`. A hand edit of the tracked map is no longer reported as `artifact-changed` — the tracked file is where prose is edited now (D2); that STR-02 reader test was updated. Files touched: `scripts/structure-state.js`, `scripts/structure-read.js`, `test/structureState.test.js`, `test/structureRead.test.js`, `test/scriptsProjectRoot.test.js`.

_Captured: 2026-10-01 · 5 file change(s)_

---
