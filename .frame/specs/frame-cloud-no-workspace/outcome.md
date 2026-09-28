# Outcome — Frame Cloud no workspace

## T01 — Pin the null workspace in the sign-in core

Added doc-comment lines to `runSignIn` and `refreshSession` in `src/main/cloud/deviceFlow.js` saying `session.workspace` may be null, with no code change, since both already pass the server's `workspace` through (D4). Added three tests to `test/cloudDeviceFlow.test.js`: register answering `workspace: null` signs in, `me` answering null returns null, and a later `me` returns a new workspace. The 412 `NO_WORKSPACE` test is unchanged.

_Captured: 2026-09-28 · 2 file change(s)_

---

