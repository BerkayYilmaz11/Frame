# Outcome — Terminal Context Boundary

## T01 — Add pure `src/main/launchEnv.js`

Added `src/main/launchEnv.js` with `supportsWrappers(platform)`, `frameBinDir(projectPath)` and `prependFrameBin(pathValue, projectPath, platform)`; it requires only `node:path` and `frameConstants`. `prependFrameBin` removes a later copy of the bin directory rather than returning early when it is present anywhere — an entry that is not *first* is useless, since a real `claude` earlier on `PATH` would win. Platform is a defaulted parameter so the non-POSIX branch is testable without stubbing `process.platform`. No consumer yet; T09 wires it into the PTY spawn env.

_Captured: 2026-08-01 · 1 file change_

---
## T02 — Add `test/launchEnv.test.js`

Added 12 cases: `frameBinDir` with and without a project, the POSIX gate, first-position prepending, idempotence, move-not-duplicate when the entry sits behind a real CLI, an untouched `win32` value, an absent `PATH`, and empty-segment handling. Purity is asserted twice — a source scan for forbidden requires, plus a reload through a poisoned `Module._load` that throws on `fs`/`electron` and then exercises `prependFrameBin`, so a require added later fails rather than slipping past a string match.

_Captured: 2026-08-01 · 1 file change_

---

## T03 — Recursion-safe wrapper that emits its tool's flags

Rewrote `getWrapperTemplate`: it resolves the real CLI at run time via `PATH="$(path_without_self)" command -v <tool>` and execs `"$REAL_CLI"`, builds a `frame_args` array from `promptFlag`/`settingsFlag` (settings only when that file exists), keeps the bare-exec fallback, and exits 127 with a named message when the CLI is absent. Run-time resolution over a write-time absolute path so a version-manager switch is picked up at once. Deviation from plan.md: the three existing wrapper assertions in `test/frameTemplates.test.js` encoded the old `exec codex …` shape and were updated here rather than in T04, since a task that leaves the suite red is not finished — T04 still adds the new cases. Verified end to end in a sandbox: no self-exec with the wrapper first on `PATH`, `--resume`/`-p` pass through, missing preamble and missing settings both degrade correctly.

_Captured: 2026-08-01 · 2 file changes_

---
