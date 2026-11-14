# Outcome — Frame Cloud connection on a teammate's machine

## T01 — Give the device a stable install id

Added `resolveInstallId(stored, mint)` (keeps a stored UUID, mints `randomUUID()` for anything else) and `INSTALL_ID_MAX` (128, FrameCloud's limit) to `src/main/cloud/deviceFlow.js`; `formatDeviceInfo` now carries `installId` and `registerDevice` sends it. `cloudSession.deviceInfo()` reads it once per run from `userSettings` under `cloudInstallId`, storing a minted one — never the session file, never the analytics id. Tests in `test/cloudDeviceFlow.test.js` cover keeping, replacing and minting, the cut, and the register input.

_Captured: 2026-11-14 · 3 file change(s)_

---
## T02 — Replace release with per-device connect and disconnect

Added `connect` (`link.connect { projectId, frameProjectId }`), `disconnect` (`link.disconnect { projectId }`) and `PROJECT_UNLINKED` → `unlinked` to `cloudProjects.js` and removed `release`. `cloudProjectsService.js` gained `linkConnect({ path })` (reads the folder identity without stamping, maps a mismatch to `identityChanged`, refreshes after success, `unlinked`, `identityChanged` or `notFound`) and `linkDisconnect({ projectId })` (a project gone from the list, or `notFound`, counts as done), both behind `linkBlocked()` and `work`; `linkRelease` and `CLOUD_LINK_RELEASE` are gone, replaced by `CLOUD_LINK_CONNECT` / `CLOUD_LINK_DISCONNECT`, and both Disconnect callers (`cloudHubTabs.js`, `projectSettingsModal.js`) now send the project id. Nothing calls `CLOUD_LINK_CONNECT` yet: the Ready state arrives in T03.

_Captured: 2026-11-14 · 6 file change(s)_

---
## T03 — Make this device's connection decide Connected

`normalizeProject` reads `thisDevice` from `connection.thisDevice`; `matchFolders` gives project rows `state` (`connected` | `ready` | `notConnected` | `notClaimed`, replacing `connected`) and folder rows `ready`, so `folder.connected` — read by the Briefs gate, the mark and the palette — now means this device connected. The service moved its cache to version 2 and skips plans and candidates for ready folders. New `src/renderer/cloudConnectionCopy.js` holds the chips, claiming line, three Not-on-this-device notes, the Disconnect question and both refusal sets; the Cloud projects tab draws the four states (Ready connects in the row through `CLOUD_LINK_CONNECT`, Not claimed shows the line and Connect a folder…, Connected with no folder asks and disconnects). Diverged from tasks.md: the Disconnect question and the refusal lines landed here rather than in T04, because the Connected-with-no-folder and Ready rows already need them; the notes became three (one per state) because the old note was right for an unclaimed project and wrong for a claimed one.

_Captured: 2026-11-14 · 7 file change(s)_

---
## T04 — Make On this device speak per device

On this device lists Ready folders first under "Ready to connect" (green-ring dot); `drawReady` names the project, gives the Ready lead and connects this device in one click through `CLOUD_LINK_CONNECT`. `drawConnected` carries the connection explanation and the per-device Disconnect question, and Disconnect's refusals come from the copy module; the take-over question now says every device of the project is disconnected. Beyond the task: the candidate chip "Already connected" became "Claimed" and the `taken` error stopped saying "already connected", because both used Connected for an identity (spec G1). Files: `cloudHubTabs.js`, `cloudConnectionCopy.js`, `cloud-hub.css`, `test/cloudConnectionCopy.test.js`.

_Captured: 2026-11-14 · 4 file change(s)_

---
## T05 — Make Project Settings speak per device

Project Settings' Frame Cloud row now has three states from `cloudConnectionCopy.settingsRow`: Connected (workspace plus the connection explanation, the per-device Disconnect question when confirming), Ready to connect (the Ready lead, Connect in place through `CLOUD_LINK_CONNECT` beside Open Frame Cloud) and Not connected (as before). Connect and Disconnect refusals come from the copy module. Files: `projectSettingsModal.js`, `cloudConnectionCopy.js`, `test/cloudConnectionCopy.test.js`. The app walk against a local FrameCloud is not done yet: it needs a sign-in approved in the browser and a second member's device, so the task stays in progress until it is walked.

_Captured: 2026-11-14 · 3 file change(s)_

---
