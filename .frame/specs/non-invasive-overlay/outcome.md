# Outcome — Non-Invasive Frame Overlay (.frame-only, zero-touch)

## T01 — Meta path map + frameStore storage seam

Added `FRAME_META_FILES` (the `.frame/`-relative meta path map) and
`LEGACY_ROOT_FILES` to `src/shared/frameConstants.js` — `FRAME_FILES` stays as
an alias while pre-overlay call sites are converted — and built
`src/main/frameStore.js` with a data API (tasks/structure/notes/quickstart/
config/project-AGENTS) plus separately named `…Path(projectPath)` entries for
the file-needing minority; JSON reads pass fsSafe's `{ data, source, error }`
envelope through rather than flattening it, so the recovery signal survives the
seam. Diverged from `plan.md` on one point: `ORCH_META_FILES` was **not**
converted to `.frame/` paths — both consumers (`specManager.js:656`,
`orchestrationManager.js:462`) match a footprint entry's *basename*, which is
already layout-agnostic, and full paths there would have silently stopped every
match; the reason is now a comment on the constant. Files: `frameConstants.js`,
`frameStore.js` (new), `test/frameStore.test.js` (new, 12 cases).

_Captured: 2026-07-29 · 3 file changes_

---
