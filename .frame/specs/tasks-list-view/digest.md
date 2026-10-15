---
keywords: tasks board, kanban, task list, spec tasks, play button, in progress, new task form, acceptance criteria
related: tasks-detail-on-demand, boards-done-window, agent-dispatch, home-widget-board, compact-center-vs-code-density, new-spec-agent-handoff
---
Replaced the Tasks Kanban with the Specs screen's shell: scope segments with counts (All / Active / Done,
opens on Active), In progress above Pending, Completed under the done window behind the "Show" ghost tile,
tiles in the Specs grid, no drag anywhere. The reason was spec safety: a drag rewrote a spec task's status
and so the spec's phase. Spec tasks are now hidden by default; a "Spec tasks n" chip reveals them grouped
per spec, read-only (no Play, no status action, no Delete), with "Open spec" links. What the screen lists
comes from the pure `src/renderer/tasks/listModel.js`; the run prompt lives in the pure
`src/renderer/tasks/runPrompt.js`, which every Play surface shares through `tasksPanel.openRunFlow`.
A task missing `description` or `acceptanceCriteria` gets a format step at Play: the agent writes the fields,
shows the criteria and waits. New Task saves only `userRequest` verbatim; no agent runs at creation (rejected:
the new-spec-style handoff at creation, which writes criteria before the code is in view).
Rules: never send a status from an order write. Permanent Save sends `{ id }` only and keeps spec tasks in their
file slots. A screen action must never change a `spec:` task's status. Spec groups stay in file (T) order.
Counts must equal what each scope lists with the reveal in its current state.

Chain: spec.md → plan.md → tasks.md → outcome.md
