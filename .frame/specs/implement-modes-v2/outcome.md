## T01 — Flagged-launch tracking on lanes (launchedAutonomous)

Added a module-level `launchedAutonomousLanes` Map to `src/renderer/agentDispatch.js`, set at the CLI start when a dispatch carried launch flags that the CLI kept (guarded on `!flagsDropped`), cleared on `TERMINAL_DESTROYED`, and exposed as `launchedAutonomous` on `getSpecLaneInfo` (gated on a live `agentName` so a dead-but-remembered lane never reports a session that no longer exists). No deviation from plan.md — the plan named the map `launchedAutonomousLanes` and this matches. Files touched: `src/renderer/agentDispatch.js`.

_Captured: 2026-07-22 · 1 file change_

---

## T02 — Expose implementHint on getSpec

Added `implementHint: resolveImplementLaunchHint(projectPath, slug)` to `getSpec`'s return in `src/main/specManager.js`. No deviation — `resolveImplementLaunchHint` already existed (D10 launch-hint work) with exactly the status.implement_mode → config implement.defaultMode → null precedence the task requires, so this only surfaces it on the spec payload for the modal and next-action button. Files touched: `src/main/specManager.js`.

_Captured: 2026-07-22 · 1 file change_

---
