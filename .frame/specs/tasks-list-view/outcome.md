# Outcome — Tasks List View

## T01 — Add the pure list model

Added `src/renderer/tasks/listModel.js` (`buildListModel`, plus `isSpecTask` and `specSlugOf` for later tasks) and `test/tasksListModel.test.js` (23 tests, including a sweep that checks every scope's count equals what it lists, with and without the reveal and the window). Beyond plan.md's shape: the window also applies to revealed spec tasks, their older ones count toward `olderCount` only while revealed, and spec groups keep file order even under a sort. Not wired yet, as the plan sequenced.

_Captured: 2026-10-15 · 2 file change(s)_

---
