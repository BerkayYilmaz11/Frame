---
keywords: frame cloud, sign in, device flow, rfc 8628, safeStorage, bearer token, settings account, cloud server url
related: settings-by-scope, in-app-feedback
---
Desktop half of FrameCloud's device flow. Frame signs in from Settings → Account or the palette, keeps the token in the main process, and shows the account, workspace, plan label and this device. No project linking and no gating of local features.
Layout (D4/D15): `src/main/cloud/` is the connection module's home. `deviceFlow.js` is the pure core: the five endpoint calls, the poll loop, and `runSignIn`/`refreshSession`, with every side effect injected. `cloudSession.js` is the thin Electron shell (net.fetch, shell, IPC, allowlisted state push). `sessionStore.js` holds the token in `userData/cloud-session.json`, safeStorage-encrypted. A future CLI is a second shell over the same core. Rejected: flow logic inside the Electron service, which a CLI would have had to rewrite.
Decisions: no safeStorage → memory-only session (`ephemeral: true`), not plaintext; empty packaged default URL → Account hidden, and `FRAME_CLOUD_URL` / `cloudServerUrl` turn it on; tests cover only the pure core (38 cases), while the shell was checked against a fake FrameCloud in the dev app.
Diverged from the plan:
- `formatDeviceInfo()` lives in the core.
- redact.js already had the Bearer pattern; the real gap was JSON-quoted keys, now fixed for every secret key.
- `startup()` runs once, because the renderer's first CLOUD_GET_STATE arrives before did-finish-load.
- Palette commands carry `when` predicates, so packaged builds list neither.
- `clear()` also removes fsSafe's `.bak`.
Rules for later work:
- The token never enters the push payload; extend `PUBLIC_KEYS`, never delete fields.
- Frame never compares plans; `planLabel` is display text.
- A 401 means a silent `signedOut`.
- A request timeout must surface as a plain Error, not an AbortError, or the core reads it as a cancel.
- Server strings are rendered as text nodes only.
Followups: project linking, Pro gating and Settings → Devices are later specs; the prod server URL is a one-line change to `DEFAULT_CLOUD_SERVER_URL`.

Chain: spec.md → plan.md → tasks.md → outcome.md
