## T01 — check-freshness runs without structure helpers

Made `structure-read` and `structure-switch` optional requires in `scripts/check-freshness.js`; `mapEnabled` now needs both present plus the project's opt-in, otherwise only the notes/tasks/quickstart checks run. Dropped `check-freshness.js` from `ENTRY_REQUIRES` in `src/main/structureBootstrap.js` and updated the activation test in `test/structureBootstrap.test.js` that encoded the old dependency. Added a helper-less copy test to `test/structureSwitch.test.js`.

_Captured: 2026-10-22 · 4 file change(s)_

---
## T02 — Lean .frame/bin for projects without the map

Added `STRUCTURE_ENTRIES` / `STRUCTURE_HELPERS` to `src/main/structureBootstrap.js`; `stageParserScripts` decides `withMap` from `structureEnabled(projectPath)` or an existing `.frame/bin/update-structure.js` (overridable via `options.structureMap`), drops structure sources and entries otherwise, computes preflight requirements from the staged entries only, and seeds `intent-map.json` only with the map. Added off / old-bin / on tests to `test/structureBootstrap.test.js` and changed the off-init assertion in `test/structureSwitch.test.js` (the tools no longer ship there).

_Captured: 2026-10-22 · 3 file change(s)_

---
## T03 — Hint hooks follow the opt-in

Added `hintHooksFor` to `src/shared/frameTemplates.js` and made `installSpecHintHook` and `installCodexHintHook` in `src/main/frameProject.js` install its result for `structureEnabled(projectPath)`; the full template sets still drive recognition, upgrade and removal. Tests in `test/sessionHookInstall.test.js` (off → no module-hint, opt-in → present, removal clears all; removal deletes an emptied settings file, so the assertion allows that) and `test/codexHookInstall.test.js` (added only for an opted-in project, never removed by an off one).

_Captured: 2026-10-22 · 4 file change(s)_

---
## T04 — REFERENCE and QUICKSTART templates follow the opt-in

Added a `structureMap` option (default off) to `getReferenceTemplate` and `getQuickstartTemplate` in `src/shared/frameTemplates.js` and passed `structureEnabled(projectPath)` from the three write sites in `src/main/frameProject.js`; opted-in output was diffed against the previous version and is byte-identical. Four existing tests in `test/projectAgnostic.test.js` that read the STRUCTURE section now ask for the opted-in template, and a new test covers both shapes.

_Captured: 2026-10-22 · 3 file change(s)_

---
