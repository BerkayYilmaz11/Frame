---
keywords: tasks board, specs dashboard, done window, completed column, phase filter, segmented control, project settings, recency
related: tasks-detail-on-demand, settings-by-scope, home-widget-board, compact-center-vs-code-density
---
Both boards were a thin layer of live work on a pile of done items (510/570
tasks, 41/46 specs). Added a **done window**: Completed tasks and done specs
inside the project's window show, the rest sit behind "Show N older" (tasks
column foot) or a ghost tile "N older done specs · Show" (spec grid). Live
items are never windowed; a spec search bypasses it. Rejected: today / this
week / date-range filters (they hide an old pending task, the card the board
exists to show) and a toolbar period selector (one more control on a crowded
row). The window is a Project Setting, `settings.doneWindow { tasks: 7,
specs: 30 }` in `.frame/config.json` (options 7/30/90/0), owned in the
renderer by `src/renderer/doneWindow.js`; logic is pure in
`src/shared/doneWindow.js` and `src/renderer/specs/filterModel.js` (28
tests). Specs board state became `scope` + `phase`; phase chips render only
under Active. Rules: a done item with no usable date counts as recent; hidden
Completed cards stay in the DOM so reorder keeps file order; the reveal is
per-project session state, never persisted.

Chain: spec.md → plan.md → tasks.md → outcome.md
