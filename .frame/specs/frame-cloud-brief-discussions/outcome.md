# Outcome — Frame Cloud brief discussions

## T01 — recordDiscussion call and the provider limit

Added `recordDiscussion` (POST `brief.recordDiscussion`, `url`/`provider` sent only when present) and `LIMITS.provider = 40` to `src/main/cloud/cloudBriefs.js`, with four cases in `test/cloudBriefs.test.js`. Checked the input shape against FrameCloud's `recordDiscussionInputSchema`, which returns the brief. `classifyLinkError` folds `NOT_A_PROPOSAL`/`ALREADY_CLOSED` into `badRequest`, so T02 must read the server code from `err.message` to give the user the real reason.

_Captured: 2026-09-21 · 2 file change(s)_

---

## T02 — The pure discussions core

Wrote `src/main/cloud/cloudDiscussions.js` (ids, immutable store with 90-day prune, `validateRecordInput`, `buildDiscussPrompt`, `handleRecordRequest`, `replyMessage`) with 19 cases in `test/cloudDiscussions.test.js`, and exported `isHttpUrl` from `cloudBriefs.js`. Diverged from plan: server refusals are caught inside the function passed to `call()` and returned as values, because `call()` classifies them all as `badRequest`; the command path is single-quoted rather than double-quoted. Followup: the heredoc command assumes a POSIX shell, so a Discuss lane on a Windows PowerShell terminal would need another form.

_Captured: 2026-09-21 · 3 file change(s)_

---

## T03 — The record-discussion command

Wrote `src/templates/bin/record-discussion.js` (pure `parseArgs`/`requestFor`, then `run()`: atomic request in `bus/` beside `__dirname`, a 30 s poll for `bus/replies/<same>.json`, the printed reply, exit 0/1) with 10 cases in `test/recordDiscussion.test.js`, including the timeout and a spawned copy reading stdin. Added beyond the plan: on timeout the command withdraws its request. It reports "Frame did not answer" only when that withdrawal succeeds, and otherwise says the record may still land. That relies on T04's watcher claiming each request by renaming it.

_Captured: 2026-09-21 · 2 file change(s)_

---

## T04 — The discussions service, channels and wiring

Wrote `src/main/cloud/cloudDiscussionsService.js` (userData folder, pruned `discussions.json`, the staged command, a `safeWatch` bus with rename-to-claim, the `CLOUD_BRIEF_DISCUSS` handler, the recorded push), added both channels to `src/shared/ipcChannels.js` and wired `init`/`setupIPC` in `src/main/index.js`. Diverged from plan: at start, requests older than the command's 30 s wait (+5 s) are dropped unrecorded rather than drained, because the command already told the agent they failed. Only requests still inside that window are handled. The service reads `WAIT_MS` from the command template. A stubbed-electron smoke run covered discuss → record → refusal → unknown id → push end to end.

_Captured: 2026-09-21 · 3 file change(s)_

---

## T05 — Brief lanes in agentDispatch

Added `getBriefLaneInfo` (current project's lanes only, since brief numbers are per project), `briefStatusDotHtml`, `onBriefLaneActivity` and `enterBriefLane` to `src/renderer/agentDispatch.js`, fed by the existing `laneStatus.onChange` and `TERMINAL_DESTROYED` hooks. `enterBriefLane` goes beyond the plan's list and gives the panel its route to `multiTerminalUI.enterLane`. The brief change gate is cleared when a terminal is destroyed, unlike the task gate. No unit test (DOM/lane code has no harness); T08 walks it.

_Captured: 2026-09-21 · 1 file change(s)_

---

## T06 — Discussion copy

Added the `discussion-recorded` sentence, `discussionRecords` (newest first, http(s)-only url, blank summaries dropped), the Discuss / Go to discussion / Discussions / Read the write-up labels and `discussErrorMessage` to `src/renderer/cloudBriefsCopy.js`, with five cases in `test/cloudBriefsCopy.test.js`. Diverged from plan: `discussionRecords(events, meId)` also takes `meId` so each record says who recorded it, as the spec and the web's section do.

_Captured: 2026-09-21 · 2 file change(s)_

---

## T07 — Discuss in the Briefs panel

Wired Discuss / Go to discussion into the detail header, lane dots onto cards, the Discussions list under the description, and a reload on `CLOUD_BRIEF_DISCUSSION_RECORDED` in `src/renderer/cloudBriefsPanel.js`, with styles in `cloud-briefs.css`. Lane activity patches the dot and button slots in place instead of re-rendering the drawer. Go to discussion also shows on a brief that is no longer an open proposal while its lane is open, a small widening of the spec's rule.

_Captured: 2026-09-21 · 2 file change(s)_

---

