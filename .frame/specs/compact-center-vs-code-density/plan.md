# Plan — Compact center — VS Code density for the right side

## Architecture

### Resolved plan-time decisions

- **D1 · Home board gutter (business, asked).** `.lane-board` padding goes
  from 24px to 12px. Chosen over keeping 24px because every other surface
  will start at the same x (`.view-header` 12px, the terminal ~4px behind a
  1px border) and Home is the surface you leave for Terminals most often — a
  12px jump between the two reads as a layout bug. Widget-to-widget gaps are
  untouched.
- **D2 · Single-pane header (business, asked).** Thinned to ~24px, CSS only.
  Chosen over removing it because the header carries the status vocabulary
  terminals-home-agents put there (`.tv-pane-status`, `.tv-pane-attention`,
  `.tv-pane-assign`, the action buttons) and the tab bar chip does not;
  moving it would touch `terminalsView.js` and `terminalTabBar.js` and break
  the spec's CSS-only constraint for ~26px.
- **D3 · Dock edge (technical, silent).** `#dock` loses its margin, radius
  and outer border and keeps one inner hairline: `border-top` when docked at
  the bottom, `border-left` when docked on the right. The spec's S3 already
  requires a flush dock; once the container's padding is gone the dock's
  own 6px margin and 5px radius would be the last card standing.
- **D4 · Tab bar height (technical, silent).** 35px, square, `0 8px`
  padding. The bar's controls are 32px tall (`.terminal-tab-actions button`)
  and the Start button is a shared `.primary-btn`; a 32px bar would need
  every control shrunk, which is a second spec. 35px is VS Code's tab strip.
- **D5 · Grid spacing (technical, silent).** `.terminals-view` padding is 0
  in both modes. The grid keeps a 6px gap between panes and 0 outer padding;
  the layout bar (`.tv-bar`) gets its own `4px 8px` padding because it no
  longer inherits a gutter from the view.
- **D6 · Single-pane background (technical, silent).** `.tv-pane-single`
  becomes transparent in both themes (`#0a0908` / `#f7f5f2` stay on the
  grid's `.tv-pane`). The "panes darker than the surrounding chrome" note in
  `terminals-view.css` is kept for the grid and deliberately dropped for the
  single pane, as the spec's C5 says.
- **D7 · No new tokens (technical, silent).** Every value is edited in
  place; the smallest reused value (8px) already appears in the file.
- **D8 · Test posture: none this time (technical, silent).** The testing
  record in PROJECT_NOTES lists DOM-coupled renderer code as not covered and
  there is no DOM harness; nothing under `test/` can reach a stylesheet.
  Verification is the running app in both themes and both dock positions.

### The box tree, before and after

```
#main-content (bg-deep)
└─ #terminal-container         margin 6/0/6/6 · padding 10 · radius 6 0 0 6   →  0 · 0 · 0
   ├─ #terminal                radius 5 · overflow hidden                      →  radius 0
   │  └─ .multi-terminal-wrapper
   │     ├─ .terminal-tab-bar  42px · radius 5 5 0 0 · padding 0 10            →  35px · 0 · 0 8
   │     └─ .terminal-content  radius 0 0 5 5                                  →  0
   │        └─ .terminals-view padding 10 14 14 · gap 10                       →  0 · 0
   │           ├─ .tv-bar      (grid only)                                     →  padding 4 8
   │           ├─ .tv-grid     gap 10 · padding-bottom 6                       →  gap 6 · 0
   │           │  └─ .tv-pane  border 1 · radius 6 · dark bg                   →  unchanged
   │           └─ .tv-single   gap 6
   │              ├─ .tv-pane-single   border 1 · radius 6 · dark bg          →  none · 0 · transparent
   │              │  ├─ .tv-pane-header  7 10                                  →  3 8 · min-height 24
   │              │  └─ .tv-pane-content 4 6 6                                 →  0 0 0 4
   │              └─ .lane-rail.collapsed  margin-right -6                     →  0
   └─ #dock                    margin 6 · border 1 · radius 5                  →  0 · inner hairline · 0
```

Sum for the enlarged terminal, sidebar border → first xterm column:
before 6 + 10 + 14 + 1 + 6 = 37px, after 0 + 0 + 0 + 0 + 4 = 4px.
Window top → tab bar bottom border: before 6 + 10 + 42 = 58px, after 35px.

### Why nothing else has to move

- **Refit.** `terminalsView.js:583` observes every `.tv-pane-content` with a
  `ResizeObserver` and fits the terminal on change. Padding edits resize the
  observed box, so xterm refits itself; no call is added (C1).
- **Dock clamp.** `dock.js:284-286` measures the center as `clientWidth /
  clientHeight` minus the container's computed padding. With padding 0 the
  subtraction is 0 and the clamp is unchanged. `#dock` is `display: none`
  when closed, so a closed dock still leaves the layout untouched (C3).
- **Status bar.** `body` keeps `padding-bottom: var(--status-bar-height)`
  (`ui.css:14`); the container's bottom margin was inside that box, so
  removing it ends the center exactly at the bar's top border (C4).
- **Sidebar seam.** `#sidebar` has `border-right: 1px solid` and the
  container no longer has a margin or `--bg-deep` showing through a radius,
  so the 1px border is the only separator at every dock position (G8).
- **Home container query.** `.lane-board` is `container-type: inline-size`
  with a 759px breakpoint on its content box; 12px less padding per side
  moves the breakpoint by 24px of window width. Acceptable and noted.

## Files

- **Modified** `src/renderer/styles/layout.css` — `#terminal-container`:
  margin 0, padding 0, border-radius 0.
- **Modified** `src/renderer/styles/components/terminal.css` — `#terminal`
  radius 0; `.terminal-tab-bar` 35px, radius 0, `0 8px`; `.terminal-content`
  radius 0.
- **Modified** `src/renderer/styles/components/terminals-view.css` —
  `.terminals-view` padding/gap 0; `.tv-bar` padding; `.tv-grid` gap 6 /
  padding 0; `.tv-pane-single` border/radius/background (both themes);
  `.tv-pane-single .tv-pane-header`; `.tv-pane-single .tv-pane-content`;
  `.tv-single .lane-rail.collapsed` margin; header comment updated.
- **Modified** `src/renderer/styles/components/dock.css` — `#dock` margin,
  radius, border → inner hairline per position.
- **Modified** `src/renderer/styles/components/view-header.css` —
  `.view-header` padding `8px 12px`.
- **Modified** `src/renderer/styles/components/home-board.css` —
  `.lane-board` padding 12px.

## Footprint

- src/renderer/styles/layout.css
- src/renderer/styles/components/terminal.css
- src/renderer/styles/components/terminals-view.css
- src/renderer/styles/components/dock.css
- src/renderer/styles/components/view-header.css
- src/renderer/styles/components/home-board.css

## Dependencies

None

## Sequencing

1. **Flatten the shell.** `layout.css` `#terminal-container`: margin 0,
   padding 0, border-radius 0. `terminal.css` `#terminal`: border-radius 0.
   Result: the center is one surface from the sidebar's border to the window
   edge; the tab bar and dock still show their own corners (next steps).
2. **Dock flush.** `dock.css` `#dock`: border-radius 0, no margin at either
   position, `border: none` plus `border-top` under `.dock-bottom` and
   `border-left` under `.dock-right`. Result: an open dock touches the
   window edge with no `--bg-deep` strip; drag-resize and the clamp behave
   as before.
3. **Tab bar.** `terminal.css` `.terminal-tab-bar`: height 35px,
   border-radius 0, padding `0 8px`; `.terminal-content`: border-radius 0.
   Result: a square 35px strip with a single bottom border, controls
   unchanged.
4. **Single terminal.** `terminals-view.css`: `.terminals-view` padding 0,
   gap 0; `.tv-pane.tv-pane-single` border none, border-radius 0, background
   transparent, and the same for `[data-theme="light"]`; `.tv-pane-single
   .tv-pane-header` padding `3px 8px`, min-height 24px; `.tv-pane-single
   .tv-pane-content` padding `0 0 0 4px`; `.tv-single .lane-rail.collapsed`
   margin-right 0. Update the file's header comment to say the single pane
   is flat by design. Result: xterm's first column is ≤ 6px from the sidebar
   border, the header is ≤ 26px, no leftover slab in either theme, the rail
   strip touches the window edge.
5. **Grid.** `terminals-view.css`: `.tv-bar` padding `4px 8px`; `.tv-grid`
   gap 6px, padding-bottom 0. Result: two or more panes keep their 1px
   borders with 6px between them and nothing around them.
6. **Full-page headers.** `view-header.css` `.view-header`: padding
   `8px 12px`. Result: Specs, Tasks, Sessions, GitHub, Decisions,
   Orchestration headers are ≤ 36px and content starts under the border.
7. **Home.** `home-board.css` `.lane-board`: padding 12px. Result: Home's
   left edge lines up with the headers; the 759px container breakpoint
   shifts by 24px of window width, which the widgets absorb.
