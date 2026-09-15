---
keywords: onboarding, how to use, guide, help, first run, welcome, sketches, rail foot, help menu, launch sequence
related: settings-by-scope, in-app-feedback, dock-panel-readonly-views, shell-chrome-app-header-collapsible-panels, ui-zoom-steps, terminals-home-agents
---
Added "How to Use Frame": a 1040px modal with an 11-chapter, 36-page index tree left and a sketch + explanation right,
Back / n of N / Next, ←/→, action links that run command-registry ids (theme and zoom links `stay` and apply in place).
Three modules: pure `src/renderer/guide/guideContent.js` (CHAPTERS, SKETCH_KINDS, ACTION_IDS, flattenPages, parseInline,
validate; tested in test/guideContent.test.js), `guide/guideSketches.js` (20 HTML/CSS wireframe kinds from design tokens,
one `focus` param accents a region), and the DOM host `guideModal.js`. Styles in components/guide.css (`.gs-*` for sketches).
Launch: the guide owns the first WORKSPACE_DATA and opens unless `guideHideOnLaunch` (its "Don't show this on launch"
checkbox) is true; closing it by ×/Esc/backdrop/Done calls welcomeOverlay.showOnLaunch, an action-link close skips Welcome
for that launch. Welcome itself is unchanged (user kept it). Entry points: rail button under the gear, Help › How to Use
Frame, palette `help.guide`; `plugins.open` was registered so the guide could link to Plugins; `--modal-width-wide` token.
Rejected: screenshots per theme (dated by every UI change), absorbing Welcome, a last-read page, one drawing per page.
Rules: page copy never hard-codes a shortcut — cite `{kbd:commandId}`; every cited id goes in ACTION_IDS (the test fails
otherwise); state only what the code confirms (Claude-only claims were corrected against the code during T11); a UI
change that renames a view, label or command should update the matching guide page. Sketches are replaceable in one file.

Chain: spec.md → plan.md → tasks.md → outcome.md
