## T01 — The permission core in cloudProjects.js

Added `WORKSPACE_PERMISSIONS` (frozen copy of the protocol's map), `can(role, permission)` and `permissionsOf(role)` to `src/main/cloud/cloudProjects.js`, mapped `ROLE_FORBIDDEN` to `roleForbidden` in `CODE_KINDS`, and gave `shouldAutoShowDevices` a `canWork` input. `can` guards with `hasOwnProperty`, so a permission name like `toString` holds nothing; `canWork` defaults to true and only an explicit `false` holds the auto-show back, so the one existing caller keeps today's behaviour until T02 passes the role. Six tests in `test/cloudProjects.test.js` cover role × permission, unknown roles, the frozen map, the 403 classification through `create` and `claim`, and the viewer auto-show.

_Captured: 2026-11-14 · 2 file change(s)_

---
