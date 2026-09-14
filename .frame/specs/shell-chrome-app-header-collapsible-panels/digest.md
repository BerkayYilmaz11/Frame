---
keywords: app header, title bar, top bar, sidebar collapse, dock collapse, layout toggles, shell layout, vscode layout, theme toggle, agent launcher, project switcher
related: compact-center-vs-code-density, dock-panel-readonly-views, terminals-home-agents, status-bar, sidebar-project-section, sidebar-nav-groups
---
Gave Frame VS Code's shell shape: one 35px `#app-header` across the whole
window (static markup in `index.html`; `body` is now a column with a `#shell`
row holding `#sidebar` + `#main-content`). Left: the Frame mark, version and
update dot (the sidebar's own header is gone). Center: the current-project
switcher, moved whole with its ids so `index.js` kept binding it — chosen over
"first row of the sidebar" so it stays reachable while the sidebar is hidden
(amends sidebar-project-section). Right: agent picker + Start, two layout
toggles, theme, update bell. The center's `.terminal-tab-bar` is the
navigation strip alone. New `appHeader.js` wires theme restore/toggle, the
bell and `mountSelector()` (moved verbatim from `terminalTabBar`), and the
toggles: click → `runById('panel.toggleSidebar' | 'dock.toggle')`, painted from
`sidebarResize.onChange` (new, mirrors `dock.onChange`) / `dock.onChange` —
never from the click — so ⌘B/⌘J, menu, palette, status-bar icons and the
dock's × all leave the buttons right; the dock icon follows its position.
Rejected: JS-rendered header (bind-after-render race), `flex-wrap` on body,
rail-only collapse, a "header state" module (test theater). No tests added:
DOM-coupled shell work. Rules: controls in the header, readouts in the status
bar; a new header control is markup in `index.html` + wiring in
`appHeader.js`; a region toggle runs the registered command and paints from
the owning module's change event.

Chain: spec.md → plan.md → tasks.md → outcome.md
