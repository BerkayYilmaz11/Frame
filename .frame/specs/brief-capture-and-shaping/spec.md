---
keywords: brief, unshaped work, home brief row, shape, drop, briefs view, capture before spec, backlog age
related: home-widget-board, new-spec-agent-handoff, agent-dispatch, sidebar-nav-groups, cli-spec-command-parity, tasks-detail-on-demand
---

# Brief — capturing work before it is shaped

## Problem

Frame covers the moment a developer already knows what to build: spec, plan,
tasks, outcome. The moment before that has nowhere to live. Ideas arrive
mid-session, a project starts with "these five things", a conversation with an
agent produces a dozen work items — none of them are tasks or specs yet, and
none of them are ready to be. Today they go to a notes app or nowhere.

Frame's own boards show the cost: `.frame/tasks.json` holds 525 entries, 48 of
them pending, the oldest from January. Many are ideas rather than committed
work, and some were delivered by a spec and never closed. The Pending column is
serving as a brief backlog, badly — and because a task has a type, a priority
and acceptance criteria, everything landing there gets a form it did not earn.

## Goal

A third door on Home and one view behind it, for work that has not been shaped
yet.

- **Home brief row** — a full-width row between the header and the existing 2×2
  widget board. One always-present text box ("Something you want but haven't
  shaped yet"); Enter creates an Open Brief and clears the box. Under it, at
  most three Open Briefs — kind (or "—"), the user's text, age, **Shape**,
  **Drop** — plus a count with the oldest age ("9 briefs · oldest 3 wk") and an
  "All briefs →" link. Nothing else. The four existing widgets are untouched.
- **Briefs view** — a full list in the sidebar beside Specs and Tasks. Filter by
  state (Open by default) and kind; sort by age; same two row actions. Shaped
  and Dropped are reachable, not shown by default.
- **A brief record** — the user's text verbatim, an optional kind (bug, feature,
  refactor, docs, testing, research, chore), a state (Open / Shaped / Dropped),
  dated transitions, a drop reason, and — once shaped — a pointer to the task or
  specs it became. Stored with the project, readable by user and agent alike.
- **Shape** — one agent proposal, one user confirmation. Shape opens its own
  agent lane with its own staged template; there the agent reads the Brief
  against the project and proposes a task, one spec, or several ordered specs,
  and asks the user to confirm. The user may change the level before confirming. On confirm the work is
  created through the flows that already exist, and the Brief freezes and points
  at it. Nothing starts running.
- **Drop** — marked not-doing with a one-line reason, never deleted.
- **Agent-written Briefs** — an agent can record a Brief on the user's behalf
  when a session produces unshaped work.

*Delivered* is derived, never set: a Shaped Brief whose resulting work is all
done.

## Constraints

- **Home's data path.** `home/homeData.js` owns every subscription behind an
  init-once guard and widgets never require `electron` (`home-widget-board`,
  after the 2026-08-20 storm at ~100 round-trips/sec and 163% CPU). Briefs join
  `SOURCES` there; the brief row must not open its own IPC.
- **Home's host owns the layout.** `homeBoard.js` builds the header and the one
  `.home-grid`, and `home/registry.js` places widgets in that grid. A full-width
  row above the grid is not a fifth grid widget — the host grows a second region
  or the widget contract grows a full-width slot. Either way `resolveLayout` /
  `sourcesFor` stay the one path, and `mount()` builds once while `update()`
  patches (never rebuilds).
- **One door to the agent.** All prompt delivery goes through
  `agentDispatch.dispatch()` (`agent-dispatch`), and the staged command template
  is the only authoring flow (`cli-spec-command-parity`,
  `new-spec-agent-handoff` — which deleted `createSpec` rather than keep a
  second path). Shape stages a template and dispatches; it does not create
  specs in-process. It stages its **own** template into its **own** lane rather
  than reusing `spec.new`'s Spec Creator lane: Shape has to be able to land on a
  task as well as on specs, and deciding the form is a different act from
  authoring a spec.
- **Shape is one question.** `new-spec-agent-handoff` already routes spec
  creation through a lane. Shape must reach a single proposal and a single
  confirmation on top of that; a second prompt in a row is a defect, and any
  remaining question belongs inside the task or spec that gets created.
- **Sidebar reality.** Specs, Tasks and Decisions live in the **Context** group,
  not Work (`sidebar-nav-groups`, `projectListUI.js`). The business brief says
  "the Work group"; "beside Tasks and Specs" is the intent that wins.
- **Lives with the project, under `.frame/`.** Briefs and their history are
  part of the project's record, human-readable and git-visible, like
  `.frame/tasks.json` — and inside `.frame/`, per `non-invasive-overlay`.
- **The text is never rewritten** by product or agent; anything the agent
  produces sits beside it. State is read from what happened, never typed.
- **Spec-driven mode can be off** (`IS_SPEC_DRIVEN_ENABLED`); Briefs still work.
- **No migration.** Nothing in `.frame/tasks.json` or the spec catalog is moved,
  renamed or reinterpreted.
- **Nothing is forced.** The agent may offer a Brief once for a given piece of
  unshaped work; declined means it does not ask again in that session. A user
  who never writes a Brief loses nothing.

## Success Criteria

- When the project is open, then the brief row is present on Home between the
  header and the 2×2 board, and the four existing widgets render unchanged.
- When the user types text and presses Enter, then an Open Brief exists with
  that text stored byte-for-byte, no kind, and the box is empty — with no
  further prompt, field or modal.
- When more than three Briefs are open, then the row shows the three it lists
  plus a count and the oldest age, and "All briefs →" opens the Briefs view.
- When a Brief is open, then its row shows an age and no status word anywhere.
- When the user presses Shape, then exactly one proposal is presented (task, one
  spec, or several ordered specs), the user can change the level, and one
  confirmation creates the work — no second question, and nothing starts running
  afterwards.
- When shaping completes, then the Brief is Shaped, its text is frozen, it names
  what it became, and the created task or specs are indistinguishable from ones
  created by hand.
- When the user presses Drop, then a one-line reason is required, and the Brief
  is kept as Dropped with its text and reason intact.
- When a Shaped Brief's resulting work is all done, then it reads as Delivered
  without anyone setting it; when that work is all deleted, it reads as needs
  attention rather than reverting to Open.
- When spec-driven mode is off, then Shape proposes a task and never a spec.
- When an agent is asked to record a Brief, then it creates the same record the
  box creates, with the user's words unaltered.
- When the Briefs view is opened, then Open is the default filter, and Shaped
  and Dropped are reachable but not shown by default.
- When any board or report other than the brief row and the Briefs view is
  opened, then no Brief appears on it — and no task or spec appears in the brief
  row.
- When `.frame/tasks.json` is compared before and after this work, then it is
  unchanged except for tasks a user shaped deliberately.

## Out of Scope

- Milestones, or any grouping of Briefs by date or goal.
- A single entry point replacing New Task and New Spec.
- The agent shaping, moving or dropping without user confirmation.
- Deep decomposition at Shape time: sequencing analysis, coverage matrices,
  plan-level reasoning.
- Handing a multi-spec Brief to the orchestrator (`agent-orchestration`).
- Sharing, servers, multi-user access.
- Import from GitHub issues, Linear or other trackers.
- Comments, owners, notifications, priorities on Briefs.
- Automatic conversion of the 48 pending tasks into Briefs.

## Open Questions

1. **Where the brief row is built.** (a) `homeBoard.js` grows a second region
   above `.home-grid`, leaving the widget contract untouched; (b) the widget
   contract grows a full-width slot and the row registers like any other widget.
   (b) costs more now and buys a place for future full-width rows.
2. **How Briefs are stored.** (a) one `.frame/briefs.json`, mirroring
   `tasks.json` and its watcher; (b) a file per Brief under `.frame/briefs/`,
   which reads better in a diff and never conflicts on a merge.
3. **After shaping into several specs, what the user sees.** (a) the Brief,
   now pointing at its specs; (b) the specs board. Product's call.
4. **Linking existing work back to a Brief after the fact** — product prefers
   yes; the fork is whether Phase 1 ships it or only leaves room for it.
5. **How the agent becomes aware of Open Briefs** without ever being required to
   read them. (a) a `scripts/` lookup in the family of `spec-context.js` /
   `find-module.js`; (b) a managed block in `AGENTS.md`. (a) keeps the always-on
   context flat, which `spec-knowledge-layer` deliberately protects.
6. **Which session moments offer "record this as a Brief"** — the answer decides
   whether this is a prompt-template rule, a Frame-side detection, or both.
