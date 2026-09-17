---
keywords: onboarding, how to use, guide, help, first run, welcome, tutorial, user manual, index tree, rail foot, help menu
related: settings-by-scope, in-app-feedback, dock-panel-readonly-views, shell-chrome-app-header-collapsible-panels, ui-zoom-steps, non-invasive-overlay, terminals-home-agents, sidebar-nav-groups, sessions-from-transcripts, audit-q3-ux-error-feedback, audit-q3-generic-any-project
---

# How to Use Frame guide

## Problem

A first-time user opens Frame and gets a 560px welcome card with four project
buttons, a tool picker and one tip. Nothing in the app explains what Frame
actually is or how its pieces fit: that it is a terminal-first IDE and the
user brings their own agent subscription; that Initialize writes a `.frame/`
folder and one pointer file; that work flows spec → plan → tasks → implement;
that Orchestration (beta) refuses to start without specs; where past sessions,
decisions, prompts and activity live; that several projects can run agents at
once and the status bar shows the ones waiting elsewhere; that there are four
themes, page zoom, plugins with skills to enable or disable.

Today that knowledge is scattered across a README, a marketing site, the
`Initialize` modal's file list, tooltips, a spotlight card that never fires
(`state.js:287` — its anchor is parked in a hidden holder), and the Keyboard
Shortcuts sheet. A user who does not already know the model finds Frame by
clicking around, and the ones who give up are silent.

## Goal

One wide modal, **"How to Use Frame"**, that explains the whole app step by
step: an index tree on the left, one page of illustration + explanation on
the right, Back / Next stepping through the pages in order.

**Shell.**

- Width `min(1040px, 94vw)`, height `min(720px, 86vh)`; the same overlay
  chrome as the settings surfaces (backdrop, × in the header, Escape).
- Left column (≈240px): a two-level tree — chapters with their pages, the
  current page highlighted, chapters collapsible, every row clickable.
- Right column: page title, an **illustration slot** on top (see Open
  Questions), then the explanation: short paragraphs, `kbd` shortcuts,
  file paths in code, and **action links** that run a command-registry id
  (`runById`) — "Open Frame Settings", "Open the Specs Dashboard", "Show
  Keyboard Shortcuts" — so every reference to a setting or view is a way
  there, not just a name. A link whose id is not registered renders
  disabled and logs a `console.error` (audit-q3-ux-error-feedback).
- Footer: `Back` · `3 / 24` · `Next`; on the last page Next reads `Done`.
  Keyboard: `←` `→` step, `Esc` closes.
- The first page carries what the Welcome card carries today — the four
  project actions and the live default-agent picker — so a fresh user can
  act from inside the guide. See Open Questions for the Welcome overlay's
  fate.

**Content — the index tree** (English, like the rest of the UI; exact page
copy is written in the plan, one page per task):

1. **Start here** — What Frame is (terminal-first, bring your own agent:
   Claude Code / Codex CLI / Gemini CLI, Frame calls no model API) · Pick
   your agent (live picker) · Open a project (sample / folder / new / clone).
2. **Projects** — Initialize: what `.frame/` gets and the one pointer file
   `.claude/rules/frame.md`, what is never touched · Git sharing: repo vs
   local · The sidebar: Projects / Files / Changes / GitHub, collapse to the
   rail (⌘B) · Project Settings vs Frame Settings (two scopes).
3. **Terminals & agents** — Open a terminal (⇧⌘T, the ghost cell, 1/2/3
   column grid, 9 per project) · Start the agent (header Start, ⌘K, Home
   launcher) · Talk to it: prompts, the `<tool>` menu's slash commands ·
   Lane states: working / needs approval / waiting for input · Home: agents,
   last sessions, active specs, active tasks.
4. **Specs** — Why specs · The flow: spec → plan → tasks → implement
   (phases) · New Spec: describe it, an agent writes `spec.md` · Generate
   Plan / Break into Tasks · Implement modes: Step by step / Guided run /
   Autonomous + report / Describe your own · Where specs live: panel,
   dashboard (⇧⌘S), spec tab, reports · Tasks (⇧⌘D) and how spec tasks
   import.
5. **Orchestration (Beta)** — What it is: a conductor, one worker per spec
   in its own worktree, footprint conflict guard, `main` never touched ·
   Needs specs at `tasks_generated` — no specs, nothing to assign · Start it
   (⇧⌘O), assign, approve, remove.
6. **Sessions** — Sessions view (⇧⌘X): past Claude Code transcripts of this
   project, resume opens a new terminal with `--resume` · Last Sessions on
   Home. Claude Code only.
7. **Context that survives** — What Frame keeps: `STRUCTURE.json`,
   `PROJECT_NOTES.md`, `tasks.json`, the spec archive, hooks that hand spec
   history to the agent, the pre-commit hook (commit often) · The dock (⌘J,
   bottom or right): Decisions (⇧⌘Y), Prompts (⇧⌘L), Activity (⇧⌘A).
8. **Several projects at once** — The header switcher, ⇧⌘] / ⇧⌘[ ·
   Terminals of other projects keep running · The status bar's left slot:
   agents waiting in *other* projects · Per-project badges.
9. **Plugins** — Claude Code plugins from the official marketplace: install
   (a terminal handoff), enable / disable with the switch. Claude Code only.
10. **Look & keys** — Four themes: Dark, Light, Dark+, Light+ (header
    picker, View › Theme) · Zoom in / out / reset · Command Palette (⇧⌘P),
    Keyboard Shortcuts (⇧⌘K).
11. **Frame Settings, feedback, updates** — Privacy (usage stats, crash
    dumps), updates, logs · Send Feedback: bug / idea / reach us · Where this
    guide lives (rail button, Help menu, palette).

**When it shows and where it lives.**

- **First launch**: opens once, after the first `WORKSPACE_DATA` push (the
  same trigger the Welcome card uses today), before anything else asks for
  attention. Closing it — any way — marks it seen in `user-settings.json`
  (`guideSeen`), so it never auto-opens again. No "Don't show again"
  checkbox: seen is seen.
- **Reopen**: a fourth button at the foot of the sidebar rail, under the
  gear (Plugins · Send Feedback · Frame Settings · **How to Use Frame**);
  Help menu item **How to Use Frame** above Keyboard Shortcuts; palette
  command `help.guide` in category Help. Reopening lands on the first page
  (or the last-read page — plan decides).

## Constraints

- **Persistence goes through `userSettings`** (`GET_USER_SETTING` /
  `SET_USER_SETTING`, `user-settings.json`), never `localStorage`: renderer
  localStorage has lost state across launches in dev (`userSettings.js:1-12`).
- **Menu items dispatch a command-registry id** over `RUN_APP_COMMAND`, never
  a channel per item (dock-panel-readonly-views C6). The rail button, the
  Help item and the palette all run the same id.
- **Content is data, not markup in `index.html`.** The tree and every page
  live in one pure module (`src/renderer/guide/guideContent.js`, no
  `electron` / DOM at require time) so `npm test` can assert: ids unique,
  every page reachable from the tree, every action link names a command id
  from a declared allowlist, no empty page. The modal host renders it.
- **Copy is generic** (audit-q3-generic-any-project): nothing may assume
  Frame's own repo, JavaScript, or macOS; shortcuts render with the
  platform's modifier (`platform.js`). Claude-only pages say so.
- **Does not change what it describes.** No behaviour, setting or view is
  altered to make the guide easier to write; the guide follows the app.
- **Footprint overlaps the in-flight `ui-zoom-steps` spec** (`menu.js`,
  `frameSettingsModal.js`, `index.html`, `index.js`). This spec is sequenced
  after it, and page 10's zoom copy describes zoom as that spec defines it
  (`⌘=` / `⌘-` / `⌘0`, an Appearance section in Frame Settings) — not the
  stock Electron roles that exist today.
- **Existing surfaces stay**: the telemetry notice banner, the sample
  banner, the detection banner, the migration modal and the spec-driven /
  docs-health hints are untouched. The guide is z-ordered above the app
  and below nothing that must interrupt it.
- No new dependencies; the same design tokens (`variables.css`), the same
  overlay animation family, works in all four themes and at every zoom step.
- Package size: any embedded imagery must keep the app below a noticeable
  install-size change — the plan sets a budget once the imagery question is
  settled.

## Success Criteria

- When Frame launches with no `guideSeen` in `user-settings.json`, then the
  guide opens on its first page after the workspace loads, and no Welcome
  card opens on top of or under it.
- When the guide is closed by ×, Escape, backdrop or Done, then `guideSeen`
  is `true` and the next launch does not auto-open it.
- When the user clicks the rail's fourth foot button, chooses Help › How to
  Use Frame, or runs "How to Use Frame" from the palette, then the same guide
  opens, whether or not it has been seen.
- When a tree row is clicked, then the right pane shows that page, the row is
  highlighted, and the footer counter reflects its position; Back / Next and
  `←` / `→` move through the pages in tree order across chapter boundaries.
- When an action link is clicked, then the named command runs (e.g. "Open
  Frame Settings" opens the gear's modal); the guide closes first so the
  target is visible.
- When `npm test` runs, then the guide content suite passes: unique ids, all
  pages reachable, every action link in the allowlist, no empty page, and
  the module requires without `electron`.
- When the theme is any of the four and the window is 1100×700 or larger,
  then the modal fits without the page body overflowing horizontally; below
  that the right pane scrolls, the tree stays reachable.
- When the first page's project actions or agent picker are used, then they
  behave exactly as the Welcome card's do today (sample / folder / new /
  clone, `SET_AI_TOOL`).
- When the `Welcome` decision below is resolved as "absorb", then
  `help.welcome` is gone from the registry and the menu, and the guide
  reaches everything it reached.

## Out of Scope

- A screenshot capture pipeline and its upkeep (own spec if chosen below).
- Interactive coach-marks / spotlight tours anchored on live UI.
- Localization of the guide.
- The zoom feature itself (`ui-zoom-steps`).
- Fixing the README's stale shortcut table.
- Spec command templates for Codex / Gemini.
- Contextual "?" help buttons inside individual views.

## Open Questions

1. **Illustration slot: what goes in it?**
   - (a) Real screenshots, captured per theme and stored as PNG/WebP under
     `assets/guide/` — highest fidelity, but ~24 images × 4 themes, a
     capture recipe to maintain, and every UI change dates them.
   - (b) Hand-drawn inline illustrations — small HTML/CSS/SVG sketches of the
     relevant region built from the app's own tokens and lucide icons, so
     they follow the theme and weigh nothing. Recommended: durable, in
     keeping with a terminal-first app, and one theme-neutral sketch per
     page instead of four bitmaps.
   - (c) Screenshots only for a few key pages (Home, Specs, Orchestrator,
     Dock), sketches elsewhere.
2. **The Welcome overlay.** Two modals on first launch is not an option.
   - (a) The guide **absorbs** Welcome: its first page carries the same four
     project actions and the agent picker; `welcomeOverlay.js`, its markup
     and CSS go; `help.welcome` becomes `help.guide`. Recommended.
   - (b) Welcome stays as a small launch card and the guide opens only from
     the rail / Help / palette (never automatically) — cheaper, but the user
     asked for the guide to be what a first launch shows.
3. **Reopen lands on** the first page every time, or the last page read
   (persisted alongside `guideSeen`)?
