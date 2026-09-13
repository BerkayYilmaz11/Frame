# Plan — Status bar branch picker

## Architecture

### Resolved plan-time decisions

- **D1 · Popover, not a dock tab** (business, decided in conversation before
  the spec). Switching a branch is a transient act; the dock hosts content
  that stays open and shows one tab at a time, so a checkout there would
  evict Activity or Decisions. The picker is a child of `.status-bar-left`,
  opening upward like `.sb-agents-menu`.
- **D2 · Local branches ordered by most recent commit** (business, asked).
  `loadBranches` adds `%(committerdate:unix)` to its existing format string as
  a `time` field; the GitHub view's `rowModels.branchRow` copies only the
  fields it names, so it ignores the new one. Alphabetical was rejected: with
  remote branches in the list the branch you were on ten minutes ago would be
  lost in the middle.
- **D3 · Branches checked out in another worktree are dimmed up front**
  (business, asked). Opening the picker runs `LOAD_GIT_WORKTREES` next to
  `LOAD_GIT_BRANCHES`; a local branch whose worktree path differs from the
  project path renders disabled with "in worktree <folder>". Letting git
  refuse was rejected: the orchestration's `frame/<slug>/work` branches make
  this a common case, and a row that cannot work should say so before the
  click.
- **D4 · Test posture: pure logic and data transforms only** (technical,
  asked). The list model, the branch-name validator and the remote-ref
  splitter are dependency-free modules under `node --test`; the popover's DOM
  host is not tested, matching the project's recorded convention (no DOM
  harness; `src/renderer/home/`, `src/renderer/github/rowModels.js`,
  `src/renderer/dock/dockState.js` are the precedent).
- **D5 · The picker lives in its own module pair** (technical, silent).
  `src/renderer/statusBar/branchPicker.js` (DOM host) and
  `src/renderer/statusBar/branchPickerModel.js` (pure), wired from
  `statusBar.js`, the same host/model split `github/` and `dock/` use.
  Inlining into `statusBar.js` (already ~400 lines, three unrelated widgets)
  was rejected.
- **D6 · No new IPC channels and no change to the `SWITCH_GIT_BRANCH`
  payload** (technical, silent). `src/shared/ipcChannels.js` is in the
  footprint of the in-flight `audit-q3-cross-platform` spec, and the spec
  asked for no new channels. Main detects a remote ref on its own: if
  `refs/heads/<name>` exists it is a local checkout; otherwise the name is
  split against `git remote`'s list. The GitHub view keeps calling the same
  channel with the same payload and gets the multi-remote fix for free.
- **D7 · The two mutating git calls this spec touches move to `execFile`**
  (technical, silent). `switchBranch` and `createBranch` currently build a
  shell string with double quotes around the name. Branch names may contain
  `$`, backticks and quotes; the touched calls go through a new
  `execGitArgs(args, cwd)` helper on `execFile('git', args)`, which main
  already uses in `gitStatusManager.js:269` and `gitDiffManager.js:66`. The
  other commands in the file are not touched — not this spec's scope.
- **D8 · Branch-name validation is a shared pure module** (technical,
  silent). `src/shared/gitRefNames.js` exports `isValidBranchName(name)`
  implementing the `git check-ref-format --branch` rules that matter (no
  spaces or control characters, no `..`, `~`, `^`, `:`, `?`, `*`, `[`, `\`,
  no leading `-` or `/`, no trailing `/`, `.lock` or `.`, no `@{`, not `@`).
  The renderer disables the create row while the text is invalid; main
  rejects an invalid name before running git, so the GitHub view's create
  flow is covered too. Running `git check-ref-format` as a subprocess on
  every keystroke was rejected.
- **D9 · Remote dedupe uses a `shortName` computed in main** (technical,
  silent). `loadBranches` also runs `git remote` and, for each remote
  branch, attaches `remote` and `shortName` (the name after `<remote>/`,
  split with the longest matching remote so remote names containing `/`
  work). The model hides a remote row whose `shortName` matches a local
  branch. Splitting on the first `/` in the renderer was rejected because it
  is wrong for remotes named `a/b` and for branches named `feat/x` under a
  remote it cannot see.

### Data shapes

`LOAD_GIT_BRANCHES` result (existing fields kept, three added):

```js
{
  error: null,
  currentBranch: 'main',            // '' on detached HEAD
  remotes: ['origin', 'upstream'],  // NEW — git remote
  branches: [{
    name: 'main', commit: 'a1b2c3d', date: '2 hours ago', message: '…',
    isRemote: false, isCurrent: true,
    time: 1757760000               // NEW — %(committerdate:unix)
  }, {
    name: 'upstream/feat', …, isRemote: true, isCurrent: false, time: …,
    remote: 'upstream', shortName: 'feat'   // NEW — remote rows only
  }]
}
```

`branchPickerModel.buildRows(input)`:

```js
input  = { branches, currentBranch, worktrees, projectPath, filter }
output = {
  create: { name, valid, reason },   // reason: 'Type a name' | 'Invalid branch name' | null
  local:  [{ kind: 'local',  name, ref: name, current, date, disabledReason }],
  remote: [{ kind: 'remote', name, ref: name, shortName, date, disabledReason: null }],
  empty:  boolean                    // no local and no remote after filter
}
```

`disabledReason` for local rows is `in worktree <basename>` when
`worktreeFor(name, worktrees, projectPath)` finds a worktree at another path,
otherwise `null`. Rows are already filtered and ordered: local — current
first, then `time` descending, ties by name; remote — `time` descending, ties
by name.

`SWITCH_GIT_BRANCH` payload stays `{ projectPath, branchName }`. Result stays
`{ error, branch }` or `{ error: 'uncommitted_changes', message, changes }`.
`branch` is read back from `git branch --show-current` after the checkout
instead of being assumed, so the toast and any caller see the branch git
actually landed on.

### Components

- **`gitRefNames.js` (shared, pure)** — `isValidBranchName`. Used by the
  renderer for the create row and by main before `git checkout -b`.
- **`gitBranchRefs.js` (main, pure)** — `parseBranchLine(line)` for the new
  six-field format, `splitRemoteRef(name, remotes)` → `{ remote, shortName }`
  or `null`. `gitBranchesManager.js` requires it; the tests require it
  directly.
- **`gitBranchesManager.js` (main)** — `loadBranches` gains `remotes`,
  `time`, `remote`/`shortName`; `switchBranch` becomes: clean check →
  `refs/heads/<name>` exists? plain `git checkout <name>` : split against
  remotes → `git checkout -b <shortName> --track <remote>/<shortName>`
  (if local `<shortName>` already exists, plain checkout of it) → read
  `--show-current`. `createBranch` validates the name and uses
  `execGitArgs`. Any git failure returns the git message verbatim in
  `error` (this is what surfaces "already checked out at …").
- **`branchPickerModel.js` (renderer, pure)** — `buildRows`, `worktreeFor`,
  `moveHighlight(rows, index, delta)` over enabled rows only, and
  `flatten(output)` producing the keyboard order: create → local → remote →
  manage.
- **`branchPicker.js` (renderer, DOM host)** — `init({ anchorEl, slotEl,
  onOpen })`, `open()`, `close()`, `isOpen()`. Builds
  `.sb-branch-picker` once inside `.status-bar-left` (hidden), on `open()`
  fetches branches and worktrees in parallel, renders through the model,
  focuses the filter. Owns keyboard (Up/Down/Enter/Escape on the input),
  outside click (document listener guarded by `isOpen()`), and the inline
  `.sb-bp-notice`. Row click / Enter → `SWITCH_GIT_BRANCH` or
  `CREATE_GIT_BRANCH`; on success `notify.success`, `REFRESH_GIT_STATUS`,
  `close()`; on `uncommitted_changes` the notice reads "Commit or stash
  changes first · N changed file(s)" and the popover stays open; on any
  other error the notice shows `result.error`. "Manage branches…" runs
  `commandRegistry.runById('sidebar.github')` then
  `githubPanel.revealSection('branches')` and closes.
- **`statusBar.js`** — `_buildBranch` creates a `<button class="sb-branch">`
  instead of a span, calls `branchPicker.init`, toggles it on click, and
  makes the two popovers mutually exclusive: `branchPicker.init`'s `onOpen`
  calls `_closeMenu(true)`, and `_openMenu` calls `branchPicker.close()`.
  `state.onProjectChange` already clears the label; it now also closes the
  picker. Not a repo → the button stays `hidden`, so there is nothing to
  click (C6).
- **`githubPanel.js`** — one new export `revealSection(id)`:
  `sections = sectionState.setExpanded(sections, id, true)`, persist, apply,
  render, load. Eight lines beside `toggleSection`.
- **`status-bar.css`** — `.sb-branch` gains button resets, hover and
  `:focus-visible` like `.sb-dock-btn`; `.sb-branch-picker` mirrors
  `.sb-agents-menu` (absolute, `bottom: 100%`, `bg-elevated`, `shadow-md`,
  width 300–360px, `max-height: 60vh`) plus rows, group labels, the filter
  input, the notice, `.disabled` and `.current` states. Dock clearance is
  free: `#status-bar` is `position: fixed; z-index: 500` (a stacking
  context above the whole center, the dock included), so anything inside it
  paints over the dock at any dock position (C1).

### Behaviours pinned by the design

- Opening runs reads only (`git branch -a`, `git remote`, `git worktree
  list`); nothing writes, no `git fetch` (C8). `gitStatusManager`'s `.git`
  watcher does not fire on ref reads.
- Detached HEAD: `currentBranch` is `''`, so no row is `current`; the
  indicator shows `gitStatusManager`'s `'detached HEAD'` label (C5).
- No git binary: `loadBranches` rejects with `GIT_MISSING_ERROR`; the host
  shows it in the notice with an empty list (C7).
- Every branch name and path goes through `escapeHtml` (C10). Filter text
  is never inserted as HTML; the create row's label uses `textContent`.
- The bar stays 26px: the button replaces the span in place and adds no
  width (C1).

## Files

- **New** `src/shared/gitRefNames.js` — `isValidBranchName(name)`, the
  `check-ref-format --branch` rules as a pure predicate for both processes.
- **New** `src/main/gitBranchRefs.js` — pure helpers for
  `gitBranchesManager`: `parseBranchLine`, `splitRemoteRef`.
- **Modified** `src/main/gitBranchesManager.js` — `execGitArgs` helper;
  `loadBranches` adds `remotes`, `time`, `remote`/`shortName`;
  `switchBranch` detects local vs remote ref and tracks any remote;
  `createBranch` validates and uses `execFile`.
- **New** `src/renderer/statusBar/branchPickerModel.js` — pure list model:
  grouping, dedupe, ordering, filter, worktree matching, keyboard
  navigation order.
- **New** `src/renderer/statusBar/branchPicker.js` — the popover's DOM
  host: fetch, render, keyboard, outside click, switch/create/manage
  actions, inline notice.
- **Modified** `src/renderer/statusBar.js` — indicator becomes a button,
  wires the picker, mutual exclusion with the agents menu, close on project
  change.
- **Modified** `src/renderer/githubPanel.js` — export `revealSection(id)`.
- **Modified** `src/renderer/styles/components/status-bar.css` — button
  states for `.sb-branch`; `.sb-branch-picker` and its rows, groups, filter,
  notice.
- **New** `test/gitRefNames.test.js` — valid and invalid names, including
  the injection-shaped ones (`$(…)`, backticks, quotes) and the git edge
  rules (`.lock`, `@{`, `..`, leading `-`).
- **New** `test/gitBranchRefs.test.js` — six-field line parsing (message
  containing `|`), `splitRemoteRef` with one remote, two remotes, a remote
  named `a/b`, a branch `feat/x`, and a name matching no remote.
- **New** `test/branchPickerModel.test.js` — local/remote grouping, remote
  hidden when local exists, current pinned first then `time` desc, filter
  substring case-insensitive, worktree disabling (other path disables, own
  path does not, trailing-slash normalisation), create row states (empty /
  invalid / valid / hidden when an exact local match exists), `empty` flag,
  `moveHighlight` skipping disabled rows and wrapping.

## Footprint

- src/shared/gitRefNames.js
- src/main/gitBranchRefs.js
- src/main/gitBranchesManager.js
- src/renderer/statusBar/branchPickerModel.js
- src/renderer/statusBar/branchPicker.js
- src/renderer/statusBar.js
- src/renderer/githubPanel.js
- src/renderer/styles/components/status-bar.css
- test/gitRefNames.test.js
- test/gitBranchRefs.test.js
- test/branchPickerModel.test.js

## Dependencies

None. Icons come from the `lucide` package already in `package.json`
(`GitBranch`, `Cloud`, `Plus`, `Settings2` are all present); the filter is a
plain substring match.

## Sequencing

1. **Branch-name validator.** Write `src/shared/gitRefNames.js` with
   `isValidBranchName` and `test/gitRefNames.test.js` covering the rule list
   in D8 and the injection-shaped names.
2. **Pure ref helpers for main.** Write `src/main/gitBranchRefs.js`
   (`parseBranchLine` for the six-field format, `splitRemoteRef` longest-
   remote-first) and `test/gitBranchRefs.test.js`.
3. **Main: richer branch list.** In `gitBranchesManager.js`, add
   `%(committerdate:unix)` to the `git branch -a` format, run `git remote`,
   parse through `parseBranchLine`, attach `time` to every row and
   `remote`/`shortName` to remote rows, return `remotes`. Confirm the
   GitHub view's Branches section renders unchanged.
4. **Main: switch and create fixed.** Add `execGitArgs` on `execFile`.
   Rewrite `switchBranch` per D6 (local ref → plain checkout; remote ref →
   `checkout -b <short> --track <remote>/<short>`, or plain checkout when
   local `<short>` exists; read `--show-current` for the result). Make
   `createBranch` reject invalid names via `isValidBranchName` and use
   `execGitArgs`. Git's own error text passes through in `error`.
5. **Renderer list model.** Write
   `src/renderer/statusBar/branchPickerModel.js` (`buildRows`, `worktreeFor`,
   `flatten`, `moveHighlight`) and `test/branchPickerModel.test.js`.
6. **Popover host and styles.** Write `src/renderer/statusBar/branchPicker.js`
   (build once, fetch on open, render from the model, filter, keyboard,
   outside click, notice) and its CSS in `status-bar.css`, including the
   `.sb-branch` button states. Switch and create actions with the
   uncommitted-changes and error notices, success toast and
   `REFRESH_GIT_STATUS`.
7. **Status bar wiring.** In `statusBar.js`, turn the indicator into a
   button, init the picker, toggle on click, close the agents menu when the
   picker opens and the picker when the agents menu opens, close on project
   change, return focus to the button on Escape.
8. **Manage branches row.** Add `revealSection(id)` to `githubPanel.js`; the
   picker's last row runs the `sidebar.github` command, reveals the
   Branches section and closes.
