---
keywords: health notice, main process error, error banner, status bar, notification tray, problems indicator, crash guard
related: status-bar, status-bar-branch-picker, audit-q3-reliability-recovery, migration-consent-scope, codex-parity, audit-q3-ux-error-feedback
---

# Status bar notice tray

## Problem

Errors and degraded states pushed from the main process — `Main process
error: ENOENT …`, unhandled rejections, "git was not found", tasks.json
restored from backup, Codex hooks never trusted — appear in `healthNotice`'s
banner, which is `position: fixed; top: 0` across the full width. It lands
directly on the 35px `#app-header`, and its error background
(`--error-subtle`) is translucent, so the header's own text shows through and
the two read as one garbled line. The banner also holds one message at a time
(latest wins), so an earlier error is gone the moment a second one arrives,
and a dismissed error cannot be read again.

## Goal

The top-of-window banner is gone. In its place, a notice indicator at the
right end of the status bar:

- A `!` icon button, always present. Muted when there is nothing unread;
  **red** when an unread error exists; **amber** when the worst unread entry
  is a warning. A count sits beside the icon while there are unread entries.
- Clicking it opens a popover above it (the status bar's existing popover
  idiom — branch picker / agents menu) listing every notice this session,
  newest first: severity glyph, time, source, and the full message
  (wrapped, never ellipsised).
- Each row can be copied and dismissed; the popover has "Clear all".
- Opening the popover marks entries read, returning the icon to muted while
  entries remain listed.
- A repeated identical message does not add a row — the existing row's
  `×N` counter and time update.

Every message `healthNotice` handles today (`MAIN_PROCESS_ERROR` with both
severities, `STATE_FILE_RECOVERED`, `CODEX_HOOKS_UNTRUSTED`,
`TASKS_FILE_ERROR`, `showMigration`) is routed into the tray.

## Constraints

- **The main-process contract stays.** `crashGuard.notify` and every IPC
  payload are unchanged; this is a renderer-side move.
- **One popover in the bar at a time** (status-bar-branch-picker): opening
  the tray closes the branch picker and the agents menu, and vice versa.
- **The status bar holds readouts you glance at** (status-bar): the indicator
  is ambient; it never steals focus or animates for attention.
- **The migration receipt's surface** (migration-consent-scope chose "banner +
  activity log only" and rejected a reopenable receipt modal): moving the
  receipt must keep it noticeable after an automatic move — see Open
  Questions.
- **Messages rendered with `textContent` only**, never `innerHTML`
  (audit-q3-ux-error-feedback). No local `escapeHtml`/toast copies.
- **`index.html` and `src/main/index.js` sit in
  audit-q3-performance-resources' in-flight footprint** — build the indicator
  from JS into `.status-bar-right`, the way the zoom readout is built.
- The render-process-gone native dialog in `crashGuard` is untouched.
- Both themes; keyboard reachable (Enter/Space opens, Escape closes, arrows
  move between rows) like the branch picker.

## Success Criteria

- When the main process throws an uncaught exception, then nothing overlays
  `#app-header`, and the status bar's `!` icon turns red with a count of 1.
- When the tray is opened, then the full error message is readable without
  truncation, and the icon returns to muted.
- When the same error fires 20 times in a loop, then the tray shows one row
  with `×20`, not 20 rows.
- When a warning (e.g. "gh was not found") and an error are both unread, then
  the icon is red; with only the warning unread, it is amber.
- When a row's dismiss is clicked, then that row disappears; when "Clear all"
  is clicked, the list is empty and the icon is muted.
- When the copy action is used, then the clipboard holds the full message.
- When the branch picker is open and the tray icon is clicked, then the
  picker closes and the tray opens.
- When nothing has been reported this session, then the icon is muted and the
  popover says there are no notices.

## Out of Scope

- Persisting notices across reloads or restarts
- Stack traces or log-file links in the tray
- Routing `notify.js` toasts into the tray
- Changes to `crashGuard`'s error capture or the render-process-gone dialog
- Writing notices to the activity log

## Open Questions

- **The migration receipt.** It is news the user never agreed to beforehand,
  and an info entry that does not colour the icon may go unseen.
  - Tray entry that marks the icon with a neutral/blue unread dot (no alarm
    colour), so it is noticeable but calm.
  - Tray entry plus a one-shot `notify.info` toast pointing at the tray.
