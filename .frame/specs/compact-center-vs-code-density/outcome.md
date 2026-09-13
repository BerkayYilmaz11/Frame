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
