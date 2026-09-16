---
keywords: onboarding, first run, welcome, boot splash, empty state, default agent, open project, clone from github
related: how-to-use-frame-guide, sidebar-project-section, audit-q3-ux-error-feedback, audit-q3-generic-any-project
---

# First-run onboarding screen

## Problem

A first launch ends on a boot splash that fades into an empty app, and then a
560px welcome card appears on top of it — a modal asking a user to do the one
thing the empty app behind it also needs. The card shows on *every* launch
until the user finds the "Don't show this again" checkbox, so the people who
see it most are the ones who least need it: users with projects already open.
Meanwhile the user who genuinely has nothing gets a dialog they can dismiss
into a blank window with no route back.

The boot intro now ends on a composed full-bleed lockup. Handing that straight
to a modal throws away the one moment the app already has the user's full
attention.

## Goal

The boot splash does not fade into the app when the user has no projects. It
becomes the onboarding screen: the same full-bleed surface, the mark and
wordmark already on it, with the first-run content arriving beneath them.

The screen carries, top to bottom:

- **Three boxes**, side by side — Open a folder · Create a new project ·
  Clone from GitHub. Each runs the route that exists today.
- **Default agent** — the live agent picker, below the boxes.
- **Skip**, at the foot of the screen, which leaves for the app.

It appears only when the workspace has zero projects. With one or more
projects the splash fades to the app exactly as it does now. The welcome modal
is deleted; the palette's **Show Welcome Screen** command opens this screen
instead, so it stays reachable once projects exist.

## Constraints

- **The guide is reference, not onboarding** (`how-to-use-frame-guide`
  follow-up, 2026-09-15): the user rejected a launch-time guide once already.
  This screen must not open the guide by itself. A link out is fine.
- **The welcome card's 2026-09-16 content baseline holds** — three ways into a
  project, agent chips, no sample project, no pitching. This spec moves that
  content to a new surface; it does not re-open what it should say.
- **Reuse the existing routes, don't fork them**: `state.selectProjectFolder()`,
  `state.createNewProject()`, `openProjectModal.open({ clone: true })`.
- **Agent picker keeps its current wiring**: `GET_AI_TOOL_CONFIG` to read,
  `SET_AI_TOOL` to persist, `AI_TOOL_CHANGED` to stay in sync. A saved tool
  that no longer exists still falls back to Claude Code.
- **The splash's boot contract survives**: the loader leaves only once the
  intro has finished *and* `WORKSPACE_DATA` has arrived, and the failsafe's
  "couldn't load your workspace" retry state still wins over everything.
- **No new IPC.** `WORKSPACE_DATA` already carries the projects array
  (`src/main/workspace.js:203`); the count is the whole gate.
- **No silent failures** (`audit-q3-ux-error-feedback`): a failed agent read or
  a failed persist tells the user.
- Both schemes, using the `--brand-mark` tokens the splash already uses.

## Success Criteria

- When the workspace has zero projects, then the boot intro ends on the
  onboarding screen and no welcome modal ever appears.
- When the workspace has one or more projects, then the splash fades to the
  app and the onboarding screen never renders.
- When the user clicks any of the three boxes, then the screen leaves and the
  existing route runs — folder picker, new-project flow, or the Open Project
  modal's clone form.
- When the user picks an agent, then `SET_AI_TOOL` persists it and the choice
  is still selected after a relaunch.
- When the user clicks Skip, then the screen leaves for the app; relaunching
  with still zero projects shows the screen again.
- When the user has opened a project, then no later launch shows the screen.
- When the user runs **Show Welcome Screen** from the palette, then the screen
  opens on demand regardless of project count, and Skip closes it.
- When `LOAD_WORKSPACE` never answers, then the failsafe's retry state shows —
  not the onboarding screen.
- After this ships, `welcomeOverlay.js`, `#welcome-overlay` and
  `welcome-overlay.css` are gone, with no dead ids, styles or commands left
  pointing at them.

## Out of Scope

- The How to Use Frame guide's content and entry points.
- The Open Project modal's own internals, including the clone form.
- Which agents exist in `AI_TOOLS`.
- Migrating or clearing the now-unread `onboardingDismissed` user setting.

## Open Questions

1. **How the intro becomes the screen.** The splash ends on a centred
   mark + wordmark lockup.
   - *(a)* The lockup stays put and the boxes, agent picker and Skip fade in
     beneath it — one continuous page, no second entrance. Recommended.
   - *(b)* The lockup crossfades out and the onboarding screen fades in as its
     own composition, free to place the mark wherever it reads best.
2. **Whether Skip is the only way out.** The screen has no × and no backdrop
   to click when it opens at boot, but the palette-opened case is a
   conventional overlay.
   - *(a)* Skip only at boot; Escape and × added when opened from the palette.
   - *(b)* Escape always closes, at boot too.
