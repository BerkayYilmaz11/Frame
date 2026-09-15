---
keywords: app header, title bar, top bar, sidebar collapse, dock collapse, layout toggles, shell layout, vscode layout, theme toggle, agent launcher
related: compact-center-vs-code-density, dock-panel-readonly-views, terminals-home-agents, status-bar, sidebar-project-section, sidebar-nav-groups
---
# Shell chrome — one app header, collapsible sidebar and dock

## Problem

Frame's shell reads as rigid next to VS Code. The window's top edge is split
in two: the sidebar carries its own header (the Frame mark, the version, the
update dot) and the center carries a separate top bar that mixes two
different things — the navigation strip (Home, Terminals, terminal chips,
section chips) and window-level controls (agent picker, Start, update bell,
theme toggle). Nothing on screen says the sidebar or the dock can be
collapsed; both can (⌘B, ⌘J) but only through shortcuts and menus the user
has to know about. The result feels fixed where VS Code feels flexible: one
title row across the whole window with the layout toggles at its right end,
and every region below it collapsible from there.

## Goal

A VS Code-shaped shell, in three parts:

1. **One app header, full width, one piece.** A single row across the whole
   window above the sidebar and the center, never split by the sidebar's
   border. Left: the Frame mark (with version and the update dot as today).
   Right, in order: the default-agent picker, Start, the layout toggles
   (sidebar, dock), the theme toggle, the update/notification bell. The
   sidebar's own header goes away; the center's top bar loses its right
   action cluster.
2. **Sidebar and dock collapse from the header.** Two toggle buttons in the
   header, VS Code's "toggle primary side bar" / "toggle panel" idiom: each
   shows the region's open/closed state and flips it on click. They drive the
   existing `panel.toggleSidebar` (⌘B) and `dock.toggle` (⌘J) commands, so the
   shortcuts, the View menu, the palette and the buttons all agree. A
   collapsed sidebar is fully hidden (the whole work-context column, rail
   included), not reduced to a rail. Resize keeps working as it does now.
3. **The center keeps an inner header of its own.** The strip that lives in
   today's top bar — Home, Terminals, the terminal breadcrumb chips, the
   section chips (task / spec / diff / orchestrator) — stays as the center's
   first row, with the same strip semantics. It is now purely navigation.

## Constraints

- **Strip semantics are untouched** (terminals-home-agents): × means "drop
  from this strip", never destroy; Home is permanent; every live terminal is
  a chip; `shownTerminal` / `hiddenFromBar` prefs stay. Only the row's right
  half moves out.
- **The center stays one flat surface** (compact-center-vs-code-density): no
  margin, padding or radius between the sidebar's border and the window
  edge; the inner header is 35px and nothing taller than 32px sits in it.
- **Dock rules hold** (dock-panel-readonly-views): the header's dock button
  runs the registered `dock.toggle` command — no new IPC channel, no second
  state store; dock state stays in `dockState` / `frame-dock`. Anything that
  changes the center's size calls `terminal.fitTerminal()` once, after the
  change settles.
- **Sidebar hide/show stays in `sidebarResize`** (`sidebar-hidden`,
  `sidebar-width`); the header button is a caller, not a second owner.
- **Controls vs readouts** (status-bar): the header holds controls you click;
  the status bar keeps ambient readouts. Nothing moves between the header
  and the status bar.
- **Element ids that other modules bind to keep working**:
  `#ai-tool-selector` (aiToolSelector.mountSelector), `#sidebar-agent-launch`,
  `#sidebar-theme-btn`, `.btn-update-notify`, `#update-dot`, `#app-version`.
  Moving them is fine; renaming them is not, unless every binder moves with
  them in the same task.
- **Theme restore and the theme toggle stay wired where the element is
  rendered** (status-bar decision: binding from index.js raced the render).
- The window keeps macOS's native title bar; the app header is a Frame row
  below it, not a custom title bar (no `titleBarStyle` change).
- Boot must not flash: the header and the collapsed states render from
  persisted values before first paint, as the sidebar width does today.
- Overlays stay body children; the Specs and Tasks panels keep their own
  headers and their absolute positioning over the center.
- No new dependencies. Both schemes and all four themes (Dark, Light, Dark+,
  Light+) must look right.

## Success Criteria

- When the app opens, then one header row spans the full window width above
  both the sidebar and the center, with the Frame mark at its left and the
  agent picker, Start, sidebar toggle, dock toggle, theme toggle and bell at
  its right; the sidebar has no header of its own.
- When the sidebar toggle in the header is clicked, then the whole sidebar
  column disappears and the center fills its space; clicking again restores
  it at its previous width; the terminal refits once each way.
- When ⌘B, View › Toggle Sidebar or the palette toggles the sidebar, then the
  header button's state updates to match, and vice versa.
- When the dock toggle in the header is clicked, then the dock opens (on its
  last tab and side) or closes; ⌘J, the View menu, the status-bar icons and
  the dock's own × all leave the header button showing the right state.
- When the app is relaunched with the sidebar and/or dock collapsed, then
  they come back collapsed, with no flash of the expanded layout.
- When the center shows Home, Terminals, an enlarged terminal or an open
  section, then the center's first row is the navigation strip alone: same
  chips, same ×, same highlight rules as before; no agent picker, Start,
  theme or bell in it.
- When Start is clicked in the header, then it launches the picker's agent
  in the focused terminal exactly as it does today; when the agent is
  changed in the header, then Home's Agents widget reflects it and vice
  versa.
- When a Light or Dark+ theme is active, then the header uses that theme's
  chrome tokens and reads as one row with no seam at the sidebar boundary.
- When the sidebar is hidden, then the resize handle is not reachable, and
  when shown, then drag-resize and double-click reset work as before.

## Out of Scope

- A secondary (right) side bar or moving the dock into it.
- Turning the sidebar into a rail-only collapsed state (VS Code's activity
  bar staying visible).
- A custom / hidden macOS title bar, traffic-light layout, window drag
  regions.
- Sidebar density and its internal headers (project switcher, rail tabs) —
  sidebar-project-section / sidebar-nav-groups territory.
- Status bar content or layout (status-bar, status-bar-branch-picker).
- Reworking what earns a chip in the strip (terminals-home-agents).
- The Specs / Tasks panel headers and their collapse buttons.

## Open Questions

- **Where does the project switcher go once the sidebar header is gone?**
  Options: (a) it stays as the sidebar's first row, above the rail-and-panel
  split, exactly where it is now — the header only removes the mark row
  above it; (b) it moves into the app header's center, VS Code
  command-center style, showing the project name. (a) keeps
  sidebar-project-section's decision and the switcher available only when
  the sidebar is open; (b) keeps it reachable with the sidebar collapsed.
