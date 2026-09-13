---
keywords: agent ready, laneStatus, agent-input, cursor position report, DECXCPR, dispatch timeout, prompt not sent, Claude Code 2.1.270
related: agent-dispatch, terminals-home-agents, audit-q3-cross-platform, resize-storm-watchdog
---

# Agent readiness when the terminal never goes quiet

> **What we're fixing:** Every spec/task dispatch ("Break into Tasks",
> "Generate Plan", task ▶) cold-starts Claude Code and then aborts after 15 s
> with *"Claude Code didn't become ready — prompt not sent"*, even though the
> CLI is up and sitting at its input line. The lane never reaches
> `agent-input` because Frame's readiness signal requires 1.8 s of terminal
> silence, and Claude Code 2.1.270 never gives it one.

## User's request (original, Turkish)

> break into tasks buttonu var spec'e girdiğimde. buna tıklayınca claude
> session'ı açıldı terminalde Claude Code didn't become ready — prompt not
> sent uyarısı aldım sonra. […] nedeni nedir araştır.
>
> bunu spec haline getir tasklara bölme

## Problem

`agentDispatch.dispatch()` waits for the lane to report `agentName` **and**
`status === 'agent-input'` (`_waitForAgentReady`, `AGENT_READY_TIMEOUT_MS =
15000`). The only producer of `agent-input` is `laneStatus._classifyQuiet`,
which runs solely after `QUIET_MS = 1800` of no PTY output.

Diagnosed on 2026-09-13 (investigation only, no code changed):

- Claude Code asks the terminal for its cursor position (`ESC[?6n`) on
  every render. xterm.js answers (`ESC[?row;colR`), the answer triggers a
  re-render, which asks again. Measured on a raw pty that answers like
  xterm.js: **93 requests / 109 output chunks in 20 s of an idle CLI, longest
  silence 0.22 s**. The lane therefore sits in `agent-working` forever;
  `_waitForAgentReady` times out; the staged prompt is never injected.
- The loop is not new — `resize-storm-watchdog` / `terminalInput.js`
  measured it as an IPC-volume problem ("a working agent produced ~55 msg/s")
  — but until CLI **2.1.270 (installed 2026-09-12 23:15)** it only ran while
  the agent was working; an idle agent went quiet and classified
  `agent-input`. Since that install `main.log` shows the ipcWatchdog line
  (`stdin: cursor-report ×130+` per 5 s) every minute around the clock,
  including an overnight idle lane. Readiness detection was silently
  coupled to a CLI behaviour that changed under it.
- Secondary: the new Claude Code UI no longer draws the `╭─` frame or the
  `│ >` prompt line; its prompt is `❯`. `laneStatus.AGENT_PATTERNS` still
  fingerprints the old frame. On macOS/Linux this is masked by
  process-name detection; on Windows (`FOREGROUND_RELIABLE = false`) it is
  the *only* agent signal, so agent detection there is broken outright.

Cost of not fixing: every dispatch path in Frame (spec commands, task runs,
orchestrator worker spawn, `startDefaultAgent` follow-ups) fails on the
current Claude Code, and the same "quiet = done" assumption feeds every
surface that shows "Awaiting input" (Home agents widget, sidebar chips,
status bar, spec next-action bars).

## Goal

A lane whose agent is idle at its input line is reported as `agent-input`
— and a cold-started CLI is reported ready to `dispatch()` — **regardless
of whether the TUI keeps exchanging control queries with xterm**. Concretely:

1. `laneStatus` distinguishes *content output* from *terminal protocol
   chatter* (cursor-position, device-attribute and similar query/answer
   traffic). Chatter must not reset the quiet clock or count as "working".
   Where the classification runs (renderer buffer scan vs. main-side
   `ptyManager` flush) is a plan decision; the invariant is that a
   continuous `ESC[?6n` ⇄ `ESC[?…R` exchange with no visible change leaves
   the lane classifiable.
2. `_waitForAgentReady` resolves true for the current Claude Code within its
   existing 15 s budget on a cold start in this project, with the prompt
   injected once (no double Enter, no injection into a bare shell).
3. `AGENT_PATTERNS` recognises the current Claude Code TUI (`❯` prompt line,
   the banner/status-line glyphs) in addition to the old frame, so the
   Windows fingerprint path and the Unix "agent under a wrapper" fallback
   work again. Old-frame patterns stay for older CLIs.
4. A regression guard: a fixture that replays a captured 2.1.270 idle
   stream (with the query/answer loop) through the classifier and asserts
   `agent-input`; and a captured *working* stream asserting `agent-working`.

## Constraints

- **`agent-dispatch` decisions stand:** readiness is derived from
  `laneStatus`, never from blind timeouts; `agent-approval` is *not* ready
  (a CLI stuck on a trust/permission chooser must still time out rather
  than receive the prompt). The 15 s fallback remains the abort path.
- **`terminals-home-agents` vocabulary stands:** the status set
  (`idle | running | agent-working | agent-approval | agent-input`) and
  `statusLabel`/`attentionMark` do not change; consumers must not need
  edits.
- **`terminalInput.js` microtask coalescing and the reply path are not
  touched.** Replies to `ESC[?6n` must keep flowing at once — a TUI blocks
  its frame waiting for them (see PROJECT_NOTES 2026-09-10). Suppressing or
  delaying the answers is not an acceptable way to get silence.
- No new dependency; no xterm.js upgrade as part of this.
- `FOREGROUND_RELIABLE` gating from `audit-q3-cross-platform` is respected:
  Unix keeps process-name-first detection; the fingerprint list is the
  Windows path and must be kept CLI-version-tolerant.
- Frame's own IPC budget (`ipcWatchdog` terminal threshold) is unchanged;
  this spec does not try to stop the loop itself — that is Claude Code's
  behaviour and outside Frame's control.

## Success Criteria

- When "Break into Tasks" (or any spec/task dispatch) cold-starts Claude
  Code 2.1.270 in a new Frame, then within 15 s the lane shows
  `Claude Code · Awaiting input` and the staged prompt appears in the CLI's
  input line exactly once, and no "didn't become ready" toast is shown.
- When a Claude Code lane has finished a turn and is idle while the
  cursor-report loop is running, then `laneStatus.getStatus()` returns
  `agent-input` within ~2 s of the last *content* output.
- When Claude Code is actively producing content (tool output, streaming
  text), then the lane stays `agent-working` — protocol filtering must not
  make a working agent look idle.
- When a captured 2.1.270 idle stream is fed to the classifier in a unit
  test, then it yields `agent-input`; a captured working stream yields
  `agent-working`; a captured permission dialog yields `agent-approval`.
- When the foreground process name is unavailable (Windows path, or a
  wrapper process on Unix), then a lane showing the current Claude Code
  screen is still detected as an agent (`agentName` truthy).
- When an older Claude Code frame (`╭─ … │ >`) is on screen, then detection
  still works — no regression for users on older CLIs.
- When the CLI is killed inside the lane, then the lane still drops to
  `idle` on the next process poll (the `agent-dispatch` follow-up fix about
  leftover TUI frames is preserved).

## Out of Scope

- Stripping `CLAUDECODE` / `CLAUDE_CODE_CHILD_SESSION` from the PTY env
  (separate finding, see `sessions-from-transcripts` follow-ups).
- Reducing the cursor-report IPC volume further (`resize-storm-watchdog`).
- Wider Windows terminal parity (`audit-q3-cross-platform`).
- Changing the 15 s readiness budget or adding a user-facing retry.

## Open Questions

- **Where to filter protocol chatter.** (a) In the renderer: `laneStatus`
  inspects the flushed chunk (or a "content bytes" flag ptyManager attaches
  to `TERMINAL_OUTPUT_ID`) and only resets `lastActivityAt` for non-query
  output. (b) In main: `ptyManager` classifies each flush and emits a
  separate `contentAt` timestamp. (a) keeps the change in one module; (b)
  spares the renderer a per-flush scan.
- **Should readiness accept a screen-based signal in addition to quiet?**
  E.g. "agent process in foreground + `❯` prompt line visible at the
  cursor row" ⇒ `agent-input` even mid-loop. Faster and independent of
  timing, but reintroduces a TUI fingerprint into the primary Unix path
  that `agent-dispatch` deliberately kept process-based.
