## T01 — The entry rule: cloudEntry.entryFor and its strings

Added `entryCall`, `entryEarly` and `entryJoined` to `cloudEarlyAccess.COPY` and wrote the pure `src/renderer/cloudEntry.js` (`entryFor`) with `test/cloudEntry.test.js` (12 tests). Diverged from plan.md: `cloudRoles.workspaceName` is not exported and `cloudRoles.js` is outside the footprint, so the name comes from `cloudNoWorkspace.workspaceRow(workspace).value`; the tooltip reuses the existing `COPY.join` and `COPY.joinedTitle`. `npm test` is deferred to the end of the run at the user's instruction.
Followup: `test/serverConnection.test.js` and `test/specManagerServer.test.js` pass every subtest but never exit, so `npm test` hangs on this machine.

_Captured: 2026-11-16 · 3 file change(s)_

---
## T02 — The entry in the header: markup, styles and bindCloudEntry

Added the hidden `button#cloud-entry` to `index.html`, its token-based styles and the `max-width: 760px` icon-only rule to `app-header.css`, and `appHeader.bindCloudEntry(cloudHub)`, called from `index.js` after `cloudHub.init`. Diverged from plan.md in two details: the separator is the button's `::before` rather than a child element, and the `24ch` cap applies to the workspace name only so the waitlist call is never cut. The entry carries its own `[hidden]` rule because the stylesheets have no global one.

_Captured: 2026-11-16 · 4 file change(s)_

---
## T03 — The rail loses its Frame Cloud button

Removed `#cloud-btn` from the rail in `index.html` and the `bindCloudBtn` block from `index.js`, and rewrote the rail-foot comments (five buttons: Add Server, Plugins, Feedback, Frame Settings, How to Use Frame) and `cloudHub.js`'s header comment. No divergence from plan.md; the dead `#cloud-btn[hidden]` rule in `cloud-hub.css` goes with T05.

_Captured: 2026-11-16 · 3 file change(s)_

---
## T04 — The tour's data: cloudTour.js

Wrote the pure `src/renderer/cloudTour.js` (copy and fixed sample data of mockup alternative D, plus `clamp`, `next`, `back`, `canNext`, `canBack`, `counter`, `strings`) and `test/cloudTour.test.js` (17 tests, including the dropped claims and the tour's pricing guard that lets "plan" through). Additions beyond plan.md's shape: `TRUST_LEAD`, a structured `milestone` (`{ name, due, progress, ratio }`), and exported `EXAMPLE_KINDS` / `TONES`.

_Captured: 2026-11-16 · 2 file change(s)_

---
## T05 — The tour in the window: cloudWelcome as the DOM host

Rewrote `cloudWelcome.js` as the tour's host (`render`, `show`, `reset`, one builder per example kind), replaced `.cloud-feats` / `.cloud-feat*` in `cloud-hub.css` with token-based `.cloud-tour-*` rules, and called `cloudWelcome.reset()` from `cloudHub.onOpen`. Beyond plan.md: focus is handed over in both directions (Back also turns disabled under focus on step one), the dead `#cloud-btn[hidden]` rule left over from T03 was removed here, and the pitch column's gap went from 26px to 20px.

_Captured: 2026-11-16 · 3 file change(s)_

---
## T06 — PRIVACY.md: where the Frame Cloud window opens from

Changed the one phrase in `PRIVACY.md` that located the window ("the cloud icon at the foot of the sidebar") to "the Frame Cloud button in the header, beside the Frame mark". No divergence from plan.md.

_Captured: 2026-11-16 · 1 file change(s)_

---
