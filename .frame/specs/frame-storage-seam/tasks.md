# Tasks — Frame storage seam — the last meta path joins frameStore

- T01 · Add `specsRoot(projectPath)` and `resolveSpecDir(projectPath, slug)` to `src/main/frameStore.js` as flat joins over `FRAME_DIR`, never routed through `resolvePath`, and export both
- T02 · Extend `src/main/frameStore.js`'s header to name spec folders alongside the meta files it already lists, recording that `non-invasive-overlay`'s `specManager.js` exception is withdrawn
- T03 · Add resolver unit tests to `test/frameStore.test.js`: each returns the flat `.frame/specs[/slug]` answer, and a legacy project carrying a `config.files` record plus a root-level `specs/` directory still resolves to the overlay
- T04 · Reduce `getSpecsRoot` and `getSpecDir` in `src/main/specManager.js` to one-line delegates and delete the module's `SPECS_DIR_NAME`, leaving every call site and every `mkdirSync` — including the `isLegacyLayout`-gated one at line 1270 — untouched
- T05 · Replace the two joins at `src/main/frameProject.js:241` and `:933` with `frameStore.specsRoot(projectPath)`, keeping both sites' `mkdir` and `.gitkeep` writes as they are
- T06 · Add `test/metaPathGuard.test.js` with the source-scanning guard: no `.js` file under `src/` other than `frameStore.js` has a line that both calls `path.join` and carries the `'specs'` literal, excluding `src/templates/bin/` because those files ship into `.frame/bin/` under the same rule as `scripts/`
- T07 · Add the drift test to `test/metaPathGuard.test.js` asserting `frameStore.specsRoot()` agrees with the `.frame/bin` literal used by `scripts/spec-index.js`, `scripts/spec-command-hint.js` and `src/templates/bin/implement-launch.js`
