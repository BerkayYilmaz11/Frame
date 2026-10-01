# Outcome — Frame Cloud server address

## T01 — Server address rule: https anywhere, http on loopback only

Added `LOOPBACK_HOSTS` and `checkServerUrl` to `deviceFlow.js` and made `resolveServerUrl` return `{ url, refused }`, the first non-empty candidate deciding with no fall-through; `cloudProjects.js` now imports the shared set. `cloudSession.resolveUrl()` takes `.url` and logs each distinct refused address once, through a Set, naming scheme and host only (host keeps the port, which helps with LAN addresses). Beyond the plan's shape, `checkServerUrl` separates `invalid` (unparsable or not http(s)) from `insecure` (http off loopback) so the log can say which. Files: `src/main/cloud/deviceFlow.js`, `src/main/cloud/cloudProjects.js`, `src/main/cloud/cloudSession.js`, `test/cloudDeviceFlow.test.js`.

_Captured: 2026-10-01 · 4 file change(s)_

---
