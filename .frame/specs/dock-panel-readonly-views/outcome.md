# Outcome — Dock panel — readonly views leave the sidebar nav

## T01 — Pure dock state module and its test

Wrote `src/renderer/dock/dockState.js` (`STORAGE_KEY`, `TABS`, `LIMITS`, `defaults`, `load`, `open`, `close`, `toggle`, `toggleTab`, `setPosition`, `resize`, `clampSize`, `serialize`) with no DOM or Electron import, and `test/dockState.test.js` (27 cases) covering defaults, garbage input, the three `toggleTab` transitions, both clamp ends on both sides and a serialize → load round-trip. Two additions beyond the plan's list: `toggle(state)` for `dock.toggle` so the host does not re-derive open/close, and `clampSize` exported so the host can re-clamp a stored size against the measured center on every apply. `load` takes either the raw localStorage string or a parsed object; the ceiling is only applied when `available` is passed, since the module cannot measure the center. `npm test`: 608 pass.

_Captured: 2026-09-10 · 2 file change(s)_

---

## T02 — Dock shell: markup, styles, host module and commands

Added the `#dock` shell to `index.html` inside `#terminal-container` (which now starts with `.dock-bottom`), `src/renderer/styles/components/dock.css` with its `main.css` import, and `src/renderer/dock.js`: tabs and slots built from `dockState.TABS`, state applied with a re-clamp against the measured center on every apply, persistence under `frame-dock`, drag-resize applying the size per animation frame and running one terminal refit plus the tab's `refit()` on mouseup, and `onChange` for the status bar. `index.js` calls `dock.init()` before `statusBar.init()` and registers `dock.toggle` (CmdOrCtrl+J), `dock.moveRight` and `dock.moveBottom` in a `View` category with `when` predicates so only the applicable move is listed. Deviations from plan.md: `DOCK_TABS` already carries each tab's lucide icon so T07's status bar reads one table rather than a second one, and `remountActive()` is exposed now for T06. The center gets `min-height: 0 / min-width: 0` only while the dock is open, so a closed dock leaves the existing layout byte-for-byte.

_Captured: 2026-09-10 · 5 file change(s)_

---

## T03 — Prompts, Activity and Feedback hosted in the dock

Added `panelTab()` to `src/renderer/dock.js` and used it for the Prompts, Activity and Feedback entries of `DOCK_TABS`: re-parent into the slot with `.dock-hosted`, call `show()`, observe `class` so the panel's own × closes the dock; `unmount` disconnects, calls `hide()` and returns the element home. Registered `dock.prompts` (CmdOrCtrl+Shift+L, replacing `panel.togglePrompts`), `dock.activity` and `dock.feedback` in `index.js` and moved `dock.init()` after the panels' `init()` so a dock restored open at boot can load. Removed the three entries from `PANEL_REGISTRY`, the `TOGGLE_HISTORY_PANEL` listener from `promptsPanel.js`, and rewrote `feedbackPanel.js`'s header. Deviation from plan.md: the width overrides are one `.dock-slot > .dock-hosted` rule in `dock.css` rather than three per-file rules in `panels.css` / `activity.css` / `feedback.css` — the same eight declarations for every re-parented panel belong in one place.

_Captured: 2026-09-10 · 6 file change(s)_

---

## T04 — Decisions hosted in the dock

Filled `DOCK_TABS.decisions` in `src/renderer/dock.js`: mount adds `.decisions-view-host` to the slot and calls `decisionsView.render(slot)`, unmount clears it; `dock.css` lets the rendered `.decisions-view` fill the slot by flex rather than by percentage height. Registered `dock.decisions` in `index.js`. Removed `showDecisions` / `hideDecisions` / `toggleDecisions`, the `isDecisionsVisible` flag with its seven guards, the `decisionsView` import and the `'decisions'` branch of `getActiveSurface()` from `multiTerminalUI.js`; rewrote `decisionsView.js`'s header. No deviation from plan.md. The nav's Decisions row and the palette's "Go to Decisions" still call the retired method until T08 / T10 remove them.

_Captured: 2026-09-10 · 5 file change(s)_

---

## T05 — Structure map hosted in the dock, overlay retired

Replaced the overlay lifecycle in `src/renderer/structureMap.js` with `mount(host)` / `show(projectPath)` / `refit()` / `hide()`: the container markup goes into the host given, `show()` abandons a load whose host unmounted meanwhile, `refit()` re-renders the current view, and the info-panel resize binds its document listeners once instead of per mount. Dropped `#structure-map-overlay` and `.structure-map-close` from `panels.css`; `dock.css` sizes the container to the slot, trims the 60px header to 36px and adds `.dock-empty`. `DOCK_TABS.structure` in `dock.js` mounts the map or the inline no-project state (D4), unmounts through `hide()`, and refits on resize-end / side change; `dock.structure` registered in `index.js`; `structureMap.init()` and `showStructureMap()` left `multiTerminalUI.js`. Deviation from plan.md: `init()` is removed rather than emptied, since nothing calls it. Followup: `panels.css` still carries `.structure-map-sidebar` / `.node-details` / `.map-control-*` rules that no markup has used for some time.

_Captured: 2026-09-10 · 6 file change(s)_

---

## T06 — Open dock tab follows the project switcher

Added one call at the end of `index.js`'s `state.onProjectChange` handler: `dock.remountActive()`, which unmounts and re-mounts the active tab while the dock is open, so Decisions and Structure re-render for the new project and the re-parented panels reload through their own `hide()` / `show()`. It runs on the null-project edge too, which turns an open Structure tab into its inline no-project state. No deviation from plan.md.

_Captured: 2026-09-10 · 1 file change(s)_

---

## T07 — Status-bar dock icons

Added `_buildDockIcons()` to `src/renderer/statusBar.js`, run before `_buildAgentSlot()` so the five icons sit ahead of the other-projects indicator: buttons built from `dock.DOCK_TABS`' icons, each click going through `commandRegistry.runById`, tooltips with the shortcut through `platform.formatShortcut`, `.on` driven by `dock.onChange` and painted once at build from `dock.isOpen()` / `activeTab()`, `console.error` when `.status-bar-left` is missing. `status-bar.css` gained the `.sb-dock` group and a hairline before `.sb-agents`. Deviation from plan.md: the icons are read from `DOCK_TABS` rather than listed a second time in the status bar; only the command id, tooltip and shortcut live here.

_Captured: 2026-09-10 · 2 file change(s)_

---

## T08 — Sidebar nav trimmed to Work / Context with a pinned Project Settings row

Trimmed `WORKSPACE_NAV_GROUPS` in `src/renderer/projectListUI.js` to Work (Terminals, Orchestration, Claude) and Context (Specs, Tasks), removed the Frame group, and added `WORKSPACE_NAV_FOOT` — Project Settings, running `settings.openProject` through the command registry, `surfaces: []` — rendered after the groups inside `.workspace-nav-foot` and appended to `WORKSPACE_NAV_ITEMS` so the existing click and highlight loops cover it unchanged; `terminals-view.css` draws the foot's hairline. Deviation from plan.md: the foot row carries `id="project-settings-btn"`, because `specDrivenHint.js` anchors its popover on that id and would otherwise go silent once T09 removes the rail button that held it.

_Captured: 2026-09-10 · 2 file change(s)_

---

## T09 — GitHub on the icon rail, Project Settings off it

Moved `#github-panel` in `index.html` into a new `[data-sidebar-tab-content="github"]` block behind a fourth rail tab after Changes, and removed the rail's foot button; `layout.css` lost `.sidebar-rail-btn-foot`, `panels.css` makes the panel fill the tab regardless of `.visible`, hides `#github-close` and drops the slide-in geometry inside the tab. In `index.js`, `revealSidebarTab('github')` calls `githubPanel.show()` the way Changes refreshes on reveal, `sidebar.github` (CmdOrCtrl+Shift+G, View) replaces `panel.toggleGitHub`, and the foot-button binding is gone; `PANEL_REGISTRY` is `{ claude }`. No deviation from plan.md; the create-branch modal was already a body-level overlay and stayed where it was.

_Captured: 2026-09-10 · 5 file change(s)_

---

## T10 — Native View menu wired through one channel; palette trimmed

Added `RUN_APP_COMMAND` to `src/shared/ipcChannels.js` and removed `TOGGLE_HISTORY_PANEL`. In `src/main/menu.js` the View menu now leads with Decisions · Structure Map · Prompts (⌘⇧L) · Activity · Feedback / Toggle Panel (⌘J) · Move Panel Right · Move Panel to Bottom / GitHub (⌘⇧G) · Project Settings… ahead of the Electron roles, every item going through `sendAppCommand(id)`; the AI-tool submenu's "Toggle Prompt History Panel" and `toggleHistoryPanel()` are gone. `index.js` listens for `RUN_APP_COMMAND` and runs `commandRegistry.runById`, logging an id that does not run. `paletteSources.viewItems` keeps terminals / specs / tasks / claude, since the other five rows duplicated registered commands. No deviation from plan.md.

_Captured: 2026-09-10 · 4 file change(s)_

---

