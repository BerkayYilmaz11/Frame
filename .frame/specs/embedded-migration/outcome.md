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

## T03 — `embeddedMigration.plan()` and the backup writer

Added `src/main/embeddedMigration.js`: `plan()` reads the legacy
`config.json.files` manifest (falling back to `LEGACY_ROOT_FILES`), gives each
artifact a disposition against its `.frame/` counterpart, and reports
Frame-planted symlinks, restorable instruction blocks, unrecognized root files
and the git dirty/tracked verdicts — all without writing; `writeBackup()`
byte-copies into `.frame/migration-backup/` and skips paths already there.
Detection reuses `instructionDiscovery.scan().legacyLayout` rather than
exporting the unexported `detectLegacyLayout`, which would have widened the
footprint for nothing. The activity and telemetry sinks are injected through
`init()` (the `globalLayer` convention) so the engine and its 22-case suite
never load Electron.

_Captured: 2026-07-31 · 2 file changes_

---

## T04 — Execute a plan: move, resolve conflicts, rewrite the config

Added `applyArtifact()`, `rewriteConfig()` and `migrateProject()` to
`src/main/embeddedMigration.js` — backup first, then each artifact's
disposition, then the `files` block dropped from `.frame/config.json`.
Implemented `move` as copy-verify-then-delete rather than `rename` so an
interruption leaves a duplicate the next run reconciles as `delete-identical`,
which is what D2's "never a hole" requires. The failure path returns
`{ status, step, error }` instead of throwing, because T06's sweep must isolate
one project's failure and T08's modal must show the real message; it also
sends the `migration_failed` telemetry event through `bucketCount`. Twelve
cases added, including dual layout, an interrupted run, and a failing run whose
backup survives.

_Captured: 2026-07-31 · 2 file changes_

---

## T05 — Restore the consumed instruction files, remove the planted symlinks

Added `removeSymlinks()` and `restoreInstructions()` and wired them into
`migrateProject()` between the move and the config rewrite. Deviation from the
spec's step order: symlinks are removed **before** restoration, not after —
writing `CLAUDE.md` while the dangling link is still there follows it and
recreates the root `AGENTS.md` the migration exists to remove, which the
`restore-order` test now pins. An occupied target is never overwritten; the
extracted content goes to `migration-backup/restored/<rel>` instead.
`.claude/CLAUDE.md` stays out of `RESTORE_TARGETS` because old init read it
without unlinking it. Eight cases added, including "a migrated project is no
longer a legacy project".

_Captured: 2026-07-31 · 2 file changes_

---
