---
keywords: guided tour, product tour, coachmark, spotlight, first run, onboarding, terminal-first, bring your own agent
related: first-run-onboarding-screen, how-to-use-frame-guide, sidebar-project-section, terminals-home-agents, agent-orchestration, settings-by-scope
---

# First-run guided tour

## Problem

A first-time user who gets past the onboarding screen lands in an app with a
header, a rail, a nav and a composer, and nothing tells them how the pieces fit
together. The most important idea never reaches them: Frame is a
**terminal-first** platform. You bring your own agent (Claude Code, Codex), and
you run the work from the terminal. Frame does not replace the agent. The
How to Use Frame guide explains all of this, but it is reference material the
user has to go and open. A user who skips onboarding without adding a project
gets no pointer at all to the project-start boxes, and without a project
nothing else in Frame works.

## Goal

A short, fluid tour for first-time users. Each step highlights one real element
of the app and shows a small card next to it: one or two sentences, a step
counter, **Next** and **Skip tour**. The steps, in order:

1. **Add a project** *(only when no project is open)*. Highlights Home's
   project-start block (`.project-start` inside `.lane-board-empty-start`):
   Frame needs a project to work with. The step does not advance on Next.
   Adding a project through any route moves the tour on.
2. **Project switcher**. Highlights `#sidebar-current-project` in the header:
   add another project or switch between projects here.
3. **Agents & terminals**. Highlights the agent launcher (`#sidebar-agent-launch`
   + `#ai-tool-selector`) and where terminals are managed. This is the step
   that carries the terminal-first message: connect your own agent, and drive
   the work from its terminal.
4. **Specs**. Highlights the Specs nav item: significant work goes
   spec → plan → tasks before code, and the agent runs each stage.
5. **Tasks**. Highlights the Tasks nav item.
6. **Settings**. Highlights the rail's gear (`#frame-settings-btn`).
7. **Orchestration (Beta)**. Highlights the Orchestration nav item: it is in
   beta, and it runs several specs in parallel, so it has nothing to do until
   more than one spec is ready.

The last step ends on a closing line that restates the terminal-first idea
and points to How to Use Frame for the details.

## Constraints

- **It is not the guide** (`how-to-use-frame-guide`, 2026-09-15): the user
  rejected a launch-time modal guide ("onboarding sayılmaz"). The tour is
  lightweight cards on the live UI. It never opens the guide by itself; a
  link to it on the last step is allowed.
- **The onboarding screen owns the boot** (`first-run-onboarding-screen`): the
  tour never shows over the onboarding screen or the workspace failsafe. It
  starts only after the loader has parked. If the user added a project from
  the onboarding screen, the tour starts at step 2.
- **Reuse the routes, don't fork them**: step 1 adds no buttons of its own.
  The highlighted `projectStart` boxes stay clickable and run
  `state.selectProjectFolder()`, `state.createNewProject()` and the clone row
  exactly as today.
- **The tour only highlights; it never navigates.** Every target lives in the
  persistent chrome (header, rail, sidebar nav), so no view switch is needed.
  The one exception: when the sidebar is collapsed to the rail (it always is
  with no project, per `projectSection.syncSidebar`), the tour reveals it
  before a nav-item step.
- **State only what the code confirms** (the guide's rule): the orchestrator
  enforces no minimum spec count today (`orchestrator.js` `ASSIGNABLE_PHASES`),
  so the orchestration copy must match whatever Open Question 2 decides.
- **Shown once**: finishing or skipping records a user setting through the
  existing `GET_USER_SETTING` / `SET_USER_SETTING` channels. No new IPC.
  Re-runnable on demand from the command palette.
- **No new dependency** (no tour library). Both themes via design tokens;
  `prefers-reduced-motion` respected; Escape skips, Enter/→ advances.
- A missing or hidden target skips its step with a `console.error`. It never
  breaks the tour or leaves a stray backdrop. The card and highlight follow
  window resize and sidebar collapse.
- UI copy in English, one or two sentences per step, no marketing tone.

## Success Criteria

- When a first-time user clicks Skip on the onboarding screen, then Home's
  project-start block is highlighted with step 1's card, and the boxes inside
  it still work.
- When a project is added during step 1 (by any route), then the tour moves to
  step 2 without the user pressing Next.
- When a first-time user adds a project from the onboarding screen, then the
  tour starts at step 2 once the project is open.
- When the user presses Next on steps 2–6, then the next target is highlighted
  and its card is placed beside it, inside the viewport.
- When a nav-item step starts while the sidebar is collapsed, then the sidebar
  is revealed and the nav item is highlighted.
- When step 3 is shown, then its copy says that Frame connects your own agent
  (Claude Code, Codex) and that work is driven from the terminal.
- When step 7 is shown, then its copy says orchestration is in beta and needs
  more than one spec.
- When the user clicks Skip tour, presses Escape or finishes the last step,
  then the tour closes, the setting is saved, and no later launch shows it.
- When the user runs the tour command from the palette, then the tour starts
  again, beginning at step 1 or step 2 depending on whether a project is open.
- When a user who already has projects (or has already seen the tour) launches
  Frame, then no tour appears.
- When a step's target element is missing, then that step is skipped and the
  tour continues.

## Out of Scope

- The How to Use Frame guide's content and entry points (how-to-use-frame-guide).
- The onboarding screen's layout and routes (first-run-onboarding-screen).
- Changing the orchestrator's own behaviour, unless Open Question 2 chooses (b).
- Telemetry events for tour start/skip/finish (audit-q3-product-analytics).
- Retiring the Initialize Frame spotlight in `state.js`.

## Open Questions

1. **Who sees the tour automatically.**
   - *(a)* Only a fresh user: the launch had zero projects and the tour setting
     was never written. Existing users can still run it from the palette.
     Recommended.
   - *(b)* Everyone once, including existing users on their next launch.
2. **Orchestration's "needs more than one spec".** The orchestrator has no
   minimum today.
   - *(a)* Copy only: it runs specs in parallel, so it is worth starting once
     more than one spec has tasks. Recommended.
   - *(b)* Enforce it: the Start button stays disabled until two specs are
     assignable, and the copy states the rule.
3. **Agents and terminals as one step or two.**
   - *(a)* One step on the header launcher that covers both starting an agent
     and where its terminals live. Shorter tour. Recommended.
   - *(b)* Two steps: the launcher, then the terminal tab bar (Terminals chip
     and per-terminal chips).
4. **The highlight mechanism.**
   - *(a)* Generalise the existing Initialize Frame spotlight (`state.js`,
     `#spotlight-overlay`) into a reusable tour host.
   - *(b)* A new `tour/` module with its own dim-with-cutout overlay and card,
     leaving the init spotlight alone. Recommended: the init spotlight is
     parked and single-purpose.
