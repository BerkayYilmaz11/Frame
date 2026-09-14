# Plan — Shell chrome — one app header, collapsible sidebar and dock

## Architecture

### Resolved plan-time decisions

Business

- **D1 · Where does the project switcher live once the sidebar header is gone?**
  Chosen: the app header's center slot (VS Code command-center position) —
  `#sidebar-current-project-wrap` moves there whole, ids unchanged. Rejected:
  the sidebar's first row. Rationale (asked, 2026-09-14): the switcher must stay
  reachable while the sidebar is collapsed; this explicitly amends
  sidebar-project-section's "switcher above the rail-and-panel split" decision —
  the rail's Projects view stays the project *list*, the header carries the
  *current* project.
- **D2 · What does a collapsed sidebar look like?** Chosen: fully hidden, the
  whole column including the rail (today's `sidebarResize.hide()` behavior).
  Rejected: rail-only. Rationale (silent, from the spec): "komple kapatıp
  açılabilir" — and rail-only is a separate spec by the spec's Out of Scope.
- **D3 · Order of the header's right cluster.** Chosen, as the user listed it:
  agent picker · Start · sidebar toggle · dock toggle · theme · bell. Silent.

Technical

- **D4 · Static markup or JS-rendered header?** Chosen: static markup in
  `index.html` (like the sidebar, the dock shell and the status bar) plus a thin
  `appHeader.js` that only wires behavior. Rejected: rendering the header from
  a JS template the way `terminalTabBar._render` does. Rationale: the spec
  wants no boot flash, and static markup exists before any script runs; it also
  ends the "bind after render" race the tab bar's comments describe twice
  (`mountSelector`, the theme button) — with static markup, `index.js`'s
  `getElementById` bindings for Start (`index.js:333`) and the switcher
  (`index.js:381-450`) simply keep working.
- **D5 · How does a full-width header fit a `body { display:flex }` row?**
  Chosen: `body` becomes `flex-direction: column`; a new `#shell` wrapper
  (`display:flex; flex:1; min-height:0`) holds `#sidebar` and `#main-content`.
  Rejected: `flex-wrap` on `body` with a 100%-basis header. Rationale: no CSS in
  the project selects `body > #sidebar` or `body > #main-content` (verified), so
  the wrapper is safe; overlays stay body children (`position: fixed`), so they
  are unaffected. `flex-wrap` makes the row height implicit and fragile.
- **D6 · How does the header learn the sidebar's state?** Chosen: add
  `onChange(fn)` to `sidebarResize` mirroring `dock.onChange` (called from
  `hide()`, `show()`), and read `isVisible()` once at init. Rejected: painting
  only on the header button's own click. Rationale: ⌘B, the View menu and the
  palette all go through `panel.toggleSidebar` → `sidebarResize.toggle()`, so
  the module is the only place that always knows; a listener there is the one
  seam that keeps every entry point in agreement (S3).
- **D7 · What do the header buttons call?** Chosen:
  `commandRegistry.runById('panel.toggleSidebar')` / `runById('dock.toggle')`.
  Rejected: calling `sidebarResize.toggle()` / `dock.toggle()` directly.
  Rationale: dock-panel-readonly-views' rule — every entry point shares one
  seam; `panel.toggleSidebar` also owns the `terminal.fitTerminal()` call, so
  the button gets the refit for free (C3).
- **D8 · Dock toggle icon.** Chosen: the icon follows the dock's position —
  `PanelBottom` when bottom, `PanelRight` when right (both exist in the
  installed `lucide`, verified) — painted from `dock.onChange`'s
  `{ open, position }`. Silent; costs one branch.
- **D9 · Header height.** Chosen: 35px — the same as the center's strip
  (`.terminal-tab-bar`, compact-center-vs-code-density) so the sidebar's first
  row and the strip share a top edge; controls inside stay ≤ 32px
  (`.dock-action-btn` is 24px, `.primary-btn` fits today's 35px bar). Silent.
- **D10 · Test posture: none this time.** The testing record says DOM-coupled
  renderer code has no test path and the convention is to extract pure logic;
  this spec adds no logic worth a module — the only state is two booleans that
  `sidebarResize` (`sidebar-hidden`) and `dockState` (`frame-dock`, already
  tested) own. A "header state" module would be test theater. Silent.
- **D11 · IN-FLIGHT collisions.** `index.html` / `index.js` sit in
  audit-q3-performance-resources' footprint (implementing since 2026-08-26, no
  worktree, no branch) and `index.js` / `aiToolSelector.js` in
  audit-q3-cross-platform's (planned 2026-07-20). Both dormant; this plan
  touches `index.html` / `index.js` minimally and does not touch
  `aiToolSelector.js` at all. Silent.

### Shape

Three regions, one row above them:

```
body (column)
├── #app-header                       35px, full width, one piece
│   ├── .app-header-left              Frame mark · #app-version · #update-dot
│   ├── .app-header-center            #sidebar-current-project-wrap (moved, ids kept)
│   └── .app-header-right             .lane-bar-launcher (picker + Start) ·
│                                     #layout-toggle-sidebar · #layout-toggle-dock ·
│                                     #sidebar-theme-btn · .btn-update-notify
├── #shell (row, flex:1)
│   ├── #sidebar                      no #sidebar-header any more; starts at the rail
│   └── #main-content
│       └── #terminal-container
│           ├── .terminal-tab-bar     the strip alone: .lane-bar-left, 35px
│           └── #dock
└── #status-bar (fixed, unchanged)
```

**`appHeader.js` (New)** — `init()` only. It (1) restores the persisted theme
(`localStorage['frame-theme']` → `terminalTabBar.applyTheme`, moved verbatim
from `TerminalTabBar._initTheme`) and wires `#sidebar-theme-btn` to
`applyTheme(themes.counterpartOf(currentTheme()))`; (2) wires
`.btn-update-notify` — the `IPC.UPDATE_AVAILABLE` listener and the
`shell.openExternal(releaseUrl)` click, moved verbatim from
`terminalTabBar._setupEventHandlers`; (3) calls
`aiToolSelector.mountSelector()` for `#ai-tool-selector` (the same call the tab
bar makes today, now with no race); (4) wires the two layout toggles:
click → `runById`, paint from `sidebarResize.isVisible()` /
`dock.isOpen()` + `dock.position()` at init and on every
`sidebarResize.onChange` / `dock.onChange`. Paint = `.on` class,
`aria-pressed`, title ("Hide Sidebar (⌘B)" / "Show Sidebar (⌘B)", "Hide Panel
(⌘J)" / "Show Panel (⌘J)") and, for the dock, the icon. Icons come from
`dock.lucideIcon(PanelLeft | PanelBottom | PanelRight, 16)`.

**`terminalTabBar.js`** keeps `applyTheme` / `currentTheme` exports (the
`theme.*` commands and `terminalManager` depend on them) and loses the
`.terminal-tab-actions` template block, its update/theme handlers, the
`_initTheme` call and the `Bell` import. `_render` becomes the strip only.

**`sidebarResize.js`** gains `onChange(fn)` (returns an unsubscribe, same
shape as `dock.onChange`) and notifies from `hide()` and `show()`. Nothing else
changes: keys, clamps, drag, double-click reset.

**Boot order** (index.js `DOMContentLoaded`): `dock.init()` (206) →
`sidebarResize.init()` (209) → **`appHeader.init()` (new, right after)** → the
rest. Theme restore therefore runs before `multiTerminalUI` builds the strip,
as it does today from the tab bar's constructor. The app loader
(`appLoader.init()`, `position: fixed` overlay) covers boot as it does now, so
a persisted collapsed state applied in `sidebarResize.init` / `dock.init` never
paints expanded first (C9).

**CSS** — `components/app-header.css` (New): `#app-header` (35px, `flex`,
`background: var(--bg-secondary)`, `border-bottom: 1px solid
var(--border-subtle)`, `padding: 0 8px`, `position: relative; z-index: 60` so
the switcher's absolute menu — `z-index: 50` inside it — floats over `#shell`);
the three slots (`left` / `center` / `right`, center `flex:1` with the switcher
clamped to `max-width: 360px` and centered); the launcher, picker, theme and
bell rules moved out of `terminal.css` (`.terminal-tab-actions …` →
`.app-header-right …`, `.lane-bar-launcher`, `.ai-tool-picker*`,
`.btn-update-notify .update-badge`); the switcher rules moved out of
`layout.css` (`.sidebar-current-project*`, `.sidebar-project-menu*`) with
`width: 100%` replaced by the clamp and the menu anchored below the header
row; `.layout-toggle` (24×24, the `.dock-action-btn` look, `.on` =
`var(--accent-primary)` on `var(--accent-subtle)` like `.sb-dock-btn.on`).
Every color is a token, so Dark / Light / Dark+ / Light+ need no per-theme
rule (C11). `layout.css`: `#shell`, `#sidebar` top padding reduced now that
there is no header row (the "~62px alignment" comment goes), `#sidebar-header`
/ `.sidebar-header-*` rules deleted. `ui.css`: `body { flex-direction: column }`.
`terminal.css`: the moved blocks deleted; `.terminal-tab-bar` untouched (still
35px, still `space-between` with only `.lane-bar-left` in it).

**Not touched**: `src/main/menu.js` (Toggle Sidebar ⌘B and Toggle Panel ⌘J
already exist), `commandRegistry.js`, `dock/dockState.js`, `statusBar.js`,
`aiToolSelector.js`, `multiTerminalUI.js`, the Specs/Tasks panels.

## Files

- `index.html` — **Modified**: add `#app-header` (left mark/version/update-dot; center; right cluster incl. two new `button.layout-toggle`s) and the `#shell` wrapper; delete `#sidebar-header`; move `#sidebar-current-project-wrap` into the header center.
- `src/renderer/appHeader.js` — **New**: `init()` — theme restore + toggle, update bell, `mountSelector()`, layout toggle wiring and painting.
- `src/renderer/sidebarResize.js` — **Modified**: `onChange(fn)`; notify from `hide()` / `show()`.
- `src/renderer/terminalTabBar.js` — **Modified**: drop the right cluster from `_render`, its handlers, `_initTheme` and the `Bell` import; keep `applyTheme` / `currentTheme`.
- `src/renderer/index.js` — **Modified**: `require('./appHeader')` and `appHeader.init()` after `sidebarResize.init()`.
- `src/renderer/styles/components/app-header.css` — **New**: header row, slots, moved launcher/picker/theme/bell/switcher rules, `.layout-toggle`.
- `src/renderer/styles/main.css` — **Modified**: `@import 'components/app-header.css'` beside `status-bar.css` / `dock.css`.
- `src/renderer/styles/components/ui.css` — **Modified**: `body { flex-direction: column }`.
- `src/renderer/styles/layout.css` — **Modified**: `#shell`; `#sidebar` top padding; delete `#sidebar-header`, `#app-version`, `.sidebar-header-*`; remove the switcher rules (moved).
- `src/renderer/styles/components/terminal.css` — **Modified**: remove `.terminal-tab-actions*`, `.btn-update-notify .update-badge`, `.lane-bar-launcher*`, `.ai-tool-picker*` (moved).

## Footprint

- index.html
- src/renderer/appHeader.js
- src/renderer/sidebarResize.js
- src/renderer/terminalTabBar.js
- src/renderer/index.js
- src/renderer/styles/components/app-header.css
- src/renderer/styles/main.css
- src/renderer/styles/components/ui.css
- src/renderer/styles/layout.css
- src/renderer/styles/components/terminal.css

## Dependencies

None. `lucide` (already in `package.json`) provides `PanelLeft`, `PanelBottom`, `PanelRight`.

## Sequencing

1. **Shell skeleton.** In `index.html` add `<header id="app-header">` with its three slots — the left slot receives the mark SVG, `#app-version` and `#update-dot` from `#sidebar-header`, which is deleted — and wrap `#sidebar` + `#main-content` in `<div id="shell">`. In `ui.css` set `body { flex-direction: column }`; in `layout.css` add `#shell`, trim `#sidebar`'s top padding and delete the `#sidebar-header` / `#app-version` / `.sidebar-header-*` rules; create `app-header.css` with the row and slot rules and import it from `main.css`. Result: a 35px full-width header with the mark; the sidebar starts at the switcher; everything else as before.
2. **Project switcher into the header center.** Move `#sidebar-current-project-wrap` (button + menu, ids unchanged) into `.app-header-center`; move `.sidebar-current-project*` / `.sidebar-project-menu*` from `layout.css` to `app-header.css`, replacing `width: 100%` with the centered clamp and anchoring the menu below the row (`#app-header` `z-index` above `#shell`). `index.js:381-450` is untouched and keeps working by id. Result: switching projects works from the header with the sidebar open or hidden.
3. **Right cluster into the header; `appHeader.js`.** Move the launcher (`.ai-tool-picker` + `#ai-tool-selector`, `#sidebar-agent-launch`), `.btn-update-notify` and `#sidebar-theme-btn` markup from `terminalTabBar._render` into `.app-header-right` in `index.html`. Create `appHeader.js` with theme restore + toggle, the update-bell listener/click and `mountSelector()` moved verbatim from `terminalTabBar`; delete those from `terminalTabBar` (template block, handlers, `_initTheme` call, `Bell` import). Move the cluster's CSS from `terminal.css` to `app-header.css` under `.app-header-right`. Call `appHeader.init()` in `index.js` after `sidebarResize.init()`. Result: the strip is navigation only; Start, agent picker, theme and bell work from the header; Home's Agents widget still mirrors the picker.
4. **Layout toggles.** Add `onChange(fn)` to `sidebarResize` (notify in `hide()` / `show()`). Add `#layout-toggle-sidebar` and `#layout-toggle-dock` (`button.layout-toggle`) between Start and the theme button; in `appHeader.js` wire click → `runById('panel.toggleSidebar')` / `runById('dock.toggle')` and paint (`.on`, `aria-pressed`, title, dock icon by position) at init from `sidebarResize.isVisible()` / `dock.isOpen()` + `dock.position()` and on every `sidebarResize.onChange` / `dock.onChange`. Style `.layout-toggle` in `app-header.css`. Result: both regions collapse and restore from the header; ⌘B / ⌘J / View menu / palette / status-bar icons / the dock's × all leave the buttons showing the right state; relaunch restores collapsed states.
