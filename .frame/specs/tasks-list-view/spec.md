---
keywords: tasks board, kanban, task list, spec tasks, play button, in progress, new task form, acceptance criteria
related: tasks-detail-on-demand, boards-done-window, agent-dispatch, home-widget-board, compact-center-vs-code-density, new-spec-agent-handoff
---

# Tasks List View

## Problem

The Tasks screen is a three-column Kanban (Pending / In Progress / Completed),
and dragging a card is the only way it changes status. That is wrong for Frame
in three ways:

- **It breaks specs.** Spec tasks (`source: spec:<slug>:T##`) sit on the same
  board with no visual difference. A spec's phase is derived from its tasks
  (`specManager.derivePhase`), so a drag rewrites the spec's `status.json` on
  the next `listSpecs`: dropping the last open task in Completed marks the spec
  `done` with no implement run, and dragging one out of a done spec walks it
  back to `implementing`. In this repo 530 of 639 tasks are spec tasks.
- **Two screens, two models.** Specs is a scoped grid with one primary action
  per item; Tasks is a drag board with no action at all. Starting a task is
  only possible from Home or a task tab, although the tour promises "the play
  button on a task".
- **Two task formats.** Agent-written tasks follow the `tasks.json` schema
  (description, original request, acceptance criteria, context); the New Task
  form writes only title, description, priority and category. 13 of this
  repo's 55 open non-spec tasks have no acceptance criteria. Play does not
  help: its prompt carries only the title and description, so the agent never
  learns what "done" means even for a complete task.

A drop also sends `REORDER_TASKS` with the status of every card in every
column, hidden ones included, so one drag rewrites the whole file's order.

## Goal

The Tasks screen follows the Specs screen's structure instead of a Kanban:

- **Same shell as Specs:** view header (title, New Task, close), a toolbar
  with a segmented scope control with counts (All / Active / Done), and the
  existing detail drawer on click.
- **Tasks are tiles in the Specs grid** (`repeat(auto-fill, minmax(280px, 1fr))`).
- **Active shows two sections:** *In progress* first, then *Pending*. Done
  shows completed tasks under the project's done window. While Active is
  picked, an *In progress* and a *Pending* chip with counts narrow it to one
  of the two, as the Specs screen's phase chips narrow its Active.
- **A Play button on every pending task** starts it through the existing run
  flow. In-progress tasks show their lane activity dot instead.
- **Status buttons in the drawer of a non-spec task,** the same set as the
  Specs screen's task rows: pending → Play and Mark complete; in progress →
  Mark complete and Back to pending; completed → Reopen. The agent still
  closes the task itself at the end of a run, as the run prompt asks today.
- **Spec tasks are hidden by default.** An "Include spec tasks" checkbox in
  the toolbar shows their count and includes them on demand. Included spec
  tasks are listed in the status sections with the other tasks, each tile
  labelled with its spec and number, and carry no Play or status control.
- **No drag and drop** anywhere on the screen.
- **New Task stays a quick form, mapped to the schema:** a title, the request
  text (saved verbatim as `userRequest`), priority and category. No agent runs
  at creation; the form does not write `description` or `acceptanceCriteria`.
- **Play completes the format first.** A task is ready to start when
  `description` and `acceptanceCriteria` are both non-empty. When one is
  missing, the run prompt opens with a step: write the missing fields into
  `tasks.json`, show the acceptance criteria to the user, start after they
  confirm. A ready task starts directly. Either way, the prompt carries the
  task's acceptance criteria.

## Constraints

- Spec tasks are identified by `source` starting with `spec:`, the rule Home's
  `activeTasks` and `specNextAction` already use.
- No new task status and no new field: `pending | in_progress | completed`
  and the existing `tasks.json` schema stay as they are. `specManager`
  (`derivePhase`, `reconcilePhase`, `syncTasksFromMarkdown`) and IPC channel
  names do not change.
- New Task is not handed to an agent, unlike `new-spec-agent-handoff`: the
  format is completed at Play, when the code context is current and the user
  confirms the acceptance criteria.
- An agent never invents `userRequest`: a task that has none keeps none.
- Play reuses `tasksPanel.openRunFlow` → `taskRunModal` →
  `agentDispatch.dispatch`. Per `agent-dispatch`, all prompt delivery goes
  through dispatch and a task run opens a new Frame; the task turns
  `in_progress` only after dispatch succeeds.
- Done window (`boards-done-window`): completed tasks honor
  `settings.doneWindow.tasks` with "Show N older". Reveal state, including the
  spec-tasks reveal, is per-project session state, never persisted.
- `tasks-detail-on-demand`: the right aside stays out of layout unless the
  New Task form is open. This spec reverses only its Kanban columns.
- `compact-center-vs-code-density`: one flat surface; content starts at x=12
  via `.view-header`; no cards inside cards.
- Entry points and APIs keep working: sidebar Tasks row and count, Home's
  Tasks header and play, palette "Go to Tasks", `panel.toggleTasksDashboard`
  (Cmd+Shift+D), the inline host API (`mountInline`, `notifyDetached`,
  `openTask`, `getSelectedTaskId`, `closeDrawer`), lane activity dots, the
  Project Settings done-window select.
- Existing tokens and components only; no new dependency.

## Success Criteria

- When Tasks opens, then no status columns render and no item is draggable.
- When the project has spec tasks, then none is listed by default and the
  toolbar shows a control with their count.
- When the user includes spec tasks, then they appear in the status section
  of their status, labelled with their spec, with no Play or status control;
  when they clear the checkbox, or reopen the project, they are hidden again.
- When Active is picked and the user picks its *In progress* or *Pending*
  chip, then only that section is listed; picking the chip again, or another
  scope, lists both again.
- When the user presses Play on a pending task and the dispatch succeeds, then
  the task moves to *In progress*; when the run modal is cancelled or the
  dispatch fails, then the task stays *Pending*.
- When a task is `in_progress`, then it is listed under *In progress*, above
  *Pending*, with its lane activity dot.
- When the user presses a status button in a non-spec task's drawer, then the
  task moves to that status and its section, and no agent is started (Play
  excepted).
- When any action is taken on this screen, then no message changes the status
  of a `spec:` task, and no spec's `status.json` changes as a result.
- When an order write is sent from this screen, then every task keeps its
  status.
- When Done is selected, then tasks completed inside the done window are
  listed and older ones sit behind "Show N older".
- When the scope control and the status chips show their counts, then each
  count equals the number of items that control lists with the spec-tasks
  checkbox in its current state.
- When the user creates a task with New Task, then it is saved as `pending`
  with the request text in `userRequest` exactly as typed, the chosen priority
  and category, and no `description` or `acceptanceCriteria`.
- When Play starts a task missing `description` or `acceptanceCriteria`, then
  the prompt asks the agent to write the missing fields and show the
  acceptance criteria before starting; when it starts a ready task, then the
  prompt has no such step. In both cases the prompt carries the acceptance
  criteria once they exist.
- When the entry points and inline host API listed in Constraints are used,
  then they behave as before.
- When the guided tour reaches its Tasks step, then its text describes this
  screen: spec tasks hidden by default, Play on a pending task.
- The pure model that splits tasks into scope, section and spec/non-spec, and
  the readiness check behind Play, have unit tests, as `specs/filterModel.js`
  does.

## Out of Scope

- The Specs screen's own task-row ▶/✓/‖/↺ buttons (same effect on spec phase).
- Editing a task's fields after creation.
- Search over tasks.
- Removing the retired `tasksPanel.js` side panel.
- Changing how a spec's phase is derived from its tasks.
- Completing a task from a git commit (a commit names no task and does not mean
  done).
