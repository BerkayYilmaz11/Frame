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
## T05 — End-to-end test: an off init leaves no trace

Added "a project without the map ends init with no trace of it" to `test/frameProjectInit.test.js`: a real `runProjectInit` without the opt-in, then checks of `.frame/bin`, STRUCTURE.json's absence, and the text of AGENTS.md, REFERENCE.md, QUICKSTART.md, `.claude/rules/frame.md` and `.claude/settings.json`. Test only; no source change was needed.

_Captured: 2026-10-22 · 1 file change(s)_

---
## T06 — Opting in later: the hook arrives on reopen

Added `ensureStructureHook` to `src/main/structureBootstrap.js` (opt-in check, then `installPreCommitHook`) and called it from the open path in `src/main/frameProject.js` — **only on the open where `.frame/bin/update-structure.js` first appears**, not on every open as plan.md said. Divergence: every-open install broke STR-02b's recorded rule "an open never installs a hook that is not there" (caught by `test/frameProjectOpen.test.js`); keying it to the parser's arrival gives an opting-in project its hook once while a hook the user deleted stays deleted. Tests: opt-in reopen stages tools, writes the hook, attaches the worker, and a later reopen after deleting the hook does not restore it; off reopen installs nothing; Husky untouched.

_Captured: 2026-10-22 · 3 file change(s)_

---
## T07 — App UI no longer presents the map

Removed STRUCTURE.json from `index.html` (two spotlight cards, init modal) and changed "parser and helper scripts" to "helper scripts" there and in the init confirmation in `src/main/frameProject.js`; removed the map from `src/renderer/guide/guideContent.js` and `guideSketches.js` (the chip became `AGENTS.md`). Went slightly past plan.md's list: three more Guide phrases ("a module map" in the overview, the pre-commit sentence, "the module map being refreshed" in Activity) surfaced on grep and were removed. Added a no-map check over every Guide page and the sketches file to `test/guideContent.test.js`.

_Captured: 2026-10-22 · 5 file change(s)_

---
## T08 — Sample project in line with the off templates

Deleted `src/templates/sample-project/.frame/STRUCTURE.json`, removed the "STRUCTURE.json Rules" section and the STRUCTURE half of General Rule 3 from the sample's `.frame/AGENTS.md` and `.claude/rules/frame.md` (kept byte-for-byte in sync below the generated header), and removed the map from its `README.md`. Updated the sample assertion in `test/frameProjectInit.test.js` to expect three meta files, no map, and no mention of it.

_Captured: 2026-10-22 · 5 file change(s)_

---
