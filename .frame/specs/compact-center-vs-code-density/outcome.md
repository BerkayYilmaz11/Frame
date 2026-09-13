# Outcome — Compact center — VS Code density for the right side

## T01 — Flatten the center shell

Set `#terminal-container` (`src/renderer/styles/layout.css`) margin, padding and border-radius to 0 and `#terminal` (`src/renderer/styles/components/terminal.css`) border-radius to 0, with a comment naming the spec. No deviation from plan.md; the dock's own card and the tab bar's corners remain until T02/T03.

_Captured: 2026-09-13 · 2 file change(s)_

---
## T02 — Make the dock flush

Removed `#dock`'s outer border, radius and per-position 6px margin in `src/renderer/styles/components/dock.css`; each position now draws one inner hairline (`border-top` at the bottom, `border-left` on the right) on the same edge the resize handle occupies. No deviation from plan.md.

_Captured: 2026-09-13 · 1 file change(s)_

---
## T03 — Square the tab bar

Set `.terminal-tab-bar` to 35px, radius 0 and `0 8px` padding, and `.terminal-content` to radius 0, in `src/renderer/styles/components/terminal.css`; the controls inside the bar are untouched. No deviation from plan.md.

_Captured: 2026-09-13 · 1 file change(s)_

---
## T04 — Flatten the enlarged terminal

In `src/renderer/styles/components/terminals-view.css`: `.terminals-view` padding and gap to 0; `.tv-pane.tv-pane-single` loses border, radius and background in both themes; new scoped rules thin the single pane's header to `3px 8px` / 24px and pad its content `0 0 0 4px`; the collapsed rail's `-6px` margin becomes 0; the header comment now says only grid panes are darker than the chrome. Left `.tv-single`'s 6px gap between pane and rail alone — plan.md did not name it and it is not padding.

_Captured: 2026-09-13 · 1 file change(s)_

---
## T05 — Respace the grid

Gave `.tv-bar` its own `4px 8px` padding and set `.tv-grid` to a 6px gap with no bottom padding in `src/renderer/styles/components/terminals-view.css`; grid panes keep their border, radius and darker background. No deviation from plan.md.

_Captured: 2026-09-13 · 1 file change(s)_

---
## T06 — Tighten the shared full-page header

Set `.view-header` padding to `8px 12px` in `src/renderer/styles/components/view-header.css`, which every full-page surface (Specs, Tasks, Sessions, GitHub, Decisions, Orchestration) shares. No deviation from plan.md.

_Captured: 2026-09-13 · 1 file change(s)_

---
## T07 — Align Home with the other surfaces

Set `.lane-board` padding to 12px in `src/renderer/styles/components/home-board.css`; the 759px container query now fires 24px of window width later, as plan.md accepted. No deviation from plan.md.

_Captured: 2026-09-13 · 1 file change(s)_

---
