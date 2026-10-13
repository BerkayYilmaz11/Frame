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
## T02 — Declare the `spec-close` mode, its reasons and `spec.close_checked`

Added the `spec-close` mode to `hint.injected` and `hint.quiet` through one shared `HINT_MODES`
list, four reasons to `HINT_REASONS` (`orchestrated`, `before-baseline`, `no-close-time`, and T01's
`git-unavailable`, which `plan.md` did not list), a `SPEC_CLOSE_REASON_TEXT` map where `no-index`
reads as "tasks.json could not be read", and the `spec.close_checked` event with host, slug, a
`CLOSE_VERDICTS` enum and a defect count. `PRIVACY.md` gained a "Spec close reminders" bullet in the
same commit. Files: `src/shared/activityEvents.js`, `PRIVACY.md`, `test/activityEvents.test.js`.
Followup: `spec.close_checked` shows only under the Activity panel's "All" filter until
`src/renderer/activityPanel.js` maps it to the `specs` group — that file is outside this plan.

_Captured: 2026-10-13 · 3 file changes_

---
## T03 — The close script: `spec-close.js <slug> [--json] [--strict]`

Added `scripts/spec-close.js`, which prints one spec's task count and then one line per close item —
`ok`, `missing` with the digest shape, or each named defect (`no-front-matter`, `no-keywords`,
`first-sentence-too-long`, `no-chain-line`) — exits 0 unless `--strict`, and writes only its
`spec.close_checked` row; `scripts/spec-index.js` now exports `firstSentence`, `firstParagraph` and
`DIGEST_LINE_CAP`, so the length it measures is the one a hint carries. Run over this repo's 50
digests it flags 12, all for the first sentence, the figure `spec.md` measured by hand. Beyond
`plan.md`: a spec that is not closed reports `not due` and records no row, an unknown slug is a
one-line error, and a `.frame/bin/` whose `spec-index.js` predates the exports says the length was
not checked instead of reporting `ok`. Files: `scripts/spec-close.js`, `scripts/spec-index.js`,
`scripts/spec-close-state.js` (exports `SLUG_RE`), `test/spec-close.test.js`, `test/metaPathGuard.test.js`.

_Captured: 2026-10-13 · 5 file changes_

---
## T04 — Same-turn reminder in `docs-hint.js pre-edit`

Wired `scripts/docs-hint.js` to call `spec-close-state.js`'s `reminder()` on the path that used to
return in silence — a shell or edit call that is not a meta write — behind a guarded require, emit
the line as `PreToolUse` context, and write one `hint.quiet` row per reason the helper reports and
one `hint.injected` row per reminder, all under mode `spec-close`. A meta write still delivers only
its section and does not consume the reminder, which arrives on the next call. Files:
`scripts/docs-hint.js`, `test/docs-hint.test.js` (12 new cases: Claude Code `Bash` and `Edit`, Codex
shell and `apply_patch`, each quiet reason, an unreadable `tasks.json`, a `.frame/bin/` without the
helper, the inline limit with five 120-character slugs).

_Captured: 2026-10-13 · 2 file changes_

---
