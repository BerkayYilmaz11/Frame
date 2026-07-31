# Outcome — Embedded-Layout Migration

## T01 — Register the migration event family and the failure-only telemetry event

Added eight `migration.*` events to `src/shared/activityEvents.js` — detected,
deferred, skipped, artifact, restored, posture, completed, failed — exporting
`MIGRATION_DISPOSITIONS`/`MIGRATION_STEPS`/the two reason lists so the engine
labels artifacts with the same strings the log records rather than mapping
between two vocabularies. Registered `migration_failed` in
`src/main/telemetryEvents.js` with its `PRIVACY.md` row in the same change, per
the rule `project-settings` T04 set. Deviation from plan.md: D12 asks the
telemetry event to carry "artifact counts", but that registry is enum-only by
construction, so counts ship as buckets (`0`/`1-3`/`4-6`/`7+`) through a new
pure `bucketCount()` and the exact figures stay local. Tests added to
`test/activityEvents.test.js` and `test/telemetry.test.js`.

_Captured: 2026-07-31 · 5 file changes_

---

## T02 — Add `migration-backup/` to the managed `.frame/.gitignore` block

Added `migration-backup/` to `MACHINE_LOCAL_PATHS` in `src/main/gitSharing.js`,
which is the only definition the block writer reads. Extended the
block-content case in `test/gitSharing.test.js` and added one that seeds a
backup file inside a repo-mode project and asserts `git status` never sees it.
Followed plan.md exactly; sequenced second so no project can write a backup
before the ignore rule exists.

_Captured: 2026-07-31 · 2 file changes_

---
