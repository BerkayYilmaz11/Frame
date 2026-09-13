---
keywords: padding, compact, density, terminal-container, terminals-view, tv-pane, tab bar, view-header, VS Code, layout
related: terminals-home-agents, dock-panel-readonly-views, github-view-tree-layout, status-bar, home-widget-board
---

# Compact center — VS Code density for the right side

## User's request (original, Turkish)

> bir ui geliştirmesi yapmamız lazım. sol panelle sağ tarafı ayırdık ui'da.
> ancak sağda çokça padding var. vs code gibi daha compact bir görüntü
> olmasını istiyorum. bu paddinglerin olmaması lazım.

## Problem

The center (everything right of the sidebar) wastes space. Not because the
spacing tokens are large — `--space-*` is 4/6/10/14/20px — but because every
level of the tree is its own rounded card sitting inside the one above it:

| Layer | Rule | Cost |
| --- | --- | --- |
| `#terminal-container` | `layout.css:668` — margin 6px, padding 10px, left radius 6px on `--bg-deep` | 16px each side, a visible "card in a frame" |
| `.terminal-tab-bar` | `terminal.css:21` — 42px tall, rounded top, `0 10px` padding | 7px taller than VS Code's 35px tab strip |
| `.terminals-view` | `terminals-view.css:9` — padding `10px 14px 14px`, gap 10px | 14px gutter around the pane |
| `.tv-pane` (single) | `terminals-view.css:172` — 1px border, radius 6px, own background | a third card |
| `.tv-pane-header` | `terminals-view.css:213` — `7px 10px` | ~33px repeating the name already in the tab bar chip |
| `.tv-pane-content` | `terminals-view.css:326` — `4px 6px 6px` | 6px on top of xterm's own cell padding |

Enlarged terminal, measured: ~37px from the sidebar edge to the first
character, ~105px from the window top. VS Code: tab strip ends, editor starts.
The dock (`#dock`) is a child of `#terminal-container`, so it inherits the
same 10px padding. The other center surfaces have the same habit: `.lane-board`
(Home) pads 24px; `.view-header` (Specs, Tasks, Sessions, Orchestration,
GitHub) pads `14px 20px`.

The cost is fewer terminal columns and rows on every screen, and a UI that
reads as "app in a window in a window" next to the editor it sits beside.

## Goal

The center is one flat surface from the sidebar's right border to the window
edge and from the top to the status bar. Concretely:

1. `#terminal-container` has no margin, padding or border-radius. The dock
   gets the same by inheritance.
2. The top bar (`.terminal-tab-bar`) is 32–35px, square-cornered, separated
   from the content by a single bottom border. `.terminal-content` loses its
   rounded bottom corners.
3. Enlarged terminal (`.tv-single`): `.terminals-view` padding and gap are 0,
   the pane draws no border, radius or background of its own, and
   `.tv-pane-content` pads at most 4px on the left, 0 elsewhere. Text starts
   within ~5px of the sidebar border and directly under the pane header.
4. Pane header in single mode is thin (≤ 26px) — it still carries the
   status, attention mark, assignment chip and actions, which the tab bar
   chip does not.
5. Grid (`.tv-grid`): the outer padding is 0; panes keep a 4–6px gap between
   each other and keep their border, because there the border is what
   separates one terminal from the next.
6. The Other Terminals rail (`.tv-single .lane-rail`) sits flush against the
   window edge; the negative margin that compensated for the old padding is
   removed rather than re-tuned.
7. `.view-header` on the full-page surfaces drops to `8px 12px`, height
   ≤ 36px, so Specs/Tasks/Sessions/GitHub start where the terminal does.
8. The sidebar and the center are separated by their existing 1px border
   only — no `--bg-deep` gap shows between them at any dock position.

Deliverable: CSS-only changes across `layout.css`, `terminal.css`,
`terminals-view.css`, `view-header.css`, `dock.css` (if the dock shell needs
a matching edge) and `home-board.css`. No JS, no DOM change.

## Constraints

- **CSS only.** `terminalsView.js` mounts terminals into `.tv-pane-content`
  and refits through a `ResizeObserver`; the geometry change must land as
  padding/margin/border edits that the existing observer already handles.
  No new refit calls, no timers (resize-storm-watchdog).
- **terminals-home-agents** decided the enlarged pane has no shrink control
  and that Terminals never leaves the top bar; the pane header keeps its
  status vocabulary (`.tv-pane-status`, `.tv-pane-attention`, `.tv-pane-assign`).
  Thinner, not gone.
- **dock-panel-readonly-views** measures the center to clamp the dock size
  and refits terminals only on open/close/side change/drag release. Removing
  the container padding changes the measured center; the clamp must still
  hold and a closed dock must still leave the layout byte-for-byte.
- **status-bar**: `body` carries `padding-bottom: var(--status-bar-height)`;
  the center must end at the status bar's top border, not slide under it.
- The `terminals-view.css` header comment records a prototype language of
  "panes darker than the surrounding chrome". This spec deliberately drops
  that for the single pane (there is no surrounding chrome left to be darker
  than) and keeps it in the grid.
- Light and dark themes both, including `[data-theme="light"] .tv-pane`.
- No new tokens unless one is reused three or more times; prefer editing the
  existing rules in place.

## Success Criteria

- When one terminal is enlarged, then the distance from the sidebar's right
  border to xterm's first column is ≤ 6px and from the window top to the
  tab bar's bottom border is ≤ 36px.
- When one terminal is enlarged, then no border, rounded corner or
  background change is visible between the tab bar and the terminal other
  than the pane header's bottom hairline.
- When the dock is open at the bottom or the right, then it sits flush
  against the window edge with no `--bg-deep` strip around it, and the
  terminal still refits to the remaining space.
- When the Other Terminals rail is collapsed, then its 28px strip touches
  the window edge and the pane beside it is not clipped.
- When the grid shows two or more panes, then each pane keeps a 1px border
  and the gap between panes is 4–6px with 0 outer padding.
- When Specs, Tasks, Sessions or GitHub is open, then its `.view-header` is
  ≤ 36px tall and its content starts directly under the header's border.
- When the theme is switched, then the enlarged pane shows no leftover
  `#0a0908` / `#f7f5f2` slab under the terminal.
- When `npm test` runs, then `dockState`, `homeRows` and `reorder` suites
  still pass (the change adds no test of its own; nothing under test moves).

## Out of Scope

- Sidebar density (`#sidebar` padding 14px, `.sidebar-rail` strip, nav row
  indents) — the user separated the left panel from this request.
- Home board layout and its widget cards (home-widget-board).
- Tab bar chips, launcher and usage bars' internal spacing (`.lane-bar-*`,
  `.claude-usage-bars`).
- xterm font size, line height or cell padding.
- Dock tab strip height (32px already) and dock body internals.

## Open Questions

- **Home board gutter.** `.lane-board` pads 24px. Keep it (Home is a
  dashboard, not an editor) or bring it down to the same ~12px as
  `.view-header` so every surface starts at the same x?
- **Single-pane header.** Thin it to ~24px, or hide it and move status,
  attention and assignment into the tab bar chip? Hiding is out of the CSS-
  only constraint and touches terminalsView.js and terminalTabBar.js.
