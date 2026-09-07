## T01 — Add specsRoot / resolveSpecDir to frameStore

Added a `Specs` section to `src/main/frameStore.js` holding `SPECS_DIR_NAME`,
`specsRoot(projectPath)` and `resolveSpecDir(projectPath, slug)`, both exported.
Placed after the Layout section beside the file-shaped resolvers rather than
inside `resolvePath`, and written as bare joins so no `config.files` lookup or
root fallback can reach spec paths. Nothing calls them yet, so the app is
unchanged.

_Captured: 2026-09-06 · 1 file change_

---
## T02 — Widen the frameStore header doctrine to spec folders

Extended `src/main/frameStore.js`'s header: the "no other module joins those
paths" sentence now names `.frame/specs/<slug>` alongside the five meta files,
and a new paragraph records that `non-invasive-overlay`'s `specManager.js`
exception is withdrawn and points at the guard test that replaces it. The
paragraph forward-references `test/metaPathGuard.test.js`, which T06 creates —
the sentence is false until that lands.

_Captured: 2026-09-06 · 1 file change_

---
## T03 — Cover the spec resolvers in frameStore's tests

Added a `Spec paths` section to `test/frameStore.test.js` with two tests: the
flat shape of both resolvers, and that neither moves when every condition
`resolvePath`'s legacy branch needs is present at once — the `config.files`
record, a root file making `isLegacyLayout` true, and a root-level `specs/`
directory. The second test asserts `isLegacyLayout` is true first, so it fails
loudly if the fixture stops reproducing the legacy state it is guarding
against. File now runs 15 tests, all passing.

_Captured: 2026-09-06 · 1 file change_

---
## T04 — Point specManager's helpers at frameStore

Reduced `getSpecsRoot` and `getSpecDir` in `src/main/specManager.js` to one-line
delegates and deleted the module's `SPECS_DIR_NAME`; the 17 call sites, every
`mkdirSync` and the `isLegacyLayout` gate at line 1267 are untouched. No
`path.join` carrying `'specs'` remains in the file. The five spec suites
(49 tests) pass without edits, which is what S5 asks for.

_Captured: 2026-09-06 · 1 file change_

---
## T05 — Point frameProject's two creation sites at the resolver

Replaced the joins at `src/main/frameProject.js:241` (async, in
`runProjectInit`) and `:933` (sync, in `ensureSpecDrivenArtifacts`) with
`frameStore.specsRoot(projectPath)`; both keep their own `mkdir` and `.gitkeep`
writes, and neither changes I/O shape. Two lines changed. With this, no
`path.join` carrying `'specs'` remains anywhere in `src/main` or `src/shared`.
The init, open, toggle and migration suites (62 tests) pass unchanged.

_Captured: 2026-09-06 · 1 file change_

---
## T06 — Add the meta-path doctrine guard

Added `test/metaPathGuard.test.js`: a recursive `src/` scan flagging any line
that calls `path.join` / `path.posix.join` and carries a `'specs'` literal,
exempting `src/main/frameStore.js` (the owner) and `src/templates/bin/` (ships
into `.frame/bin/`, cannot require frameStore — the same answer `scripts/`
gets). Verified by injecting a violation into `specManager.js` and watching the
test name it, then reverting. **Diverges from plan.md step 4**, which says
"every `.js` under `src/`" with no exemption: `implement-launch.js:33,174`
would make that guard permanently red. A second test asserts the scanner still
matches the exempt copies, so it cannot pass by matching nothing.

Followup: plan.md step 4 and the plan report's S1 row still describe the
unexempted guard; correct them or record the exemption there.

_Captured: 2026-09-06 · 1 file change_

---
## T07 — Pin the shipped mirrors to the resolver

Added the drift test to `test/metaPathGuard.test.js`: it extracts the joined
segments from every spec-path join in `scripts/spec-index.js`,
`scripts/spec-command-hint.js` and `src/templates/bin/implement-launch.js`
(resolving each file's own `FRAME_DIR` constant) and asserts each carries the
`['.frame', 'specs']` pair that `frameStore.specsRoot()` produces, failing too
when a mirror stops building a spec path at all. Verified by rewriting
`spec-index.js:37` to `.framev2` and watching it name the file, line and both
segment lists. Full suite: 581 tests, all passing.

_Captured: 2026-09-06 · 1 file change_

---
