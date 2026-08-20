# Windows context parity for Claude Code

## Problem

Since `non-invasive-overlay`, Frame plants no file in the working tree, so an
agent learns about Frame at **launch** rather than by reading something at the
repository root. `terminal-context-boundary` then made the wrapper in
`.frame/bin` the single route for that, and `terminal-session-setup` made the
route survive a shell that reorders `PATH`.

Every one of those mechanisms is gated off on Windows.
`launchEnv.supportsWrappers()` returns false for `win32` and
`shellSetup.deliveryFor()` answers `{ mode: 'none', reason: 'platform' }`
before it ever looks at which shell the lane is running.

What that costs, for Claude Code specifically:

- **A launch Frame composes** falls to the inline branch
  (`aiToolManager.js:860-864`), which appends `--append-system-prompt <preamble>`
  and `--settings <path>` to a line that is then **typed into the PTY**
  (`terminalManager.js:734-737`, `data: command + '\r'`). The preamble is 993
  bytes over 9 lines and contains 6 backticks. A POSIX shell accepts a
  multi-line quoted string as continuation, which is why this path worked on
  macOS; `cmd.exe` has no such continuation and submits at the first newline,
  and PowerShell treats a backtick inside a double-quoted string as its escape
  character. Either way `--settings` sits at the end of the line and is the
  first thing lost.
- **Losing `--settings` costs the spec archive.** That file registers the
  `UserPromptSubmit` and `PreToolUse` hooks that run
  `node .frame/bin/spec-hint.js`, which is how a session learns which earlier
  specs touched the topic and the file being edited. A Windows session loses
  not just "Frame exists" but the project's recorded memory.
- **A hand-typed `claude`** gets nothing at all, silently: no `PATH` entry, no
  wrapper, no shell function.

Before this branch, none of this was true on Windows. Init planted a root
`CLAUDE.md` — a real copy rather than a symlink, since symlinks need Developer
Mode — and Claude Code read it natively with no flags and no quoting. The
overlay removed that delivery without putting the replacement within reach of
the platform.

**Half the replacement is already there.** `prepareLaunchAssets`
(`aiToolManager.js:716-732`) gates only its last line on `supportsWrappers()`:

    if (preamble) writeRuntimeFile(projectPath, preambleFileName(tool.id), preamble);
    if (tool.injection && tool.injection.settingsFlag) {
      settingsPath = writeToolSettings(projectPath, tool, extraSettings);
    }
    const wrapperPath = launchEnv.supportsWrappers() ? writeWrapper(...) : '';

So on Windows today, opening a Frame project already writes a correct
`.frame/runtime/preamble-claude.txt` and a correct
`.frame/runtime/claude-settings.json`. Preamble composition, the global layer,
the spec-driven flag and the hook registration are all platform-neutral and
all working. What is missing is not a mechanism — it is a **carrier**: an
executable on Windows that reads those two files and starts Claude with them.

## Goal

A Claude Code session on Windows knows exactly what one on macOS or Linux
knows, by the same route, with nothing typed into the terminal that a shell
has to parse.

1. **A Node launcher does the work.** A script under `.frame/bin/` resolves the
   real CLI with its own directory removed from `PATH`, reads the preamble and
   settings paths from the runtime files, and starts Claude with
   `spawn(cli, [...frameArgs, ...userArgs], { stdio: 'inherit' })`. Passing
   argv as an array is the point: it removes the shell-quoting layer entirely
   rather than trying to survive it, so backticks, newlines and quotes in the
   preamble stop being a category of bug. Node is already a hard dependency —
   the spec-hint hooks shell out to it.
2. **A `.cmd` trampoline makes it reachable.** `.frame/bin/claude.cmd` is a
   three-line file that hands off to the launcher. `.cmd` rather than `.ps1`
   because only `.cmd` is in the default `PATHEXT`, which is what makes a
   hand-typed `claude` resolve to it.
3. **The `PATH` entry is ungated.** `launchEnv.prependFrameBin` already carries
   the `;` separator (`launchEnv.js:69`); it is reached only after a
   platform check that is about wrappers, not about `PATH`.
4. **The composed line gets short again.** `wrapperLaunchCommand`
   (`aiToolManager.js:761-765`) returns the wrapper on Windows too, so the
   typed line is a path and the 993-byte preamble never reaches a shell.
5. **A shell that reorders `PATH` does not win.** The reason
   `terminal-session-setup` exists — `.frame/bin` pushed to sixth place by a
   version manager — has a direct Windows analogue in nvm-windows. The
   PowerShell equivalent of the init file (a profile-shaped script sourced at
   spawn via `-NoExit -Command`, defining one function per tool) closes it the
   same way, and lets the lane report `installed` rather than `unsupported`.

## Constraints

- **One injection route, not two.** `terminal-context-boundary` removed the
  second route rather than guarding it; a Windows path that reintroduces
  inline flags alongside a wrapper would rebuild exactly the double-injection
  this project already decided against. Where a wrapper exists, Frame
  contributes no flags of its own.
- **A wrapper that cannot run is worse than no wrapper.** `launchEnv.js:18-20`
  states it: shadowing a working CLI with a broken script is the failure to
  avoid. The Windows carrier must pass through transparently when the real CLI
  is not found, and must propagate the child's exit code — there is no `exec`
  to inherit the process the way the POSIX wrapper does.
- `FRAME_NO_WRAP=1` stays the escape hatch, honoured in the Windows carrier as
  it is in the POSIX wrapper, and honoured nowhere else.
- Nothing is written outside `.frame/`. The footprint test
  (`test/frameProjectInit.test.js`) is the standing check and must hold on
  Windows too.
- Generation stays on **project open**, write-if-changed, per tool — the rule
  `terminal-context-boundary` set after a wrapper from three months earlier was
  found still sitting in `.frame/bin/`.
- The launcher's logic must be testable without a Windows machine: platform,
  `PATH` and paths are parameters, not `process` reads, the same shape
  `launchEnv` and `shellSetup` already use.
- No change to what the preamble says or how it is composed. This spec moves
  an existing payload to a platform that cannot currently receive it.

## Success Criteria

- On Windows, a Claude session Frame starts receives the preamble **byte for
  byte** — all 9 lines, all 6 backticks — verified against
  `.frame/runtime/preamble-claude.txt`.
- The same session receives `--settings`, and the spec-hint hooks fire: a
  prompt produces the spec-context block, and an edit to a file with spec
  history produces the file-history block.
- A hand-typed `claude` in a Frame lane on Windows gets both of the above.
- No line typed into a Windows PTY contains a newline.
- With the real `claude` absent from `PATH`, the carrier exits with a clear
  message and does not shadow anything; with `FRAME_NO_WRAP=1` set, it starts
  the real CLI with no Frame arguments.
- The child's exit code reaches the shell unchanged.
- A lane on a Windows shell Frame can set up reports `installed`, not
  `unsupported`, so `laneContext.whenReady` stops paying the fallback delay.
- `npm test` passes on `windows-latest` in CI.
- The init footprint test passes on Windows.

## Out of Scope

- **Codex and Gemini.** Both declare `INJECTION_WRAPPER` and both currently get
  nothing on Windows. That is a real gap and is deliberately deferred: Claude
  parity is the acceptance bar for this spec. The launcher should not be
  designed in a way that blocks them later, but no work is done for them here.
- Changing the preamble's content, the global layer, or the spec-driven flag.
- `cmd.exe` function-equivalent behaviour. `cmd` has no functions and `doskey`
  macros are too fragile to build on; `cmd` gets the `PATH` entry and the
  `PATHEXT` resolution, and nothing more.
- Windows packaging and release artifacts. `package.json` builds `mac` only
  today while the README advertises three platforms; that contradiction is
  real but it is a release-engineering question, not this spec's.
- Rewriting the POSIX wrapper. It works; this spec adds a sibling.

## Open Questions

- **Is there a Windows machine to verify on?** Unit tests can prove the
  launcher composes the right argv, but nothing short of a real PTY proves a
  line was typed and a shell accepted it. Without one, the spec can be
  implemented but not closed — its central claim is exactly the part a unit
  test cannot reach.
- **What does Git Bash / MSYS / WSL get?** `shellFamily()` already resolves
  `C:\…\Git\bin\bash.exe` to `bash` (it strips `.exe` and lowercases), so the
  POSIX wrapper would plausibly run there — it is the platform check upstream
  that stops it, and `test/shellSetup.test.js:94` pins that behaviour with a
  Git Bash path on purpose. Options: write both carriers on Windows and pick by
  lane shell, write only the `.cmd` and let Git Bash run it, or keep Git Bash
  out of scope. Picking by lane shell is the most correct and the most
  machinery; note that `prependFrameBin`'s separator would then have to follow
  the shell rather than the platform, since Git Bash uses `:`.
- **Does the `.cmd` trampoline need to survive a space in the project path?**
  `%~dp0` quoting is the classic failure. Likely yes and likely cheap, but it
  needs a real test, not reasoning.
- **PowerShell vs pwsh.** Windows PowerShell 5.1 and PowerShell 7 differ in
  profile handling and in `-Command` parsing. Which are targeted, and does the
  init script have to work in both?
- **Does `spawn` with `stdio: 'inherit'` give Claude a real TTY on Windows?**
  Claude Code is interactive; if the extra Node process between the shell and
  the CLI degrades the terminal (raw mode, resize, Ctrl-C), the trampoline
  design has to be revisited. This is the largest design risk in the spec.
