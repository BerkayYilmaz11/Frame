# Outcome — Frame Cloud projects

## T01 — callTrpc query input and access removal

Made `callTrpc` encode GET input as `?input=<url-encoded JSON>` (omitted when there is none) and exported it; removed `access` from `runSignIn`, `sessionFromMe`, `sessionStore.pickSession`, `cloudSession`'s `PUBLIC_KEYS` and `signedInState`, and the Plan row from `index.html` / `frameSettingsModal.js`. The test fake now records the query separately so route keys stay path-only; added GET/POST encoding and no-`access` session tests. Files: deviceFlow.js, sessionStore.js, cloudSession.js, index.html, frameSettingsModal.js, test/cloudDeviceFlow.test.js.

_Captured: 2026-09-17 · 6 file change(s)_

---

## T02 — Pure core: reading, matching, web links

Created `src/main/cloud/cloudProjects.js` with `listProjects`, `normalizeProject`, `matchFolders` (identity-only match; a project row's `connected` is the server's link state, so a project linked by a folder elsewhere still reads Connected with no folder names) and `buildWebUrl` (origin-only, slug-shape check, https API needs https web origin unless the web host is loopback). Started `test/cloudProjects.test.js` with a fake fetch that decodes `?input=`. `buildWebUrl` checks slug shape only; the reserved-word list arrives with T03's `validateSlug`.

_Captured: 2026-09-17 · 2 file change(s)_

---

