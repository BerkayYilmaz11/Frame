---
keywords: guided tour, product tour, coachmark, spotlight, first run, onboarding, terminal-first, bring your own agent
related: first-run-onboarding-screen, how-to-use-frame-guide, sidebar-project-section, terminals-home-agents, agent-orchestration, settings-by-scope
---
Added an 8-step guided tour over the live UI: a clear cutout with an accent ring in a 50% dim, plus a small card (title, n of N,
1–2 sentence body, Skip tour, Next/Done). Steps: project (Home's project-start boxes, only with no project, advances when one
opens) → switcher → agent launcher → terminals (tab bar chip, falls back to the nav row) → Specs → Tasks → Settings gear →
Orchestration (Beta, "needs more than one spec with tasks"). The last card restates terminal-first and links to How to Use Frame.
Split: pure `src/renderer/tour/tourSteps.js` (steps + copy, shouldAutoStart, first/next step, placeCard, validate; 19 tests in
test/tourSteps.test.js) and DOM host `src/renderer/guidedTour.js` (JS-built `#guided-tour`, `tour.css`, z-index 8000).
Starts once for every user (user's choice over "fresh users only") via `appLoader.onBootLeave` — the first park, after the
splash fade or the onboarding screen — then waits for the first-launch telemetry notice to close. Skip/Escape/Done write
`guidedTourDone: { outcome, at }` (user setting); a failed read never starts it; quitting mid-tour replays it next launch.
Rerun: palette/Help "Take the Frame Tour" (`help.tour`). Rejected: generalising state.js's parked init spotlight, a two-spec
minimum in the orchestrator (copy only), one combined agents+terminals step, a global key handler.
Rules: the overlay never takes clicks except the card and never navigates; targets are re-queried on every reposition (the tab
bar rewrites its chips); nav steps reveal the sidebar via revealSidebarTab and expand groups with
`projectListUI.revealNavItem` (not persisted) only when the step opens, never on reposition; keys act only with focus in the
card; a missing target skips its step. Card copy states only what the code confirms — renaming a named view, button or command
means updating tourSteps.js, and `validate` caps bodies at two sentences.

Chain: spec.md → plan.md → tasks.md → outcome.md
