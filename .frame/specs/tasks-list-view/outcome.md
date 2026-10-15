# Outcome — Tasks List View

## T01 — Add the pure list model

Added `src/renderer/tasks/listModel.js` (`buildListModel`, plus `isSpecTask` and `specSlugOf` for later tasks) and `test/tasksListModel.test.js` (23 tests, including a sweep that checks every scope's count equals what it lists, with and without the reveal and the window). Beyond plan.md's shape: the window also applies to revealed spec tasks, their older ones count toward `olderCount` only while revealed, and spec groups keep file order even under a sort. Not wired yet, as the plan sequenced.

_Captured: 2026-10-15 · 2 file change(s)_

---
## T02 — Move the run prompt into the pure runPrompt.js

Added `src/renderer/tasks/runPrompt.js` (`missingFields`, `buildTaskPrompt`, `isSpecTask` re-exported from `listModel.js`) and made `tasksPanel.buildTaskPrompt` a one-line delegate; fixed its stale "Kanban" comment. The "Before starting" steps are now built from a list numbered First/Then, so a ready task's prompt is byte-identical to the old builder plus the criteria line (pinned in `test/taskRunPrompt.test.js` against a verbatim copy of the old function). Beyond the plan's wording, the format step tells the agent to read the task's `tasks.json` entry, because that is where a form-created task's `userRequest` is: the prompt itself still carries no request text.

_Captured: 2026-10-15 · 3 file change(s)_

---
## T03 — Make addTask keep the request

`tasksManager.addTask` now copies a non-blank string `userRequest` verbatim, whitespace included. A blank or non-string request records no field. Extended `test/tasksManager.test.js` with the verbatim, blank/absent/wrong-type, and id-only `reorderTasks` cases; the last checks that status, `updatedAt` and `completedAt` all survive. Also rewrote `reorderTasks`' doc comment, which described Kanban drag-and-drop, to say what an entry without a status does. No code change there.

_Captured: 2026-10-15 · 2 file change(s)_

---
## T04 — Replace the Kanban with the Specs-style grid

Rebuilt the Tasks markup in `index.html`: a toolbar with the scope segments, Filter and Sort moved to its right, and a list container in place of the three columns. `tasksDashboard.js` now renders sections of `.specs-card` tiles and the `.specs-card-older` ghost tile from `buildListModel`; all drag code, `commitOrder` and the column lookups are deleted, and the export surface is unchanged. Permanent Save sends ids only. Beyond the plan, it keeps spec tasks in their file slots and fills the remaining slots with the sorted non-spec tasks, so a sort never reorders a spec's T01…Tn. Section tracks are a task-only `.tasks-dashboard-grid` with the Specs template, because `.specs-dashboard-grid` is itself a full-height scroll container and cannot repeat per section.

_Captured: 2026-10-15 · 3 file change(s)_

---
## T05 — Play and drawer status actions

Added the Play button to pending non-spec tiles; it calls `tasksPanel.openRunFlow` without selecting the tile. Added a drawer action slot (`index.html`) left of Delete, filled per status as D9 lists: Play → `openRunFlow`, and Mark complete, Back to pending and Reopen → `UPDATE_TASK { status }`. The action handler re-reads the task and refuses spec tasks, so a spec task opened from the top-bar chip already shows no actions before T06 adds its read-only drawer. A task with an unknown status gets the pending set, matching the section it is listed in.

_Captured: 2026-10-15 · 3 file change(s)_

---
