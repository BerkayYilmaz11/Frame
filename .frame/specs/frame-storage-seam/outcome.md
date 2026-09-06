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
