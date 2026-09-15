# Plan — How to Use Frame guide

## Architecture

### Resolved plan-time decisions

**Business** (the three spec forks were answered by the user on 2026-09-15):

- **D1 · Illustration slot → inline sketches.** Every page's illustration is a
  small HTML/CSS/SVG sketch of the relevant region, drawn from the app's own
  design tokens and lucide icons, so it follows all four themes and every zoom
  step and adds no bitmap weight. Rejected: per-theme screenshots (≈36 pages ×
  4 themes, dated by every UI change). The user's words: "eskizleri deneyelim,
  beğenmezsek güncelleriz" — so sketches are one module behind one render
  entry point, replaceable without touching content or the modal.
- **D2 · Welcome overlay stays, and opens after the guide closes on launch.**
  Overturns the spec's recommended "absorb" option. Launch order is guide →
  Welcome, never both at once. `welcomeOverlay.js`, its markup, its
  `onboardingDismissed` checkbox and `help.welcome` all stay as they are.
  Consequence, recorded as a spec amendment: the guide carries **no** live
  project actions or agent picker (Welcome still does, right after it), so
  success criteria S8 and S9 are void. Project-opening pages use action
  links instead (`project.add`, `project.create`).
- **D3 · Reopen always lands on the first page.** No last-read page is
  persisted.
- **D4 · The guide shows on every launch until the user opts out.** Follows
  from D3 ("checkbox ile bir daha ilk açılışta gösterme seçeneği olmalı"):
  the spec's one-shot `guideSeen` is replaced by a footer checkbox **"Don't
  show this on launch"** persisted as `guideHideOnLaunch` (`true` or unset) in
  `user-settings.json`. It is written on `change`, so Cmd+Q with the guide up
  keeps the choice — the pattern `welcomeOverlay.persistDismissPreference`
  already uses. Opening the guide by hand shows the checkbox with its stored
  value and never resets it (unlike `welcomeOverlay.reopen`, which clears its
  flag). *Silent — the only reading of the user's request.*
- **D5 · Closing through an action link on launch skips Welcome for that
  launch.** The user picked a destination; opening Welcome over it would
  bury it. Welcome's own flag is untouched, so it shows on the next launch.
  Closing by ×, Escape, backdrop or Done opens Welcome as D2 says. *Silent.*
- **D6 · Menu and rail placement.** Help menu: **How to Use Frame** first,
  then Welcome, then Keyboard Shortcuts. Rail foot: a fourth button **below**
  the Frame Settings gear, lucide `CircleHelp`, tooltip "How to Use Frame".
  Palette: `help.guide`, title "How to Use Frame", category Help, no
  shortcut (none is free and the user asked for none). *Silent.*
- **D7 · Theme and zoom links do not close the guide.** Every other action
  link closes the guide and then runs its command (spec S5); the four theme
  swatches and the three zoom links apply in place, because what they change
  is visible in the guide itself. *Silent.*
- **D8 · Chapters are expanded by default and collapsible;** navigating to a
  page in a collapsed chapter expands it. Collapse state lives only as long
  as the modal is open. *Silent.*

**Technical:**

- **D9 · Content, sketches and host are three modules.** `guideContent.js` is
  pure data + helpers (no `electron`, no DOM, no `lucide`), so `npm test`
  requires it in CI without `npm ci`. `guideSketches.js` renders a sketch
  kind to an HTML string and requires `lucide` at the top like every other
  renderer module that draws icons (`statusBar.js:44`, `appHeader.js:36`), so
  it is not tested. `guideModal.js` is the DOM host. The declared list of
  sketch kinds lives in `guideContent.js` (`SKETCH_KINDS`) so the test can
  check every page against it; the host `console.error`s once and draws an
  empty slot for a kind `guideSketches` does not implement. *Silent — follows
  the Testing record's convention (target the pure module, skip the
  Electron-coupled wrapper).*
- **D10 · Sketches are few kinds with a `focus` parameter, not one drawing per
  page.** 20 kinds cover 36 pages: e.g. one `shell` wireframe (header, rail,
  sidebar, center, dock, status bar) is reused with `focus: 'header-start'`,
  `'rail-foot'`, `'statusbar-left'`… and the named region is drawn in the
  accent colour. *Silent — cuts the drawing work and keeps pages consistent.*
- **D11 · The guide owns the launch trigger.** `welcomeOverlay` stops
  listening to `WORKSPACE_DATA` and exports `showOnLaunch()` (its existing
  `maybeShowOnLaunch`, unchanged in behaviour). `guideModal` listens to the
  first `WORKSPACE_DATA`, reads `guideHideOnLaunch`, and either opens in
  launch mode or calls its `onLaunchDone` callback at once. `index.js` wires
  the callback to `welcomeOverlay.showOnLaunch`, so neither module requires
  the other. Rejected: both modules listening and racing on a shared flag.
  *Silent.*
- **D12 · `plugins.open` is registered.** Plugins is the one rail-foot modal
  with no command id (`pluginsPanel` exports `show/hide/toggle`, nothing in
  `index.js` registers it), so the plugins page could not link to it. One
  registry entry — title "Plugins", category Help, `run: () =>
  pluginsPanel.toggle()` — mirrors `feedback.open` (`index.js`). Additive: no
  existing behaviour changes (C5). *Silent.*
- **D13 · A wide-modal token.** `--modal-width` (640px) is "one standard for
  every dialog shell" (`variables.css:78`); the guide is a deliberate
  exception the user asked for. Add `--modal-width-wide: 1040px` beside it
  with a comment naming the guide as its one user, rather than a magic
  number in the component CSS. *Silent.*
- **D14 · Focus.** Opening focuses the dialog (`tabindex="-1"`) so ←/→ never
  reach a focused xterm; closing calls `window.terminalFocus()` as
  `settingsOverlay.js` does — except when closing through an action link,
  where the target surface keeps focus. The guide's keydown handler runs only
  while open and ignores events whose target is an input, select or
  textarea. *Silent.*
- **D15 · Zoom copy follows the shipped `ui-zoom-steps`, not the spec's
  guess.** That spec is now `done`; the spec's ⌘= was drifted. Zoom In is
  ⇧⌘0, Zoom Out ⌘-, Reset ⌘0, Frame Settings › Appearance › Interface size,
  five sizes 85–120%, a status-bar percentage away from 100% (click resets).
  Shortcuts are never hard-coded in copy: pages cite command ids and the host
  renders `commandRegistry.getById(id).shortcut` through
  `platform.formatShortcut`, so copy cannot drift from the registry and
  Windows/Linux get Ctrl. *Silent.*
- **D16 · Test posture: pure logic and data only.** `test/guideContent.test.js`
  covers `guideContent.js`; the DOM host and the sketches get none. This is
  the posture the Testing record shows in force (pure `src/renderer/home/`
  modules tested, DOM surfaces not). *Decided without asking in this
  autonomous run — the recommended option, matching the record; flagged to
  the user.*

### Components

```
index.js ── guideModal.init({ onLaunchDone: welcomeOverlay.showOnLaunch })
             registers help.guide, plugins.open
menu.js ──── Help › How to Use Frame  → RUN_APP_COMMAND 'help.guide'
rail foot ── #guide-btn               → runById('help.guide')

guideModal.js (DOM host)
  ├─ guideContent.js   CHAPTERS, SKETCH_KINDS, ACTION_IDS, flattenPages(), validate()
  ├─ guideSketches.js  render(kind, focus) → HTML string (tokens + lucide)
  ├─ commandRegistry   getById (shortcut, registered?), runById
  └─ platform.js       formatShortcut
```

### Content data shape (`src/renderer/guide/guideContent.js`)

```js
CHAPTERS = [
  { id: 'start', title: 'Start here', pages: [
    { id: 'start.what', title: 'What Frame is',
      sketch: { kind: 'agents' },
      claudeOnly: false,                      // renders a "Claude Code only" chip when true
      blocks: [                               // rendered in order
        { p: 'Frame is a terminal-first IDE …' },
        { p: 'Press {kbd:terminal.new} to …' },  // {kbd:<id>} → registry shortcut
        { list: ['…', '…'] },
        { code: '.frame/STRUCTURE.json' },
        { note: 'Frame never calls a model API …' }
      ],
      actions: [ { id: 'settings.open', label: 'Open Frame Settings' },
                 { id: 'theme.dark', label: 'Dark', stay: true } ] } ] } ]

SKETCH_KINDS = ['agents','shell','fileTree','gitSharing','settings','terminalGrid',
  'laneStates','home','specFlow','implementModes','boards','orchestrator','sessions',
  'dockTabs','multiProject','plugins','themes','zoom','keys','feedback']

ACTION_IDS = [ /* every id an action or {kbd:} may cite — see Files */ ]
flattenPages() → [{ chapterId, page, index }]   // tree order; drives Back/Next and "n / N"
validate()     → [] | ['problem', …]            // used by the test and logged by the host
```

Inline text is plain strings with exactly two tokens — `{kbd:<commandId>}` and
`` `code` `` — escaped by the host with `htmlUtils.escapeHtml` before tokens
are expanded. No HTML in content.

### Page index (36 pages; copy is written in the step that owns the chapter)

Facts each page must state are listed; implementation verifies each against
the code it names before writing the sentence (C5).

1. **Start here**
   - `start.what` · agents — terminal-first IDE; runs the user's own AI CLI in
     real terminals; the user signs in with their own subscription or key in
     that CLI; Frame calls no model API; what Frame adds (project context,
     specs, tasks, visibility across agents).
   - `start.agent` · shell/header-agent — Claude Code, Codex CLI, Gemini CLI
     (`aiToolManager.js` AI_TOOLS); first run picks the first one found on
     PATH; header **Agent** picker and the tool menu's Switch AI Tool; install
     and sign in to the CLI first; Sessions, Plugins and usage meters are
     Claude Code only.
   - `start.open` · shell/header-switcher — sample project, open folder, new
     project, clone from GitHub; header project switcher "+ Add a project…".
     Actions: `project.add`, `project.create`.
2. **Projects**
   - `projects.init` · fileTree/init — what Initialize writes under `.frame/`
     and the one pointer `.claude/rules/frame.md`; nothing in the project
     root; existing CLAUDE.md / AGENTS.md never touched; Claude Code hooks in
     `.claude/settings.json` or `settings.local.json`; pre-commit hook only
     when none exists. Action: `project.initializeFrame`.
   - `projects.git` · gitSharing — Share with the repo vs Keep it local to me;
     changeable in Project Settings › Workflow. Action: `settings.openProject`.
   - `projects.sidebar` · shell/rail-views — Projects, Files, Changes, GitHub;
     the nav's Work and Context groups; collapse to the rail. Actions:
     `panel.toggleSidebar`, `sidebar.github`.
   - `projects.settings` · settings/scopes — Project Settings (spec-driven
     toggle, git sharing, open on launch, boards, remove Frame) vs the Frame
     Settings gear (privacy, appearance, about). Actions: `settings.openProject`,
     `settings.open`.
3. **Terminals & agents**
   - `terminals.open` · terminalGrid — the ghost cell, `terminal.new`, 1/2/3
     columns, drag to reorder, enlarge a pane, 9 per project, a top-bar chip's
     × only removes the chip. Action: `terminal.new`.
   - `terminals.start` · shell/header-start — header Start, Home's "Start an
     agent", `ai.startSession`; a busy terminal asks new or restart.
   - `terminals.talk` · terminalGrid/prompt — prompts are typed like in any
     terminal; the tool menu's slash commands; Frame itself sends prompts into
     a lane for spec actions.
   - `terminals.states` · laneStates — working, needs approval, waiting for
     input; the Other Terminals rail beside an enlarged terminal.
   - `terminals.home` · home — Agents, Last Sessions, Active Specs, Active
     Tasks. Action: `lane.home`.
4. **Specs**
   - `specs.why` · specFlow — spec-driven is on for new projects; the agent
     offers a spec for sizable work and never forces one; switch in Project
     Settings › Workflow.
   - `specs.flow` · specFlow/all — phases draft → specified → planned →
     tasks_generated → implementing → done; spec.md, plan.md, tasks.md; the
     next-action labels Write the Spec / Generate Plan / Break into Tasks /
     Implement Tasks….
   - `specs.new` · specFlow/spec — Specs › New, describe in your own words, a
     "Spec Creator" terminal writes spec.md; or ask the agent in any session.
     Action: `panel.toggleSpecsDashboard`.
   - `specs.plan` · specFlow/plan — Generate Plan: the agent checks the code,
     asks the open decisions, writes plan.md and a plan report; Break into
     Tasks writes tasks.md, which imports into the Tasks board.
   - `specs.implement` · implementModes — Step by step, Guided run, Autonomous
     + report, Describe your own; autonomous needs a fresh flagged launch.
   - `specs.where` · boards — Specs panel, Specs Dashboard, a spec's own tab
     with its rail, reports; Tasks Dashboard. Actions:
     `panel.toggleSpecsDashboard`, `panel.toggleTasksDashboard`.
5. **Orchestration (Beta)**
   - `orch.what` · orchestrator — Beta; a conductor plus one worker per spec,
     each in `.frame/worktrees/<slug>` on `frame/<slug>/work`; footprint
     conflict guard; `main` is never touched; a person approves every merge.
   - `orch.needs` · specFlow/tasks — only specs with tasks (tasks_generated or
     later) can be assigned; no specs, nothing to orchestrate; the plan's
     Footprint is what the guard reads.
   - `orch.run` · orchestrator/pipeline — Work › Orchestration or
     `orchestrator.open`; Start Orchestrator; Assign; Queued → Running → Done →
     Approved; Open / Approve / Remove; promotion to main stays manual.
     Action: `orchestrator.open`.
6. **Sessions**
   - `sessions.list` · sessions — Context › Sessions; this project's Claude
     Code transcripts; Resume opens a new terminal with `--resume`; Home shows
     the last three. Claude Code only. Action: `panel.toggleSessions`.
7. **Context that survives**
   - `context.files` · fileTree/context — AGENTS.md, STRUCTURE.json,
     PROJECT_NOTES.md, tasks.json, the spec archive; hooks hand the agent the
     history of a file or topic before it edits; commit often, the pre-commit
     hook refreshes STRUCTURE.json.
   - `context.dock` · dockTabs — the panel at the bottom or right, drag tabs
     to reorder. Action: `dock.toggle`.
   - `context.decisions` · dockTabs/decisions — every dated entry of
     PROJECT_NOTES.md, searchable. Action: `dock.decisions`.
   - `context.prompts` · dockTabs/prompts — the project's prompt history,
     searchable. Action: `dock.prompts`.
   - `context.activity` · dockTabs/activity — what Frame did on its own:
     watchers, hooks, recoveries; skipped work shown muted. Action:
     `dock.activity`.
8. **Several projects at once**
   - `multi.switch` · multiProject — header switcher, `project.next` /
     `project.prev`, palette jump targets; other projects' terminals keep
     running. Action: `palette.toggle`.
   - `multi.watch` · shell/statusbar-left — the status bar lists agents in
     *other* projects; needs approval and waiting for input stand out; click
     to jump.
9. **Plugins**
   - `plugins.install` · plugins — the rail's Plugins button; the official
     Claude Code marketplace; All / Installed / Enabled; Install types
     `/plugin install <name>` into the active terminal; the switch enables or
     disables; plugins carry skills, commands and agents. Claude Code only.
     Action: `plugins.open`.
10. **Look & keys**
    - `look.themes` · themes — Dark, Light, Dark+, Light+; header picker and
      View › Theme. Actions (stay): `theme.dark`, `theme.light`,
      `theme.darkPlus`, `theme.lightPlus`.
    - `look.zoom` · zoom — five sizes; the three commands; Frame Settings ›
      Appearance › Interface size; the status-bar percentage. Actions (stay):
      `view.zoomIn`, `view.zoomOut`, `view.zoomReset`.
    - `look.keys` · keys — Command Palette, Keyboard Shortcuts. Actions:
      `palette.toggle`, `help.shortcuts`.
11. **Settings, feedback, this guide**
    - `frame.settings` · settings/frame — privacy (usage stats, local crash
      dumps), appearance, updates, logs. Action: `settings.open`.
    - `frame.feedback` · feedback — Bug, Feature idea, Reach us; every channel
      opens a draft the user sends. Action: `feedback.open`.
    - `frame.guide` · shell/rail-guide — reopen from the rail button, Help ›
      How to Use Frame, or the palette; the launch checkbox; Help › Welcome.
      Action: `help.welcome`.

### Modal behaviour

- Markup (`index.html`, beside `#welcome-overlay`): `#guide-overlay` >
  `.guide-modal[role=dialog][tabindex=-1]` > header (title, ×) · body
  (`.guide-tree` nav, `.guide-page` article with `.guide-sketch` slot) ·
  footer (checkbox left; Back, `n / N`, Next right). Tree and page are
  rendered by `guideModal.js`; the static markup is only the frame.
- `open({ launch })` renders page 0, reads `guideHideOnLaunch` into the
  checkbox, adds `.visible`, focuses the dialog. `close({ via })` removes
  `.visible`; `via === 'action'` skips focus restore and, in launch mode,
  skips `onLaunchDone`; any other close in launch mode calls `onLaunchDone`
  once.
- Keys while open: ← Back, → Next, Escape close. Backdrop mousedown closes.
- Action link: `getById(id)` missing or `when()` false → rendered disabled,
  `console.error` once per id per open. Otherwise click → (unless `stay`)
  `close({ via: 'action' })` → `runById(id)`.
- Sizes: `width: min(var(--modal-width-wide), 94vw)`, `height: min(720px,
  86vh)`; tree column 240px and scrolls; page column scrolls; at ≤ 760px
  wide the tree narrows to 180px (never hidden). Overlay z-index 10001, the
  same as Welcome and the settings overlays; the guide and Welcome are never
  open together (D2), and action links close the guide before opening
  another overlay.

## Files

- `src/renderer/guide/guideContent.js` — **New.** Pure content: CHAPTERS (36
  pages), SKETCH_KINDS, ACTION_IDS, `flattenPages`, `validate`.
- `test/guideContent.test.js` — **New.** Requires the module with no
  electron/lucide; asserts unique chapter and page ids, `flattenPages` order
  and length, every page has a title and ≥ 1 block, every sketch kind in
  SKETCH_KINDS, every action id and `{kbd:}` id in ACTION_IDS, `stay` only on
  theme/zoom ids, `validate()` returns `[]`, and `validate()` reports each
  of those problems on a deliberately broken fixture.
- `src/renderer/guide/guideSketches.js` — **New.** `render(kind, focus)` →
  HTML string for each of the 20 kinds; shared primitives (window frame,
  pane, chip, dot, file row) and the focus highlight.
- `src/renderer/guideModal.js` — **New.** DOM host: init, launch trigger,
  open/close, tree, page, footer, keys, action links, checkbox persistence.
- `src/renderer/styles/components/guide.css` — **New.** Overlay, two-column
  layout, tree, page typography, footer, sketch primitives, focus highlight.
- `index.html` — **Modified.** `#guide-overlay` frame; `#guide-btn` as the
  last rail-foot button, below `#frame-settings-btn`.
- `src/renderer/styles/main.css` — **Modified.** `@import 'components/guide.css'`.
- `src/renderer/styles/variables.css` — **Modified.** `--modal-width-wide`.
- `src/renderer/index.js` — **Modified.** Require and init `guideModal` with
  `onLaunchDone`; register `help.guide` and `plugins.open`; wire `#guide-btn`
  (click + tooltip) beside the other rail-foot buttons.
- `src/renderer/welcomeOverlay.js` — **Modified.** Drop the `WORKSPACE_DATA`
  listener and `launchTriggerFired`; export `showOnLaunch` (the current
  `maybeShowOnLaunch`).
- `src/main/menu.js` — **Modified.** Help › How to Use Frame (`help.guide`)
  above Welcome.

## Footprint

- src/renderer/guide/guideContent.js
- src/renderer/guide/guideSketches.js
- src/renderer/guideModal.js
- src/renderer/styles/components/guide.css
- src/renderer/styles/variables.css
- src/renderer/styles/main.css
- src/renderer/welcomeOverlay.js
- src/renderer/index.js
- src/main/menu.js
- index.html
- test/guideContent.test.js

## Dependencies

None. `lucide` is already a dependency; everything else is existing modules.

## Sequencing

1. **Content model.** Create `guideContent.js` with the data shape,
   SKETCH_KINDS, ACTION_IDS, `flattenPages`, `validate`, and chapter 1
   (`start.*`) written in full. Write `test/guideContent.test.js` alongside
   it, including the broken-fixture cases.
2. **Modal shell.** `#guide-overlay` markup, `guide.css` (imported from
   `main.css`),
   `--modal-width-wide`, `guideModal.js` with tree, page rendering (blocks,
   `{kbd:}` via registry + `formatShortcut`, Claude-only chip), Back/Next,
   counter, keys, focus, backdrop/×/Escape, action links (close-then-run,
   `stay`, disabled when unregistered). Sketch slot draws a placeholder.
   Register `help.guide` in `index.js` so the palette opens it.
3. **Entry points.** Register `plugins.open`; Help › How to Use Frame in
   `menu.js`; `#guide-btn` under the gear with the `CircleHelp` icon and
   tooltip, running `help.guide`.
4. **Launch sequence and checkbox.** Guide owns the first `WORKSPACE_DATA`;
   `guideHideOnLaunch` checkbox persisted on change; `welcomeOverlay` loses
   its listener and exports `showOnLaunch`; `onLaunchDone` wired in
   `index.js`; D5's action-link skip.
5. **Sketch system + chapter 1 sketches.** `guideSketches.js` primitives, the
   focus highlight, and the `agents` and `shell` kinds; the host renders
   sketches instead of the placeholder and logs a missing kind once.
6. **Chapters 2–3 (Projects; Terminals & agents).** Page copy plus the
   `fileTree`, `gitSharing`, `settings`, `terminalGrid`, `laneStates`, `home`
   sketches; extend ACTION_IDS and the test data expectations as pages land.
7. **Chapters 4–5 (Specs; Orchestration).** Page copy plus `specFlow`,
   `implementModes`, `boards`, `orchestrator` sketches.
8. **Chapters 6–8 (Sessions; Context; Several projects).** Page copy plus
   `sessions`, `dockTabs`, `multiProject` sketches.
9. **Chapters 9–11 (Plugins; Look & keys; Settings, feedback, this guide).**
   Page copy plus `plugins`, `themes`, `zoom`, `keys`, `feedback` sketches;
   theme and zoom actions with `stay`.
