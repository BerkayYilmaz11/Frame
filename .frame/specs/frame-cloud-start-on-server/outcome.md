# Outcome — Start Work on a Frame Server

## T01 — workspaceManager.create({ from: 'new', branch }) and startSha

Let `workspaceManager.create({ from: 'new', branch })` validate the name, refuse a taken one (`Branch "…" already exists.`), cut it from the fetched `origin/<base>` and name the workspace from its last segment; both `from: 'new'` paths now return `startSha`, and `createOnServer` passes it through only when the server answers one. The start point keeps the existing fallback to the local base when `origin/<base>` is missing — the origin-only rule is enforced by the preflight (T02/T06), not here. Files: `src/main/workspaceManager.js`, `test/serverProjects.test.js`.

_Captured: 2026-11-25T09:12:25.109Z · 2 file change(s)_

---

## T02 — Server workspaces.preflight

Added `workspaces.preflight` to `src/server/projects.js`: registered project only, branch and base validated before git, `fetchBranch` then `localBranchExists`/`remoteBranchExists`, answering `{ branchTaken, baseOnOrigin, fetch, tasksPath }`. `base` is a plain branch name (the caller strips `origin/`), and `tasksPath` is null when the clone has no Frame setup, as `tasks.list` answers — a detail the plan did not specify. Files: `src/server/projects.js`, `test/serverProjects.test.js`.

_Captured: 2026-11-25T09:14:22.310Z · 2 file change(s)_

---

