## T01 — Flagged-launch tracking on lanes (launchedAutonomous)

Added a module-level `launchedAutonomousLanes` Map to `src/renderer/agentDispatch.js`, set at the CLI start when a dispatch carried launch flags that the CLI kept (guarded on `!flagsDropped`), cleared on `TERMINAL_DESTROYED`, and exposed as `launchedAutonomous` on `getSpecLaneInfo` (gated on a live `agentName` so a dead-but-remembered lane never reports a session that no longer exists). No deviation from plan.md — the plan named the map `launchedAutonomousLanes` and this matches. Files touched: `src/renderer/agentDispatch.js`.

_Captured: 2026-07-22 · 1 file change_

---
