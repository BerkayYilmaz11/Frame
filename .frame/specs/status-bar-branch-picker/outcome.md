## T01 — Branch-name validator in src/shared

Wrote `src/shared/gitRefNames.js` with `isValidBranchName` implementing the `check-ref-format --branch` rules from plan D8, and went one step past the plan: shell metacharacters (`$` `` ` `` `"` `'` `;` `|` `&` `<` `>`) are rejected too, although git accepts them, because a branch named `$HOME` is hostile to every script the user runs later. `test/gitRefNames.test.js` pins each rule, the slash and dot edge cases, the 255 cap and the injection-shaped names.

_Captured: 2026-09-13T14:41:05Z · 2 file change(s)_

---

## T02 — Pure ref helpers for gitBranchesManager

Wrote `src/main/gitBranchRefs.js` with `parseBranchLine`, `splitRemoteRef` (longest remote first) and, beyond the plan's two functions, the exported `BRANCH_FORMAT` string so the parser and the `git branch -a` format cannot drift apart when T03 wires them. `test/gitBranchRefs.test.js` pins the six-field parse with `|` inside the subject, the `origin/HEAD` pointer shape, tolerance of garbage, and the split across one remote, two remotes, a remote named `a/b`, `feat/x` under a remote, and no match.

_Captured: 2026-09-13T14:42:31Z · 2 file change(s)_

---

