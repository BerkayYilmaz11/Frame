# Plan — Start Work in workspaces

## Architecture

### Resolved plan-time decisions

Business
- **Coming soon visibility** — The disabled "Server · Coming soon" location shows only when a server is saved, with the same rule as New Workspace's Location row (`newWorkspaceModal.js:278`). Rejected: always showing it, which adds a dead row for people without a server. (Asked.)
- **Archived workspace on the card** — The workspace chip drops, and the row shows what it shows today: its state, or "On `<branch>`". After a merge the row already reads "Merged into `<target>`" from the cloud. Rejected: a Restore chip, which adds UI and reruns setup. Settles spec Open Question 2. (Asked.)
- **Workspace name** — The workspace is named after the part's branch: its last segment, slugged and made unique (`feat/export-api` → `export-api`), as `workspaceManager.create({ from: 'branch' })` already names it (`workspaceManager.js:514`). The dialog shows the name and follows the branch field; it is not a separate field, and renaming stays in the sidebar. The user picks the base as today. (Asked, 2026-11-19.)

Technical
- **Creating the branch (spec Open Question 1)** — Start Work cuts the part's branch as today, but without switching the main checkout to it (`git branch`, not `checkout -b`). It then opens that branch with `workspaceManager.create({ from: 'branch', branch, base })`. This keeps today's base rules (local or origin pick, `--no-track` for an origin base) and leaves `workspaceManager.create`, which Frame Server's `workspaces.create` shares, unchanged. Rejected: a branch-name option on `create({ from: 'new' })`, which always cuts from `origin/<base>` and changes the server-facing call. If creating the workspace fails, the branch stays and the answer is `partial` with step `workspace`. (Asked.)
- **Which workspace a part is in** — The card finds it by branch: the active local workspace whose branch is the part's `begunBranch`, else its cloud `branch`. Git checks a branch out in at most one worktree, so the match is unique. The chip shows the workspace's current name. This overturns the spec's "the begun record also stores the workspace" (Goal) and "the begun record stores the workspace with its location" (Constraints). `cloud-starts.json` stays `{ ref, branch, begunAt, baseSha }`. Workspace records already carry `location`, so phase 2 still needs no migration. Rejected: storing the workspace id in `cloud-starts.json`, which goes stale on archive, rename or re-open. (Asked.)
- **Setup before the lane** — Frame waits for the workspace's setup script to finish (`runSetupThenAgent` with `openAgent: false`, `newWorkspaceModal.js:417`), then opens the lane, as New Workspace does. This corrects the spec's citation: a spec created from main runs setup *alongside* its lane (`agentDispatch.js:530`), not before. Rejected: running alongside, where a task run can start before dependencies are installed. (Asked.)
- **Test posture** — Pure logic only, matching the testing record (`PROJECT_NOTES.md` › Testing): extend `test/cloudStart.test.js`, `test/cloudBriefsCopy.test.js` and `test/taskRunPrompt.test.js`. DOM code has no harness. (Asked.)
- **The task run names its tasks file** — The task-run prompt says "update … in tasks.json" with no path (`runPrompt.js:80`). In a workspace that is the worktree's copy, while the row lives in the main checkout's `tasks.json`. `buildTaskPrompt` takes an optional `tasksPath`, and Begin passes the main checkout's absolute path. Without `tasksPath` the prompt is unchanged. This follows `spec-in-workspace`'s `{tasks_path}` rule. (Silent: one defensible answer.)
- **Refs are unique across checkouts** — `specSlugs` reads only the main checkout's `.frame/specs` (`cloudStartService.js:96`), but specs now live in workspaces. Ref allocation takes the union of that folder and `specManager.listSpecs(folderPath)` slugs, which covers main and active workspaces. (Silent.)
- **The base commit comes from the branch** — `recordBranch`'s `baseSha` is `git.branchTipSha(folderPath, branch)` (`gitBranchesManager.js:833`), read right after the branch is cut. It no longer comes from the main checkout's HEAD (`cloudStartService.js:221`). Worktrees share refs with the main repository. (Silent.)
- **The workspace's base is a branch name** — The workspace record's `base` (↓behind, PR base, Update from base) is the picked base without an `origin/` prefix (`origin/main` → `main`). This is a pure `workspaceBase(base)` in `cloudStart.js`. (Silent.)
- **Completion stays off for workspace parts** — `cloudDoneService` is unchanged. Rows are never on the part's branch, so `isFinished` at the tip stays false and `brief.recordCompletion` is never sent (spec Constraints, agreed 2026-11-19). (Silent.)
- **Coming soon reuses what exists** — `copy.COMING_SOON` and `.cloud-briefs-start-soon`, as Orchestrate shows them (`cloudStartDialog.js:152`). (Silent.)

### The start, in order

`cloudStart.handleStartRequest` (pure, `cloudStart.js:479`) keeps every check before `brief.start` and drops the dirty check and the stash (`cloudStart.js:523`, 545–552):

1. Read the brief and check the part, definition, ref, branch name (`badBranch`, `branchTaken`) and base (`baseMissing`), as today.
2. `brief.start` reserves every ref (start mode only).
3. `deps.createBranch(branch, base, { track })`, which the service runs with `checkout = false`. Failure → `partial('branch')`.
4. `deps.branchSha(branch)` → `baseSha` (null when not a full id, as today).
5. `deps.createWorkspace(branch, workspaceBase(base))` → `{ workspace, setupScript }`. Failure → `partial('workspace')`.
6. A spec part → `deps.writeSpec(ref, files, workspace.path)`, into the worktree. A task part → `deps.writeTasks([row])`, into the main checkout as today. Failure → `partial('files')`.
7. `deps.recordBegun({ partId, ref, branch, baseSha })`, then fire `deps.recordBranch` as today.

Request: `{ number, beginPartId, branch, base }`; `stash` is gone.
Success: today's fields without `stashMessage`, plus `workspace: { id, name, path, branch, base }` and `setupScript`. A task part's `begin` carries `tasksPath`, the main checkout's absolute `tasks.json` path from `frameStore.resolvePath`.
Partial steps: `branch | workspace | files`.
`prepareView` drops `changeCount` and `currentBranch`.

### After the start (renderer)

`cloudBriefsPanel.openBeginLane` (`cloudBriefsPanel.js:1684`) gets the result's `begin`, `workspace` and `setupScript`. It runs these steps:
- `workspaceSection.load()`, then `select(workspace)`.
- `await runSetupThenAgent({ setupScript, openAgent: false })` when there is a script.
- Selects the workspace again, in case the user moved during setup.
- Opens the lane:
  - A spec part: `dispatchSpecCommand(… 'spec.plan')`, which selects the spec's workspace itself (`agentDispatch.js:536`).
  - A task part: `runTaskWithOptions(task, { branchMode: 'current', tasksPath })`, then `UPDATE_TASK in_progress` on the main checkout as today.

### The dialog

`cloudStartDialog` keeps its part choice, Orchestrate (disabled) and branch row, and changes in three ways:
- **Removed:** the dirty prompt, the `stash` state and their copy.
- **New, under the branch row:** a "Workspace `<name>`" line. It is computed with `toSlug`/`uniquify` from `src/shared/workspaceNames.js` against the loaded workspace names, and updates as the branch is typed.
- **New, only with a saved server:** a Location line, "This Mac" plus a disabled "Server · Coming soon".

### The card

`cloudBriefsCopy.partWorkspace(part, workspaces)` (pure) → the active, local workspace whose `branch` is `part.begunBranch || part.branch`, else null. `renderPartRow` (`cloudBriefsPanel.js:1063`) adds a chip with that workspace's name, and clicking it calls `workspaceSection.select(ws)`. `workspaceSection` gains `onChange(fn)`, called after each `load()`, so the rows redraw when workspaces are created, renamed or archived.

### What does not change

The cloud contract (`brief.start`, `brief.recordBranch`, part refs), `cloudDoneService`, `workspaceManager`, `cloud-starts.json`'s shape, Orchestrate, and the Frame Server path. Server is phase 2, and phase 1 shows it as Coming soon.

## Files

- `src/main/cloud/cloudStart.js` — **Modified**. Start order without dirty/stash; new `branchSha`, `createWorkspace` and `writeSpec(root)` deps; `partial('workspace')`; result carries `workspace`, `setupScript` and `begin.tasksPath`; `workspaceBase()`; `prepareView` without `changeCount`/`currentBranch`.
- `src/main/cloud/cloudStartService.js` — **Modified**. Non-checkout `createBranch`; `branchSha` via `git.branchTipSha`; `createWorkspace` via `workspaceManager.create({ from: 'branch' })`; `writeSpec` into the workspace root; `specSlugs` across checkouts; the `tasksPath` value; changeCount/stash/currentBranch wiring removed.
- `src/renderer/cloudStartDialog.js` — **Modified**. Dirty prompt and stash removed; Workspace name line; Location line with Coming soon when a server is saved.
- `src/renderer/cloudBriefsPanel.js` — **Modified**. `openBeginLane` selects the new workspace, waits for setup, then opens the lane; the part row shows the workspace chip and selects it on click; rows redraw on workspace changes.
- `src/renderer/cloudBriefsCopy.js` — **Modified**. `partWorkspace()`; the `workspace` partial step; `startedNotice` names the workspace and loses the stash sentence; Workspace and Location labels; dialog descriptions; `dirtyWarning` and `STASH_AND_CONTINUE_LABEL` removed.
- `src/renderer/workspaceSection.js` — **Modified**. `onChange(fn)`, called after each `load()`.
- `src/renderer/tasks/runPrompt.js` — **Modified**. Optional `tasksPath` in `buildTaskPrompt`.
- `src/renderer/styles/components/cloud-briefs.css` — **Modified**. Workspace and Location lines in the dialog; the part row's workspace chip.
- `test/cloudStart.test.js` — **Modified**. Start order and steps, `partial('workspace')`, base from branch, spec written to the workspace root, no dirty/stash, `workspaceBase`, `prepareView`.
- `test/cloudBriefsCopy.test.js` — **Modified**. `partWorkspace`, the partial message for `workspace`, `startedNotice` without stash.
- `test/taskRunPrompt.test.js` — **Modified**. `tasksPath` named in the prompt; unchanged without it.

## Footprint

- src/main/cloud/cloudStart.js
- src/main/cloud/cloudStartService.js
- src/renderer/cloudStartDialog.js
- src/renderer/cloudBriefsPanel.js
- src/renderer/cloudBriefsCopy.js
- src/renderer/workspaceSection.js
- src/renderer/tasks/runPrompt.js
- src/renderer/styles/components/cloud-briefs.css
- test/cloudStart.test.js
- test/cloudBriefsCopy.test.js
- test/taskRunPrompt.test.js

## Dependencies

None.

## Sequencing

1. **The task run names its tasks file.** `buildTaskPrompt(task, { tasksPath })` puts the given path in the completion sentence and keeps today's sentence without it. Tests in `test/taskRunPrompt.test.js`.
2. **Start Work opens the part in a new workspace (main).**
   - In `cloudStart.js` and `cloudStartService.js`: the new order (no dirty check or stash, branch cut without checkout, `baseSha` from the branch, the workspace step, spec files into the worktree, task row into main).
   - The result's `workspace`, `setupScript` and `begin.tasksPath`; `workspaceBase`; ref allocation across checkouts; `prepareView` without dirty fields.
   - In `cloudBriefsCopy.js`: the `workspace` partial step and a `startedNotice` that names the workspace without the stash sentence.
   - Tests in `test/cloudStart.test.js` and `test/cloudBriefsCopy.test.js`.
3. **The lane opens in the new workspace after setup.** `openBeginLane` loads and selects the workspace, waits for the setup script, re-selects, and opens `/spec.plan` or the task run with `tasksPath`.
4. **The dialog drops the stash and shows where the work goes.**
   - Remove the dirty prompt, the stash state and their copy.
   - Add the Workspace name line, which follows the branch field.
   - Add the Location line ("This Mac", "Server · Coming soon" disabled), shown only when a server is saved.
   - Update the dialog descriptions and the CSS.
   - Copy tests in `test/cloudBriefsCopy.test.js`.
5. **The card names the workspace.** `cloudBriefsCopy.partWorkspace`; `workspaceSection.onChange`; the part row's workspace chip, which selects the workspace on click and redraws on workspace changes; CSS. Tests for `partWorkspace` in `test/cloudBriefsCopy.test.js`.
