# Outcome — Frame Cloud connection on a teammate's machine

## T01 — Give the device a stable install id

Added `resolveInstallId(stored, mint)` (keeps a stored UUID, mints `randomUUID()` for anything else) and `INSTALL_ID_MAX` (128, FrameCloud's limit) to `src/main/cloud/deviceFlow.js`; `formatDeviceInfo` now carries `installId` and `registerDevice` sends it. `cloudSession.deviceInfo()` reads it once per run from `userSettings` under `cloudInstallId`, storing a minted one — never the session file, never the analytics id. Tests in `test/cloudDeviceFlow.test.js` cover keeping, replacing and minting, the cut, and the register input.

_Captured: 2026-11-14 · 3 file change(s)_

---
