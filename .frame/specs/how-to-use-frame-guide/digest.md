---
keywords: onboarding, how to use, guide, help, first run, welcome, sketches, rail foot, help menu, launch sequence
related: settings-by-scope, in-app-feedback, dock-panel-readonly-views, shell-chrome-app-header-collapsible-panels, ui-zoom-steps, terminals-home-agents
---
Added "How to Use Frame": a 1040px modal with an 11-chapter, 36-page index tree left and a sketch + explanation right,
Back / n of N / Next, ←/→, action links that run command-registry ids (theme and zoom links `stay` and apply in place).
Three modules: pure `src/renderer/guide/guideContent.js` (CHAPTERS, SKETCH_KINDS, ACTION_IDS, flattenPages, parseInline,
validate; tested in test/guideContent.test.js), `guide/guideSketches.js` (20 HTML/CSS wireframe kinds from design tokens,
one `focus` param accents a region), and the DOM host `guideModal.js`. Styles in components/guide.css (`.gs-*` for sketches).
No launch behaviour (revised 2026-09-15 after using it: "not onboarding"): the guide never opens by itself and has no
checkbox; Welcome keeps its own WORKSPACE_DATA trigger, unchanged. Tree titles wrap, never truncate; keep them short.
Entry points: rail button under the gear, Help › How to Use
Frame, palette `help.guide`; `plugins.open` was registered so the guide could link to Plugins; `--modal-width-wide` token.
Rejected: screenshots per theme (dated by every UI change), absorbing Welcome, a last-read page, one drawing per page,
and (after shipping) opening the guide on launch before Welcome.
Rules: page copy never hard-codes a shortcut — cite `{kbd:commandId}`; every cited id goes in ACTION_IDS (the test fails
otherwise); state only what the code confirms (Claude-only claims were corrected against the code during T11); a UI
change that renames a view, label or command should update the matching guide page. Sketches are replaceable in one file.

Chain: spec.md → plan.md → tasks.md → outcome.md
