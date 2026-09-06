## T01 — Add specsRoot / resolveSpecDir to frameStore

Added a `Specs` section to `src/main/frameStore.js` holding `SPECS_DIR_NAME`,
`specsRoot(projectPath)` and `resolveSpecDir(projectPath, slug)`, both exported.
Placed after the Layout section beside the file-shaped resolvers rather than
inside `resolvePath`, and written as bare joins so no `config.files` lookup or
root fallback can reach spec paths. Nothing calls them yet, so the app is
unchanged.

_Captured: 2026-09-06 · 1 file change_

---
