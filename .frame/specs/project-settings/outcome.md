# Outcome — project-settings

## T01 — Explicit mode parameter on `gitExclude.ensure()`

Added an optional `mode` parameter to `ensure(projectPath, mode)` in src/main/gitExclude.js: `'repo'` joins the tracked check in the removal branch, so the block is never written and an existing one is stripped; `'local'`/absent keep the conditional logic with tracked state still overriding (D3). Extended test/gitExclude.test.js with four mode cases: repo-mode never writes, repo-mode strips an existing block, local behaves as default, local on a tracked repo still removes. No deviation from plan.md; full suite green (326 tests).

_Captured: 2026-07-30 · 2 file change(s)_

---

## T02 — `src/main/gitSharing.js`, the sharing-semantics owner

Created src/main/gitSharing.js (Electron-free): `getState` returning `{ isRepo, declared, tracked, effective }` with D3's tracked-wins rule, `resolveMode` deriving and persisting an absent mode once (D4), `setMode` as the single write path (config → ensure(mode) → gitignore, index never touched), `ensureOnOpen`, `writeFrameGitignore`, and `getRepoSignal` (remote presence + distinct authors over 200 commits). The `.frame/.gitignore` signed block uses begin/end marker comments rather than gitExclude's comment-plus-one-line form — the block is multi-line, so an explicit end marker is what keeps unsigned user lines safe; contents per plan (runtime/, index/, implement-permissions.json, worktrees/, orchestration/, bin/, *.bak, *.tmp, *.corrupt-*). Authored test/gitSharing.test.js: 24 cases over derivation, the state matrix, setMode side effects on tmp repos, gitignore idempotence/preservation, and the repo signal.

_Captured: 2026-07-30 · 2 file change(s)_

---
