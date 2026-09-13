## T01 — Branch-name validator in src/shared

Wrote `src/shared/gitRefNames.js` with `isValidBranchName` implementing the `check-ref-format --branch` rules from plan D8, and went one step past the plan: shell metacharacters (`$` `` ` `` `"` `'` `;` `|` `&` `<` `>`) are rejected too, although git accepts them, because a branch named `$HOME` is hostile to every script the user runs later. `test/gitRefNames.test.js` pins each rule, the slash and dot edge cases, the 255 cap and the injection-shaped names.

_Captured: 2026-09-13T14:41:05Z · 2 file change(s)_

---

## T02 — Pure ref helpers for gitBranchesManager

Wrote `src/main/gitBranchRefs.js` with `parseBranchLine`, `splitRemoteRef` (longest remote first) and, beyond the plan's two functions, the exported `BRANCH_FORMAT` string so the parser and the `git branch -a` format cannot drift apart when T03 wires them. `test/gitBranchRefs.test.js` pins the six-field parse with `|` inside the subject, the `origin/HEAD` pointer shape, tolerance of garbage, and the split across one remote, two remotes, a remote named `a/b`, `feat/x` under a remote, and no match.

_Captured: 2026-09-13T14:42:31Z · 2 file change(s)_

---

## T03 — loadBranches: committer time, remotes, remote short names

Rewired `loadBranches` in `src/main/gitBranchesManager.js` onto `gitBranchRefs`: `BRANCH_FORMAT` replaces the inline five-field string, `parseBranchLine` replaces the inline split, one extra `git remote` read feeds `splitRemoteRef`, and rows gain `time` (all) plus `remote`/`shortName` (remote rows); the result gains `remotes`. No field was renamed, so the GitHub view's Branches section is unchanged — `githubRowModels.test.js` passes as-is and a smoke run on this repo showed every remote row split and the `origin/HEAD` pointer still dropped.

_Captured: 2026-09-13T14:43:45Z · 1 file change(s)_

---

## T04 — switchBranch and createBranch on execFile, any remote, validated names

Added `execGitArgs` (execFile, no shell, stderr-as-error) and `localBranchExists` to `src/main/gitBranchesManager.js`, rewrote `switchBranch` to check `refs/heads/` first and otherwise split the name against the real remote list and create a tracking branch for any remote (plain checkout of the local twin when one exists; unknown names handed to git for its own message), and read `result.branch` back from `--show-current`. `createBranch` now refuses names failing `isValidBranchName` and passes an argv array. Verified on a scratch repo with two remotes and a second worktree: every plan scenario (S3–S8) behaved as specified, and an injection-shaped name created no file. The other commands in the file keep their `exec` string form, as the plan scoped.

_Captured: 2026-09-13T14:45:35Z · 1 file change(s)_

---

## T05 — Pure branch picker list model

Wrote `src/renderer/statusBar/branchPickerModel.js` — `buildRows`, `worktreeFor`, `flatten`, `moveHighlight` as planned, plus `initialHighlight` (current row, else first enabled) so the keyboard starts on the current branch. Remote rows without a `shortName` are kept rather than deduped by guesswork. `test/branchPickerModel.test.js` pins grouping, dedupe, recency ordering, detached HEAD, the filter, worktree disabling with path normalisation, the create row's four states, `flatten`'s order and flags, wrapping highlight movement, and garbage input.

_Captured: 2026-09-13T14:47:50Z · 2 file change(s)_

---

## T06 — Popover host and styles

Wrote `src/renderer/statusBar/branchPicker.js` as the DOM host over the pure model — parallel reads on every open with a sequence guard against late results, keyboard and outside-click handling, inline notices for every refusal, toast + `REFRESH_GIT_STATUS` + close on success — and the popover, row and `.sb-branch` button styles in `status-bar.css`. Two small departures from the plan: the manage row calls an injected `onManage` callback (T08 wires it from `statusBar.js`, keeping this file free of `commandRegistry`/`githubPanel`), and a `busy` state dims the list while a switch is in flight so a double Enter cannot fire two checkouts. Not exercised in the running app yet — that check comes with T07's wiring.

_Captured: 2026-09-13T14:50:17Z · 2 file change(s)_

---

## T07 — Status bar wiring

Turned `.sb-branch` in `src/renderer/statusBar.js` into a button, initialised `branchPicker` against it with `onOpen` closing the agents menu, made `_openMenu` close the picker, and closed the picker on project change and when the project stops being a repo. Escape's focus return was already in the host's `close({ refocus })`, so the task's last item needed no code here. `_manageBranches` is an empty stub until T08 wires the GitHub hand-off.

_Captured: 2026-09-13T14:51:35Z · 1 file change(s)_

---

