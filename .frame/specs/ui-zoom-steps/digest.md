---
keywords: zoom, ui scale, font size, accessibility, view menu, keyboard shortcut, frame settings, appearance
related: settings-by-scope, status-bar, compact-center-vs-code-density
---
Frame gained a five-step interface zoom (−2…+2 → 0.85 / 0.92 / 1.00 / 1.10 / 1.20), step 0 byte-identical to before.
Mechanism is Chromium page zoom owned by main: `src/main/uiZoom.js` seeds `webPreferences.zoomFactor` from
`user-settings.json` (`uiZoomStep`), re-applies on `did-finish-load` so a stale per-origin Chromium level never wins,
and snaps `zoom-changed` (pinch / Ctrl+wheel) onto the ladder. The numbers live in pure `src/shared/uiZoom.js` (tested).
Rejected: a rem refactor of the px-only stylesheets (16k lines, still misses xterm and SVG) and CSS `zoom` on body
(breaks rect math and xterm measurement). Entry points all end in `UI_ZOOM_SET`: registry commands `view.zoomIn` /
`view.zoomOut` / `view.zoomReset` on ⇧⌘0 ⌘- ⌘0 (replacing Electron's stock View-menu roles; zoom in moved off ⌘= by the user's choice),
Frame Settings › Appearance select, a status bar `110%` readout (hidden at 100%, click resets). `UI_ZOOM_CHANGED`
drives the subscribers: terminals refit, readout, select. xterm passes modifier + - / 0 through (⇧⌘0 via its Shift rule); digit shortcuts match e.code so ⇧0 works on any layout.
Verified live: clamping at both ends, PTY cols change per step, relaunch opens at the stored step, stale level overridden.
Rules: never add a renderer-side zoom path (webFrame) or reintroduce the stock zoom roles; new CSS on a JS-toggled
element with an explicit `display` must restate `[hidden] { display: none }` — the readout shipped showing "100%" without it.
Unverified: native macOS menu accelerators (not reachable from automation); the renderer keydown path is verified and covers them.

Chain: spec.md → plan.md → tasks.md → outcome.md
