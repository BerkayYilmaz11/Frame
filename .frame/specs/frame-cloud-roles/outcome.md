## T01 — The permission core in cloudProjects.js

Added `WORKSPACE_PERMISSIONS` (frozen copy of the protocol's map), `can(role, permission)` and `permissionsOf(role)` to `src/main/cloud/cloudProjects.js`, mapped `ROLE_FORBIDDEN` to `roleForbidden` in `CODE_KINDS`, and gave `shouldAutoShowDevices` a `canWork` input. `can` guards with `hasOwnProperty`, so a permission name like `toString` holds nothing; `canWork` defaults to true and only an explicit `false` holds the auto-show back, so the one existing caller keeps today's behaviour until T02 passes the role. Six tests in `test/cloudProjects.test.js` cover role × permission, unknown roles, the frozen map, the 403 classification through `create` and `claim`, and the viewer auto-show.

_Captured: 2026-11-14 · 2 file change(s)_

---
## T02 — Carry the role into main's services

Added `role` to `cloudSession.getAuth().cloudWorkspace`, and to `cloudProjectsService` a `permissions()` reader (both false while signed out or without a workspace), `can(permission)` and `refuseUnless(permission)` — both exported so the brief, discussion, shape, start and done services can guard in T04–T06 — plus `publicState().permissions`. `onSessionChange` remembers the last `work,manage` answer and pushes only on the same-session-key path when it changes (a new key already re-lists through `refresh()`), and the auto-show rule now gets `canWork`. Files: `src/main/cloud/cloudSession.js`, `src/main/cloud/cloudProjectsService.js`.

_Captured: 2026-11-14 · 2 file change(s)_

---
## T03 — Re-read the role when it may have changed

Made `cloudSession.init`'s focus listener re-read `device.me` on every focus while signed in, and made `cloudProjectsService.call()`'s failure path fire `cloudSession.refresh()` on `roleForbidden` and `noWorkspace` without awaiting it, so the refusal returns at once, unchanged, and the redraw follows through T02's permissions push. Nothing is retried. Files: `src/main/cloud/cloudSession.js`, `src/main/cloud/cloudProjectsService.js`.

_Captured: 2026-11-14 · 2 file change(s)_

---
## T04 — Guard link and brief writes in main

Chained `refuseUnless('work')` onto `linkBlocked()` in `linkClaim` and `linkRelease` and `refuseUnless('manage')` in `linkCreate`, so no workspace still wins over the role (D7). Added a `work` guard to `cloudBriefsService.create`, `decide` and `move` right after the connected-folder check; a move already held is not re-checked and relies on the server's `ROLE_FORBIDDEN` through `call()`, as planned. Files: `src/main/cloud/cloudProjectsService.js`, `src/main/cloud/cloudBriefsService.js`.

_Captured: 2026-11-14 · 2 file change(s)_

---
## T05 — Guard the agent paths

Made `discuss` and `shape` refuse with `roleForbidden` after the connected-folder check and before staging a prompt. Made both `handleFile`s pass the pure core a local `workCall` that returns the refusal without `work` instead of checking ahead of `handleRecordRequest` / `handleShapeRequest`, so unknown-session, bad-input and not-connected answers (what signed out and no workspace reach today) keep precedence and the cores stay untouched. Added the `roleForbidden` reply to both `REASON_MESSAGES`, ending in "An admin can change your role.", with a `replyMessage` test in `test/cloudDiscussions.test.js` and `test/cloudShape.test.js`.

_Captured: 2026-11-14 · 6 file change(s)_

---
## T06 — Guard Start and Done

Made `cloudStartService.start` refuse with `roleForbidden` after the connected-folder check, and made `sendBranch` and `cloudDoneService.report` return without sending when the role lacks `work`. The two background writes skip silently rather than log a warning, since a viewer's every Briefs read would otherwise log one. Files: `src/main/cloud/cloudStartService.js`, `src/main/cloud/cloudDoneService.js`.

_Captured: 2026-11-14 · 2 file change(s)_

---
