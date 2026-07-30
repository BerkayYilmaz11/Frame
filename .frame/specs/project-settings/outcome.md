# Outcome — project-settings

## T01 — Explicit mode parameter on `gitExclude.ensure()`

Added an optional `mode` parameter to `ensure(projectPath, mode)` in src/main/gitExclude.js: `'repo'` joins the tracked check in the removal branch, so the block is never written and an existing one is stripped; `'local'`/absent keep the conditional logic with tracked state still overriding (D3). Extended test/gitExclude.test.js with four mode cases: repo-mode never writes, repo-mode strips an existing block, local behaves as default, local on a tracked repo still removes. No deviation from plan.md; full suite green (326 tests).

_Captured: 2026-07-30 · 2 file change(s)_

---
