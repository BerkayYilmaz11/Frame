# Plan — GitHub view — tree sections, dense rows, real pull requests

## Architecture

### Resolved plan-time decisions

Business (asked, 2026-09-12):

- **D1 · Start work on an issue: branch only, or branch + New Spec launcher?**
  Chosen: **branch only** — create `issue-<n>-<slug>` from the current
  branch and check it out. Rationale: smaller, predictable, and the spec
  hand-off is its own feature (`new-spec-agent-handoff` owns that launcher);
  it lands as a follow-up spec once the panel is solid.
- **D2 · Does a PR / issue row click open the browser?** Chosen: **row click
  selects; the browser opens only through the Open on GitHub action** (hover
  action or context menu). Rationale: a selectable row is what the inline
  actions and context menu need anyway; accidental browser launches were the
  main complaint about the current issue list.
- **D3 · Which sections start expanded?** Chosen: **Pull Requests and
  Branches**; Issues and Worktrees collapsed. Rationale: the two most used
  sections fit a 280px sidebar without a scroll; the user's own toggles then
  persist.

Technical (asked):

- **D4 · Test posture:** **pure logic and data transforms only** — the row
  models, the access-state resolver and the section-state store under
  `src/renderer/github/` get `test/*.test.js`; the DOM host does not. This
  is the project's convention (`src/renderer/home/`, `dock/dockState.js`).

Technical (decided silently):

- **D5 · One file or a split?** `githubPanel.js` is rewritten in place as
  the DOM host, keeping its module path and `init / show / hide` exports so
  `index.js` and `revealSidebarTab` do not change shape (C1). Everything
  that can be pure moves to `src/renderer/github/` (C10).
- **D6 · Access check lives in main.** `githubManager.js` resolves
  `gh --version` → `gh auth status` → `gh repo view --json nameWithOwner`
  once per project path and caches the result; the renderer asks over one
  new invoke channel and passes `force: true` on a manual refresh. Rejected:
  checking from the renderer per section, which would run three `gh`
  processes per expand.
- **D7 · Section state mirrors `dockState`.** A pure module owns defaults,
  parsing garbage, toggle and serialize; the host persists under
  `localStorage['frame-github-sections']`, app-wide (G1).
- **D8 · Confirm modal: generalise `taskConfirmModal`, no second modal.**
  `open()` gains `heading`, `message` and `confirmLabel` options with the
  task wording as defaults; the `<h3>` gets an id. One confirm discipline
  (C3), no new markup.
- **D9 · Stylesheet split.** The GitHub rules leave `panels.css` for a new
  `components/github.css` (imported from `main.css` next to
  `git-changes.css`). Rejected: editing the ~600 GitHub lines inside
  `panels.css`, which eight prior specs have already layered onto.
- **D10 · Context menu reuses the file tree's `.context-menu` classes** on a
  panel-owned `#github-context-menu` element; no shared module is extracted.
- **D11 · Terminal lanes are reached through an injected hook.** `index.js`
  passes `openLane({ cwd, command })` into `githubPanel.init()`, built on
  the `multiTerminalUI` instance it already holds
  (`createTerminalForCurrentProject({ cwd })` then `sendCommand`). Rejected:
  `githubPanel.js` requiring `multiTerminalUI` itself — a require cycle.
- **D12 · PR links open through `OPEN_GITHUB_ISSUE`.** The channel is a
  URL-agnostic `shell.openExternal`; reusing it keeps C5 literal. Checkout
  and PR list get their own channels.
- **D13 · Git-side refresh after a switch.** After Switch, Checkout, Start
  work and Delete, the host sends `REFRESH_GIT_STATUS` so the status bar
  branch (`GIT_STATUS_DATA`) and the Changes tab update without a new
  channel.

### Reversed prior decision

`dock-panel-readonly-views` D8 moved the panel into the rail tab "keeping
its refresh / filter / create-branch chrome". This plan keeps the tab, the
command and the Create Branch modal, and replaces the chrome (tabs, filter
strip, repo-name bar) — recorded here, not silently.

### Working-tree note (2026-09-12)

Uncommitted, unrelated edits were in progress in the tree while this plan
was written — among them `index.html`, `src/renderer/styles/main.css`,
`panels.css`, `statusBar.js` and a new `view-header.css`. Implementation
branches on top of that work and touches only the lines this plan names
(C11 for `index.html`; one `@import` line in `main.css`; the GitHub rule
block in `panels.css`).

### Shape of the panel

```
[data-sidebar-tab-content="github"]
  #github-panel
    .github-head          GitHub · owner/repo            [↻]
    .github-search        (.file-tree-search field)
    .github-state         (only when access ≠ ok: no-gh / no-auth / no-remote)
    section.github-section[data-section="prs"]
      .github-section-head  ▾ Pull Requests  (12)   [filter ▾] [↻]
      .github-rows          .github-row × n
    section[data-section="issues"]     ▸ Issues (…)   [filter ▾] [↻]
    section[data-section="branches"]   ▾ Branches (…) [+ New] [↻]
      .github-subhead  Remote ▸
    section[data-section="worktrees"]  ▸ Worktrees (…) [↻]
  #github-context-menu.context-menu
```

Row: `.github-row` = `.github-row-icon` (lucide, 14px) + `.github-row-main`
(ellipsis) + `.github-row-meta` (muted, right) + `.github-row-actions`
(hidden until `:hover` / `:focus-within`). `.active` marks the selected row
(D2). Rows carry `data-kind` and `data-id`; one delegated click / contextmenu
listener per section, not one listener per row.

### Data shapes

`GITHUB_ACCESS_STATE` (invoke, `{ projectPath, force }`) →
`{ gh: boolean, authed: boolean, repoName: string|null }`.
`accessState.resolve()` maps it to `'no-gh' | 'no-auth' | 'no-remote' | 'ok'`
and to `{ prs, issues, branches, worktrees }` availability: git sections are
available in every state; GitHub sections only in `'ok'`.

`LOAD_GITHUB_PULL_REQUESTS` (invoke, `{ projectPath, state }`) →
`{ error, prs: [{ number, title, state, isDraft, author:{login}, updatedAt,
url, reviewDecision, statusCheckRollup, headRefName }] }` from
`gh pr list --state <s> --limit 50 --json …`.

`CHECKOUT_GITHUB_PR` (invoke, `{ projectPath, number }`) → `{ error, branch }`;
refuses with `uncommitted_changes` through `gitBranchesManager.isWorkingTreeClean`
before running `gh pr checkout <n>` (C8).

Row view-models (pure, `rowModels.js`):

```
{ kind:'pr'|'issue'|'branch'|'worktree', id, icon, iconClass, primary,
  secondary?, meta, labels?:[{name,color}], actions:[{id,label,danger?}],
  url?, current?, isRemote?, slug? }
```

`branchRows(result)` orders current → local (name) → remote under a
`Remote` sub-group; `worktreeRows(result, projectPath)` derives `slug` when
the path is under `<project>/.frame/worktrees/<slug>` (the path
`gitBranchesManager.orchWorktreePath` builds); `filterRows(rows, query)`
matches primary, `#id` and secondary case-insensitively;
`issueBranchName(n, title)` yields `issue-<n>-<kebab-slug>` (max 40 chars
of slug).

Section store (pure, `sectionState.js`): `STORAGE_KEY`, `SECTIONS`,
`defaults()` (D3), `load(raw)`, `toggle(state, id)`, `serialize(state)`.

Host caches per section `{ filter, rows, loadedAt }`; expanding re-renders
the cache instantly and reloads in the background (G6).

## Files

- **New** `src/renderer/github/rowModels.js` — pure row view-models, filter, relative time, label contrast, issue branch name.
- **New** `src/renderer/github/accessState.js` — pure resolver: access payload → state id + section availability + state copy.
- **New** `src/renderer/github/sectionState.js` — pure section expanded/collapsed store with defaults and persistence shape.
- **New** `src/renderer/styles/components/github.css` — the tree layout: head, search, state, sections, rows, actions, sub-group, filter menu.
- **New** `test/githubRowModels.test.js` — ordering, slug detection, filter, branch naming, contrast, relative time.
- **New** `test/githubAccessState.test.js` — the four states and their section availability.
- **New** `test/githubSectionState.test.js` — defaults, garbage input, toggle, round-trip.
- **Modified** `src/renderer/githubPanel.js` — rewritten DOM host: access state, header, search, sections, rows, actions, context menu, confirm flows, Create Branch trigger, refresh and cache.
- **Modified** `src/main/githubManager.js` — `checkAccess` with per-project cache, `loadPullRequests`, `checkoutPullRequest`, three new IPC handlers.
- **Modified** `src/shared/ipcChannels.js` — `GITHUB_ACCESS_STATE`, `LOAD_GITHUB_PULL_REQUESTS`, `CHECKOUT_GITHUB_PR`.
- **Modified** `src/renderer/taskConfirmModal.js` — `open()` accepts `heading`, `message`, `confirmLabel`; defaults unchanged.
- **Modified** `src/renderer/index.js` — `githubPanel.init({ openLane })` built on the existing `multiTerminalUI` instance.
- **Modified** `index.html` — the GitHub tab block rewritten (head, search, state, four sections, context menu); `id` on the confirm modal's `<h3>`; nothing else (C11).
- **Modified** `src/renderer/styles/components/panels.css` — GitHub, `.git-branch-*`, `.git-worktree-*` and `.github-branches-actions` rules removed (moved to `github.css`).
- **Modified** `src/renderer/styles/main.css` — `@import 'components/github.css'`.

## Footprint

- src/renderer/github/rowModels.js
- src/renderer/github/accessState.js
- src/renderer/github/sectionState.js
- src/renderer/githubPanel.js
- src/renderer/taskConfirmModal.js
- src/renderer/index.js
- src/renderer/styles/components/github.css
- src/renderer/styles/components/panels.css
- src/renderer/styles/main.css
- src/main/githubManager.js
- src/shared/ipcChannels.js
- index.html
- test/githubRowModels.test.js
- test/githubAccessState.test.js
- test/githubSectionState.test.js

## Dependencies

None. `lucide` (icons) and `gh` (already the transport) are in place.

## Sequencing

1. **Pure modules and their tests.** Write `sectionState.js` (D3 defaults,
   `load` tolerant of garbage, `toggle`, `serialize`), `accessState.js`
   (four states, availability map, one-line copy per state) and
   `rowModels.js` (PR / issue / branch / worktree rows, `filterRows`,
   `issueBranchName`, `relativeTime`, `contrastColor` moved out of the
   host). Author `test/githubSectionState.test.js`,
   `test/githubAccessState.test.js`, `test/githubRowModels.test.js`
   alongside. No DOM, no Electron import.
2. **Main-side GitHub access and pull requests.** Add the three channels to
   `ipcChannels.js`. In `githubManager.js` add `checkAccess(projectPath,
   force)` (gh present → `gh auth status` exit code → `gh repo view`), a
   `Map` cache keyed by project path, `loadPullRequests(projectPath, state)`
   and `checkoutPullRequest(projectPath, number)` guarded by
   `gitBranchesManager.isWorkingTreeClean`; register the handlers in
   `setupIPC`. `loadIssues` reuses `checkAccess` so both lists share one
   check.
3. **Generalised confirm modal.** `taskConfirmModal.open()` reads
   `heading`, `message`, `confirmLabel` (defaults: today's task wording);
   `index.html` gives the `<h3>` `id="task-confirm-delete-heading"`.
   Focus and Enter behaviour untouched.
4. **Markup and stylesheet.** Replace the GitHub tab block in `index.html`
   with the head / search / state / four sections / context menu shape
   above; move the Create Branch trigger into the Branches section head.
   Create `github.css` (rows in the `.git-changes-row` idiom, 22px, ellipsis,
   hover wash, `:focus-within` actions, sub-group, filter menu) and import
   it from `main.css`; delete the moved rules from `panels.css`. The page
   must still boot with the old `githubPanel.js` disabled.
5. **Host: shell, state, Branches and Worktrees.** Rewrite `githubPanel.js`:
   `init({ openLane })`, `show()` → access state → header repo name and
   state block; section expand/collapse through `sectionState` persisted
   under `frame-github-sections`; search field filtering every expanded
   section; Branches and Worktrees sections rendered from `rowModels` with
   delegated click (select), hover actions, `#github-context-menu`, Switch /
   Delete / force-delete and Remove / force-remove through the confirm
   modal, Create Branch modal wired to the section head, Open terminal here
   through `openLane({ cwd })`, and the `no-auth` state's Sign in button
   through `openLane({ command: 'gh auth login' })`. `index.js` passes the
   hook.
6. **Host: Pull Requests and Issues.** Render both sections from
   `rowModels` behind the `ok` state; per-section Open / Closed / All menu;
   PR Checkout via `CHECKOUT_GITHUB_PR`; issue Start work via
   `issueBranchName` + `CREATE_GIT_BRANCH` (checkout true); Open on GitHub
   via `OPEN_GITHUB_ISSUE` from action and context menu only (D2). Delete
   `renderComingSoon` and the tab / filter code paths.
7. **Refresh semantics, cache and follow-through.** Header refresh reloads
   every expanded, available section with `force: true` on the access check;
   section refresh reloads one; expand shows the cached rows then reloads.
   After Switch, Checkout, Start work, Delete and Remove send
   `REFRESH_GIT_STATUS` (D13) and reload Branches. On `state.onProjectChange`
   clear the caches and re-run `show()` if the tab is visible.
