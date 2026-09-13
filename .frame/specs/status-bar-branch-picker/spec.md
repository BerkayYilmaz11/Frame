---
keywords: status bar, git branch, branch picker, checkout, switch branch, popover, quick pick, remote branches, VS Code
related: status-bar, github-view-tree-layout, dock-panel-readonly-views, agent-orchestration
---

# Status bar branch picker

## User's request (original, Turkish)

> sol altta git branchi var. buna tıklayınca vscode gibi var olan branchleri
> popover gibi gösterip seçtirebilir miyiz? […] local branchler mi local +
> remote branchler mi listelenmeli best practice nedir
>
> spec olarak açalım. best practice neyse uyalım bugsız bir şekilde. […]
> oradaki dockta bir tab olarak mı açalım sence yoksa sol alttan açılan bir
> popover mı daha uygun

Decision taken in conversation: a popover anchored to the status bar
indicator, not a dock tab. Switching a branch is a transient act (open, pick,
gone); the dock hosts content you keep open, and it shows one tab at a time,
so a checkout there would evict Activity or Decisions for nothing. VS Code
makes the same call with its branch quick pick.

## Problem

The status bar's branch indicator (`.sb-branch` in `statusBar.js`, status-bar
spec) is a read-only label. Switching branches means leaving the terminal for
the GitHub view's Branches section, finding the row, and clicking its hover
action. In an app whose center is the terminal, a checkout is a frequent,
small act; it should cost one click on the thing that already shows the
branch, the way every editor with a status bar does it.

The backend already exists: `LOAD_GIT_BRANCHES` returns local and remote
branches with `isRemote`, `isCurrent`, short sha and relative date;
`SWITCH_GIT_BRANCH` checks the working tree, checks out, and turns a remote
ref into a tracking branch; `CREATE_GIT_BRANCH` creates and optionally
checks out. Only the status bar side is missing.

## Goal

Clicking the branch indicator opens a popover above it (the bar sits on the
window floor, so it opens upward, like `.sb-agents-menu`). The popover:

1. Opens with a filter input focused. Typing narrows the list on the branch
   name, case-insensitive, substring match.
2. Lists **local branches first**, current one marked and pinned at the top,
   the rest ordered by most recent commit (`committerdate`, which the IPC
   already returns as relative text; the plan decides whether to add a
   sortable timestamp). Each row: branch glyph, name, and the relative date
   dimmed on the right.
3. Below a labelled divider, lists **remote branches that have no local
   counterpart** (`origin/foo` is hidden when local `foo` exists). Remote
   rows show a cloud/remote glyph and their full `remote/name`. Best
   practice, and VS Code's: both scopes, separated, no duplicates.
4. A first row **"Create new branch…"** that turns the filter's current text
   into the new branch name and checks it out (`CREATE_GIT_BRANCH` with
   `checkout: true`). When the filter matches nothing, this row is the only
   one left and pressing Enter runs it.
5. A last row **"Manage branches…"** that opens the GitHub view's Branches
   section for delete, worktrees and pull requests. The popover stays a
   picker; management lives where it already is.
6. Selecting a row runs `SWITCH_GIT_BRANCH`. On `uncommitted_changes` the
   popover stays open and shows an inline notice ("Commit or stash changes
   first") with the count of changed files, rather than a toast alone. On
   any other error the notice carries the git message. On success the
   popover closes, a toast confirms, and `REFRESH_GIT_STATUS` is sent so the
   indicator repaints from the same `GIT_STATUS_DATA` push it already
   listens to (GitHub view's D13 pattern, `afterCheckoutChange`).
7. Keyboard: Up/Down move the highlight, Enter picks, Escape closes, focus
   returns to the indicator. Outside click and project switch close it.
8. The list is fetched on every open, not cached: a branch created in a
   terminal a second ago must be there.

Deliverable: the picker in `statusBar.js` (or a sibling module it owns), its
CSS in `status-bar.css`, a pure list model with tests (grouping, dedupe,
ordering, filter), and one `gitBranchesManager.js` fix listed under
Constraints. No new IPC channels unless the plan finds `LOAD_GIT_BRANCHES`'s
payload insufficient for ordering.

## Constraints

- **status-bar**: the bar stays 26px and quiet. The indicator becomes a
  button in place; nothing new is added to the bar itself. The popover is a
  child of `.status-bar-left` like `.sb-agents-menu`, positioned
  `bottom: 100%`, and must clear the dock when the dock is at the bottom.
- **Click opens, not hover.** The agents menu opens on hover because it is a
  readout; the picker is an action with a text input and must not open
  under a passing pointer. One popover in the bar at a time: opening the
  picker closes the agents menu and vice versa.
- **Multi-remote correctness.** `switchBranch` in `gitBranchesManager.js`
  strips only an `origin/` prefix; with a second remote (`upstream/foo`) it
  would try `git checkout upstream/foo` and land in detached HEAD. The
  picker passes the remote branch's `isRemote` flag or short local name so
  the tracking-branch path works for any remote (`git checkout -b foo
  --track upstream/foo`, or `git switch -c`). Fix in main, keep the IPC
  signature backward compatible for the GitHub view.
- **agent-orchestration**: workers run in worktrees on `frame/<slug>/work`
  branches. A branch checked out in another worktree cannot be checked out
  here; git refuses with "already checked out at …". The picker shows that
  git message verbatim in its inline notice and does not offer `--force` or
  any workaround. The plan decides whether such rows are dimmed up front
  using `LOAD_GIT_WORKTREES`.
- **Detached HEAD**: `gitStatusManager` reports `'detached HEAD'` as the
  branch. The indicator shows it, the picker still opens, no row is marked
  current.
- **Not a repo**: the indicator stays hidden (unchanged); nothing to open.
- **No git on the machine**: `LOAD_GIT_BRANCHES` returns an error; the
  popover shows it in the notice area instead of an empty list.
- **Never mutate on open.** Opening the picker runs only `LOAD_GIT_BRANCHES`
  (a read). No `git fetch`: a fetch is a network call and a surprise from a
  UI that looks local. `.git` watcher in `gitStatusManager` must not spin;
  `git branch -a` reads refs only.
- **No new dependencies.** Lucide icons already in the bundle; no
  fuzzy-search library, plain substring filter.
- Light and dark themes; `escapeHtml` on every branch name (names can carry
  `<`, `&`, quotes).
- **XSS/command safety**: branch names go to main and are shell-quoted
  there; the filter text used for "Create new branch…" is validated with
  `git check-ref-format --branch` semantics (reject spaces, `..`, `~`, `^`,
  `:`, leading `-`) before it is sent, and the row is disabled with a reason
  while the text is invalid.
- Tests: the list model is pure (`src/renderer/statusBar/branchPicker
  Model.js` or similar) and covered by `node --test` like `dockState`;
  the main-side remote-prefix fix gets a unit test on its pure part.

## Success Criteria

- When the indicator is clicked in a repo, then a popover opens above it
  within one frame after the branch list resolves, with the filter focused
  and the current branch marked and first.
- When local `foo` and remote `origin/foo` both exist, then `foo` appears
  once, in the local section, and `origin/foo` does not appear.
- When remote `origin/bar` has no local branch, then it appears under the
  remote divider; picking it checks out a local `bar` tracking `origin/bar`
  and the indicator reads `bar`.
- When a second remote `upstream/baz` exists with no local `baz`, then
  picking it creates local `baz` tracking `upstream/baz` and does not land
  in detached HEAD.
- When the working tree has uncommitted changes and a row is picked, then
  the popover stays open showing "Commit or stash changes first" and the
  branch does not change.
- When a branch checked out in another worktree is picked, then git's
  "already checked out" message is shown inline and nothing changes.
- When "new-feature" is typed and no branch matches, then the only row is
  "Create new branch 'new-feature'" and Enter creates and checks it out.
- When "bad name" (with a space) is typed, then the create row is disabled
  with a reason and Enter does nothing.
- When Escape is pressed, then the popover closes and focus is on the
  indicator; when the user clicks outside or switches project, it closes.
- When the picker is opened while the agents menu is open (or vice versa),
  then only one of them is visible.
- When the dock is open at the bottom, then the popover renders above the
  dock, not behind it.
- When `npm test` runs, then the new model tests pass alongside `dockState`,
  `githubRowModels` and `gitStatusWatcher`.

## Out of Scope

- Branch delete, rename, worktree add/remove, pull request checkout (GitHub
  view, github-view-tree-layout).
- Stash-and-switch or auto-stash prompts.
- `git fetch` / prune from the picker.
- Fuzzy matching or recency memory of picked branches.
- Ahead/behind counts or sync status next to the branch name.
- A command palette entry or keyboard shortcut to open the picker.

## Open Questions

- **Ordering of local branches.** By most recent commit (VS Code) needs a
  sortable timestamp; `LOAD_GIT_BRANCHES` returns only relative text.
  Options: add `%(committerdate:unix)` to the existing format string (one
  extra field, GitHub view ignores it), or order by name and keep the IPC
  untouched.
- **Rows for branches checked out in other worktrees.** Dim them up front
  with a "in worktree …" hint (one more IPC call on open, `LOAD_GIT_
  WORKTREES`), or let git refuse and show its message only when picked.
