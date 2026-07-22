## T01 — Flagged-launch tracking on lanes (launchedAutonomous)

Added a module-level `launchedAutonomousLanes` Map to `src/renderer/agentDispatch.js`, set at the CLI start when a dispatch carried launch flags that the CLI kept (guarded on `!flagsDropped`), cleared on `TERMINAL_DESTROYED`, and exposed as `launchedAutonomous` on `getSpecLaneInfo` (gated on a live `agentName` so a dead-but-remembered lane never reports a session that no longer exists). No deviation from plan.md — the plan named the map `launchedAutonomousLanes` and this matches. Files touched: `src/renderer/agentDispatch.js`.

_Captured: 2026-07-22 · 1 file change_

---

## T02 — Expose implementHint on getSpec

Added `implementHint: resolveImplementLaunchHint(projectPath, slug)` to `getSpec`'s return in `src/main/specManager.js`. No deviation — `resolveImplementLaunchHint` already existed (D10 launch-hint work) with exactly the status.implement_mode → config implement.defaultMode → null precedence the task requires, so this only surfaces it on the spec payload for the modal and next-action button. Files touched: `src/main/specManager.js`.

_Captured: 2026-07-22 · 1 file change_

---

## T03 — Unified implement mode + destination modal

Created `src/renderer/implementModeModal.js`, a Promise-based `spec-modal-overlay` with the four mode entries (hinted mode preselected), a destination section shown only when the spec's lane is alive, autonomous "Continue" disabled with a stated reason and forced to a new Frame unless `lane.launchedAutonomous`, and Escape/backdrop/Cancel resolving null. Added the matching mode/destination styles to `src/renderer/styles/components/panels.css`. Deviation from plan: built as a dynamic overlay (agentDispatch's own idiom) rather than the pre-baked-HTML `taskConfirmModal` pattern the plan cited, because the reactive mode↔destination coupling makes dynamic markup the cleaner fit — the plan already allowed reusing the `spec-modal-overlay` idiom. Files touched: `src/renderer/implementModeModal.js`, `src/renderer/styles/components/panels.css`.

_Captured: 2026-07-22 · 2 file changes_

---

## T04 — Route spec.implement through the modal (ordering flip)

Branched `dispatchSpecCommand` in `src/renderer/agentDispatch.js`: `spec.implement` now goes through a new `_dispatchImplement` that opens the modal, records `implement_mode` via `UPDATE_SPEC_STATUS`, then stages (so launch flags derive from the recorded mode), then dispatches to the chosen destination — cancel writes and dispatches nothing. Rewrote the flags-dropped `notify.info` and the prompt note from the old "unavailable → step-by-step" copy to the guided-fallback wording. Non-implement commands keep the stage-first + `_askContinueOrNew` path unchanged. Files touched: `src/renderer/agentDispatch.js`.

_Captured: 2026-07-22 · 1 file change_

---
