# Outcome — Frame Cloud brief discussions

## T01 — recordDiscussion call and the provider limit

Added `recordDiscussion` (POST `brief.recordDiscussion`, `url`/`provider` sent only when present) and `LIMITS.provider = 40` to `src/main/cloud/cloudBriefs.js`, with four cases in `test/cloudBriefs.test.js`. Checked the input shape against FrameCloud's `recordDiscussionInputSchema`, which returns the brief. `classifyLinkError` folds `NOT_A_PROPOSAL`/`ALREADY_CLOSED` into `badRequest`, so T02 must read the server code from `err.message` to give the user the real reason.

_Captured: 2026-09-21 · 2 file change(s)_

---

