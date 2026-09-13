---
keywords: tasks board, specs dashboard, done window, completed column, phase filter, segmented control, project settings, recency
related: tasks-detail-on-demand, settings-by-scope, home-widget-board, compact-center-vs-code-density
---

# Boards done window

## User's request (original, Turkish)

> ama burası yan yana çok kalabalık oldu gibi. ayrıca buraya default değeri
> olan bir period mu eklesek? Çünkü burası çoğaldıkça çok kalabalık
> görünüyor. Date range olan ya da default tanımlı today, this week, last
> 10days gibi filteler mi olmalı sence ekstradan? tartışalım. aynı durum
> tasklarda da var.
>
> 4 öneriyi de yapalım.

Decisions taken in conversation, on the numbers of this project (46 specs,
41 done; 570 tasks, 510 completed):

1. A time window applies to **done items only**. A pending task from sixty
   days ago is still pending; hiding it by date would break the board.
   Today / this week / date-range pickers belong to activity-style views,
   not a work board.
2. The window is a **default, not a filter the user must pick**: done items
   inside it show, the rest sit behind one "Show N older" control. Nothing
   is lost, nothing has to be chosen.
3. The window is a **Project Setting** (7 / 30 / 90 days / all), with two
   starting values: 7 days for tasks, 30 for specs, because specs live
   longer.
4. On the Specs board the five phase chips are all subsets of Active, so
   they render **only while Active is selected**. All and Done keep the
   row to the segmented control and the search field.

The fourth point of the conversation — sort the spec grid by last update —
already holds: `specManager.listSpecs` orders by `updated_at` descending and
the grid keeps that order. It is not part of this spec.

## Problem

Both boards grow monotonically at the done end. The Tasks board's Completed
column carries 510 cards; the Specs dashboard's All scope shows 41 done
cards beside 5 live ones. The work that matters is a thin layer on top of a
pile the user scrolls past every time, and the filter row on the Specs
board — one segmented control, five phase chips, a search field — wraps to
two lines at ordinary widths even though the phase chips only make sense
inside Active.

## Goal

**Tasks board** (`src/renderer/tasksDashboard.js`, `index.html`
`#tasks-dashboard`, `tasks-dashboard.css`):

- The Completed column shows tasks whose `completedAt` (falling back to
  `updatedAt`) is within the project's tasks window. Older completed tasks
  render hidden behind a footer control at the column's foot: "Show 480
  older". Clicking it reveals them for the rest of the session on that
  project; the control then reads "Hide older". Pending and In Progress are
  untouched by the window.
- The Completed count badge shows the visible count. When older cards are
  hidden, the column header's tooltip states both numbers.
- The existing Filter and Sort popovers keep working inside the window;
  drag-and-drop reorder keeps working because hidden cards stay in the DOM
  (the board already relies on that for `.filtered-out`).

**Specs dashboard** (`src/renderer/specsDashboard.js`, `panels.css`):

- Filter state becomes `scope` (`all` | `active` | `done`) plus an optional
  `phase` that is honoured only while `scope === 'active'`. The phase chip
  row renders only in Active; picking a scope clears the phase.
- In All and Done, done specs whose `updated_at` is older than the project's
  specs window are dropped from the grid and a trailing ghost tile says
  "N older done specs · Show". Clicking it reveals them until the scope
  changes or the project switches. Active is never windowed. An active
  search (`searchMatches`) bypasses the window: a query is explicit intent.
- The All and Done counts show what the grid will show; the segment's
  tooltip states the total when older specs are hidden.

**Project Settings** (`projectSettingsModal.js`, `index.html`
`#project-settings-overlay`, `frameProject.js`, `ipcChannels.js`):

- A new **Boards** section with two selects, "Completed tasks shown" and
  "Done specs shown", each offering Last 7 days / Last 30 days / Last 90
  days / All. Values persist in `.frame/config.json` under
  `settings.doneWindow` as `{ tasks: 7, specs: 30 }` (days; `0` means all).
  Missing or malformed values fall back to the defaults. With no project
  open the selects go inert and say why, like Git sharing.
- Both boards re-read the setting when it changes and when the project
  changes, without a reload.

## Constraints

- **No date pickers, no date-range state.** Recorded above; the window is
  a project default with one reveal control per board.
- **Board semantics stay.** Tasks: file order is the default order and
  every card stays in the DOM (tasks-detail-on-demand; the DnD comment in
  `render()`). Specs: single-select filtering, `applyFilter` semantics for
  `all` / `active` / `done` / phase unchanged apart from the new window.
- **Settings by scope** (settings-by-scope): the setting is the project's,
  so it lives in Project Settings and in `.frame/config.json`, never in
  Frame Settings or `localStorage`. Rows follow the existing
  `.settings-row` / `.settings-select` idiom; the no-project state goes
  inert with a note rather than disappearing.
- **Config writes go through `frameStore`'s atomic `writeFrameConfig`**
  (audit-q3-reliability-recovery), like the spec-driven flag and git
  sharing.
- **Pure logic is testable, DOM is not** (Testing record in
  PROJECT_NOTES): the window partition and the specs filter model are
  dependency-free modules under `node --test`; the two dashboards are not
  tested.
- **Badges stay one system.** Counts keep the pill introduced in the
  previous two commits (`.home-card-count`, `.tasks-dashboard-column-count`,
  `.specs-filter-count`); no new count style.
- **In-flight footprints.** `ipcChannels.js` sits in
  `audit-q3-cross-platform` (planned); `frameProject.js` and `index.html`
  in `audit-q3-performance-resources` (implementing). Changes there are
  additive (new constants, a new handler pair, a new settings section) so a
  merge is a clean union.
- No new dependencies.

## Success Criteria

- S1 · When a project has 510 completed tasks of which 30 completed in the
  last 7 days and the window is 7, then the Completed column renders 30
  visible cards, the badge reads 30, and a footer control reads "Show 480
  older".
- S2 · When the footer control is clicked, then all 510 cards are visible,
  the badge reads 510, the control reads "Hide older", and the state
  survives a `TASKS_DATA` re-render on the same project.
- S3 · When the project changes, then the Completed column returns to the
  windowed view.
- S4 · When a completed task has no `completedAt`, then `updatedAt` decides
  its bucket; with neither it counts as recent (never silently hidden).
- S5 · When the Specs board is in Active, then the phase chips render;
  when All or Done is selected, then no phase chip renders and any phase
  previously selected is cleared.
- S6 · When the specs window is 30 and 38 of 41 done specs were updated
  more than 30 days ago, then All shows the 5 active plus 3 recent done
  cards and a trailing tile "38 older done specs · Show"; Done shows 3 and
  the same tile; Active shows 5 and no tile.
- S7 · When a search query is active, then the window does not apply and
  no tile renders.
- S8 · When the window select in Project Settings changes, then
  `.frame/config.json` carries the new `settings.doneWindow` value and the
  open board re-renders with it without a reload.
- S9 · When `settings.doneWindow` is missing, `null`, or holds a value
  outside `{0, 7, 30, 90}`, then the boards use 7 (tasks) and 30 (specs)
  and the selects show those.
- S10 · When no project is open, then both selects are disabled with the
  note "Open a project to change this — the setting lives in its
  .frame/config.json."
- S11 · `npm test` passes with new tests covering the window partition
  (boundary at exactly N days, missing dates, `0` = all) and the specs
  filter model (scope × phase, counts, older split, search bypass).

## Out of Scope

- Date range or preset period pickers (today / this week) on any board.
- Windowing Pending, In Progress, or Active in any form.
- Persisting the reveal state across sessions.
- Sorting the spec grid (already by `updated_at`, specManager).
- The Home widgets' own lists (home-widget-board).
- Archiving or deleting old completed tasks.
