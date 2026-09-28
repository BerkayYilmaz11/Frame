# Outcome — Frame Cloud no workspace

## T01 — Pin the null workspace in the sign-in core

Added doc-comment lines to `runSignIn` and `refreshSession` in `src/main/cloud/deviceFlow.js` saying `session.workspace` may be null, with no code change, since both already pass the server's `workspace` through (D4). Added three tests to `test/cloudDeviceFlow.test.js`: register answering `workspace: null` signs in, `me` answering null returns null, and a later `me` returns a new workspace. The 412 `NO_WORKSPACE` test is unchanged.

_Captured: 2026-09-28 · 2 file change(s)_

---

## T02 — The /new link

Extracted the origin guards into a private `webBase(apiUrl, webOrigin)` in `src/main/cloud/cloudProjects.js`, used by `buildWorkspaceWebUrl` (and so by `buildWebUrl`) and by the new exported `buildNewWorkspaceWebUrl` → `<origin>/new`. Added four tests to `test/cloudProjects.test.js`: https, loopback over http, an http origin for an https API, and non-http or missing origins. The existing builder tests pass unchanged.

_Captured: 2026-09-28 · 2 file change(s)_

---

