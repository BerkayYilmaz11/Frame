# Outcome — Non-Invasive Frame Overlay (.frame-only, zero-touch)

## T01 — Meta path map + frameStore storage seam

Added `FRAME_META_FILES` (the `.frame/`-relative meta path map) and
`LEGACY_ROOT_FILES` to `src/shared/frameConstants.js` — `FRAME_FILES` stays as
an alias while pre-overlay call sites are converted — and built
`src/main/frameStore.js` with a data API (tasks/structure/notes/quickstart/
config/project-AGENTS) plus separately named `…Path(projectPath)` entries for
the file-needing minority; JSON reads pass fsSafe's `{ data, source, error }`
envelope through rather than flattening it, so the recovery signal survives the
seam. Diverged from `plan.md` on one point: `ORCH_META_FILES` was **not**
converted to `.frame/` paths — both consumers (`specManager.js:656`,
`orchestrationManager.js:462`) match a footprint entry's *basename*, which is
already layout-agnostic, and full paths there would have silently stopped every
match; the reason is now a comment on the constant. Files: `frameConstants.js`,
`frameStore.js` (new), `test/frameStore.test.js` (new, 12 cases).

_Captured: 2026-07-29 · 3 file changes_

---

## T02 — Route tasksManager and overviewManager through frameStore

Swapped `tasksManager`'s direct `fsSafe` reads/writes for `frameStore.readTasks`/
`writeTasks` (the recovery envelope arrives from the store, so the corruption
contract is untouched) and made its watcher derive the watch directory from the
store's path entry rather than assuming the project root; `overviewManager`'s
`loadStructure`/`loadTasks`/`loadDecisions` lost their hand-built root paths.
Two touches outside `plan.md`'s Files, both forced by this change rather than
chosen: `specManager.js:1063` kept a private `fs.watch` on the root
`tasks.json` — left alone it would watch a path that no longer exists, so it
now uses `frameStore.tasksPath` — and `test/specTasksSync.test.js` seeded its
fixture at the root. Kept the `tasks-root` activity-watcher label as-is:
renaming it would drag in the `WATCHERS` enum in `activityEvents.js` for a
cosmetic gain. Files: `tasksManager.js`, `overviewManager.js`, `specManager.js`,
`test/tasksManager.test.js` (+2 cases), `test/specTasksSync.test.js`.

Followup: `src/renderer/structureMap.js:276` still reads a root `STRUCTURE.json`
and is in no task's scope — it will show an empty map once T13 moves the
writers.

_Captured: 2026-07-29 · 5 file changes_

---

## T03 — Conditional .git/info/exclude state machine

Built `src/main/gitExclude.js` — exclude file resolved through
`git rev-parse --git-path info/exclude` so linked worktrees and submodules get
their own, then the state machine (no repo → no-op, `.frame/` tracked → remove
our entry, untracked → add it) — and called `ensure()` from both the
project-open IPC and the top of `runProjectInit`, before the first `.frame/`
artifact exists. Diverged from `plan.md` on the signed line: gitignore has no
trailing comments, so the specified `.frame/  # managed by Frame …` would have
been read as a literal pattern that excludes nothing — the signature now sits
on its own comment line above the pattern and the two move together, with the
old single-line form still recognized so an earlier Frame's entry is collapsed
rather than orphaned. Files: `gitExclude.js` (new), `frameProject.js`,
`test/gitExclude.test.js` (new, 12 cases against real temp repos).

_Captured: 2026-07-29 · 3 file changes_

---
