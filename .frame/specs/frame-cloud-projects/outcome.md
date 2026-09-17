# Outcome — Frame Cloud projects

## T01 — callTrpc query input and access removal

Made `callTrpc` encode GET input as `?input=<url-encoded JSON>` (omitted when there is none) and exported it; removed `access` from `runSignIn`, `sessionFromMe`, `sessionStore.pickSession`, `cloudSession`'s `PUBLIC_KEYS` and `signedInState`, and the Plan row from `index.html` / `frameSettingsModal.js`. The test fake now records the query separately so route keys stay path-only; added GET/POST encoding and no-`access` session tests. Files: deviceFlow.js, sessionStore.js, cloudSession.js, index.html, frameSettingsModal.js, test/cloudDeviceFlow.test.js.

_Captured: 2026-09-17 · 6 file change(s)_

---

