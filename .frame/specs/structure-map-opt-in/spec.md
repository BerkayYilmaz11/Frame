---
keywords: STRUCTURE.json, structure map, opt-in, structureMap, structure-switch, find-module, module-hint, init, new users
related: str-02-structure-lifecycle, str-02b-commit-map-publication, str-03-local-file-retrieval, non-invasive-overlay, reliable-structure-generation
---

# Structure map opt-in — invisible to new users

## User's request (original, Turkish)

> bizim dosya bulma için devasa bir yapımız ve pipeline ımız var, ama çok fayda alıyoruz gibi durmuyor ve structure.json çok baş ağrıtıyor birden fazla kişinin pr attığı durumlarda. kodun durmasını ama mekanızmanın çalışmasını kesmek istiyorum geçici olarak.
>
> frame i kullanan ama frame e katkı yapmayan bütün kullanıcılar bu yapıyı kullanmasın false olsun, sadece bizim repomuzda true olsun
>
> benim istediğim şey bundan sonra gelecek yeni kullanıcılar structure dosyası mekanızmasıyla uğraşmasın, var olan bir projeyi de initilaize ederse de oluşmasın, yeni gelenler bilmesin yani

## Problem

The STRUCTURE.json pipeline (generation, lifecycle worker, commit publication, retrieval hints) is large, its benefit is not evident, and the tracked map conflicts whenever several people open PRs — PR #179, a one-file fix, conflicted on it. Frame turns it on for every project it initializes, so every new user inherits the machinery and its noise without asking for it.

Already done in this session (uncommitted, on `main`'s working tree): `scripts/structure-switch.js` makes maintenance opt-in per project through `.frame/config.json` `settings.structureMap: true` (Frame's own repo sets it); with it off the parser, pre-commit staging, lifecycle worker, init scan, module-hint and freshness checks stand down; init no longer creates `.frame/STRUCTURE.json`; the AGENTS.md template drops its STRUCTURE/find-module lines. README.md no longer presents the map (file table, commit-anchor bullet, "Fast File Lookup" section, feature/roadmap/architecture lines) — user follow-up: "readme den de kaldıralım". A project without the opt-in still shows the mechanism through:

1. `.frame/bin/` — ~20 structure files (`update-structure.js`, `find-module.js`, `structure-*.js`, `lang/`, `intent-map.json`, `structure-ignore.LICENSE`).
2. The project's Claude settings file and `CODEX_HOME/hooks.json` — a `module-hint.js` search hook entry.
3. `.frame/docs/REFERENCE.md` — the "STRUCTURE.json Rules" section, the meta-file list in its intro, "After Commit: check STRUCTURE.json".
4. `.frame/QUICKSTART.md` — the STRUCTURE.json row and "First: read STRUCTURE.json".
5. App UI — the init screens list `.frame/STRUCTURE.json` (index.html, three places); the Guide names it twice (guideContent.js).

## Goal

A project that has not opted in — a brand-new folder or an existing codebase initialized with Frame — ends init with no file, hook entry, document line or UI text that names STRUCTURE.json, the module map, `find-module` or `module-hint`. Frame's own repo (`structureMap: true`) behaves exactly as today. The code stays in the tree and ships in the app, so opting in later is one config line plus a project reopen.

## Constraints

- The opt-in key is `settings.structureMap === true`; `settings.autoUpdateStructure` must not opt in (init wrote it `true` everywhere). `FRAME_STRUCTURE=on` remains the per-process override the test suite uses.
- Opted-in output stays byte-identical to today for every template (AGENTS, REFERENCE, QUICKSTART, settings hooks) — Frame's repo and opted-in projects must not churn.
- Existing projects are not rewritten: Frame never rewrites a whole AGENTS.md/REFERENCE.md/QUICKSTART.md (`non-invasive-overlay`, specDriven upgrade path), and already-shipped `.frame/bin` files and hook entries are not deleted by this spec.
- Everything Frame writes stays under `.frame/` plus the pointer files it already writes (`non-invasive-overlay`).
- Scripts that remain shipped without the opt-in (`check-freshness.js`, `spec-*`, `docs-hint.js`, `detect-project.js`) must run without the structure helpers present (lazy or guarded requires), as module-hint already does ("a hook copied without the read contract stays quiet").
- STR-02/02b/03 behavior for opted-in projects is unchanged; this spec gates them, it does not supersede them.
- No new dependency; `npm test` stays green with the suite running under `FRAME_STRUCTURE=on`.

## Success Criteria

- When a project without the opt-in is initialized, then `.frame/STRUCTURE.json`, `.frame/bin/update-structure.js`, `find-module.js`, `structure-*.js`, `lang/` and `intent-map.json` do not exist afterwards.
- When it is initialized or reopened, then neither its Claude settings file nor `CODEX_HOME/hooks.json` gains a `module-hint.js` entry.
- When init writes REFERENCE.md and QUICKSTART.md for it, then neither contains `STRUCTURE`, `find-module` or `module map`.
- When the init screens and the Guide are shown, then neither names `STRUCTURE.json` or the module map.
- When `.frame/bin/check-freshness.js` runs (pre-commit) in such a project, then it exits 0 and prints no structure warning.
- When `settings.structureMap: true` is added and the project is reopened, then the structure tools are staged and the lifecycle worker attaches, with no re-init.
- When Frame's own repo is opened or initialized, then every generated artifact equals today's output.

## Out of Scope

- Cleaning structure files, hook entries and doc lines out of projects initialized before this change.
- Deleting the structure pipeline code, its specs or its tests.
- A settings UI toggle for `structureMap`.
- The str-04-jev-evaluation and structure-non-standard-layouts specs.

## Open Questions

- **Guide and init-screen wording** — the app is global, the opt-in is per project. Options: (a) drop the STRUCTURE mentions from these surfaces entirely, since the default is off; (b) show them only when the current project has opted in.
- **Pre-commit hook entry for opted-in projects** — init skips hook install when off; when a project opts in later, should reopen install the hook (today only init does), or stay a manual step?
