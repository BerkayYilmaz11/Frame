# Outcome — Frame Cloud no workspace

## T01 — Pin the null workspace in the sign-in core

Added doc-comment lines to `runSignIn` and `refreshSession` in `src/main/cloud/deviceFlow.js` saying `session.workspace` may be null, with no code change, since both already pass the server's `workspace` through (D4). Added three tests to `test/cloudDeviceFlow.test.js`: register answering `workspace: null` signs in, `me` answering null returns null, and a later `me` returns a new workspace. The 412 `NO_WORKSPACE` test is unchanged.

_Captured: 2026-09-28 · 2 file change(s)_

---

## T02 — The /new link

Extracted the origin guards into a private `webBase(apiUrl, webOrigin)` in `src/main/cloud/cloudProjects.js`, used by `buildWorkspaceWebUrl` (and so by `buildWebUrl`) and by the new exported `buildNewWorkspaceWebUrl` → `<origin>/new`. Added four tests to `test/cloudProjects.test.js`: https, loopback over http, an http origin for an https API, and non-http or missing origins. The existing builder tests pass unchanged.

_Captured: 2026-09-28 · 2 file change(s)_

---

## T03 — The projects service stops at no workspace

Added `hasWorkspace()` to `src/main/cloud/cloudProjectsService.js`. Signed in without one, `status()` answers `'noWorkspace'` and `refresh()` only scans folders, drops `autoShowPending` and pushes. `loadCandidates` is skipped, `linkBlocked`/`checkSlug` refuse with `noWorkspace`, the cache is not loaded for an empty slug, and `openWorkspaceOnWeb` opens `/new`. As planned, the service stays untested (Electron wrapper, D3).

_Captured: 2026-09-28 · 1 file change(s)_

---

## T04 — Re-read on focus

Added a `focus` listener in `cloudSession.init(window)` (`src/main/cloud/cloudSession.js`). While the state is `signedIn` and `state.workspace` is empty, it calls `refresh()` at most once per `NO_WORKSPACE_FOCUS_MS` (10 s). The throttle stamps on the attempt, not on success, so an unreachable server is not asked on every focus.

_Captured: 2026-09-28 · 1 file change(s)_

---

## T05 — The copy

Wrote `src/renderer/cloudNoWorkspace.js` (`NO_WEB_ORIGIN`, `workspaceRow`, `panel` with 0/1/N wording, `settingsRow`) and `test/cloudNoWorkspace.test.js` (8 tests, including a no-trial/plan/Pro/price guard). Two departures from `plan.md`: the body says briefs are seen "from the web" as `spec.md` has it, dropping the plan example's "and your phone"; and `settingsRow()` also returns the `action` label ("Open Frame Cloud"). "Has a workspace" means a non-empty slug, the same test as `hasWorkspace()` in main.

_Captured: 2026-09-28 · 2 file change(s)_

---

