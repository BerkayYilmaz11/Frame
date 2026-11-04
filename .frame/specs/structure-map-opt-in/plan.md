# Plan — Structure map opt-in — invisible to new users

## Architecture

### Resolved plan-time decisions

- **Guide and init-screen wording (business, asked).** Drop every STRUCTURE / module-map mention from the app UI (init spotlight cards, the init modal, the Guide's two lists and three sketches) unconditionally. Rejected: show them per current project. Rationale: the default is off for everyone, the UI is global, and the only opted-in project is Frame's own repo, whose contributors already know the map. No renderer plumbing of a per-project flag.
- **Pre-commit hook on a later opt-in (technical, asked).** Reopen installs the hook when the project is opted in and has no hook at all, through the existing `installPreCommitHook` (vanilla `.git/hooks` only; Husky, lefthook and custom hooks still get instructions, logged). Rejected: manual install. Rationale: meets "one config line plus a reopen" (G1, S6) with code that already has the safety rules.
- **Test posture (technical, asked).** Everything testable, following the testing record (`src/main/`, `src/shared/`, `scripts/`, pure renderer modules are covered). Tests are attached to the step that produces the code.
- **Lean `.frame/bin` (silent).** A project that is off *and* has no `update-structure.js` in its `.frame/bin` gets only the non-structure tools. A project that is off but already carries structure files (initialized before this change) keeps getting them refreshed — its installed pre-commit hook still calls `.frame/bin/update-structure.js`, and only a refresh lands the copy that stands down. Rationale: never strand an old hook on an old parser; never add structure files to a project that does not have them.
- **Structure file set (silent).** Structure-only: entries `update-structure.js`, `structure-lifecycle.js`, `find-module.js`, `module-hint.js`; helpers `structure-switch.js`, `structure-ignore.js`, `structure-ignore.LICENSE`, `structure-discovery.js`, `structure-generation.js`, `structure-state.js`, `structure-snapshot.js`, `structure-read.js`, `structure-commit.js`, `structure-retrieval.js`, `fsSafe.js`, `lang/*`; seed `intent-map.json`. Shared (always shipped): `check-freshness.js`, `detect-project.js`, `spec-index.js`, `spec-context.js`, `spec-hint.js`, `docs-hint.js`, `spec-command-hint.js`, `toolVocabulary.js`, `redact.js`, `activity-log.js`. `fsSafe.js` is structure-only because only the parser publishes through it.
- **check-freshness without helpers (silent).** `structure-read` and `structure-switch` become guarded requires; a missing switch means off. Its `ENTRY_REQUIRES` drops both, so it activates in a lean bin.
- **Hint hooks (silent).** `SPEC_HINT_HOOKS` / `CODEX_HINT_HOOKS` stay the full sets (they also identify Frame's own entries for removal and upgrade). Install writes the set returned by a new `hintHooksFor(template, { structureMap })`, which drops the `module-hint.js` entry when off. Codex's `hooks.json` is global: the entry is added only while installing for an opted-in project and never removed for an off one (another project may need it). Existing entries in already-initialized projects are not removed (spec Out of Scope).
- **Templates (silent).** `getReferenceTemplate(name, { structureMap })` and `getQuickstartTemplate(name, project, { structureMap })` follow `getAgentsTemplate`: default off, opted-in output byte-identical. Off drops REFERENCE's intro mention, the whole "STRUCTURE.json Rules" section and the STRUCTURE half of General Rule 3; QUICKSTART's Key Files row and "First: read STRUCTURE.json" step (the remaining steps renumber).
- **"Parser" wording (silent).** The init modal and confirmation dialog describe `.frame/bin/` as "Frame's helper scripts" — "parser" only made sense for the map.
- **Sample project (silent, scope note).** `src/templates/sample-project` is the first Frame project many new users open and it ships a STRUCTURE.json, a "STRUCTURE.json Rules" section and a "Structure" README bullet. It is brought in line with the off templates: map deleted, mentions removed. The sample config gets no `structureMap`.
- **Left as is (silent).** `docs-hint.js`'s STRUCTURE.json → section entry (fires only when that file is edited, which an off project does not have); orchestration `WORKER.md` (lists meta files not to touch) and `CONDUCTOR.md` (`npm run structure` "if present"); the hidden dock Structure tab; `FRAME_TRACKED_DERIVED`.

### Shape

```
structureEnabled(projectRoot)  (scripts/structure-switch.js, done)
        │
        ├── stageParserScripts(projectPath)       full set | lean set (off and no parser yet)
        ├── installSpecHintHook / installCodexHintHook   hintHooksFor(template, { structureMap })
        ├── getAgents/Reference/QuickstartTemplate(…, { structureMap })
        └── reopen: structureEnabled → installPreCommitHook when setup is 'none'
```

`stageParserScripts` takes the decision itself (`options.structureMap`, defaulting to `structureEnabled(projectPath) || fs.existsSync(<bin>/update-structure.js)`), so init, reopen and layout migration — its three callers — agree without each computing it.

## Files

- `src/main/structureBootstrap.js` — **Modified.** Structure vs shared file sets; lean staging; `ensureStructureHook(projectPath)` (install when opted in and no hook).
- `src/main/frameProject.js` — **Modified.** Pass `structureMap` to the REFERENCE/QUICKSTART templates; install hint hooks through `hintHooksFor`; reopen calls `ensureStructureHook`; dialog wording.
- `src/shared/frameTemplates.js` — **Modified.** `structureMap` option on `getReferenceTemplate` / `getQuickstartTemplate`; new exported `hintHooksFor`.
- `scripts/check-freshness.js` — **Modified.** Guarded requires of `structure-read` / `structure-switch`.
- `index.html` — **Modified.** Remove `.frame/STRUCTURE.json` from both spotlight cards and the init modal list; "helper scripts" wording.
- `src/renderer/guide/guideContent.js` — **Modified.** Remove the two STRUCTURE.json bullets.
- `src/renderer/guide/guideSketches.js` — **Modified.** Remove the STRUCTURE.json chip, tree row and dock row.
- `src/templates/sample-project/.frame/STRUCTURE.json` — **Deleted.**
- `src/templates/sample-project/.frame/AGENTS.md` — **Modified.** Drop "STRUCTURE.json Rules" and the STRUCTURE half of General Rule 3.
- `src/templates/sample-project/.claude/rules/frame.md` — **Modified.** Regenerated copy of the sample AGENTS.md.
- `src/templates/sample-project/README.md` — **Modified.** Drop "structure map" and the "Overview / Structure" bullet.
- `test/structureBootstrap.test.js` — **Modified.** Lean vs full staging; refresh of an old structure bin; `ensureStructureHook`.
- `test/frameProjectInit.test.js` — **Modified.** Off init writes no structure file in `.frame/bin`, no `module-hint` hook, REFERENCE/QUICKSTART without STRUCTURE; sample project assertion updated.
- `test/frameProjectOpen.test.js` — **Modified.** Reopen after opt-in stages the tools and installs the hook; reopen of an off project adds nothing.
- `test/codexHookInstall.test.js` — **Modified.** No `module-hint` entry for an off project; present for an opted-in one.
- `test/sessionHookInstall.test.js` — **Modified.** Same for the Claude settings file.
- `test/projectAgnostic.test.js` — **Modified.** REFERENCE/QUICKSTART off vs on; opted-in output unchanged.
- `test/guideContent.test.js` — **Modified.** No page names STRUCTURE.json.
- `test/structureSwitch.test.js` — **Modified.** `check-freshness.js` copied without structure helpers exits 0 with no structure line.

## Footprint

- src/main/structureBootstrap.js
- src/main/frameProject.js
- src/shared/frameTemplates.js
- scripts/check-freshness.js
- index.html
- src/renderer/guide/guideContent.js
- src/renderer/guide/guideSketches.js
- src/templates/sample-project/.frame/STRUCTURE.json
- src/templates/sample-project/.frame/AGENTS.md
- src/templates/sample-project/.claude/rules/frame.md
- src/templates/sample-project/README.md
- test/structureBootstrap.test.js
- test/frameProjectInit.test.js
- test/frameProjectOpen.test.js
- test/codexHookInstall.test.js
- test/sessionHookInstall.test.js
- test/projectAgnostic.test.js
- test/guideContent.test.js
- test/structureSwitch.test.js

## Dependencies

None.

## Sequencing

1. **check-freshness runs without structure helpers.** Guarded requires in `scripts/check-freshness.js`; drop `structure-read.js` / `structure-switch.js` from its `ENTRY_REQUIRES`. Test in `test/structureSwitch.test.js`: a copy with no helpers exits 0 and prints no structure line.
2. **Lean `.frame/bin`.** Split the file lists in `structureBootstrap.js`; `stageParserScripts` stages the shared set only when off and no `update-structure.js` is present, skips seeding `intent-map.json` then, and refreshes the full set otherwise. Tests in `test/structureBootstrap.test.js`: off/empty → no structure file; off/old bin → structure files refreshed (new `update-structure.js` stands down); on → full set as today.
3. **Hint hooks follow the opt-in.** `hintHooksFor` in `frameTemplates.js`; `installSpecHintHook` and `installCodexHintHook` install its result for the project. Tests in `test/sessionHookInstall.test.js` and `test/codexHookInstall.test.js`: off → no `module-hint` entry; on → today's entries; removal still takes all of Frame's entries.
4. **REFERENCE and QUICKSTART templates.** `structureMap` option on both; `frameProject.js` passes `structureEnabled(projectPath)` at the init and spec-upgrade write sites. Tests in `test/projectAgnostic.test.js`: off has no `STRUCTURE` / `find-module` / `module map`; on equals today's output.
5. **Init end to end.** `test/frameProjectInit.test.js`: an off init leaves no STRUCTURE.json, no structure file in `.frame/bin`, no `module-hint` hook entry and no STRUCTURE text in AGENTS/REFERENCE/QUICKSTART.
6. **Opt-in on reopen.** `ensureStructureHook` in `structureBootstrap.js`, called from the reopen path in `frameProject.js` beside `upgradeStructureHook`. Tests in `test/frameProjectOpen.test.js`: adding `structureMap: true` then reopening stages the tools, installs a vanilla hook and attaches the worker; an off reopen installs nothing; a Husky project is untouched.
7. **App UI.** Remove the mentions from `index.html`, `guideContent.js`, `guideSketches.js`; "helper scripts" wording in `index.html` and the init confirmation in `frameProject.js`. Test in `test/guideContent.test.js`: no page or sketch names STRUCTURE.json.
8. **Sample project.** Delete its STRUCTURE.json, edit its AGENTS.md, rules copy and README; update the sample assertion in `test/frameProjectInit.test.js`.
