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

## T02 — Teach Claude's launch to pass paths instead of prose

Added `promptFileFlag: '--append-system-prompt-file'` to Claude's injection
record, made `prepareLaunchAssets` return `preambleRel`/`settingsRel` as
project-relative forward-slash paths, and moved the wrapper-less flag
composition into a new exported pure `inlineInjectionFlags(tool, assets,
platform)` that `getLaunchCommand` now calls. The file flag is preferred only
where `!supportsWrappers(platform)`, so POSIX keeps the string form and no
version-dependent flag reaches the path that works today (C3). Files:
`src/main/aiToolManager.js`, `test/aiToolLaunch.test.js` (new, 12 tests, loads
the module with `electron` stubbed since no test had needed it before). No
deviation from `plan.md`.

_Captured: 2026-08-20 · 2 file changes_

---

## T03 — Write the `.frame/bin/<id>.cmd` wrapper template

Added `getCmdWrapperTemplate(toolCommand, options)` to `frameTemplates.js`:
self-excluding `where` resolution, exit 127 when the CLI is absent,
`FRAME_NO_WRAP` and already-composed pass-throughs, a `%CD%`-upward walk to
`.frame\`, quoted paths throughout, and one `call`/bare `exit /b` tail so the
child's exit code arrives unchanged. Returns `''` for a tool with no
`promptFileFlag`. **Deviation:** the already-composed check scans `%~1` one
argument at a time in a `:frame_scan_args` subroutine instead of the plan's
substring search over `%*` — `%*` expands at parse time, so a user argument
carrying `&` or `|` would be re-parsed as syntax. Files:
`src/shared/frameTemplates.js`, `test/frameTemplates.test.js` (14 new tests,
string-only — cmd.exe is not on this machine and T10's protocol is the real
verification).

_Captured: 2026-08-20 · 2 file changes_

---

## T04 — Let `writeWrapper` choose its family and self-gate

`writeWrapper` now takes its filename and family from `launchEnv`
(`wrapperFileName` with `canPassPaths: !!injection.promptFileFlag`,
`wrapperFamily`), picks `getCmdWrapperTemplate` or `getWrapperTemplate`, skips
the `0o755` chmod for the `cmd` family, and returns `''` for a tool that earns
no wrapper; `prepareLaunchAssets` dropped its `supportsWrappers()` call and
just calls it. Verified by forcing win32 through `launchEnv` in a scratch
project: only `.frame/bin/claude.cmd` is written, and the POSIX run still
produces all three wrappers at mode 755. Also recorded, in
`wrapperLaunchCommand`, why the `.cmd` is deliberately *not* the composed
launch line. Files: `src/main/aiToolManager.js`. No deviation from `plan.md`.

_Captured: 2026-08-20 · 1 file change_

---
