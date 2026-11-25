# Outcome — Start Work in Three Places

## T01 — The begun store learns the checkout

Added `place: 'checkout'` and `title` to the begun entry (kept only together and never with a `serverKey`), `begunPlace` on a live checkout part in `withBegunBranches`, and the pure `checkoutBusy` and `checkoutBlock` helpers; an untitled checkout entry is named by its ref, and a detached HEAD (empty current branch) is never busy. Files: `src/main/cloud/cloudStart.js`, `test/cloudStart.test.js`.

_Captured: 2026-11-25T11:44:44.166Z · 2 file change(s)_

---

## T02 — Bases per place and the view

Gave `pickBase` a `prefer: 'local'` option, added `placeBases(target, targetOn)` and made `prepareView` return `placeBases`, `checkout` (busy without a branch and a non-positive count read as none) and `workspaceFolder`; without `targetOn` every place's base is null, so the service must pass it (T04). Files: `src/main/cloud/cloudStart.js`, `test/cloudStart.test.js`.

_Captured: 2026-11-25T11:45:34.068Z · 2 file change(s)_

---

