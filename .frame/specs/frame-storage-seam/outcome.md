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
