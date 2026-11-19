# Outcome — Start Work in workspaces

## T01 — The task run names its tasks file

Added an optional `tasksPath` to `buildTaskPrompt` in `src/renderer/tasks/runPrompt.js`. When it is set, the completion line names that absolute path and adds "Use that exact file, not a tasks.json inside the working folder". A blank or missing value leaves the prompt byte-identical. Beyond the plan, which named only the completion sentence, the format step's "Read this task in tasks.json" now names the same path, because a Begin task row with no acceptance criteria would otherwise send the agent to the worktree's copy, where the row does not exist. Tests in `test/taskRunPrompt.test.js`.

_Captured: 2026-11-19 · 2 file change(s)_

---

## T02 — Refs are unique across checkouts

`specSlugs` in `src/main/cloud/cloudStartService.js` now returns the union of the main checkout's `.frame/specs/` folder names and every slug `specManager.listSpecs(folderPath)` reports (main, active workspaces, cached server workspaces). A failed `listSpecs` is logged and falls back to the folder names alone. No test was added: the service needs Electron, and `allocateRefs`, which consumes the list, is already covered.

_Captured: 2026-11-19 · 1 file change(s)_

---

## T03 — Start Work drops the dirty check and the stash

Removed the `changeCount`/`dirty` refusal, the stash step, `stashMessage` and the `currentBranch`, `changeCount` and `stash` deps from `handleStartRequest`. `prepareView` no longer takes or returns `currentBranch` and `changeCount`, and the service lost its `changeCount` helper and the matching wiring. Tests in `test/cloudStart.test.js` replace the two stash tests with one asserting that no dirty-folder dep is ever called, even when a request still sends `stash: true`. Until T04 lands, the branch is still checked out in the main checkout, so uncommitted changes carry over onto it instead of being stashed.

_Captured: 2026-11-19 · 3 file change(s)_

---

## T04 — Start Work opens the part in a new workspace

`handleStartRequest` now cuts the branch without a checkout (`git.createBranch(…, false, …)`), reads `baseSha` from the new branch's tip (`deps.branchSha` → `git.branchTipSha`, replacing `headSha`), and opens the branch with `workspaceManager.create({ from: 'branch', branch, base: workspaceBase(base) })`. A failure there, or an answer with no id or path, returns `partial('workspace')` and leaves the branch in place. A spec part's files go to the workspace root (`writeSpec(slug, files, root)`) and a task part's row stays in the main checkout. Success adds `workspace`, `setupScript` and, for a task, `begin.tasksPath` (`frameStore.resolvePath`); tests in `test/cloudStart.test.js` (65 pass). Followup: the service calls `workspaceManager.create` outside the per-project `serialize` queue the IPC path uses, because the plan keeps `workspaceManager` unchanged. A `createQueued` export, like `archiveQueued`, would order it behind a New Workspace create started at the same moment.

_Captured: 2026-11-19 · 3 file change(s)_

---

## T05 — The start copy names the workspace

In `src/renderer/cloudBriefsCopy.js`, `PARTIAL_STEPS` drops `stash` and gains `workspace` ("opening a workspace on its branch failed"), which tells the reader the branch is there. `startedNotice` drops `stashMessage` and ends with ", in workspace <name>" when the result carries a workspace name. Without one, it ends at the branch as before. Tests in `test/cloudBriefsCopy.test.js`.

_Captured: 2026-11-19 · 2 file change(s)_

---
