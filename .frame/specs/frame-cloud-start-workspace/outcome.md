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
