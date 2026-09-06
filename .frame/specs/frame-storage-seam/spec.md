---
keywords: frameStore, meta path resolution, specs directory, storage seam, resolveSpecDir, guard test, path doctrine
related: non-invasive-overlay, migration-consent-scope, frame-bin-out-of-repo, spec-knowledge-layer, cli-spec-command-parity
supersedes: non-invasive-overlay
---

# Frame storage seam — the last meta path joins frameStore

## Problem

`non-invasive-overlay` made `frameStore.js` the one module that knows where a
project's meta files live, and its own header still says so. But that spec
wrote in an exception, recorded verbatim in its digest:

> *"never join a meta path outside `frameStore.js` (`specManager.js` excepted,
> for specs)"*

The exception is now the only gap in the doctrine, and it did not stay in one
module. Three places in `src/main/` answer "where do specs live", each on its
own:

- `specManager.js:63` — `path.join(projectPath, FRAME_DIR, SPECS_DIR_NAME)`
- `frameProject.js:241` — `path.join(frameDirPath, 'specs')`
- `frameProject.js:933` — `path.join(projectPath, FRAME_DIR, 'specs')`

Today the cost is small: three copies of a rule that has not changed. It grows
in two directions. Every new module that touches specs adds a fourth copy, and
nothing catches it — the tracked meta files have a guard by convention, specs
have none. And specs are the largest entry in `FRAME_FILE_CLASSES.data`, so the
gap sits in the most-written part of `.frame/`: any later work that changes
where spec content comes from has to find all three, and a miss fails silently.

## Goal

One resolver, and a test that keeps it the only one.

- **`frameStore` resolves spec paths**, through named, spec-specific functions
  — a root (`specsRoot`) and a folder (`resolveSpecDir`) — not a generic
  segment joiner. A spec is a folder of files rather than a single file, so
  these sit beside the existing file-shaped resolvers rather than inside them.
- **Every spec path in `src/` comes from them.** `specManager.js` and
  `frameProject.js` ask instead of joining, and the `'specs'` literal exists
  in exactly one file afterwards.
- **A guard test** fails when a `.frame/specs` path is built outside
  `frameStore.js`, so the doctrine is enforced rather than remembered.
- **Nothing else changes.** Same paths on disk, same reads, same writes.

## Constraints

- **This reverses one rule of `non-invasive-overlay`**, named above, and
  declares it in `supersedes:` — the same shape as `frame-bin-out-of-repo`'s
  reversal of that spec's T15. The rest of that spec stands.
- **The resolver is spec-specific, not generic.** A `resolveDir(projectPath,
  ...segments)` would leave `'specs'` at every call site, which moves the
  duplication instead of removing it and makes the guard test below
  unenforceable — a caller legitimately passing `'specs'` is indistinguishable
  from a violation. Widening to `index/` or `runtime/` later is a named
  function each, and is not done here.
- **No legacy fallback for specs.** `resolvePath`'s overlay-then-root branch
  exists for the six names in `FRAME_FILES` when a legacy project's
  `config.files` record lists them (`migration-consent-scope`). Specs were
  never in that record, and `specManager.js:63` has always been unconditional.
  The spec resolver must be flat — `<project>/.frame/specs/<slug>`, no branch.
  Inheriting the legacy logic would change behaviour, which is the one real
  risk in this work.
- **`scripts/` keeps its own resolution, and a shared module is not available
  to it.** All four spec-path scripts — `spec-index.js`, `spec-command-hint.js`,
  `spec-context.js`, `spec-hint.js` — ship into `.frame/bin/`, where the rule
  is documented in `brief-context.js:20`: *"Dependency-free and app-tree-free,
  because it ships into `.frame/bin/`"*, with `node_modules` unreachable
  (`:136`). A `require` into `src/` resolves inside the *user's* project and
  fails there, silenced by the hook guard. `frameStore`'s header already
  accepts this mirroring. The duplication is answered by a test, not by
  coupling.
- **Zero user-visible change.** This is a refactor: no feature, no UI, no
  channel, no payload, no watcher timing moves.
- **frameStore stays synchronous and disk-backed.** Its "every read hits disk"
  guarantee is load-bearing precisely because agents edit these files with
  their own tools; nothing here introduces a cache or an async read.
- **frameStore gains resolution only.** Spec parsing, `status.json` handling,
  phase logic and reports stay in `specManager.js`. The seam moves paths, not
  behaviour.

## Success Criteria

- When `src/` is scanned after this work, then no `path.join` outside
  `frameStore.js` builds a path containing `'specs'`, and an automated guard
  fails if one appears. The bare word elsewhere — `activityLog.js`'s key
  filter, the renderer's `viewMode === 'specs'` — is not a path and is not
  matched.
- When a spec folder is resolved for any slug, then the answer is
  `<project>/.frame/specs/<slug>` unconditionally, with no legacy-root branch
  and no dependence on `config.files`.
- When the resolver is compared against the literal the `.frame/bin` scripts
  use, then a test asserts the two agree, so the mirrored rule cannot drift
  unnoticed.
- When the app runs, then every spec surface — list, search, read, rename,
  status update, reports, the specs watcher and agent dispatch — behaves as it
  did before, with no path changed and no timing shifted.
- When `npm test` runs, then the existing spec and frameStore tests pass
  unchanged, without edits to accommodate the refactor.

## Out of Scope

- A write notification on `frameStore` — no consumer exists until sync does.
- Sync, auth, a third `gitSharing` mode, and every other server-side concern.
- The renderer's transport seam (Electron IPC vs a second transport) — the
  other axis, its own spec.
- Resolvers for `index/`, `runtime/` and the other `.frame/` directories —
  added when something asks, one named function each.
- `scripts/spec-index.js`, `spec-command-hint.js`, `spec-context.js` and
  `spec-hint.js` themselves — `spec-knowledge-layer` and
  `cli-spec-command-parity` own those, and they run outside the app.
- Entity-granular writes for `tasks.json` or spec files.
