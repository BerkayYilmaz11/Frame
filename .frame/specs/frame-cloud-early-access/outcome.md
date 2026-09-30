# Outcome — Frame Cloud early access

## T01 — The two calls in the core

Added `fetchInviteMode`, `normalizeWaitlistEmail`, `joinWaitlist` and `WAITLIST_EMAIL_MAX` to `src/main/cloud/deviceFlow.js`. Both calls go through `callTrpc` with no token. `fetchInviteMode` answers `null` for a malformed answer or a 404; `joinWaitlist` maps failures by status (400 invalid, 404 unavailable, 429 rateLimited, else network) and never throws. 8 new tests in `test/cloudDeviceFlow.test.js`.

_Captured: 2026-09-30 · 2 file change(s)_

---

## T02 — The session keeps invite mode and the joined address

Added module-level `inviteOnly`/`waitlistEmail` and a shared-request `readInviteMode()` to `src/main/cloud/cloudSession.js`. The mode is read from `loadSession`'s signed-out branch and from `refresh()` whenever not signed in; both fields reach the renderer only while not signed in, and `inviteOnly` resets when the server address changes. Beyond the plan: `waitlistEmail` is re-read from user settings on every `loadSession`, not only at startup.

_Captured: 2026-09-30 · 1 file change(s)_

---

