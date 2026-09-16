## T01 — Add the pure notice tray model with tests

Added `src/renderer/statusBar/noticeTrayModel.js` (`add`, `dismiss`, `clear`, `markAllRead`, `indicator`, `sourceLabel`, `moveFocus`, `MAX_NOTICES = 50`) and `test/noticeTrayModel.test.js` (12 tests). `add` takes `{ now, id }` as its third argument rather than two positional values; unknown severities normalise to `error`, and a missing source becomes `unknown`. No deviation from plan.md.

_Captured: 2026-09-16 · 2 file change(s)_

---
## T02 — Add the notice tray host with the indicator button

Added `src/renderer/statusBar/noticeTray.js` with `init({ slotEl })` building the `.sb-notices` button (CircleAlert, count, info dot) and `push()` recording notices through `noticeTrayModel.add`, usable before `init()`. The button's tone classes and count come from `indicator()`. Divergence: plan.md had the tooltip describe the state, but `tooltip.attach` only takes fixed text, so the tooltip says "Notices" and the state goes in the aria-label and the count. Not mounted yet (T06).

_Captured: 2026-09-16 · 1 file change(s)_

---
## T03 — Build the tray popover list

Added the popover to `src/renderer/statusBar/noticeTray.js`: header with "Clear all" (hidden when empty), newest-first rows (severity icon, source label, last-occurrence time, `×N`, wrapped message via `textContent`), empty state, and `open`/`close`/`toggle`/`isOpen` with `onOpen`. Opening runs `markAllRead`; `push()` while open marks the new row read at once. The button now toggles the popover. Row actions and keyboard follow in T04, styles in T05.

_Captured: 2026-09-16 · 1 file change(s)_

---
## T04 — Add row actions and keyboard handling to the tray

Added per-row copy and dismiss buttons to `src/renderer/statusBar/noticeTray.js` (copy uses electron `clipboard` with a `notify.success` confirmation and `notify.error` on failure), Escape → `close({ refocus: true })`, arrow keys between focusable rows via `moveFocus`, and outside mousedown closing. After a dismiss, focus moves to the neighbouring row so the keyboard stays in the list. No deviation from plan.md.

_Captured: 2026-09-16 · 1 file change(s)_

---
## T05 — Style the notice indicator and tray popover

Added the notices section to `src/renderer/styles/components/status-bar.css`: `.sb-notices` tones (muted / red / amber / blue dot), the right-anchored upward `.sb-notice-tray` on the branch picker's surface, and row, meta, `×N`, wrapped message and hover-revealed action styles. `.status-bar-right` now shares `position: relative` with the left slot. Theme tokens only, so no separate light-theme rules.

_Captured: 2026-09-16 · 1 file change(s)_

---
## T06 — Mount the tray in the status bar with one popover at a time

Wired `noticeTray` into `src/renderer/statusBar.js`: `_buildNoticeTray()` mounts it last on `.status-bar-right` (logging if the slot is missing), its `onOpen` closes the branch picker and agents menu, and both of those now close the tray when they open. No deviation from plan.md; `index.html` untouched.

_Captured: 2026-09-16 · 1 file change(s)_

---
