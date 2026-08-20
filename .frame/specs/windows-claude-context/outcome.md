# Outcome — Windows context parity for Claude Code

## T01 — Put `.frame/bin` on Windows `PATH`, and name what lives there

Dropped the `supportsWrappers` gate from `launchEnv.prependFrameBin` — the check
was about wrappers, the function is about `PATH`, and gating it is what kept the
`;` separator on line 69 unreachable. Added `wrapperFamily(platform)` (`'posix'`
| `'cmd'`) and `wrapperFileName(toolId, { platform, canPassPaths })`, which
returns `''` for a tool that earns no wrapper here; `canPassPaths` defaults to
false so Windows opts a tool in explicitly rather than by a hardcoded list.
Files: `src/main/launchEnv.js`, `test/launchEnv.test.js` (8 new tests, platform
as a parameter). No deviation from `plan.md`.

_Captured: 2026-08-20 · 2 file changes_

---
