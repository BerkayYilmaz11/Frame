## T01 — Branch-name validator in src/shared

Wrote `src/shared/gitRefNames.js` with `isValidBranchName` implementing the `check-ref-format --branch` rules from plan D8, and went one step past the plan: shell metacharacters (`$` `` ` `` `"` `'` `;` `|` `&` `<` `>`) are rejected too, although git accepts them, because a branch named `$HOME` is hostile to every script the user runs later. `test/gitRefNames.test.js` pins each rule, the slash and dot edge cases, the 255 cap and the injection-shaped names.

_Captured: 2026-09-13T14:41:05Z · 2 file change(s)_

---

