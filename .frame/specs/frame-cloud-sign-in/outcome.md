## T01 — Pure device-flow core and its tests

Wrote `src/main/cloud/deviceFlow.js` (building blocks, the five endpoint calls, `pollForToken`, `runSignIn`, `refreshSession`; no Electron) and `test/cloudDeviceFlow.test.js` (38 cases, fake fetch/sleep/clock). Beyond plan.md: added `formatDeviceInfo()` so D13's `name`/`os`/`appVersion` cuts live in the core rather than the Electron shell, and `fetchJson` also receives the `AbortSignal`. `runSignIn` emits the display-grouped code (`XXXX-XXXX`) in `awaitingApproval` while the raw `device_code` goes to the server; near the deadline the poll sleeps only the remaining time and returns `expired` rather than polling late.

_Captured: 2026-09-16 · 2 file change(s)_

---

## T02 — Redact access_token and Bearer tokens

Added `access[_-]?token` to `KEYED_PATTERN` in `scripts/redact.js` and let the separator group swallow the key's closing quote, so `"access_token":"…"` in a JSON body is scrubbed; `test/logger.test.js` got a JSON-body `access_token` case, a JSON-header `Bearer` case and a clean `"token_type":"Bearer"` case. Diverged from plan.md D6: the `Bearer <token>` value pattern already existed, so none was added — the actual gap was that no JSON-quoted secret key matched at all, which the quote fix closes for every key.

_Captured: 2026-09-16 · 2 file change(s)_

---

## T03 — Session store on safeStorage + fsSafe

Wrote `src/main/cloud/sessionStore.js`: `load(serverUrl)` (null on a server mismatch, an unknown version or a decrypt failure; never throws), `save(session)` (encrypted token in `cloud-session.json` via `writeFileAtomic`, or a memory-only copy with `{ ephemeral: true }` when `safeStorage` is unavailable) and `clear()`. Beyond plan.md: `clear()` also deletes the `.bak`/`.tmp` siblings `writeFileAtomic` leaves, so no copy of the old encrypted token outlives sign-out, and a failed write falls back to the memory copy instead of failing the sign-in.

_Captured: 2026-09-16 · 1 file change(s)_

---

## T04 — Electron shell cloudSession.js

Wrote `src/main/cloud/cloudSession.js`: `net.fetch`-backed `fetchJson` (15 s timeout surfaced as a plain Error so the core reads it as `network`, not `cancelled`), abortable `sleep`, http(s)-only `openUrl`, D13 device info, the allowlisted public state, and `signIn`/`cancel`/`refresh`/`signOut`/`startup`/`getState` with `init(window)` and `setupIPC(ipcMain)`. Additions beyond plan.md: `CLOUD_SIGN_IN` returns immediately while the attempt runs, `getState()` re-runs `startup()` when the resolved server URL changed, a successful sign-in fires one `refresh()` (register returns no device), and `failed` keeps `verificationUrl` for the noWorkspace link. Verified once against a fake server with stubbed Electron (scratch, not committed).

_Captured: 2026-09-16 · 1 file change(s)_

---

## T05 — Cloud IPC channels and main-process wiring

Added the six `CLOUD_*` channels to `src/shared/ipcChannels.js` and wired `src/main/index.js`: `cloudSession.setupIPC(ipcMain)` after the user-settings handlers, `cloudSession.init(window)` in `initModulesWithWindow`, and `startup()` behind `webContents.once('did-finish-load')` + `setImmediate`. The `once` is a small departure from "after the window loads": the existing handler fires on every renderer reload, which would re-run startup and abort a sign-in in progress.

_Captured: 2026-09-16 · 2 file change(s)_

---

## T06 — Settings → Account section

Added the hidden-by-default `#settings-account` section (one pane per state, ephemeral/unreachable notes) as the first section of Frame Settings in `index.html`, its styles in `settings-modal.css` (including a forced `[hidden]` rule, since the panes reuse About's flex classes), and in `frameSettingsModal.js` the binding, `renderAccount()`, the pull on init/open with `CLOUD_REFRESH` on open when signed in, Copy via `clipboard.writeText`, and `signIn()`/`signOut()` exports. Also touched `src/main/cloud/cloudSession.js` (T04's file): the renderer's first `CLOUD_GET_STATE` arrives before `did-finish-load`, so `startup()` is now once-only and `signIn()` marks the session started — otherwise launch did two `device.me` calls and a `getState()` could reload over a running sign-in. Verified in the dev app against a fake FrameCloud with a scratch `userData` (screenshots, request order, no plaintext token, file removed on sign-out).

_Captured: 2026-09-16 · 4 file change(s)_

---

## T07 — Palette commands for Frame Cloud

Registered `cloud.signIn` ("Frame Cloud: Sign in" → `frameSettingsModal.signIn()`) and `cloud.signOut` ("Frame Cloud: Sign out" → `frameSettingsModal.signOut()`) in `registerCommands()` (Help category, beside `settings.open`), and exported `accountState()` from `frameSettingsModal.js`. Beyond plan.md: both commands carry `when` predicates — Sign in only when a server resolved and nobody is signed in, Sign out only while signed in — so packaged builds without a server list neither. Verified in the dev app against the fake FrameCloud.

_Captured: 2026-09-16 · 2 file change(s)_

---

