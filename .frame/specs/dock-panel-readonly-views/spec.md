---
keywords: dock panel, bottom panel, status bar icons, native menu, view menu, sidebar nav, sidebar rail, github tab, project settings, decisions, structure map, prompts, activity, feedback, vscode layout
related: sidebar-nav-groups, settings-by-scope, in-app-feedback, decisions-view, status-bar, terminals-home-agents, activity-monitor, resize-storm-watchdog
---

# Dock panel — readonly views leave the sidebar nav

> **What we're building:** A VS Code-style dock (bottom by default, movable
> to the right) that hosts the read-only surfaces — Decisions, Structure,
> Prompts, Activity — plus Feedback. Those rows leave the sidebar nav. The
> dock's tabs open from the native menu and from icons in the status bar.
> GitHub moves to the far-left icon rail; Project Settings moves from the
> rail's foot into the nav under the project.

## User's request (original, Turkish)

> şimdi ciddi bir ui değişikliğine gideceğiz frame içinde. bazı kullanılmayan
> ve readonly ekranlar var. Bunları proje altındaki menuden kaldıracağız.
> vscode gibi bir yapıya geçmemiz lazım. ya native menu var ya edit view gibi
> pencere üzerinde oradan açacağız ya da footer menusundeki iconlarla ya da
> ikisi birden. açılacak yerler alttan ya da sağdan bir section ile açılmalı.
> vscode terminal vs gibi. readonly ekranlar şu şekilde: decisions structure
> prompts ve activity. feedback'i de bu menuden kaldırıp footer'a koyabiliriz.
> ayrıca proje özelindeki ayarlar sol alt yerine proje altındaki menuye
> konumlanmalı. ayrıca bunların tümü native menuden açılabilir olmalı. Github
> menusunu de en sola alalım. Proje altından kaldıralım oraya koyalım.

Decided with the user on 2026-09-10, before this spec was written:

- **Dock position:** bottom by default, movable to the right ("Move Panel
  Right" / "Move Panel to Bottom"), the choice persisted.
- **Entry points:** native menu **and** status-bar icons. No in-window
  menu bar (Edit / View drawn by Frame) — on macOS it would duplicate the
  system menu.

## Problem

The workspace nav under the project lists eleven destinations in three
groups, and five of them — Decisions, Structure, Prompts, Activity,
Feedback — are things you *read* or *file*, not places you *work*. Each one
takes over the whole center when opened: Decisions is a center view, Structure
a full-window overlay, the other three are legacy side panels re-parented
into the center (`PANEL_REGISTRY`, `viewMode: 'panel'`). Opening any of them
hides the terminals, so glancing at the activity log while an agent runs
means leaving the agent. They read as first-class screens the user rarely
visits, and the nav pays for that in length.

Two other things sit in the wrong scope. GitHub is a project-wide surface
like Files and Changes, but it lives in the nav while those live in the icon
rail. Project Settings sits at the rail's foot, away from every other
project-scoped row.

## Goal

**1. A dock region** (`#dock`), a sibling of the center content inside
`#main-content`, in the shape VS Code's panel takes:

- A tab strip — **Decisions · Structure · Prompts · Activity · Feedback** —
  and a body that hosts exactly one tab's surface at a time.
- Docked at the **bottom** by default; a header control (and a menu item)
  moves it to the **right** and back. Position, open/closed, active tab and
  size persist in `localStorage`, app-wide (not per project).
- Resizable by a drag handle on its inner edge. Closes with its `×`, with
  the toggle shortcut (`CmdOrCtrl+J`, the VS Code convention), and from the
  menu.
- The dock is **not a view mode**. Opening it never changes what the center
  shows: terminals, a spec, the tasks board, a section tab all stay where
  they were and shrink to make room. Closing it gives the room back.
- The surfaces move, they are not rewritten: `decisionsView.render(el)`
  targets the dock body; `structureMap` renders into the dock body instead
  of its own overlay; Prompts / Activity / Feedback keep their elements and
  their `show()/hide()` contracts and are re-parented into the dock the way
  `PANEL_REGISTRY` re-parents them into the center today.

**2. Status-bar icons.** One monochrome icon per dock tab on the bar's
left slot, before the other-projects agent indicator, which keeps its place.
Click toggles that tab (open on it → close the dock; open on another → switch;
closed → open on it). The icon for the open tab reads as active. The bar
stays 26px and quiet — icons, not labelled buttons.

**3. Native menu.** A **View** menu that opens every destination this spec
touches, on every platform:

```
View
  Decisions            Structure            Prompts
  Activity             Feedback
  ───────────────
  Toggle Panel               ⌘J
  Move Panel Right / Move Panel to Bottom
  ───────────────
  GitHub               Project Settings…
  ───────────────
  (existing Electron roles: reload, zoom, full screen, dev tools)
```

Each item sends one message to the renderer; the renderer routes it through
the same command the palette and the status bar use, so the three entry
points cannot drift. The AI-tool menu's "Toggle Prompt History Panel" item
retires into View → Prompts.

**4. Sidebar nav and rail.**

- The nav loses Decisions, Structure, Prompts, Activity, Feedback and
  GitHub. The **Frame** group, now empty, goes. What remains:
  **Work** — Terminals, Orchestration, Claude · **Context** — Specs, Tasks ·
  and a **Project Settings** row under the project (placement: see Open
  Questions).
- The icon rail gains **GitHub** as a fourth view tab after Changes; the
  GitHub panel renders inside the sidebar's tab content like Files and
  Changes do, keeping its refresh / filter / create-branch chrome. The
  rail's foot button (Project Settings) is removed.

## Constraints

- **C1 — the center loses exactly the dock's size.** Terminals refit when
  the dock opens, closes, resizes or changes side; no clipped last row, no
  double scrollbar. Refits are debounced through the existing fit path —
  a drag must not produce a resize storm (`resize-storm-watchdog`).
- **C2 — the dock is a region, `viewMode` is untouched.** `getActiveSurface()`
  keeps reporting the center; the dock reports its own state through its
  own module. `showDecisions` / `isDecisionsVisible` and the `'panel'`
  hosting for prompts / activity / feedback retire with their nav rows.
  `PANEL_REGISTRY` keeps only what still mounts in the center (Claude).
- **C3 — one command per destination.** Palette, status bar, native menu
  and shortcuts all call the same registered command (`panel.togglePrompts`
  and friends already exist; Decisions, Structure, Activity, Feedback,
  Project Settings get theirs). Existing shortcuts keep working:
  `⌘⇧L` Prompts, `⌘⇧G` GitHub, `⌘⇧X` Claude.
- **C4 — the status bar stays a status bar** (`status-bar` spec): 26px,
  11px text, no labelled buttons. Icons only, with tooltips.
- **C5 — surfaces move without behavioural change.** Decisions' search /
  expand / refresh, Structure's canvas / info panel / view toggles,
  Prompts' search, Activity's live feed, Feedback's three tabs and
  delivery all work exactly as today, inside the dock.
- **C6 — main ↔ renderer stays one channel wide.** The menu speaks to the
  renderer through one generic "run command" message carrying a command id,
  not one channel per item. `TOGGLE_HISTORY_PANEL` / `TOGGLE_PLUGINS_PANEL`
  are folded into it or left as thin aliases; `OPEN_SETTINGS` keeps its
  contract (Frame Settings, `⌘,`).
- **C7 — a control that fails to bind must say so** (settings-by-scope C4).
- **C8 — the uncommitted work in the tree is not this spec's.** The specs
  dashboard drawer and the agent picker changes present on 2026-09-10 are
  left as they are; this spec branches from a clean tree or on top of them
  without touching those files' new lines.
- **C9 — tests keep passing** (`npm test`, 42 files). The dock's state
  (position / open / tab / size, defaults and clamping) lives in a pure
  module with its own test.

### Decisions explicitly reversed

- **`decisions-view` (2026-08-24)** — Decisions became a center view and
  Structure got its own sidebar item. Both now live in the dock; neither
  is in the nav.
- **`sidebar-nav-groups` (2026-08-26)** — the Project group was withdrawn
  mid-request and Settings stayed on the rail "because the rail was not
  going to empty out". The rail now changes anyway (GitHub in, Settings
  out), so Project Settings moves under the project as the user asked then
  and asks again now. The Frame group, created there, retires.
- **`settings-by-scope` (2026-08-26)** — Project Settings opens "from the
  rail's foot, where the old gear was". The surface, its contents and its
  sliders icon stand; only its address changes.
- **`in-app-feedback` (2026-08-31)** — "a Feedback row in the sidebar's
  Frame group". The panel stands; its entry points become the status bar,
  the View menu and the palette.
- **`status-bar` (2026-08-26)** — "the bar's left half is an empty, named
  slot — nothing is invented to fill it now". Now is later: the slot takes
  the dock icons, ahead of the other-projects agent indicator that
  `terminals-home-agents` placed there.

## Success Criteria

- When the user clicks Decisions in the status bar with the dock closed,
  then the dock opens at the bottom on the Decisions tab and the terminals
  above it refit with no clipped row.
- When the dock is open on Prompts and the user clicks the Prompts icon
  again, then the dock closes and the center regains the space.
- When the dock is open on Prompts and the user picks View → Activity, then
  the dock switches tabs without changing what the center shows.
- When the user chooses Move Panel Right, then the dock re-docks on the right
  edge with the same tab open, and the position survives a restart.
- When the user presses `⌘J`, then the dock toggles; when it reopens, it
  reopens on the last active tab at the last size.
- When Structure is opened from the dock, then the map renders inside the
  dock body with its canvas, info panel and view toggles working, and no
  full-window overlay appears.
- When Feedback is opened from the dock and a Bug report is submitted, then
  the GitHub issue draft opens exactly as it does today.
- When the user clicks the GitHub rail tab, then the GitHub panel shows in
  the sidebar's tab content with refresh, filter and Create Branch working,
  and the center is unchanged.
- When the user clicks the Project Settings row under the project, then the
  Project Settings modal opens; the rail has no foot button.
- When the nav renders, then it shows Work (Terminals, Orchestration,
  Claude), Context (Specs, Tasks) and Project Settings — no Decisions,
  Structure, Prompts, Activity, Feedback, GitHub or Frame group.
- When any dock tab, GitHub or Project Settings is chosen from the native
  menu on macOS, Windows or Linux, then the same thing happens as from the
  palette.
- When the command palette is opened, then every destination above is
  listed once, with its shortcut where one exists.
- When `npm test` runs, then every suite passes, including a new one for
  the dock state module.

## Out of Scope

- The Claude panel's placement (stays in Work, still a center panel).
- Contents or behaviour of any hosted surface (Decisions, Structure,
  Prompts, Activity, Feedback, GitHub, Project Settings).
- An in-window menu bar drawn by Frame.
- Files and Changes tabs, the project switcher, Home / Terminals model.
- The specs dashboard drawer and agent picker work in progress on
  2026-09-10.
- Frame Settings (`⌘,`) and its entry points.

## Open Questions

- **Where does Project Settings sit in the nav?** (a) a fourth group,
  **Project**, holding one row — the group name withdrawn in
  `sidebar-nav-groups`; (b) a single ungrouped row pinned at the foot of the
  nav, below Context.
- **Structure's overlay code path.** `structureMap.js` (1341 lines) builds
  its own `#structure-map-overlay` with a backdrop click-to-close. Options:
  (a) render the same markup into the dock body and drop the overlay-only
  parts (backdrop, close); (b) keep the overlay for the `⌘K` palette path
  and add a dock host — two hosts for one map. (a) is the default unless
  the plan's evidence pass finds the canvas depends on viewport sizing.
- **Right-docked width for the read surfaces.** Decisions prose is capped at
  900px and Structure wants width; a right dock narrower than ~420px makes
  both cramped. Minimum width when docked right: 380px like the old panels,
  or 480px?
