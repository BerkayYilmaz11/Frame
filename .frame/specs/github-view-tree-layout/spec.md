---
keywords: github panel, sidebar rail, pull requests, issues, branches, worktrees, gh cli, gh auth, tree view, vscode layout, confirm modal
related: dock-panel-readonly-views, audit-q3-ux-error-feedback, agent-orchestration, sidebar-nav-groups
---

# GitHub view — tree sections, dense rows, real pull requests

> **What we're building:** The sidebar's GitHub rail tab is rebuilt in the
> shape of VS Code's "GitHub Pull Requests" view: stacked, collapsible
> sections (Pull Requests · Issues · Branches · Worktrees) with dense
> single-line rows and inline hover actions, replacing the horizontal tab
> bar, the card rows and the "Coming Soon" PRs tab. Pull requests get real
> data through `gh`. Auth and repo problems become distinct states with a
> way forward.

## User's request (original, Turkish)

> Yeni bir UI UX iyileştirme yapmamız lazım. Github butonu var. Orada tablar
> vs var. buradaki görünüm cursor vs code gibi daha kullanışlı ve modern
> olabilir mi? Bizimki çok eski görünüyor ve Issues PRs vs bunlar vscode'da
> var mı? bana analiz hazırla geliştirme yapma
>
> aynen geliştirme yapmayalım spec oluşturabilirsin plan yapabilirsin

Observed on 2026-09-12 by running the app (sidebar at its 280px default):

- The fourth tab is clipped — "Worktrees" renders as "Wo". The sidebar can
  go down to 180px (`sidebarResize.js` `MIN_WIDTH`), where a fourth tab is
  never visible.
- Branches rows break into three lines each: the relative date wraps as
  "6 / months / ago", names truncate at ~10 characters, ten branches need a
  full-panel scroll.
- Issues, worktrees and the current branch are drawn as bordered cards;
  VS Code and Cursor draw flat 22px rows with a hover wash.
- The PRs tab is a "Coming Soon" placeholder, yet its Open / Closed / All
  filter strip still shows.
- The Frame repo itself reports "Not a GitHub repository". The remote is
  `github.com/denizmrtoglu/Frame`; the actual cause is that `gh` is not
  logged in. The panel offers no way to sign in.
- The header's refresh button always reloads **issues** — pressed on the
  Branches section it replaces the branch list with issues
  (`githubPanel.js` binds `refreshIssues` unconditionally).
- Branch and worktree deletion go through the browser's native
  `confirm()`, against the confirm-modal discipline of
  `audit-q3-ux-error-feedback`.

## Problem

The GitHub tab is the only rail view that does not fit its own container.
Its chrome (tabs, filters, cards, a 48px empty-state illustration) was built
for a 400px slide-in panel and was re-parented into the sidebar unchanged
by `dock-panel-readonly-views` (D8: "keeping its refresh / filter /
create-branch chrome"). At sidebar widths it is unusable for branches,
clips its own navigation, ships an unfinished tab in primary navigation,
and misdiagnoses the most common failure (no `gh` session) as "not a
GitHub repository". The cost is a rail tab users open once and avoid, and
a branch switcher nobody trusts, in a product whose orchestration flow
depends on branches and worktrees.

## Goal

**1. Sections instead of tabs.** The panel body is a vertical stack of
collapsible sections in this order — **Pull Requests · Issues · Branches ·
Worktrees** — each with a header row carrying a chevron, the title, a
count badge and section-scoped actions (refresh; plus **New** for Branches
and a filter menu for Pull Requests and Issues). Open/collapsed state per
section persists in `localStorage`, app-wide. The `.github-tabs` strip,
`.github-filter` strip and `#github-repo-name` bar are removed; the repo
name (`owner/repo`) moves into the panel header next to the title.

**2. Dense rows.** Every list item is a single flat row in the shape of the
Changes tab's `.git-changes-row`: state icon, primary text truncated with
an ellipsis, right-aligned muted meta. No borders, no card background, no
second line. Row actions appear inline at the right on hover or focus
(the `.git-branch-actions` pattern, kept), and every row action is also
reachable from a right-click context menu. Rows for:

- **Pull request** — state icon (open / draft / merged / closed), `#n`
  title; meta: author, relative time, review/CI hint when `gh` supplies it.
  Actions: Checkout (`gh pr checkout`), Open on GitHub.
- **Issue** — state icon, `#n` title, label chips as small colored dots;
  meta: relative time. Actions: Start work (creates a branch named
  `issue-<n>-<slug>` from the current branch and checks it out), Open on
  GitHub.
- **Branch** — current branch first and marked, then local, then a
  collapsible **Remote** sub-group; meta: short SHA, relative time.
  Actions: Switch, Delete (not on current / remote).
- **Worktree** — folder name, branch; the main worktree marked; a
  worktree under `.frame/worktrees/<slug>` shows the spec slug it belongs
  to. Actions: Open terminal here (new lane with `cd`), Remove (not main).

**3. Three failure states, told apart.** Before any list loads, the panel
resolves one of: `gh` not installed (link to cli.github.com); `gh` not
signed in (a **Sign in to GitHub** button that runs `gh auth login` in a
terminal lane, then re-checks); not a GitHub remote (Branches and
Worktrees still render — they are plain git). A successful check is cached
per project until refresh or project change.

**4. Real pull requests.** `githubManager.js` gains `gh pr list --json`
(number, title, state, isDraft, author, updatedAt, url, reviewDecision,
statusCheckRollup, headRefName) with the same open / closed / all filter
as issues, and `gh pr checkout <n>`. The "Coming Soon" state is deleted.

**5. Search and filter.** One filter input at the top of the panel, the
Files tab's `.file-tree-search` field, narrows every section's rows by
substring (title, number, branch name). The Open / Closed / All choice
becomes a per-section menu on the Pull Requests and Issues headers.

**6. Refresh respects the section.** The header refresh reloads every
expanded section; a section's own refresh reloads only that section. Each
section keeps its last result and re-renders it instantly on expand, then
refreshes in the background.

**7. Confirm modals.** Branch delete, force delete, worktree remove and
force remove use an app modal in the `taskConfirmModal` shape (initial
focus Cancel, Enter activates the focused button only). No `confirm()`.

## Constraints

- **C1 — the rail tab, its command and its shortcut stand.** GitHub stays
  the fourth rail tab; `sidebar.github` (`⌘⇧G`) and
  `revealSidebarTab('github')` → `githubPanel.show()` keep working
  (`dock-panel-readonly-views` T09). The dock is not involved.
- **C2 — fits every sidebar width.** Every section header, row and action
  is usable from 180px to 500px (`sidebarResize.js` limits). Nothing is
  clipped horizontally; text truncates with an ellipsis, never wraps.
- **C3 — one toast, one escapeHtml, one confirm discipline**
  (`audit-q3-ux-error-feedback`): `notify.js`, `htmlUtils.escapeHtml`, and
  a confirm modal with Cancel focused first. No local copies, no `confirm()`.
- **C4 — `gh` stays the only GitHub transport.** No GitHub REST client, no
  token storage, no new dependency. Everything GitHub-side is a `gh`
  invocation in `src/main/`; git-side calls stay in
  `gitBranchesManager.js`.
- **C5 — existing IPC contracts hold.** `LOAD_GIT_BRANCHES`,
  `SWITCH_GIT_BRANCH`, `CREATE_GIT_BRANCH`, `DELETE_GIT_BRANCH`,
  `LOAD_GIT_WORKTREES`, `REMOVE_GIT_WORKTREE`, `LOAD_GITHUB_ISSUES`,
  `OPEN_GITHUB_ISSUE` keep their payloads; new channels are added for pull
  requests, auth state and checkout. The orchestration helpers in
  `gitBranchesManager.js` (`createOrchWorktree` and friends) are untouched.
- **C6 — the Create Branch modal stands.** `#create-branch-modal` and its
  base-branch / switch-to-branch fields are reused as-is; only its trigger
  moves to the Branches section header.
- **C7 — the sidebar's own chrome stands.** The rail, the project switcher,
  Files and Changes tabs are not touched; the panel changes only inside
  `[data-sidebar-tab-content="github"]`.
- **C8 — no work is lost by a switch.** Switching branches or checking out
  a PR with a dirty tree keeps refusing (`uncommitted_changes`), and the
  toast says so; no auto-stash.
- **C9 — icons come from `lucide`** through the existing inline-SVG helper
  (`dock.lucideIcon`), not hand-drawn paths.
- **C10 — pure logic is testable.** Row-model building (PR / issue /
  branch / worktree → row view-model), the auth-state resolver and the
  section-state store live in dependency-free modules under
  `src/renderer/github/` with `test/*.test.js` coverage, the way
  `src/renderer/home/` and `dock/dockState.js` do. DOM code stays untested.
- **C11 — the in-flight `audit-q3-performance-resources` spec owns other
  lines of `index.html`.** This spec edits only the GitHub tab block and
  the create-branch modal's trigger; it merges on top of that work.

## Success Criteria

- When the sidebar is at 180px and the GitHub tab is opened, then all four
  section headers are fully visible with their counts and no horizontal
  clipping or scrollbar.
- When Branches is expanded with ten local branches, then each branch is
  one row, the current branch is first and marked, and the SHA and relative
  time sit right-aligned on the same line.
- When `gh` is installed but not logged in, then the panel shows "Sign in
  to GitHub"; clicking it opens a terminal lane running `gh auth login`,
  and after the user completes it, Refresh loads pull requests and issues.
- When the remote is not GitHub, then Pull Requests and Issues show a
  one-line "Not a GitHub remote" note and Branches and Worktrees still load.
- When Pull Requests is expanded on a GitHub repo, then open PRs list with
  number, title, author, draft/review state; Closed and All are selectable
  from the section's filter menu.
- When Checkout is chosen on a PR row with a clean tree, then `gh pr
  checkout` runs, the current branch in Branches and in the status bar
  updates, and a toast confirms.
- When Start work is chosen on issue #42 "Fix login timeout", then a branch
  `issue-42-fix-login-timeout` is created from the current branch and
  checked out, and Branches shows it as current.
- When text is typed into the filter field, then every expanded section
  shows only rows whose title, number or name contains it, and section
  counts reflect the filtered totals.
- When the header refresh is pressed while Branches is expanded, then the
  branch list reloads and no issue list appears in its place.
- When Delete is chosen on a non-current local branch, then an app modal
  opens with Cancel focused; Enter closes it without deleting; confirming
  deletes and a toast reports it; an unmerged branch gets a second, force
  confirm.
- When a worktree under `.frame/worktrees/<slug>` is listed, then its row
  names the slug; Open terminal here creates a lane in that path.
- When the app restarts, then each section's expanded/collapsed state is as
  it was left.
- When `npm test` runs, then every suite passes, including new tests for
  the row models, the auth resolver and the section store.

## Out of Scope

- A PR or issue detail view inside Frame (description, timeline, review
  comments) — a separate spec.
- Creating pull requests or issues from Frame; commenting; merging.
- Inline review comments in the editor.
- GitHub Actions / checks as a section.
- Ahead/behind counts and upstream tracking on branch rows.
- Adding worktrees from the panel (only orchestration creates them today).
- Changes tab, Files tab, status bar branch item, project switcher.
- Any dock surface (`dock-panel-readonly-views`).

## Open Questions

- **Issue → branch, or issue → spec?** Start work could (a) only create
  and check out `issue-<n>-<slug>`; or (b) additionally open the New Spec
  launcher pre-filled with the issue title and URL, tying the issue into
  Frame's spec flow. (a) is smaller; (b) is where Frame differs from VS Code.
- **Where Open on GitHub lands.** (a) external browser via
  `shell.openExternal`, as today; (b) the same, but a PR row's primary click
  copies nothing and only the action opens — i.e. does a row click open the
  browser (today's issue behaviour) or only select the row?
- **Section defaults.** Which sections start expanded on first open: (a)
  Pull Requests and Branches; (b) all four; (c) Branches only, since it
  works without `gh`.
