# Outcome — Start Work in Three Places

## T01 — The begun store learns the checkout

Added `place: 'checkout'` and `title` to the begun entry (kept only together and never with a `serverKey`), `begunPlace` on a live checkout part in `withBegunBranches`, and the pure `checkoutBusy` and `checkoutBlock` helpers; an untitled checkout entry is named by its ref, and a detached HEAD (empty current branch) is never busy. Files: `src/main/cloud/cloudStart.js`, `test/cloudStart.test.js`.

_Captured: 2026-11-25T11:44:44.166Z · 2 file change(s)_

---

## T02 — Bases per place and the view

Gave `pickBase` a `prefer: 'local'` option, added `placeBases(target, targetOn)` and made `prepareView` return `placeBases`, `checkout` (busy without a branch and a non-positive count read as none) and `workspaceFolder`; without `targetOn` every place's base is null, so the service must pass it (T04). Files: `src/main/cloud/cloudStart.js`, `test/cloudStart.test.js`.

_Captured: 2026-11-25T11:45:34.068Z · 2 file change(s)_

---

## T03 — The checkout path of handleStartRequest

Added `place` to `handleStartRequest` with the checkout path: the lock from `deps.checkoutState()` first, the local-first base, `createBranch(…, { checkout: true })`, no workspace, the spec under `deps.checkoutPath`, and `place: 'checkout'` plus the title in the begun record; every answer names its place and a checkout answer carries `checkout: { from }`. Two choices the plan left open: the place/serverKey mismatch is refused before the brief is read, and a missing `checkoutState` dep refuses with `other`. Files: `src/main/cloud/cloudStart.js`, `test/cloudStart.test.js`.

_Captured: 2026-11-25T11:47:17.719Z · 2 file change(s)_

---

## T04 — The service wires the checkout

Wired the checkout into `cloudStartService`: `checkoutState` (current branch, change count, busy via `core.checkoutBusy` and a project-folder `finishedIn`), `prepare` passing `targetOn`, the checkout with a `~`-short path and the workspace folder, and `start` passing `place`, `checkoutState`, `checkoutPath` and the `checkout` flag to `git.createBranch`. A git status failure fails `prepare` as `other`, like any other unreadable folder state, and a record the folder no longer holds keeps the checkout locked. Files: `src/main/cloud/cloudStartService.js`.

_Captured: 2026-11-25T11:48:26.177Z · 1 file change(s)_

---

