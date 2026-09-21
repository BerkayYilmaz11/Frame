# Outcome — Frame Cloud brief discussions

## T01 — recordDiscussion call and the provider limit

Added `recordDiscussion` (POST `brief.recordDiscussion`, `url`/`provider` sent only when present) and `LIMITS.provider = 40` to `src/main/cloud/cloudBriefs.js`, with four cases in `test/cloudBriefs.test.js`. Checked the input shape against FrameCloud's `recordDiscussionInputSchema`, which returns the brief. `classifyLinkError` folds `NOT_A_PROPOSAL`/`ALREADY_CLOSED` into `badRequest`, so T02 must read the server code from `err.message` to give the user the real reason.

_Captured: 2026-09-21 · 2 file change(s)_

---

## T02 — The pure discussions core

Wrote `src/main/cloud/cloudDiscussions.js` (ids, immutable store with 90-day prune, `validateRecordInput`, `buildDiscussPrompt`, `handleRecordRequest`, `replyMessage`) with 19 cases in `test/cloudDiscussions.test.js`, and exported `isHttpUrl` from `cloudBriefs.js`. Diverged from plan: server refusals are caught inside the function passed to `call()` and returned as values, because `call()` classifies them all as `badRequest`; the command path is single-quoted rather than double-quoted. Followup: the heredoc command assumes a POSIX shell, so a Discuss lane on a Windows PowerShell terminal would need another form.

_Captured: 2026-09-21 · 3 file change(s)_

---

