# Plan — First-run onboarding screen

## Architecture

### Resolved plan-time decisions

- **D1 · How the intro becomes the screen** (business, asked) — *The lockup
  stays put and the content fades in beneath it*, over a crossfade to a fresh
  composition. The mark and wordmark are already where they belong when the
  boxes arrive, so there is no second entrance and no chance of the lockup
  shifting by a pixel between two compositions.
- **D2 · Ways out** (business, asked) — *Skip only at boot; `×` and Escape
  when summoned from the palette.* At first run the screen **is** the app's
  state, not a dialog over one, so leaving it is a deliberate act. Summoned
  later it is a conventional overlay and behaves like one.
- **D3 · One surface, parked not removed** (technical, silent — forced by D1)
  — the onboarding content is static markup **inside `#app-loader`**, and
  `hide()` stops removing the node: it fades out and parks it (`display: none`)
  so both the boot path and the palette path reuse the very same element and
  the same lockup geometry. Cloning a template into a second element would
  reintroduce exactly the drift D1 exists to avoid. The node is inert when
  parked; nothing else in the renderer queries `#app-loader`.
- **D4 · Test posture** (technical, asked) — *pure logic only.* The show /
  skip / summon rule moves into a dependency-free
  `src/renderer/onboarding/onboardingGate.js` with `test/onboardingGate.test.js`,
  following `dock/dockState.js` (27 tests) and `home/agentRows.js`. The DOM
  host stays untested: the testing record lists DOM-coupled renderer code as
  **Not covered**, and re-verification confirmed no harness exists (`jsdom`,
  `playwright`, `puppeteer`, `@testing-library` all absent from `package.json`
  and `node_modules`).
- **D5 · The renderer counts the projects** (technical, silent) — the gate
  reads the array `WORKSPACE_DATA` already delivers (`workspace.js:203`,
  consumed the same way at `projectListUI.js:181`). No new IPC, per C6.
- **D6 · The guide link survives** (business, silent) — the retired modal's
  footer link to How to Use Frame moves to the new screen's foot, beside Skip.
  It is the only pointer out of a first run, and C1 forbids only *opening* the
  guide by itself, not linking to it.
- **D7 · One guide sentence is corrected, not rewritten** (technical, silent)
  — `guideContent.js:649` states the Welcome screen "opens when Frame starts",
  which this spec falsifies. The spec puts the guide's *content* out of scope;
  that covers its chapters and structure, not a sentence this work makes
  untrue. One sentence and one command label change; nothing else in the guide
  is touched.

### Shape

`#app-loader` becomes a two-state surface rather than a splash that leaves:

```
#app-loader                     full-bleed, z-index 100000
  .app-loader-brand             mark + wordmark        (the intro, unchanged)
  #onboarding                   hidden until revealed  (new)
    .onboarding-actions         three boxes
    .onboarding-agent           default agent chips
    .onboarding-foot            Skip · How to Use Frame   (+ × when summoned)
```

Three modules, with the decision isolated from the DOM:

- **`onboarding/onboardingGate.js` (new, pure)** — the whole rule, no
  `document`, no `ipcRenderer`:

  ```js
  decide({ trigger, projects }) -> { show: boolean, dismissible: boolean }
  ```

  `trigger: 'launch'` shows only when `projects` is an empty array and is
  never dismissible; `trigger: 'command'` always shows and always is. A
  non-array `projects` (a malformed or missing push) counts as *unknown*, not
  as empty — it must not show the screen to a user who has projects.

- **`onboarding.js` (new, host)** — owns the DOM inside `#onboarding`: renders
  the agent chips from `GET_AI_TOOL_CONFIG`, wires the three boxes to the
  existing routes, wires Skip, `×` and Escape per `dismissible`, and reports
  every failed IPC through `notify.error` (C7). Exports
  `init()`, `takeOver(projects)` for the loader, `open()` for the palette, and
  `close()`.

- **`appLoader.js` (modified)** — keeps its existing contract (intro done
  **and** `WORKSPACE_DATA` arrived; failsafe retry beats everything) and gains
  one branch at the moment it would have left: ask the gate, and either hand
  the surface to `onboarding.takeOver()` or park it as before. It keeps the
  init-once guard `audit-q3-performance-resources` T06 added.

The three boxes call what exists today — `state.selectProjectFolder()`,
`state.createNewProject()`, `openProjectModal.open({ clone: true })`
(`openProjectModal.js:29`) — so no project-entry flow is forked (C3).

## Files

| File | State | Purpose |
| --- | --- | --- |
| `src/renderer/onboarding/onboardingGate.js` | **New** | Pure show/dismissible rule; no DOM, no IPC. |
| `test/onboardingGate.test.js` | **New** | Node `--test` coverage of the gate's branches. |
| `src/renderer/onboarding.js` | **New** | DOM host: agent chips, three routes, Skip/×/Escape, notify on failure. |
| `src/renderer/styles/components/onboarding.css` | **New** | The panel beneath the lockup: three boxes, agent row, foot; both schemes. |
| `index.html` | **Modified** | Add `#onboarding` inside `#app-loader`; delete the `#welcome-overlay` block. |
| `src/renderer/appLoader.js` | **Modified** | Gate branch at hand-off; park instead of remove; keep the failsafe's priority. |
| `src/renderer/styles/components/app-loader.css` | **Modified** | Interactive surface + parked state; lockup holds position while the panel fades up. |
| `src/renderer/index.js` | **Modified** | Require/init `onboarding`, drop `welcomeOverlay`, repoint `help.welcome`. |
| `src/renderer/styles/main.css` | **Modified** | Import `onboarding.css`, drop `welcome-overlay.css`. |
| `src/main/menu.js` | **Modified** | Help › Welcome label follows the renamed command (`menu.js:230`). |
| `src/renderer/guide/guideContent.js` | **Modified** | One sentence + one command label corrected (D7). |
| `src/renderer/welcomeOverlay.js` | **Deleted** | Replaced by `onboarding.js`. |
| `src/renderer/styles/components/welcome-overlay.css` | **Deleted** | Replaced by `onboarding.css`. |

## Footprint

- index.html
- src/renderer/onboarding.js
- src/renderer/onboarding/onboardingGate.js
- src/renderer/appLoader.js
- src/renderer/index.js
- src/renderer/welcomeOverlay.js
- src/renderer/guide/guideContent.js
- src/renderer/styles/main.css
- src/renderer/styles/components/onboarding.css
- src/renderer/styles/components/app-loader.css
- src/renderer/styles/components/welcome-overlay.css
- src/main/menu.js
- test/onboardingGate.test.js

## Dependencies

None.

## Sequencing

1. **The gate, with its tests.** Write `onboarding/onboardingGate.js` and
   `test/onboardingGate.test.js`: launch with zero projects shows and is not
   dismissible; launch with one or more does not show; a non-array payload
   does not show; `command` always shows and is always dismissible. Nothing
   imports it yet. *(owns S1, S2, S5, S7 partly; D4, D5)*

2. **The panel's markup and styles.** Add `#onboarding` inside `#app-loader`
   in `index.html` — three boxes, the agent row, the foot with Skip, the guide
   link and a `×` — plus `onboarding.css` and its `main.css` import, and the
   `app-loader.css` rules that fade the panel up beneath the held lockup and
   make the surface interactive. Still unreachable at runtime; verified by
   temporarily forcing the class. *(owns G2, G3, G4, C8, D1, D6)*

3. **The host.** Write `onboarding.js`: render the agent chips from
   `GET_AI_TOOL_CONFIG`, keep them in sync on `AI_TOOL_CHANGED`, persist with
   `SET_AI_TOOL`, route the three boxes, wire Skip, and honour `dismissible`
   for `×`/Escape. Every failed invoke goes to `notify.error`. *(owns G2, G3,
   C4, C7, D2)*

4. **The hand-off.** In `appLoader.js`, capture the projects array from the
   `WORKSPACE_DATA` push, and at the moment the loader would leave, consult
   the gate: show → `onboarding.takeOver()`; otherwise park. Change `hide()`
   to fade-and-park instead of fade-and-remove, keeping the init-once guard
   and the failsafe's precedence. *(owns G1, G5, C5, C6, D3, S8)*

5. **Retire the modal.** Delete `welcomeOverlay.js`, `welcome-overlay.css` and
   the `#welcome-overlay` markup; repoint `help.welcome` at
   `onboarding.open()`; update `menu.js:230`, the stale comments in
   `appLoader.js` and `openProjectModal.js`, and the two guide strings. Grep
   for `welcome` afterwards: nothing may point at a deleted file or id.
   *(owns G6, S9, C1, C2, D7)*
