# Plan — Frame storage seam — the last meta path joins frameStore

## Architecture

### Resolved plan-time decisions

**Business**

- **In-flight collision — proceed now.** Both target files sit in the active
  footprint of `audit-q3-performance-resources` (implementing) and
  `audit-q3-cross-platform` (planned). Chosen: proceed, accepting rebase risk.
  Rationale: the change is mechanical and confined to path-join lines, while
  those specs work on polling/timers and on Windows path correctness
  respectively; consolidating spec-path construction into one function makes
  the cross-platform work smaller, not larger.

**Technical**

- **Test posture — everything testable.** Chosen over "only the two guard
  tests". Rationale: the testing record (PROJECT_NOTES, 2026-08-29) lists
  `src/main/` and `src/shared/` as Covered across 35 test files, and
  `test/frameStore.test.js` already exists with eight tests — unit-testing two
  new resolvers there is the convention in force, not an addition to it.
- **specManager keeps `getSpecsRoot` / `getSpecDir` as delegates** (silent).
  Both become one-line calls into `frameStore`; the twenty internal call sites
  and the module's shape are untouched. Rewriting all twenty would churn a
  file two in-flight specs are editing, for no gain — the `'specs'` literal
  lands in `frameStore` either way, which is what G2 and S1 ask for.
- **The resolvers resolve; they never create** (silent). `migration-consent-scope`
  T05 gated `startWatching`'s `mkdirSync` of the specs root on
  `frameStore.isLegacyLayout()` (`specManager.js:1270`), and `frameProject`
  creates the folder deliberately at init. Every existing `mkdirSync` stays
  exactly where it is; the resolver returns a string, matching how
  `resolvePath` already behaves.
- **The guard matches path construction, not the word** (silent). A bare
  `'specs'` scan would fail on correct code — `activityLog.js:132` filters it
  as an event key and the renderer compares `viewMode === 'specs'`. The guard
  therefore flags a line only when it both calls `path.join` and contains the
  `'specs'` literal.
- **The guard follows the project's own scanning precedent** (silent).
  `projectAgnostic.test.js:180-183` reads source files and asserts on their
  content; the new guard is written the same way rather than inventing a
  lint step or a new dependency.

### Shape

`frameStore` gains a two-function Specs section beside its existing typed
read/write helpers:

```js
function specsRoot(projectPath)            // <project>/.frame/specs
function resolveSpecDir(projectPath, slug) // <project>/.frame/specs/<slug>
```

Both are flat joins over `FRAME_DIR` — deliberately **not** routed through
`resolvePath`, whose overlay-then-root branch answers only for the six names in
`FRAME_FILES` recorded in a legacy project's `config.files` (C3, S2). Specs
were never in that record, and `specManager.js:63` has always been
unconditional; passing them through `resolvePath` would introduce a legacy
lookup that has never existed and would change behaviour.

The three existing joins become calls:

| Today | After |
| --- | --- |
| `specManager.js:63` `path.join(projectPath, FRAME_DIR, SPECS_DIR_NAME)` | `frameStore.specsRoot(projectPath)` |
| `specManager.js:67` `path.join(getSpecsRoot(p), slug)` | `frameStore.resolveSpecDir(p, slug)` |
| `frameProject.js:241` `path.join(frameDirPath, 'specs')` | `frameStore.specsRoot(projectPath)` |
| `frameProject.js:933` `path.join(projectPath, FRAME_DIR, 'specs')` | `frameStore.specsRoot(projectPath)` |

`SPECS_DIR_NAME` is deleted from `specManager.js`; the literal survives only
inside `frameStore.js`.

`scripts/` and the `.frame/bin/` copies are untouched (C4). Those four
spec-path scripts ship into the user's project, where `node_modules` and
Frame's tree are unreachable — `brief-context.js:20` records the rule. Their
duplication is answered by a drift test that asserts the app's resolver and
the shipped literal agree (S3), never by a shared require.

## Files

- `src/main/frameStore.js` — **Modified.** Adds the `specsRoot` /
  `resolveSpecDir` pair and their exports; extends the header to say specs now
  resolve here too.
- `src/main/specManager.js` — **Modified.** `getSpecsRoot` and `getSpecDir`
  delegate to `frameStore`; `SPECS_DIR_NAME` removed. No call site changes.
- `src/main/frameProject.js` — **Modified.** The two init-time joins call
  `frameStore.specsRoot()`; both keep their own `mkdir` and `.gitkeep` writes.
- `test/frameStore.test.js` — **Modified.** Unit tests for the two resolvers:
  the shape of each answer, and that neither consults `config.files` nor falls
  back to the project root.
- `test/metaPathGuard.test.js` — **New.** The two cross-module invariants: the
  source-scanning guard over `src/`, and the drift test pinning the resolver
  to the literal the `.frame/bin` scripts use.

## Footprint

- src/main/frameStore.js
- src/main/specManager.js
- src/main/frameProject.js
- test/frameStore.test.js
- test/metaPathGuard.test.js

## Dependencies

None. The guard uses `node:fs` and the project's existing `node --test`
runner; no lint tooling and no package is added, which also keeps the suite
runnable in CI, where `npm ci` deliberately does not run.

## Sequencing

1. **Add the resolvers to `frameStore`.** Write `specsRoot` and
   `resolveSpecDir`, export both, and extend the module header to name specs
   alongside the files it already lists. Add their unit tests to
   `test/frameStore.test.js` in the same step: each returns the flat
   `.frame/specs[/slug]` answer, and a legacy project with a `config.files`
   record and a root-level `specs/` directory still resolves to the overlay
   (C3, S2). Nothing calls them yet, so the app is unchanged.

2. **Point `specManager` at them.** Reduce `getSpecsRoot` and `getSpecDir` to
   delegates, delete `SPECS_DIR_NAME`. The twenty internal call sites and every
   `mkdirSync` — including the `isLegacyLayout`-gated one at line 1270 — stay
   as they are (S4).

3. **Point `frameProject` at them.** Replace the two init-time joins with
   `frameStore.specsRoot(projectPath)`, leaving the `mkdir` and `.gitkeep`
   writes untouched so a fresh project is created exactly as before (S4).

4. **Lock the doctrine.** Add `test/metaPathGuard.test.js` with the guard —
   every `.js` under `src/`, excluding `frameStore.js`, has no line that both
   calls `path.join` and contains `'specs'` (S1) — and the drift test that
   asserts `frameStore.specsRoot()` agrees with the `.frame/bin` scripts'
   literal (S3). This step follows 2 and 3 because the guard cannot pass until
   they land.
