# Plan — Dock panel — readonly views leave the sidebar nav

## Architecture

### Resolved plan-time decisions

- **D1 · Project Settings placement (business, asked)** — a single ungrouped
  row pinned at the foot of the workspace nav, below Context. Rejected: a
  fourth "Project" group holding one row — a group header for one row is
  furniture. Recorded with the user on 2026-09-10.
- **D2 · Test posture (technical, asked)** — pure logic only. The dock's
  state (position / open / tab / size, defaults, sanitising, clamping) lives
  in `src/renderer/dock/dockState.js`, dependency-free like
  `src/renderer/home/`, with `test/dockState.test.js`. The DOM host is not
  tested: the project has no DOM harness (testing record, PROJECT_NOTES).
- **D3 · Structure host (technical, silent)** — render the map straight
  into the dock body and retire the overlay. Evidence: both renderers size
  from the host (`structureMap.js:389-390`, `:599-600` read
  `container.clientWidth/Height`), so the map fits whatever contains it.
  What the overlay owned and the dock now owns: backdrop click, Escape,
  the × button. The map re-renders on dock resize-end and side change so
  the graph fits the new box. Rejected: two hosts (overlay for ⌘K, dock
  for the tab) — one map, one host.
- **D4 · Structure with no project (business, silent)** — the dock body
  shows an inline empty state ("No project selected — pick one from the
  switcher") in the same shape `decisionsView.renderEmpty` uses, instead of
  the `taskInfoModal` that `showStructureMap` raises today
  (`multiTerminalUI.js:823-833`).
- **D5 · Dock sizes (technical, silent)** — bottom: default 320px, min 140,
  max 80% of the center's height. Right: default 480px, min 360, max 80%
  of the center's width. 480 is the width the retired specs detail aside
  used; the old side panels were 360–440px (`panels.css:3900`,
  `activity.css:8`, `feedback.css:9`), so nothing hosted here gets less
  room than it had.
- **D6 · Menu → renderer channel (technical, silent; spec drift)** — a new
  `RUN_APP_COMMAND: 'run-app-command'` carrying a command-registry id.
  The spec's C6 named `RUN_COMMAND`, but that channel already means "type
  this into the terminal" (`menu.js:250` → `terminal.js:135`); reusing it
  would route "Decisions" into a shell. `TOGGLE_HISTORY_PANEL` retires: its
  only sender is the menu item that retires (`menu.js:195-199`, `:257-261`)
  and its only listener is `promptsPanel.js:52`. `TOGGLE_PLUGINS_PANEL` is
  untouched — not this spec's. `OPEN_SETTINGS` keeps its contract.
- **D7 · Dock placement in the DOM (technical, silent)** — `#dock` is the
  last child of `#terminal-container` (`layout.css:696`, a flex column).
  `#terminal-container.dock-right` flips it to `flex-direction: row`. One
  element, one class; the sidebar is outside it, so a bottom dock never
  runs under the sidebar (the VS Code shape).
- **D8 · GitHub in the sidebar (technical, silent)** — `#github-panel`
  moves in markup into a new `[data-sidebar-tab-content="github"]` block.
  In the sidebar it is always displayed (`.visible` no longer gates it) and
  its `#github-close` is hidden — there is nothing to close to.
  `revealSidebarTab('github')` calls `githubPanel.show()` so the tab loads
  on reveal, the way `changes` sends `REFRESH_GIT_STATUS`
  (`index.js:485`). `panel.toggleGitHub` becomes `sidebar.github` ("Show
  GitHub"), keeping `CmdOrCtrl+Shift+G`. `PANEL_REGISTRY` drops `github`.
- **D9 · Dock hosting model (technical, silent)** — Prompts, Activity and
  Feedback keep their elements and `show()/hide()`; `dock.js` re-parents
  them into their tab slot and returns them on unmount, the `_panelHome`
  mechanism `multiTerminalUI.js:443-475` uses today. A MutationObserver on
  the element's `class` closes the dock when the panel drops `.visible` on
  its own (its × button). Decisions and Structure render into their slots
  (`decisionsView.render(slot)`, `structureMap.mount(slot)`).
- **D10 · Status-bar icons (technical, silent)** — `lucide` (already a
  dependency, used by `sectionRail.js:18`): `ScrollText` Decisions,
  `Waypoints` Structure, `SquareTerminal` Prompts, `Activity` Activity,
  `MessageSquarePlus` Feedback. 14px, `--text-secondary` at rest,
  `--accent-primary` when that tab is open. Tooltips carry the shortcut.
- **D11 · Shortcuts (technical, silent)** — `CmdOrCtrl+J` toggles the dock
  (free in the registry — verified against every `shortcut:` in
  `index.js`). `CmdOrCtrl+Shift+L` stays on Prompts, now a dock toggle.
- **D12 · Commands are the seam (technical, silent)** — every entry point
  (status bar, View menu, palette, shortcut, nav row) calls a registered
  command id; nothing calls `dock.js` or `multiTerminalUI` directly from
  main. `paletteSources.viewItems` loses the rows that would now duplicate
  a registered command (decisions, structure, github, prompts, activity)
  and keeps terminals / specs / tasks / claude.
- **D13 · Footprint overlap (technical, silent)** — `spec-context` flags
  `index.html` and `structureMap.js` as in the footprint of
  `audit-q3-performance-resources` (phase `implementing`, last touched
  2026-08-26) and `ipcChannels.js` / `index.js` in `audit-q3-cross-platform`
  (`planned` since 2026-07-20). Neither has a worktree (`git worktree list`
  shows only main) or activity in two weeks; both are dormant. This plan
  stays out of `terminalManager.js`, the one file both of them and the
  terminal refit share — fits go through `terminal.fitTerminal()` →
  `multiTerminalUI.fitTerminal()` → `manager.fitAll()` (`terminal.js:43`,
  `multiTerminalUI.js:714`, `terminalManager.js:689`).
- **D14 · Uncommitted work (silent)** — the specs-dashboard drawer and
  agent-picker changes in the tree on 2026-09-10 are not touched. The two
  files this plan shares with them (`index.html`, `multiTerminalUI.js`) are
  edited in regions those changes do not reach (`#terminal-container`, the
  sidebar rail, the panel markup; `PANEL_REGISTRY`, `showDecisions`,
  `showStructureMap`).

### The dock

A region, not a view mode. `viewMode` and `getActiveSurface()` keep
describing the center; the dock describes itself.

```
#terminal-container                      (flex column; .dock-right → row)
  #terminal → .multi-terminal-wrapper    (the center, flex: 1, unchanged)
  #dock                                  (hidden unless state.open)
    .dock-resize-handle                  (top edge when bottom, left edge when right)
    .dock-header
      .dock-tabs   [Decisions][Structure][Prompts][Activity][Feedback]
      .dock-actions [move ⇄][×]
    .dock-body
      .dock-slot[data-tab=decisions]     ← decisionsView.render(slot)
      .dock-slot[data-tab=structure]     ← structureMap.mount(slot)
      .dock-slot[data-tab=prompts]       ← #prompts-panel re-parented
      .dock-slot[data-tab=activity]      ← #activity-panel re-parented
      .dock-slot[data-tab=feedback]      ← #feedback-panel re-parented
```

**State** (`dockState.js`, pure; storage key `frame-dock`, app-wide):

```js
{ open: false, position: 'bottom' | 'right',
  tab: 'decisions' | 'structure' | 'prompts' | 'activity' | 'feedback',
  size: { bottom: 320, right: 480 } }
```

- `defaults()`; `TABS` (ordered ids); `LIMITS` (D5).
- `load(raw)` → a valid state from anything: unknown tab → `decisions`,
  unknown position → `bottom`, sizes clamped, non-object → defaults.
- `toggleTab(state, tab)` → open on that tab → closed; open on another →
  switched; closed → open on it.
- `open(state, tab?)`, `close(state)`, `setPosition(state, position)`,
  `resize(state, px, available)` → clamped to `[min, 0.8 × available]`.
- `serialize(state)` → the string written to `localStorage`.

**Host** (`dock.js`): binds to `#dock` (console.error and return if
absent — C7), owns `DOCK_TABS` (label, icon, `mount(slot)`, `unmount(slot)`,
optional `refit()`), applies state to the DOM, persists through
`dockState.serialize`, and calls `terminal.fitTerminal()` after open,
close, side change and resize-end. During a drag the size is applied per
`requestAnimationFrame`; the terminal refit and the Structure `refit()` run
once, on mouseup (C1 — no storm). `onChange(fn)` lets the status bar
follow. API: `init()`, `open(tab)`, `close()`, `toggle()`, `toggleTab(tab)`,
`setPosition(pos)`, `isOpen()`, `activeTab()`.

Only the active tab is mounted; switching unmounts the previous one
(returns a re-parented panel to its original parent with `hide()`, clears a
rendered slot), so a panel's IPC subscriptions behave exactly as they do
under `PANEL_REGISTRY` today.

### Commands (the seam every entry point shares)

| id | title | shortcut | does |
| --- | --- | --- | --- |
| `dock.toggle` | Toggle Panel | `CmdOrCtrl+J` | `dock.toggle()` |
| `dock.decisions` | Toggle Decisions | — | `dock.toggleTab('decisions')` |
| `dock.structure` | Toggle Structure Map | — | `dock.toggleTab('structure')` |
| `dock.prompts` | Toggle Prompts | `CmdOrCtrl+Shift+L` | replaces `panel.togglePrompts` |
| `dock.activity` | Toggle Activity | — | `dock.toggleTab('activity')` |
| `dock.feedback` | Toggle Feedback | — | `dock.toggleTab('feedback')` |
| `dock.moveRight` | Move Panel Right | — | `dock.setPosition('right')` |
| `dock.moveBottom` | Move Panel to Bottom | — | `dock.setPosition('bottom')` |
| `sidebar.github` | Show GitHub | `CmdOrCtrl+Shift+G` | replaces `panel.toggleGitHub`; `revealSidebarTab('github')` |
| `settings.openProject` | Project Settings | — | exists (`index.js:530`); gains the nav row and the menu item |

Category `View` for the dock and sidebar commands so the palette groups
them. `panel.togglePlugins` (`CmdOrCtrl+Shift+X`) is unchanged.

### Native menu

`getMenuTemplate()`'s View entry (`menu.js:50-63`) is prefixed with the
destinations, each `click: () => sendAppCommand('<id>')` where
`sendAppCommand` does `mainWindow.webContents.send(IPC.RUN_APP_COMMAND, id)`.
The renderer's one listener (`index.js`, beside the other `ipcRenderer.on`
bindings) runs `commandRegistry.runById(id)`. The AI-tool submenu loses
"Toggle Prompt History Panel" and `toggleHistoryPanel()`; "Open History
File" stays. Accelerators shown in the menu are the registry's, typed once
in `menu.js` — the menu cannot read the renderer's registry, so the two
lists are kept adjacent by a comment naming the other.

```
View
  Decisions · Structure Map · Prompts · Activity · Feedback
  ─
  Toggle Panel ⌘J · Move Panel Right · Move Panel to Bottom
  ─
  GitHub ⌘⇧G · Project Settings…
  ─
  reload · forceReload · toggleDevTools · resetZoom · zoomIn · zoomOut · togglefullscreen
```

### Sidebar nav and rail

`WORKSPACE_NAV_GROUPS` (`projectListUI.js`) becomes two groups plus a
pinned row:

```
WORK      Terminals · Orchestration · Claude
CONTEXT   Specs · Tasks
──────────────────────────────
⚙ Project Settings                       (.workspace-nav-foot, ungrouped — D1)
```

The foot row is rendered by `buildWorkspaceNav()` after the groups, in the
row shape the groups use, with `open: () => commandRegistry.runById('settings.openProject')`
and `surfaces: []` (a modal is never the active surface). `refreshWorkspaceNav`
needs no new branch: it iterates `WORKSPACE_NAV_ITEMS`, and the foot row is
appended to that list.

The rail (`index.html:118-147`) becomes Projects · Files · Changes ·
GitHub; the foot button and its comment go. `index.js:292-295` (the
foot-button binding) goes with it. `revealSidebarTab` gains the GitHub
load (D8).

### Structure map, rehosted

`structureMap.js`: `init()` no longer creates an overlay. New
`mount(host)` writes the container markup (header with view toggle and
legend, canvas, info panel with its resize handle — the close button and
backdrop dropped) into `host` and binds the handlers `createOverlay` binds
today (`:132-225`) minus close/backdrop/Escape. `show(projectPath)` keeps
loading and rendering; `hide()` clears the host; new `refit()` re-renders
the current view from `currentStructureData` when present. The
`#structure-map-overlay` rules (`panels.css:2643-2653`) become
`.dock-slot[data-tab="structure"] .structure-map-container` rules; the
container / canvas / info-panel rules (`panels.css:3175+`) are kept and
re-scoped, not rewritten.

### Status bar

`statusBar.js` gains `_buildDockIcons()`: a `.sb-dock` group of five
`button.sb-dock-btn[data-tab]` inserted into `.status-bar-left` **before**
the agents indicator (`_buildAgentSlot`, `statusBar.js:66`), each running
its command on click and taking `.on` from `dock.onChange`. Fails loudly if
the slot is missing (C7). `status-bar.css` adds the group; the bar's
height token is untouched (C4).

### What retires

- `multiTerminalUI.js`: `showDecisions` / `hideDecisions` /
  `toggleDecisions` / `isDecisionsVisible`, the `decisionsView` import,
  the `'decisions'` branch of `getActiveSurface()`, `showStructureMap`,
  the `structureMap.init()` call (`:103`), and the `github` / `prompts` /
  `activity` / `feedback` entries of `PANEL_REGISTRY` (leaving `claude`;
  the `'panel'` view mode and `_renderPanelView` stay for it).
- `projectListUI.js`: the Frame group; the Decisions, Structure, Prompts,
  Activity, Feedback and GitHub rows.
- `menu.js`: "Toggle Prompt History Panel", `toggleHistoryPanel()`.
- `ipcChannels.js`: `TOGGLE_HISTORY_PANEL`. `promptsPanel.js:52-54`: its
  listener.
- `index.html`: the rail's foot button; `#structure-map-overlay` is never
  created.
- `paletteSources.js`: the five `jump.view:*` rows now covered by commands.

## Files

- **New** `src/renderer/dock/dockState.js` — pure dock state: defaults, load/sanitise, toggleTab, open/close, setPosition, resize clamp, serialize.
- **New** `test/dockState.test.js` — the state module's contract (defaults, bad input, toggle semantics, clamping, round-trip).
- **New** `src/renderer/dock.js` — the dock host: binds `#dock`, `DOCK_TABS`, mount/unmount, drag-resize, position, persistence, `onChange`, terminal refit.
- **New** `src/renderer/styles/components/dock.css` — dock layout for both sides, tab strip, handle, slots; width/height overrides for the re-parented panels.
- **Modified** `index.html` — `#dock` shell inside `#terminal-container`; GitHub rail tab and `[data-sidebar-tab-content="github"]` hosting `#github-panel`; rail foot button removed.
- **Modified** `src/renderer/styles/main.css` — `@import 'components/dock.css'`.
- **Modified** `src/renderer/styles/layout.css` — `#terminal-container.dock-right`; GitHub tab content; `.sidebar-rail-btn-foot` rule removed.
- **Modified** `src/renderer/styles/components/status-bar.css` — `.sb-dock` icon group and its `.on` state.
- **Modified** `src/renderer/styles/components/panels.css` — structure map rules re-scoped from the overlay to the dock slot; `#github-panel` in the sidebar (always shown, close hidden, width auto); `#prompts-panel` width auto inside the dock.
- **Modified** `src/renderer/styles/components/activity.css` — width auto inside the dock.
- **Modified** `src/renderer/styles/components/feedback.css` — width auto inside the dock.
- **Modified** `src/renderer/multiTerminalUI.js` — retirements listed above; `PANEL_REGISTRY` → `{ claude }`.
- **Modified** `src/renderer/projectListUI.js` — `WORKSPACE_NAV_GROUPS` trimmed to Work / Context; pinned Project Settings foot row.
- **Modified** `src/renderer/statusBar.js` — `_buildDockIcons()` ahead of the agents slot.
- **Modified** `src/renderer/structureMap.js` — `mount(host)` / `refit()`; overlay, backdrop, Escape and close retire.
- **Modified** `src/renderer/decisionsView.js` — header comment: hosted in the dock, not the center. No behaviour change.
- **Modified** `src/renderer/promptsPanel.js` — `TOGGLE_HISTORY_PANEL` listener removed.
- **Modified** `src/renderer/feedbackPanel.js` — header comment (`:34`) no longer describes `PANEL_REGISTRY` hosting.
- **Modified** `src/renderer/paletteSources.js` — `viewItems` keeps terminals / specs / tasks / claude.
- **Modified** `src/renderer/index.js` — `dock.init()`; commands table above; `RUN_APP_COMMAND` listener; `revealSidebarTab('github')` load; foot-button binding removed.
- **Modified** `src/main/menu.js` — View destinations via `sendAppCommand`; history toggle removed.
- **Modified** `src/shared/ipcChannels.js` — `RUN_APP_COMMAND` added; `TOGGLE_HISTORY_PANEL` removed.

## Footprint

- index.html
- src/renderer/dock.js
- src/renderer/dock/dockState.js
- src/renderer/styles/components/dock.css
- src/renderer/styles/main.css
- src/renderer/styles/layout.css
- src/renderer/styles/components/status-bar.css
- src/renderer/styles/components/panels.css
- src/renderer/styles/components/activity.css
- src/renderer/styles/components/feedback.css
- src/renderer/multiTerminalUI.js
- src/renderer/projectListUI.js
- src/renderer/statusBar.js
- src/renderer/structureMap.js
- src/renderer/decisionsView.js
- src/renderer/promptsPanel.js
- src/renderer/feedbackPanel.js
- src/renderer/paletteSources.js
- src/renderer/index.js
- src/main/menu.js
- src/shared/ipcChannels.js
- test/dockState.test.js

## Dependencies

None. `lucide` (icons) and `marked` (Decisions) are already in `package.json`.

## Sequencing

1. **Dock state, pure.** Write `src/renderer/dock/dockState.js` (`defaults`, `TABS`, `LIMITS`, `load`, `toggleTab`, `open`, `close`, `setPosition`, `resize`, `serialize`) and `test/dockState.test.js` covering defaults, garbage input, every `toggleTab` transition, clamping at both ends for both sides, and a serialize → load round-trip. Nothing else changes; the suite grows by one file.
2. **Dock shell.** Add the `#dock` markup to `index.html` inside `#terminal-container`, `dock.css` (+ `main.css` import), and `dock.js` with empty `DOCK_TABS` slots: tab strip, ×, move control, drag handle with rAF-applied size and a single refit on mouseup, `#terminal-container.dock-right`, persistence through `dockState`, `onChange`. Register `dock.toggle` (`CmdOrCtrl+J`), `dock.moveRight`, `dock.moveBottom` in `index.js` and call `dock.init()` from the same place the other renderer modules initialise. Result: an empty dock that opens, moves, resizes and closes, with the terminals refitting each time.
3. **Prompts, Activity, Feedback into the dock.** Add their `DOCK_TABS` entries (re-parent on mount, return + `hide()` on unmount, MutationObserver on `.visible`), the `.dock-slot` width overrides in `panels.css` / `activity.css` / `feedback.css`, and the commands `dock.prompts` (replacing `panel.togglePrompts`, `CmdOrCtrl+Shift+L`), `dock.activity`, `dock.feedback`. Remove the three entries from `PANEL_REGISTRY`, the `TOGGLE_HISTORY_PANEL` listener in `promptsPanel.js`, and fix the `feedbackPanel.js` header comment.
4. **Decisions into the dock.** `DOCK_TABS.decisions` renders `decisionsView.render(slot)` into a slot carrying `.decisions-view-host` (the class its CSS is scoped to); command `dock.decisions`. Remove `showDecisions` / `hideDecisions` / `toggleDecisions` / `isDecisionsVisible`, the `decisionsView` import and the `'decisions'` surface from `multiTerminalUI.js`; update the `decisionsView.js` header comment.
5. **Structure into the dock.** `structureMap.js`: `init()` stops creating the overlay; add `mount(host)`, `refit()`; drop backdrop / Escape / close. Re-scope the overlay CSS in `panels.css` to the dock slot. `DOCK_TABS.structure` mounts on first show, calls `show(projectPath)` per open, renders the inline no-project state (D4), and wires `refit` to the dock's resize-end and side change. Command `dock.structure`. Remove `showStructureMap` and the `structureMap.init()` call from `multiTerminalUI.js`.
6. **Status-bar icons.** `statusBar._buildDockIcons()` with the five lucide icons ahead of the agents indicator, `.on` driven by `dock.onChange`, tooltips with shortcuts, `console.error` when the slot is missing; `status-bar.css` for the group.
7. **Sidebar nav.** Trim `WORKSPACE_NAV_GROUPS` to Work (Terminals, Orchestration, Claude) and Context (Specs, Tasks); remove the Frame group; add the pinned Project Settings foot row (`.workspace-nav-foot`, running `settings.openProject`); its CSS beside the existing `.workspace-nav-*` rules.
8. **GitHub to the rail; Project Settings off it.** `index.html`: GitHub rail tab (`data-sidebar-tab="github"`), a `[data-sidebar-tab-content="github"]` block that now contains `#github-panel`, the foot button removed. `layout.css` / `panels.css`: the panel fills the tab, `#github-close` hidden, `.sidebar-rail-btn-foot` gone. `index.js`: `revealSidebarTab('github')` calls `githubPanel.show()`; `sidebar.github` (`CmdOrCtrl+Shift+G`) replaces `panel.toggleGitHub`; the foot-button binding is removed; `PANEL_REGISTRY` loses `github`, leaving `{ claude }`.
9. **Native menu and palette.** `ipcChannels.js`: add `RUN_APP_COMMAND`, remove `TOGGLE_HISTORY_PANEL`. `menu.js`: View destinations through `sendAppCommand`, the history toggle item and function removed. `index.js`: the `RUN_APP_COMMAND` → `commandRegistry.runById` listener. `paletteSources.viewItems` trimmed to terminals / specs / tasks / claude so each destination is listed once.
