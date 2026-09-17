---
keywords: zoom, ui scale, font size, accessibility, view menu, keyboard shortcut, frame settings, appearance
related: settings-by-scope, status-bar, compact-center-vs-code-density
---
# UI zoom steps

## Problem

Frame's whole interface renders at one size. The base is 12px — chosen
deliberately in the density pass so the app reads as compact as the prototype
— and every one of the ~2,400 sizes in the stylesheets is a px value, so a
user who finds it too small (or too large, on a small laptop screen) has no
supported way to change it.

An unsupported way exists and makes things worse: the View menu still carries
Electron's stock `zoomIn` / `zoomOut` / `resetZoom` roles, so Cmd+= and Cmd+-
already zoom the page — through Chromium's own ladder (25% to 500% in a dozen
steps), with no indicator, no place in Settings, and a value persisted in
Chromium's per-origin store rather than Frame's settings file. A user can land
on 67% or 175% and have no idea how they got there or how to get back.

## Goal

A five-step interface scale, owned by Frame:

- **Steps** `-2, -1, 0, +1, +2`. Step 0 is today's rendering, unchanged.
  Two steps smaller, two larger. Each step maps to one page-zoom factor.
- **Everything scales together** — text, icons, spacing, terminals, the
  structure map, modals — because the mechanism is page zoom
  (`webContents.setZoomFactor`), not a stylesheet rewrite.
- **Three commands** in the command registry — Zoom In, Zoom Out, Reset Zoom
  — with the shortcuts other apps use (`CmdOrCtrl+=`, `CmdOrCtrl+-`,
  `CmdOrCtrl+0`). Being registry commands they appear in the Command Palette
  and the Keyboard Shortcuts sheet for free.
- **View menu** lists the three commands in the place the stock roles occupy
  today (above Toggle Full Screen), as Frame commands with those accelerators.
  The stock roles are removed so Chromium never writes a value of its own.
- **Frame Settings** gains an *Appearance* section with a five-position
  control showing the current step and a way back to default. Frame Settings
  (the gear) because the value is machine-wide, not the project's.
- **Persisted** in `user-settings.json` and applied before first paint, so a
  relaunch opens at the chosen step with no visible jump.

## Constraints

- **Step 0 is byte-identical to today.** The density pass's 12px base, the
  compact-center values and every px in the stylesheets stay as they are; no
  CSS rewrite, no rem conversion. (density pass, `compact-center-vs-code-density`)
- **Page zoom is the only mechanism.** No CSS `zoom`, no root font-size
  scaling, no per-component font settings — those would each leave part of
  the UI (xterm cell metrics, SVG, `getBoundingClientRect` math) unscaled or
  mis-measured.
- **Chromium's own zoom must not leak in.** Pinch and Ctrl+wheel zoom, if
  Chromium delivers them, snap to Frame's ladder or are ignored; Frame's
  stored step always overrides any per-origin level Chromium has kept from
  earlier native zooming.
- **Settings scope** follows `settings-by-scope`: the control lives in Frame
  Settings, never Project Settings.
- **Menu and registry stay in step.** `src/main/menu.js` carries the same ids
  and accelerators as `registerCommands()` in `src/renderer/index.js`, as
  every other menu item does today.
- **Terminals stay correct** after a step change: every xterm instance is
  refit so its rows/columns match the new cell size, and the PTY is resized
  accordingly.
- No new dependencies.

## Success Criteria

- When the app launches with no stored step, then it renders exactly as
  before this spec (step 0, factor 1.0).
- When the user presses Cmd+= (Cmd+- ) with focus anywhere — a terminal
  included — then the interface moves one step up (down), and stops at +2
  (−2) with no further change.
- When the user presses Cmd+0, then the interface returns to step 0.
- When the user changes the step, then the whole UI scales — sidebar, app
  header, status bar, dock, modals, terminal text, structure map — with no
  element left at the old size.
- When the step changes while terminals are open, then each terminal's grid
  is refit and a running `tput cols` reports the new column count.
- When the user relaunches Frame after choosing a step, then the first frame
  drawn is already at that step.
- When the user opens Frame Settings, then the Appearance control shows the
  current step, and choosing another position applies it immediately.
- When a previous session left a Chromium per-origin zoom level, then
  launching with Frame's step 0 renders at 100%, not at the stale level.
- When the user opens the Command Palette or Keyboard Shortcuts, then Zoom
  In / Zoom Out / Reset Zoom appear with their shortcuts.
- When the View menu is opened, then Zoom In / Zoom Out / Reset Zoom sit
  where the stock roles were, with the same accelerators shown.
- When the test suite runs, then the step-to-factor mapping and clamping are
  covered by a unit test.

## Out of Scope

- Per-surface font settings (terminal-only font size, editor font size).
- A rem / fluid-typography refactor of the stylesheets.
- Zooming the standalone report pages opened in the browser.
- Window-size or layout changes beyond what zoom implies.

## Open Questions

- **Ladder values.** Which factors do the five steps map to? Candidates:
  `0.85 / 0.92 / 1.00 / 1.10 / 1.20` (tight, every step readable at the
  900px minimum window) or `0.80 / 0.90 / 1.00 / 1.15 / 1.30` (wider range,
  +2 crowds the layout at minimum window width).
- **Status bar indicator.** Show the current percentage at the status bar's
  right end when the step is not 0 (click resets), or keep the bar as it is
  and rely on Settings + Cmd+0? (`status-bar` reserves the right end for
  glanceable readouts, so it fits; the question is whether it earns the
  pixels.)
- **Minimum window size at +2.** Keep the 900×600 minimum and accept a
  cramped layout at the largest step, or scale the minimum with the factor
  via `setMinimumSize`?
