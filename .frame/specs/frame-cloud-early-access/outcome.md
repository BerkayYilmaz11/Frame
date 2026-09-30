# Outcome — Frame Cloud early access

## T01 — The two calls in the core

Added `fetchInviteMode`, `normalizeWaitlistEmail`, `joinWaitlist` and `WAITLIST_EMAIL_MAX` to `src/main/cloud/deviceFlow.js`. Both calls go through `callTrpc` with no token. `fetchInviteMode` answers `null` for a malformed answer or a 404; `joinWaitlist` maps failures by status (400 invalid, 404 unavailable, 429 rateLimited, else network) and never throws. 8 new tests in `test/cloudDeviceFlow.test.js`.

_Captured: 2026-09-30 · 2 file change(s)_

---

