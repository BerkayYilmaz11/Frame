# Outcome — Frame Cloud server address

## T01 — Server address rule: https anywhere, http on loopback only

Added `LOOPBACK_HOSTS` and `checkServerUrl` to `deviceFlow.js` and made `resolveServerUrl` return `{ url, refused }`, the first non-empty candidate deciding with no fall-through; `cloudProjects.js` now imports the shared set. `cloudSession.resolveUrl()` takes `.url` and logs each distinct refused address once, through a Set, naming scheme and host only (host keeps the port, which helps with LAN addresses). Beyond the plan's shape, `checkServerUrl` separates `invalid` (unparsable or not http(s)) from `insecure` (http off loopback) so the log can say which. Files: `src/main/cloud/deviceFlow.js`, `src/main/cloud/cloudProjects.js`, `src/main/cloud/cloudSession.js`, `test/cloudDeviceFlow.test.js`.

_Captured: 2026-10-01 · 4 file change(s)_

---

## T02 — One session file per server

Rewrote `sessionStore.js` to keep each server's session at `userData/cloud-sessions/<first 16 hex of sha256(serverUrl)>.json` in the existing record shape, with a per-server memory `Map` fallback and `clear(serverUrl)` removing that server's file, `.bak`, `.tmp` and memory entry (an empty `serverUrl` is a no-op). Passed the ended server to both `clear()` calls in `cloudSession.js` and added `test/cloudSessionStore.test.js` (electron stubbed via `Module._load`, `mkdtemp` userData). The task's "two running Frames stay signed in across restarts" check was done as a test with separate module instances and a fresh one reading both, not by running two Frames by hand. Files: `src/main/cloud/sessionStore.js`, `src/main/cloud/cloudSession.js`, `test/cloudSessionStore.test.js`.

_Captured: 2026-10-01 · 3 file change(s)_

---
