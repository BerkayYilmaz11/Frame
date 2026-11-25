# Outcome — Start Work on a Frame Server

## T01 — workspaceManager.create({ from: 'new', branch }) and startSha

Let `workspaceManager.create({ from: 'new', branch })` validate the name, refuse a taken one (`Branch "…" already exists.`), cut it from the fetched `origin/<base>` and name the workspace from its last segment; both `from: 'new'` paths now return `startSha`, and `createOnServer` passes it through only when the server answers one. The start point keeps the existing fallback to the local base when `origin/<base>` is missing — the origin-only rule is enforced by the preflight (T02/T06), not here. Files: `src/main/workspaceManager.js`, `test/serverProjects.test.js`.

_Captured: 2026-11-25T09:12:25.109Z · 2 file change(s)_

---

## T02 — Server workspaces.preflight

Added `workspaces.preflight` to `src/server/projects.js`: registered project only, branch and base validated before git, `fetchBranch` then `localBranchExists`/`remoteBranchExists`, answering `{ branchTaken, baseOnOrigin, fetch, tasksPath }`. `base` is a plain branch name (the caller strips `origin/`), and `tasksPath` is null when the clone has no Frame setup, as `tasks.list` answers — a detail the plan did not specify. Files: `src/server/projects.js`, `test/serverProjects.test.js`.

_Captured: 2026-11-25T09:14:22.310Z · 2 file change(s)_

---

## T03 — Server specs.create

Added `specs.create` to `src/server/specs.js` behind `checkout()` and `needSlug()`: string `spec.md`/`status.json` only, create-only folder, atomic writes, answering `{ created }`. Beyond the plan's guard list it also refuses `gitSharing: local` with the module's `LOCAL_MODE` sentence, matching `specs.stage` and the spec's local-mode constraint (the desktop refuses it first in T07). Files: `src/server/specs.js`, `test/serverSpecs.test.js`.

_Captured: 2026-11-25T09:15:34.669Z · 2 file change(s)_

---

## T04 — Server tasks.insert

Added `tasks.insert` to `src/server/tasks.js`: `needFrame(project())`, one load/save, rows appended whole, `metadata.totalCreated` bumped, `{ tasksPath }` answered. It also refuses an id repeated inside the same call and rows without a string id, neither of which the plan named. Files: `src/server/tasks.js`, `test/serverTasks.test.js`.

_Captured: 2026-11-25T09:16:34.372Z · 2 file change(s)_

---

## T05 — Begun store keeps serverKey; per-server liveness

Gave the begun entry an optional `serverKey` and factored liveness into an exported `begunLive`, which `withBegunBranches(…, servers)` now uses; live server parts carry `begunServerKey`, Mac parts keep their exact shape. With `servers` left out every server entry counts, which the plan did not state, matching the existing `localBranches` default. Files: `src/main/cloud/cloudStart.js`, `test/cloudStart.test.js`.

_Captured: 2026-11-25T09:18:54.503Z · 2 file change(s)_

---

## T06 — Server path of handleStartRequest

Added the server path to `handleStartRequest`: origin-only base, `serverPreflight` refusals before `brief.start`, no Mac `createBranch`, `baseSha` from the server's `startSha`, `serverKey` in `recordBegun`, and `begunStands`/`hostOf` in Begin's guard. Two choices the plan left open: the server task part's `tasksPath` comes from the preflight answer inside the core (not a service `tasksPath` dep), and a server start skips the Mac's `branchTaken` check, deferring to the server's. The core's workspace answer also gains `location`/`serverKey`/`host` on a server so the renderer's fallback select is correct. Files: `src/main/cloud/cloudStart.js`, `test/cloudStart.test.js`.

_Captured: 2026-11-25T09:21:07.359Z · 2 file change(s)_

---

