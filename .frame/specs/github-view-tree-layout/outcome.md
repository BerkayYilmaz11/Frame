# Outcome — GitHub view — tree sections, dense rows, real pull requests

## T01 — Pure section store `sectionState.js` and its test

Wrote `src/renderer/github/sectionState.js` (`STORAGE_KEY = 'frame-github-sections'`, `SECTIONS`, `SUBGROUPS`, `defaults`, `load`, `isExpanded`, `toggle`, `setExpanded`, `expandedSections`, `serialize`) with no DOM or Electron import, and `test/githubSectionState.test.js` (14 cases): D3 defaults, per-key garbage tolerance, toggle, unknown ids, serialize → load round-trip. Two additions beyond the plan's list: the Branches section's `remote` sub-group is a fifth key in the same store so its open/closed state persists with the rest, and `setExpanded` so Start work can open Branches without toggling blindly.

_Captured: 2026-09-13 · 2 file change(s)_

---

## T02 — Pure access resolver `accessState.js` and its test

Wrote `src/renderer/github/accessState.js` (`stateOf`, `availabilityOf`, `resolve`, `isAvailable`): `{ gh, authed, repoName }` → `no-gh | no-auth | no-remote | ok`, the section availability map (git sections always, GitHub sections only in `ok`), and one copy record per state with its action (`install` link, `signin` button, none). A main-side `error` on `no-remote` is appended to the message so a slow or offline `gh repo view` explains itself (plan risk row). `test/githubAccessState.test.js`: 12 cases.

_Captured: 2026-09-13 · 2 file change(s)_

---

## T03 — Pure row view-models `rowModels.js` and its test

Wrote `src/renderer/github/rowModels.js`: `prRow(s)` (state icon incl. draft/merged/closed, review decision and a collapsed `statusCheckRollup` → `success | failure | pending`), `issueRow(s)` (label dots with normalized colors), `branchRows` (current → local by name → remote by name), `worktreeRows` (folder, branch, main marked, spec slug when the path is a direct child of `<project>/.frame/worktrees/`), `filterRows`, `issueBranchName` (kebab slug ≤ 40 chars), `relativeTime` (injectable `now`), `contrastColor` and `labelColor` moved out of the host. Icons are semantic names, so the module never touches `lucide`. `test/githubRowModels.test.js`: 24 cases. Deviation: the main worktree is marked by icon and bold name, not by a `main` meta word — its branch already sits in `secondary`, so the meta showed "main main".

_Captured: 2026-09-13 · 2 file change(s)_

---

## T04 — Main-side access check, pull requests and PR checkout

Added `GITHUB_ACCESS_STATE`, `LOAD_GITHUB_PULL_REQUESTS`, `CHECKOUT_GITHUB_PR` to `src/shared/ipcChannels.js`. Rewrote `src/main/githubManager.js` around one `run()` helper (repaired PATH, 10s timeout, never rejects): `checkAccess(projectPath, force)` short-circuits `gh --version` → `gh auth status` → `gh repo view --json nameWithOwner` and caches per project in a `Map`; `loadIssues` and the new `loadPullRequests` (`gh pr list --state <s> --limit 50 --json number,title,state,isDraft,author,updatedAt,url,reviewDecision,statusCheckRollup,headRefName`) both read it, so a not-signed-in `gh` now reports `gh not signed in` instead of "Not a GitHub repository"; `checkoutPullRequest` refuses with `uncommitted_changes` via `gitBranchesManager.isWorkingTreeClean` before `gh pr checkout <n>` and returns the resulting branch. Three handlers registered in `setupIPC`; `LOAD_GITHUB_ISSUES` and `OPEN_GITHUB_ISSUE` payloads unchanged (C5).

_Captured: 2026-09-13 · 2 file change(s)_

---

## T05 — Generalised confirm modal

`src/renderer/taskConfirmModal.js` `open()` now reads `heading`, `message` and `confirmLabel`, each falling back to the task wording ("Delete task?", the permanent-removal sentence, "Delete"); `index.html` gives the modal's `<h3>` `id="task-confirm-delete-heading"`. Focus (Cancel first) and Enter (focused button only) untouched. No deviation.

_Captured: 2026-09-13 · 2 file change(s)_

---

## T06 — GitHub tab markup

Replaced the tab block in `index.html` with `.github-head` (title + `#github-head-repo` + refresh), the Files tab's `.file-tree-search` field as `#github-search`, `#github-state`, and four `section.github-section[data-section]` elements whose heads carry a chevron, a title, a `[data-count]` badge and `[data-section-action]` buttons (filter + refresh on PRs / Issues, `#github-create-branch-btn` + refresh on Branches, refresh on Worktrees), plus a panel-owned `#github-context-menu` and `#github-filter-menu` on the file tree's `.context-menu` classes. `.github-tabs`, `.github-filter`, `#github-repo-name`, `#github-close` and `#github-content` are gone. Deviation: each title carries a long and a short span ("Pull Requests" / "PRs", "Worktrees" / "Trees", "Branches" / "Branch") so the head stays fully visible with its count at the 180px sidebar floor, where the panel itself is ~100px wide — the long form alone could not.

_Captured: 2026-09-13 · 1 file change(s)_

---

## T07 — `github.css`, import, `panels.css` cleanup

Created `src/renderer/styles/components/github.css`: head, search, state block, sticky 22px section heads with actions shown on hover / focus-within (`display: none` otherwise, so they take no width), 22px `.github-row` in the `.git-changes-row` idiom (icon, `#n`, ellipsized primary, label dots, review / CI dots, right-aligned meta that shrinks first and is capped at 45%, actions that replace the meta on hover), the Remote sub-group, inline notes, context / filter menu accents, and a container query on `#github-panel` that swaps to the short titles and hides row meta below 170px of panel width. Imported from `main.css` after `git-changes.css`. Removed the 890-line GitHub panel + git branches panel blocks from `panels.css` (nothing outside `githubPanel.js` referenced them) and fixed one comment that cited `.github-filter-btn`.

_Captured: 2026-09-13 · 3 file change(s)_

---

## T08 — Host shell: access state, sections, search, `openLane`

Rewrote `src/renderer/githubPanel.js` as the DOM host keeping `init / show / hide / toggle`: `init({ openLane })` paints lucide icons through `dock.lucideIcon`, loads `sectionState` from `localStorage['frame-github-sections']`, binds one delegated click / contextmenu listener per section; `show()` invokes `GITHUB_ACCESS_STATE`, resolves it, fills the head's repo name and the state block (install link via `shell.openExternal`, Sign in via `openLane({ command: 'gh auth login' })` with the "Refresh when done" copy, no-remote note), then loads every expanded, available section. The search field filters every section through `filterRows`; counts follow the filtered totals. `index.js` builds `openLane` on its `multiTerminalUI` instance (`createTerminalForCurrentProject({ cwd })`, `enterLane`, `sendCommand` after 300ms) and requires `notify` for its failure toasts. The old `TOGGLE_GITHUB_PANEL` listener is gone — nothing sends it.

_Captured: 2026-09-13 · 2 file change(s)_

---

## T09 — Branches and Worktrees sections

Rendered both from `rowModels` with hover actions and `#github-context-menu` (row click only selects, D2): Switch and Delete → force delete through `taskConfirmModal.open({ heading, message, confirmLabel })` ("Delete branch?" → "Force delete branch?"), Remove → force remove likewise, Open terminal here through `openLane({ cwd })`, Create Branch modal wired to the section head's `+` (C6). Remote branches sit under a collapsible Remote sub-head whose state persists. Verified in the running app under Playwright: the modal opens with Cancel focused, Enter closes it without deleting. Deviation outside the footprint: `src/main/gitBranchesManager.js` `loadBranches` now formats `%(refname)` alongside the short name and drops `refs/remotes/*/HEAD` by refname — the short name of that ref is plain "origin", which slipped through the old `includes('HEAD')` filter and listed as a local branch named `origin`. Payload shape unchanged.

_Captured: 2026-09-13 · 2 file change(s)_

---

## T10 — Pull Requests and Issues sections

Both render behind the `ok` state from `prRows` / `issueRows`; unavailable states show a one-line note in the section instead. Per-section Open / Closed / All menu (`#github-filter-menu`, checked item marked, the filter button tinted when not on Open) resets that section's cache and reloads. PR Checkout → `CHECKOUT_GITHUB_PR` (dirty tree → "Commit or stash changes first"); issue Start work → `issueBranchName` + `CREATE_GIT_BRANCH` with `checkout: true` and expands Branches; Open on GitHub → `OPEN_GITHUB_ISSUE` from the action and context menu only. `renderComingSoon`, the tab strip and the filter strip code paths are deleted. Not verified against live data: this machine's `gh` is not signed in, so the sections were exercised in their `no-auth` state only; the row models carry the tests.

_Captured: 2026-09-13 · 1 file change(s)_

---

## T11 — Refresh semantics, cache, follow-through

Head refresh runs `loadAccess(true)` then reloads every expanded, available section with the head button spinning; a section's refresh reloads only that section with its own spinner; expand re-renders the cached `{ filter, rows, loadedAt, error }` instantly and reloads behind it; concurrent loads of one section share an in-flight promise; a result arriving after a project change is dropped. After Switch, Checkout, Start work, Delete and Create-with-checkout the host sends `REFRESH_GIT_STATUS` and reloads Branches (D13); Remove reloads Worktrees and Branches. `state.onProjectChange` clears the caches, the access state and the selection, and re-runs `show()` when the tab is visible. `npm test`: 686 pass (50 new).

_Captured: 2026-09-13 · 1 file change(s)_

---
