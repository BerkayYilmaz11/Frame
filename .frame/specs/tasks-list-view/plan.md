# Plan — Tasks List View

## Architecture

### Resolved plan-time decisions

Business (asked):

- **D1 — Where Play's format step applies → every Play.** Play is reached from
  the Tasks screen, Home's Active Tasks widget and the task tab's Start
  Working; all three go through `tasksPanel.openRunFlow`. The readiness step and
  the acceptance criteria are built once, in the shared prompt builder, so the
  three surfaces stay one run flow. Rejected: Tasks screen only (two prompt
  paths that drift).
- **D2 — Clicking a revealed spec task → read-only drawer.** The task's drawer
  opens with no status buttons and an "Open spec" link; the group heading links
  to the spec too (until T09, which drops the groups; the drawer link stays).
  Rejected: jumping straight to the spec (the task's own body would have no
  place on this screen).

Business (decided silently):

- **D3 — Opening scope is Active**, as on Specs (`specsDashboard.js:49`). A scope
  pick resets the done-window reveal, the Specs rule.
- **D4 — Revealed spec tasks follow the same scope and done-window rules** as
  other tasks: Active lists open ones, Done lists completed ones inside the
  window. They sit in one section after the status sections, grouped by spec
  in first-appearance order, each group in file (T) order. This is what makes
  S10's counts well defined.
  **Overturned 2026-10-15 (T09), after review of the shipped screen:** the
  separate section read as a second list hung under the main one. Revealed
  spec tasks now join the status sections like any other task (same scope,
  window and sort rules), each tile labelled `<slug> · T##`; the reveal is an
  "Include spec tasks" checkbox instead of the chip. Rejected on the way: one
  summary tile per spec in Completed (changes the screen's structure more than
  the problem needs).
- **D5 — Filter and Sort move from the header to the toolbar's right side**,
  where Specs has its search, so the header is title, New Task and close (G1).
  Both keep their behaviour; the filter narrows spec tasks too.
- **D6 — Done ends with the Specs ghost tile** ("N older done tasks · Show")
  instead of the column footer.
- **D7 — Text that describes the Kanban moves with it:** the tour's Tasks step
  (S14), the guide's "Plan and tasks" sentence (`guideContent.js:320`, "imports
  those tasks into the Tasks board"), and the public capability entry
  (`docs/capabilities/index.html:754`, "Drag cards across columns"). Each would
  otherwise describe a board that no longer exists.
- **D8 — New Task form fields:** Title (required), Request (textarea, saved
  verbatim as `userRequest`, optional), Priority, Category. A tile's body shows
  `description`, or `userRequest` when there is none yet.
- **D9 — Drawer actions for a non-spec task** sit in the drawer header next to
  Delete, the set `taskSection.handleAction` and the Specs task rows already use:
  pending → Play + Mark complete; in progress → Mark complete + Back to pending;
  completed → Reopen. Play calls `openRunFlow`; the rest send
  `UPDATE_TASK { status }`. A spec task's drawer shows none of them and no
  Delete either: a deleted spec task is re-imported on the next sync
  (`specManager.js:853`), so the button could only confuse.

Technical (decided silently):

- **D10 — Test posture: pure logic only.** The spec fixes it (S15) and it is the
  project's convention: pure renderer modules are tested, DOM surfaces are not
  (no DOM harness; testing record in PROJECT_NOTES). Not asked: the spec already
  answers it.
- **D11 — Two pure modules under `src/renderer/tasks/`**, mirroring
  `src/renderer/specs/filterModel.js`: `listModel.js` (what the screen lists)
  and `runPrompt.js` (readiness + the run prompt). `tasksPanel.js` requires
  `electron`, so its prompt builder cannot be tested where it is; it now
  delegates.
- **D12 — Order writes send ids only.** Sort's Permanent Save sends
  `REORDER_TASKS { order: [{ id }] }`; `tasksManager.reorderTasks` keeps a task's
  status when an entry carries none (`tasksManager.js:287`). No main change, and
  S7/S8 hold by construction. A new test pins that `reorderTasks` behaviour,
  which nothing covers today.
- **D13 — Reuse the Specs shell classes.** `panels.css` defines the toolbar,
  segments, chips, grid, card frame and ghost tile as unscoped classes
  (`.specs-dashboard-toolbar`, `.specs-filter-seg`, `.specs-filter-chip`,
  `.specs-card`, `.specs-card-older`, `.specs-dashboard-empty`), so the Tasks
  markup uses them directly. Task-only parts (sections, tile internals, Play,
  spec groups, drawer actions) live in `tasks-dashboard.css`; column, card and
  drag rules are deleted from it. Renaming the shared classes would be a
  refactor outside this spec.
- **D14 — `tasksManager.addTask` copies `userRequest`** when it is a string with
  non-whitespace content, as given. Today it drops the field
  (`tasksManager.js:203-214`), so the form mapping needs this one main change.
- **D15 — Readiness:** a non-spec task is ready when `description` and
  `acceptanceCriteria` are non-empty after trimming. A spec task is always
  treated as ready: its body lives in the spec's `tasks.md`, which the sync
  owns, so asking an agent to fill its `tasks.json` fields would be wrong (this
  matters for the task tab, which can still start one).
- **D16 — The spec-tasks reveal** is module state reset on project change, like
  `showOlderDone` (`tasksDashboard.js:209-212`). Never persisted.
- **D17 — "Open spec"** runs `specsDashboard.show()` then
  `specsDashboard.openSpec(slug, { instant: true })`, the pair
  `multiTerminalUI.enterSpecDrawer` already uses (`multiTerminalUI.js:378-391`).

Added after review (2026-10-15):

- **D18 — Status chips under Active (T10)** mirror the Specs phase chips
  (`specsDashboard.js` `renderToolbar`, `filterModel.js`): shown only while
  Active is picked, one at a time, a second click clears it, any scope pick
  resets it. `status` narrows only in Active and is ignored elsewhere. The
  scope counts do not move with it; each chip counts its own section, and the
  spec-tasks count follows it. Session state, never persisted.

### Data shapes

`listModel.buildListModel(input)`, pure:

```
input:  { tasks, scope = 'active', showSpecTasks = false, matches = () => true,
          sortMode = 'default', windowDays = 0, showOlder = false, now = Date.now() }
output: { scope,
          sections:   [{ id: 'in_progress' | 'pending' | 'completed', tasks }],
          specGroups: [{ slug, tasks }],          // [] unless showSpecTasks
          olderCount,                             // completed past the window, all/done only
          counts: { all, active, done, doneTotal, specTasks } }
```

After T09 and T10 (D4 overturned, D18):

```
input:  { …, status = null }                      // 'in_progress' | 'pending', Active only
output: { scope, status,                          // status: the effective one, null outside Active
          sections,                               // spec tasks inside while showSpecTasks
          olderCount,
          counts: { all, active, done, doneTotal, specTasks,
                    'status:in_progress', 'status:pending' } }
```

Rules:
- A spec task is one whose `source` starts with `spec:`; its slug is the
  second `:` field.
- An unknown status counts as `pending`, as the board does today
  (`tasksDashboard.js:258`).
- `matches` (category/priority filter) narrows the pool before anything is
  counted.
- Sections per scope: `active` → in_progress, pending (never windowed);
  `done` → completed; `all` → all three. Completed is windowed through
  `partitionDone` on `completedAt || updatedAt` unless `windowDays` is 0 or
  `showOlder`.
- `sortMode` (`default` | `category` | `priority`) sorts inside each section,
  stable on file order, with today's comparator.
- Counts answer "what will I see if I click". Spec tasks enter `all`, `active`
  and `done` only while revealed. `specTasks` is how many spec tasks the
  current scope would list if revealed.

`runPrompt`, pure:
- `isSpecTask(task)`
- `missingFields(task)` → subset of `['description', 'acceptanceCriteria']`;
  always `[]` for a spec task.
- `buildTaskPrompt(task, { branchMode, newBranchName })` builds the prompt in
  this order:
  1. Today's opening: title, description, high priority.
  2. `Acceptance criteria: …` when present.
  3. "Before starting, do the following in order": first, when fields are
     missing, write them into this task in `tasks.json` (by id) after reading
     the relevant code, never adding or changing `userRequest`, then show the
     acceptance criteria and wait for confirmation; then today's
     uncommitted-changes and branch steps when `branchMode === 'new'`.
  4. Today's closing line, which asks the agent to mark the task completed.

### Screen

```
view-header   ✓ Tasks                                  [+ New Task] [×]
toolbar       [All n | Active n | Done n] │ [Spec tasks n]    [Filter] [Sort]
list          In progress ─ tiles (activity dot)
              Pending     ─ tiles (▶ Play)
              Completed   ─ tiles … [N older done tasks · Show]   (all/done)
              Spec tasks  ─ <slug> · Open spec ─ tiles (read-only)  (revealed)

after T09/T10:
toolbar       [All n | Active n | Done n] │ (In progress n) (Pending n)   ☐ Include spec tasks n  [Filter] [Sort]
                                            └ chips only while Active
list          In progress / Pending / Completed ─ tiles; a spec tile reads "<slug> · T##", no Play
aside         New Task form (only while open)
drawer        task detail + status actions (non-spec) / Open spec (spec)
```

`tasksDashboard.js` keeps its whole export surface (`init`, `show`, `hide`,
`toggle`, `isVisible`, `setInlineHost`, `mountInline`, `notifyDetached`,
`isInlineMounted`, `openTask`, `getSelectedTaskId`, `closeDrawer`), the
`TASKS_DATA` / `TOGGLE_TASKS_DASHBOARD` / lane-activity listeners and the
drawer's `drawerOpened` hook. That is what keeps the sidebar, Home, palette,
Cmd+Shift+D and the top-bar chip working (C9). Tiles carry
`data-task-id` and the `selected` class the way cards did, so `selectTask`
keeps its shape.

## Files

- **New** `src/renderer/tasks/listModel.js` — pure model: scope, sections, spec groups, done window, counts.
- **New** `src/renderer/tasks/runPrompt.js` — pure readiness check and run prompt builder.
- **Modified** `src/renderer/tasksPanel.js` — `buildTaskPrompt` delegates to `tasks/runPrompt.js`; stale "Kanban" comment.
- **Modified** `src/main/tasksManager.js` — `addTask` keeps `userRequest`.
- **Modified** `src/renderer/tasksDashboard.js` — grid of sections from the model; no drag; toolbar scope + spec toggle; tile Play; drawer actions; read-only spec-task drawer; Request field; ids-only order write.
- **Modified** `index.html` — Tasks markup: toolbar (scope container, filter/sort moved), list container instead of columns, Request textarea, drawer action and spec-link slots.
- **Modified** `src/renderer/styles/components/tasks-dashboard.css` — drop column/card/drag rules; add list, section, tile, Play, spec-group and drawer-action rules.
- **Modified** `src/renderer/tour/tourSteps.js` — Tasks step text.
- **Modified** `src/renderer/guide/guideContent.js` — "Plan and tasks" sentence about where spec tasks show.
- **Modified** `docs/capabilities/index.html` — Tasks dashboard entry (04.01).
- **New** `test/tasksListModel.test.js` — scope × sections × spec reveal × window × filter × sort × counts.
- **New** `test/taskRunPrompt.test.js` — readiness, spec-task exemption, prompt with and without the format step, acceptance criteria, branch steps unchanged.
- **Modified** `test/tasksManager.test.js` — `addTask` with and without `userRequest`; `reorderTasks` with ids only keeps status.

## Footprint

- src/renderer/tasks/listModel.js
- src/renderer/tasks/runPrompt.js
- src/renderer/tasksPanel.js
- src/main/tasksManager.js
- src/renderer/tasksDashboard.js
- index.html
- src/renderer/styles/components/tasks-dashboard.css
- src/renderer/tour/tourSteps.js
- src/renderer/guide/guideContent.js
- docs/capabilities/index.html
- test/tasksListModel.test.js
- test/taskRunPrompt.test.js
- test/tasksManager.test.js

## Dependencies

None.

## Sequencing

1. **List model.** Write `src/renderer/tasks/listModel.js` per the rules above,
   with `test/tasksListModel.test.js` covering:
   - each scope's sections, and the unknown-status fallback;
   - spec tasks hidden or revealed, grouped by slug in file order;
   - the completed window in `all`/`done` with `showOlder` and window 0;
   - the filter narrowing before counts;
   - sort stability;
   - counts with and without the reveal.

   Not wired yet.
2. **Run prompt.** Write `src/renderer/tasks/runPrompt.js`; make
   `tasksPanel.buildTaskPrompt` delegate to it (every Play surface gets the
   format step and the acceptance criteria). Add `test/taskRunPrompt.test.js`:
   - `missingFields` for each combination, and spec tasks exempt;
   - the format step present or absent;
   - the criteria line;
   - the branch-step text byte-identical to today;
   - the completion line kept.
3. **`addTask` keeps the request.** `tasksManager.addTask` copies a non-blank
   `userRequest`. Extend `test/tasksManager.test.js`: with and without
   `userRequest`, and `reorderTasks` with `{ id }` entries leaving every status
   untouched.
4. **Board becomes the grid.** In `index.html`, replace the columns with the
   toolbar (scope container; filter/sort wraps moved right) and the list
   container. In `tasksDashboard.js`, render from `buildListModel`:
   - scope segments with counts;
   - In progress / Pending / Completed sections of tiles (activity dot,
     priority, category, body, date);
   - the ghost tile for older done tasks;
   - empty states.

   Delete the drag code, `commitOrder` and the column lookups. Make
   `commitSortToFile` send ids only. In `tasks-dashboard.css`, delete the
   column, card and drag rules and add the list, section and tile rules on top
   of the reused Specs classes. Spec tasks are hidden from here on; the reveal
   lands in step 6.
5. **Play and drawer actions.** Add a Play button on pending non-spec tiles; its
   click opens `openRunFlow` without selecting the tile. Add the drawer header
   actions per D9, wired to `openRunFlow` / `UPDATE_TASK`, plus their CSS.
6. **Spec tasks on demand.**
   - Toolbar: a "Spec tasks n" chip toggles the reveal; reset on project change.
   - List: a Spec tasks section with one group per spec, each with an
     "Open spec" link.
   - Drawer: a spec task opens read-only, with no actions and no Delete, and an
     "Open spec" link (D17).
7. **New Task maps to the schema.** Replace the form's Description textarea with
   Request. `submitForm` sends `userRequest` as typed when it is not blank, and
   no `description`. A tile shows `userRequest` when `description` is empty.
8. **Texts.** Rewrite the tour's Tasks step, the guide sentence and the
   capability entry to describe the grid, Play and hidden spec tasks.

Added after review (2026-10-15):

9. **Spec tasks join the status sections (D4 overturned).**
   - Model: while `showSpecTasks`, spec tasks enter the status sections under
     the same scope, window and sort rules; `specGroups` goes away. Counts are
     unchanged.
   - Toolbar: an "Include spec tasks" checkbox with the spec-task count
     replaces the chip, on the toolbar's right before Filter, present only
     while the project has spec tasks.
   - List: drop the Spec tasks section; a spec tile carries a `<slug> · T##`
     label instead of its status pill, and still no Play. The drawer stays
     read-only with "Open spec".
   - Texts that name the chip or the section (guide sentence, tour step,
     capability entry) say "Include spec tasks".
10. **Status chips under Active (D18).** `buildListModel` takes `status` and
    returns the per-status counts; the toolbar shows *In progress n* and
    *Pending n* chips after the scope segments while Active is picked; an
    empty pick says so.
