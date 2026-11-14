# Outcome — Frame Cloud connection on a teammate's machine

## T01 — Give the device a stable install id

Added `resolveInstallId(stored, mint)` (keeps a stored UUID, mints `randomUUID()` for anything else) and `INSTALL_ID_MAX` (128, FrameCloud's limit) to `src/main/cloud/deviceFlow.js`; `formatDeviceInfo` now carries `installId` and `registerDevice` sends it. `cloudSession.deviceInfo()` reads it once per run from `userSettings` under `cloudInstallId`, storing a minted one — never the session file, never the analytics id. Tests in `test/cloudDeviceFlow.test.js` cover keeping, replacing and minting, the cut, and the register input.

_Captured: 2026-11-14 · 3 file change(s)_

---
## T02 — Replace release with per-device connect and disconnect

Added `connect` (`link.connect { projectId, frameProjectId }`), `disconnect` (`link.disconnect { projectId }`) and `PROJECT_UNLINKED` → `unlinked` to `cloudProjects.js` and removed `release`. `cloudProjectsService.js` gained `linkConnect({ path })` (reads the folder identity without stamping, maps a mismatch to `identityChanged`, refreshes after success, `unlinked`, `identityChanged` or `notFound`) and `linkDisconnect({ projectId })` (a project gone from the list, or `notFound`, counts as done), both behind `linkBlocked()` and `work`; `linkRelease` and `CLOUD_LINK_RELEASE` are gone, replaced by `CLOUD_LINK_CONNECT` / `CLOUD_LINK_DISCONNECT`, and both Disconnect callers (`cloudHubTabs.js`, `projectSettingsModal.js`) now send the project id. Nothing calls `CLOUD_LINK_CONNECT` yet: the Ready state arrives in T03.

_Captured: 2026-11-14 · 6 file change(s)_

---
