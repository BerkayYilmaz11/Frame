# Plan — Status bar notice tray

## Architecture

### Resolved plan-time decisions

- **D1 · Migration receipt surface (business, asked).** Chosen: a tray entry
  with severity `info` that gives the indicator a calm blue unread dot — no
  alarm colour, no count. Rejected: tray entry plus a one-shot `notify.info`
  toast. Rationale: one surface for every notice; migration-consent-scope
  already rejected a second surface for the receipt, and the activity panel
  still records it.
- **D2 · Indicator position (business, silent).** The rightmost item of the
  bar, after `#app-version`. The user asked for the bottom-right corner, and
  VS Code puts its notifications bell there.
- **D3 · Does an error open the tray by itself? (business, silent).** No. The
  icon changes colour and count only — the status bar is ambient (status-bar
  spec), and a popover that opens on its own would steal clicks.
- **D4 · Indicator always present (business, silent).** Yes, muted when idle,
  so the corner is a stable target and "no notices" is itself readable.
- **D5 · Where the message wording lives (technical, silent).** `healthNotice.js`
  keeps its IPC listeners and every message string (prior specs wrote and
  reviewed that copy); only its banner DOM is replaced by `noticeTray.push()`.
  Its public `showMigration()` keeps its signature, so `state.js` is untouched
  apart from a stale comment.
- **D6 · Model/host split (technical, silent).** A pure
  `noticeTrayModel.js` beside a DOM host `noticeTray.js`, in
  `src/renderer/statusBar/` — the branchPickerModel / branchPicker shape
  already in that folder.
- **D7 · Build from JS, not `index.html` (technical, silent).** `index.html`
  and `src/main/index.js` are in audit-q3-performance-resources' in-flight
  footprint; the indicator is created in `statusBar.js` and appended to
  `.status-bar-right`, as `_buildZoom()` does.
- **D8 · Bounded list (technical, silent).** At most 50 rows; the oldest row
  is dropped past that. A crash loop with varying messages must not grow the
  DOM without limit.
- **D9 · Test posture (technical, asked).** Pure logic only:
  `test/noticeTrayModel.test.js` covers the model; the DOM host is not tested
  (no DOM harness — testing record).

### Data shape

```
Notice = {
  id: number,               // monotonic, assigned by the model
  severity: 'error' | 'warning' | 'info',
  source: string,           // key → label via SOURCE_LABELS
  message: string,          // full text, rendered with textContent
  count: number,            // ≥1; identical repeats increment
  firstAt: number, lastAt: number,  // epoch ms
  unread: boolean
}
```

### `noticeTrayModel.js` (pure — no electron, lucide or DOM)

- `add(list, { severity, source, message }, now, nextId)` → new list. A row
  with the same `severity + source + message` has `count + 1`, `lastAt = now`,
  `unread = true`, and moves to the top; otherwise a new row is prepended.
  Unknown severities normalise to `error`. List is capped at `MAX_NOTICES = 50`.
- `dismiss(list, id)`, `clear()`, `markAllRead(list)`.
- `indicator(list)` → `{ tone, unread }`: tone is the worst unread severity
  (`error` > `warning` > `info`), or `'none'`; `unread` counts unread
  `error`/`warning` rows (info shows a dot, not a number).
- `sourceLabel(source)` → human label (`Main process`, `Dependencies`,
  `State files`, `tasks.json`, `Codex`, `Layout migration`), falling back to
  the raw key.
- `moveFocus(index, length, delta)` → wrapped row index for the keyboard.

### `noticeTray.js` (DOM host)

- Module state: `list`, `nextId`, `opened`. `push(notice)` works before
  `init()` (entries accumulate; nothing paints until the host exists).
- `init({ slotEl, onOpen })` builds the `!` button (`.sb-notices`, lucide
  `CircleAlert` 16px, count `<span>`, unread dot) and the popover
  (`.sb-notice-tray`, `role="dialog"`) inside `.status-bar-right`, which becomes
  the positioning context; the popover opens upward, right-aligned.
- Popover: header "Notices" + "Clear all"; rows newest first — severity glyph,
  source label, `HH:MM:SS`, `×N` when `count > 1`, message (wrapped), copy
  (electron `clipboard.writeText`, then `notify.success('Copied')`) and dismiss
  buttons. Empty state: "No notices this session."
- Opening marks all read and repaints the indicator; a push while open is
  added already read. Escape closes and refocuses the button; ArrowUp/Down
  move focus between rows (`moveFocus`); outside mousedown closes.
- Tooltip on the button states the situation (`2 errors — click to view`,
  `No notices`) via the shared `tooltip.attach`.
- Exports `init, push, open, close, toggle, isOpen`.

### Wiring

- `statusBar.js` `_buildNoticeTray()` runs last in `init()`; `onOpen` closes
  the branch picker and the agents menu. `_openMenu()` and the branch
  picker's `onOpen` also call `noticeTray.close()` — one popover in the bar.
- `healthNotice.js` `show(kind, message)` becomes
  `noticeTray.push({ severity, source, message })` with a source key per
  listener; the banner elements, `dismiss()`, `lastMessage` dedupe and
  `ICONS` go away (dedupe now lives in the model).

## Files

- `src/renderer/statusBar/noticeTrayModel.js` — **New** — pure list/indicator logic.
- `src/renderer/statusBar/noticeTray.js` — **New** — indicator button + popover host.
- `test/noticeTrayModel.test.js` — **New** — node:test coverage of the model.
- `src/renderer/statusBar.js` — **Modified** — mounts the tray at the right end; mutual exclusion with branch picker and agents menu; header comment.
- `src/renderer/healthNotice.js` — **Modified** — routes every notice to the tray; banner DOM removed; header comment rewritten.
- `src/renderer/styles/components/status-bar.css` — **Modified** — `.status-bar-right` positioning context, `.sb-notices` tones, `.sb-notice-tray` popover and rows.
- `src/renderer/styles/components/health-notice.css` — **Deleted** — the banner's styles.
- `src/renderer/styles/main.css` — **Modified** — drops the `health-notice.css` import.
- `src/renderer/state.js` — **Modified** — comment only: the receipt now lands in the tray.
- `scripts/intent-map.json` — **Modified** — adds the tray modules to the crash/health intent so `find-module` finds them.

## Footprint

- src/renderer/statusBar/noticeTrayModel.js
- src/renderer/statusBar/noticeTray.js
- test/noticeTrayModel.test.js
- src/renderer/statusBar.js
- src/renderer/healthNotice.js
- src/renderer/styles/components/status-bar.css
- src/renderer/styles/components/health-notice.css
- src/renderer/styles/main.css
- src/renderer/state.js
- scripts/intent-map.json

## Dependencies

None. `lucide`, electron's `clipboard`, `tooltip.js` and `notify.js` are already in use.

## Sequencing

1. Add `src/renderer/statusBar/noticeTrayModel.js` (`add`, `dismiss`, `clear`, `markAllRead`, `indicator`, `sourceLabel`, `moveFocus`, `MAX_NOTICES`) with `test/noticeTrayModel.test.js` covering repeat merging, the cap, tone precedence, the unread count excluding info, dismiss/clear and focus wrapping.
2. Add `src/renderer/statusBar/noticeTray.js`: the indicator button with its muted / info-dot / amber / red states and count, fed by `indicator()`; `push()` usable before `init()`.
3. Add the popover to `noticeTray.js`: rows, empty state, copy, dismiss, "Clear all", mark-read on open, Escape / arrows / outside click; add the `.sb-notices` and `.sb-notice-tray` styles to `status-bar.css`.
4. Mount the tray in `statusBar.js` as the bar's last item and wire one-popover-at-a-time with the branch picker and the agents menu.
5. Route `healthNotice.js`'s five inputs (`MAIN_PROCESS_ERROR` with severity, `STATE_FILE_RECOVERED`, `CODEX_HOOKS_UNTRUSTED`, `TASKS_FILE_ERROR`, `showMigration`) into `noticeTray.push()` with source keys, and remove the banner code.
6. Delete `health-notice.css` and its `main.css` import; update the stale comment in `state.js` and add the tray modules to `scripts/intent-map.json`.
