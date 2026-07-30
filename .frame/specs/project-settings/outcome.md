# Outcome — project-settings

## T01 — Explicit mode parameter on `gitExclude.ensure()`

Added an optional `mode` parameter to `ensure(projectPath, mode)` in src/main/gitExclude.js: `'repo'` joins the tracked check in the removal branch, so the block is never written and an existing one is stripped; `'local'`/absent keep the conditional logic with tracked state still overriding (D3). Extended test/gitExclude.test.js with four mode cases: repo-mode never writes, repo-mode strips an existing block, local behaves as default, local on a tracked repo still removes. No deviation from plan.md; full suite green (326 tests).

_Captured: 2026-07-30 · 2 file change(s)_

---

## T02 — `src/main/gitSharing.js`, the sharing-semantics owner

Created src/main/gitSharing.js (Electron-free): `getState` returning `{ isRepo, declared, tracked, effective }` with D3's tracked-wins rule, `resolveMode` deriving and persisting an absent mode once (D4), `setMode` as the single write path (config → ensure(mode) → gitignore, index never touched), `ensureOnOpen`, `writeFrameGitignore`, and `getRepoSignal` (remote presence + distinct authors over 200 commits). The `.frame/.gitignore` signed block uses begin/end marker comments rather than gitExclude's comment-plus-one-line form — the block is multi-line, so an explicit end marker is what keeps unsigned user lines safe; contents per plan (runtime/, index/, implement-permissions.json, worktrees/, orchestration/, bin/, *.bak, *.tmp, *.corrupt-*). Authored test/gitSharing.test.js: 24 cases over derivation, the state matrix, setMode side effects on tmp repos, gitignore idempotence/preservation, and the repo signal.

_Captured: 2026-07-30 · 2 file change(s)_

---

## T03 — Config template: dead flags out, gitSharing in, specDriven from options

`getFrameConfigTemplate(name, options)` in src/shared/frameTemplates.js: dropped `autoUpdateStructure`/`autoUpdateNotes`/`taskRecognition` (never had a reader), `settings` now holds only `gitSharing` (from `options.gitSharing`, invalid values fall back to `'local'`), and `features.specDriven` comes from `options.specDriven` (default true). The sole caller (`frameProject.js:189`) still passes one argument and gets identical-to-today defaults until T05 threads the init options through. Three new cases in test/frameTemplates.test.js.

_Captured: 2026-07-30 · 2 file change(s)_

---

## T04 — Register the `project_sharing_set` telemetry event

Added `project_sharing_set: { mode: ['local','repo'], source: ['init','settings'] }` to the registry in src/main/telemetryEvents.js and its row to PRIVACY.md's collection table (the registry rule: event and doc land in the same change). Extended test/telemetry.test.js with in-enum pass-through and out-of-enum/unknown-prop stripping. The stale privacy copy in App Settings stays untouched per the spec's non-goal.

_Captured: 2026-07-30 · 3 file change(s)_

---

## T05 — Main-process wiring: init options, open path, sharing IPC

Threaded `options: { specDriven, gitSharing }` through `initializeFrameProject → runProjectInit`: the mode drives the pre-mkdir `gitExclude.ensure(path, mode)` (repo mode never writes the block), both answers bake into the single config-template write, and `.frame/.gitignore` is written at init. `CHECK_IS_FRAME_PROJECT` now calls `gitSharing.ensureOnOpen` instead of bare `gitExclude.ensure`, which is how pre-upgrade projects gain derivation and the gitignore. Added GET_GIT_SHARING_STATE / SET_GIT_SHARING / GET_SHARING_REPO_SIGNAL invoke handlers (constants in ipcChannels.js); `project_sharing_set` fires with source `'init'` on init success and `'settings'` from SET_GIT_SHARING. Three new init-harness tests cover repo-mode init (acceptance 2), local default, and the specDriven option.

_Captured: 2026-07-30 · 4 file change(s)_

---

## T06 — Init modal options block

Added the options block below the init modal's no-write note in index.html: Spec-Driven checkbox (default on) and the Git Sharing radio pair ("Local to this machine" / "Shared in the repository", default local), the sharing group hidden until GET_GIT_SHARING_STATE reports `isRepo: true`. `state.js` resets both options on every open and reads them into `options` on confirm, sent in the INITIALIZE_FRAME_PROJECT payload. Divergence from plan.md: the block's styles went into `src/renderer/styles/components/panels.css` (not in the plan's Files list) because that file already owns every `init-modal-*` rule.

_Captured: 2026-07-30 · 3 file change(s)_

---
