---
keywords: frameStore, meta path resolution, specs directory, storage seam, resolveSpecDir, guard test, path doctrine
related: non-invasive-overlay, migration-consent-scope, frame-bin-out-of-repo, spec-knowledge-layer, cli-spec-command-parity
supersedes: non-invasive-overlay
---

`frameStore` gained `specsRoot()` / `resolveSpecDir()`, and the three modules
that joined `.frame/specs` themselves (`specManager.js:63`,
`frameProject.js:241,933`) now ask for it. Named spec-specific functions beat a
generic `resolveDir(...segments)`, which would have left `'specs'` at every
call site and made the guard unenforceable. Both are flat joins, deliberately
not routed through `resolvePath`: its overlay-then-root branch answers only for
names a legacy project recorded in `config.files`, and specs were never in that
record. `specManager`'s helpers stayed as one-line delegates rather than
rewriting 17 call sites, and no `mkdirSync` moved — `migration-consent-scope`
T05's `isLegacyLayout` gate had to keep guarding the specs-root write.

Rules for future work: never build a `.frame/specs` path outside
`frameStore.js` — `test/metaPathGuard.test.js` fails when a line both calls
`path.join` and carries the `'specs'` literal. Two exemptions, both real:
`frameStore.js` owns the literal, and `src/templates/bin/` ships into a user's
`.frame/bin/` where frameStore is unreachable, so its copy is pinned by the
drift test alongside `scripts/spec-index.js` and `scripts/spec-command-hint.js`
instead. This is where `non-invasive-overlay`'s "`specManager.js` excepted, for
specs" ends. Widening to `index/` or `runtime/` is a named function each.

Chain: spec.md → plan.md → tasks.md → outcome.md
