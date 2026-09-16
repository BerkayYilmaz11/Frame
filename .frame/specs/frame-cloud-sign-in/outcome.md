## T01 — Pure device-flow core and its tests

Wrote `src/main/cloud/deviceFlow.js` (building blocks, the five endpoint calls, `pollForToken`, `runSignIn`, `refreshSession`; no Electron) and `test/cloudDeviceFlow.test.js` (38 cases, fake fetch/sleep/clock). Beyond plan.md: added `formatDeviceInfo()` so D13's `name`/`os`/`appVersion` cuts live in the core rather than the Electron shell, and `fetchJson` also receives the `AbortSignal`. `runSignIn` emits the display-grouped code (`XXXX-XXXX`) in `awaitingApproval` while the raw `device_code` goes to the server; near the deadline the poll sleeps only the remaining time and returns `expired` rather than polling late.

_Captured: 2026-09-16 · 2 file change(s)_

---

