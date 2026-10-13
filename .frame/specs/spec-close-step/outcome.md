## T01 — Close-state helper: closed specs, close items, baseline, cache and the reminder

Added `scripts/spec-close-state.js` — closed specs read from `.frame/tasks.json`, the one-item
`CLOSE_ITEMS` list, the baseline and mtime-and-size cache in `.frame/runtime/spec-close/state.json`,
the orchestration check, per-session dedup and the one-line reminder — with 34 cases in
`test/spec-close-state.test.js`. Departed from `plan.md` in three places: a fourth quiet reason,
`git-unavailable`, for a git that will not answer (the plan had it stay quiet with no reason of its
own, and `orchestrated` would have sent a reader looking for a branch that is not there); each quiet
reason is returned once per session rather than on every call, because a spec closed before the
baseline would otherwise add an activity row to every tool call for as long as it has no digest; and
an unreadable `tasks.json` reuses the existing `no-index`, reported once per change of the file. Also
beyond the plan: a non-git project is treated as not orchestrated without asking git, a date-only
`completedAt` counts as the end of that day, and a slug that is not a plain folder name is ignored.

_Captured: 2026-10-13 · 2 file changes_

---
