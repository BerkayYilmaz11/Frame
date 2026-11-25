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

