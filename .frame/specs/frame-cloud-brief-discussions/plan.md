# Plan — Frame Cloud brief discussions

## Architecture

### Resolved plan-time decisions

- **Discussion ids survive a restart** (asked). Main keeps every id it issues
  in `<userData>/cloud-discussions/discussions.json`, so a session resumed
  after Frame restarts (`claude --resume`) can still record. Entries older
  than 90 days are dropped on load. Rejected: in-memory ids — less code, but
  a resumed conversation would lose the one thing it exists to produce.
- **Tests cover pure logic only** (asked). The prompt builder, request
  validation, request handling, the store's pure operations, the record
  command's argument and file protocol, the new tRPC call and the new copy get
  `node --test` files; the panel's DOM is walked by hand. This is the
  project's convention (testing record: DOM-coupled renderer code has no
  harness).
- **Go to discussion lives in the detail header; the card shows the dot only**
  (silent). A card is a `<button>`, and a second control inside it would nest
  interactive elements.
- **Codex lanes get no document offer** (silent). The spec allows a summary
  document only as a published link, and only Claude Code can publish one
  (a claude.ai artifact); a Codex discussion is recorded with its summary.
- **The summary reaches the command on stdin** (silent). Up to 10,000
  characters of free text does not survive shell quoting as an argument; the
  prompt shows a quoted heredoc.
- **One staged script, its bus beside it** (silent). Main copies
  `src/templates/bin/record-discussion.js` to
  `<userData>/cloud-discussions/record-discussion.js` at start; the script
  finds `bus/` from its own `__dirname`, so no environment variable is needed
  and nothing is written into the user's repo.
- **Request handling is pure with injected calls** (silent).
  `handleRecordRequest(request, deps)` owns every branch (unknown id, not
  connected, invalid input, server refusal, success), so the posture above
  can test it; the service only wires real `deps`.
- **The brief id is resolved at record time** (silent). The store keeps the
  folder and the brief number; main calls `brief.getByNumber` before
  `brief.recordDiscussion`, as `get()` already does, so no id is ever stored
  or shown to the terminal.
- **The command waits 30 seconds for a reply** (silent). Long enough for a
  slow network round trip, short enough that an agent is not left hanging
  when Frame is closed.
- **Lane lookup is scoped to the open project** (silent). Brief numbers are
  per project; `getBriefLaneInfo(number)` reads the current project's lanes
  (`getTerminalStates()`), unlike tasks, whose ids are global.
- **`provider` is the tool's display name** (silent). The renderer passes the
  current tool's id; main accepts only an id in `aiToolManager`'s tools and
  stores its `name` (`Claude Code`, `Codex CLI`), which the server's 40-char
  limit fits.

### Flow A — Discuss

```
panel (open proposal) ──Discuss──▶ invoke CLOUD_BRIEF_DISCUSS(path, number, toolId)
main: connectedProject(path) → get(path, number) → proposal && status !== 'closed'
      → tool known? → store.add({ id, folderPath, number, toolId, provider, createdAt })
      → buildDiscussPrompt({ brief, events, toolId, commandPath, discussionId })
      ◀── { ok, prompt } | { ok: false, reason }
panel ──▶ agentDispatch.dispatch({ createNew: true, toolId, prompt,
            assignment: { kind: 'brief', label: `brief #n: <title>`, ref: n } })
```

The prompt carries: the brief's number, title, description, links; every
earlier `discussion-recorded` event (date, provider, summary, url), newest
first; the flow (understand → discuss → ask before recording, at the moments
something settles); the rule that the description is never rewritten
(suggest wording in the conversation instead); for `claude` only, the offer
to publish the summary as a claude.ai artifact and pass its link as `--url`;
and the exact command:

```
ELECTRON_RUN_AS_NODE=1 "$FRAME_NODE" "<userData>/cloud-discussions/record-discussion.js" \
  --discussion <id> [--url <https://…>] <<'FRAME_SUMMARY'
<summary>
FRAME_SUMMARY
```

`buildDiscussPrompt` treats every brief field as data, fenced and labelled;
the network content never becomes instructions.

### Flow B — Record

```
agent (on the user's yes) → record-discussion.js
  parse args + read stdin → { discussionId, summary, url? }
  write bus/<ts>-<rand>.json (tmp + rename) → wait ≤ 30 s for bus/replies/<same>.json
main: safeWatch(bus/) → drain → handleRecordRequest(request, deps)
  store.get(id)            unknown → { ok: false, reason: 'unknownDiscussion' }
  validateRecordInput      bad     → { ok: false, reason: 'badRequest', field }
  connectedProject(folder) none    → { ok: false, reason: 'notConnected' }
  getBrief(number) → recordDiscussion({ id, summary, url?, provider })
                           refusal → { ok: false, reason }
  → { ok: true }  + push CLOUD_BRIEF_DISCUSSION_RECORDED { folderPath, number }
  write replies/<same>.json, delete the request
script prints replyMessage(reply), exits 0 / 1; no reply in 30 s → "Frame did not answer"
```

Validation: `summary` trimmed, 1–10,000 characters; `url` optional, `http(s)`
only. The script checks the same shape before writing so an agent gets the
reason at once; main checks again and trusts nothing. Reasons map to
sentences in one pure function (`replyMessage`) used by main for the reply,
so the script only prints.

### Flow C — Lane and reading

- `agentDispatch`: `getBriefLaneInfo(number)`, `briefStatusDotHtml(number)`,
  `onBriefLaneActivity(cb)`, notified from the same `laneStatus.onChange` and
  terminal-destroyed hooks that feed tasks.
- `cloudBriefsPanel`: the card shows the dot; the detail header shows
  **Discuss** (open proposal, no lane) or **Go to discussion** (lane open →
  `multiTerminalUI.enterLane`, reached through `agentDispatch`); the
  Description tab lists `copy.discussionRecords(events)` below the body and
  above the links; a `CLOUD_BRIEF_DISCUSSION_RECORDED` push for the open
  folder and brief reloads the detail.
- `cloudBriefsCopy`: `eventAction` learns `discussion-recorded` ("recorded a
  discussion" / "recorded a discussion held with <provider>", as the web);
  `discussionRecords(events)` filters and orders newest first;
  `discussErrorMessage(reason)` for a failed Discuss.

Data shapes:

```
discussions.json  { version: 1, discussions: { [id]: {
                    folderPath, number, toolId, provider, createdAt } } }
bus request       { discussionId, summary, url?, ts }
reply             { ok: true, message } | { ok: false, reason, message }
push              CLOUD_BRIEF_DISCUSSION_RECORDED { folderPath, number }
```

## Files

- `src/main/cloud/cloudBriefs.js` — **Modified.** `recordDiscussion` (POST
  `brief.recordDiscussion`) and `LIMITS.provider` (40).
- `src/main/cloud/cloudDiscussions.js` — **New.** Pure: `newDiscussionId`,
  store operations (`addDiscussion`, `getDiscussion`, `pruneDiscussions`),
  `validateRecordInput`, `buildDiscussPrompt`, `handleRecordRequest`,
  `replyMessage`.
- `src/main/cloud/cloudDiscussionsService.js` — **New.** Electron shell: the
  userData folder, the persisted store, staging the script, the bus watcher,
  the `CLOUD_BRIEF_DISCUSS` handler and the recorded push.
- `src/templates/bin/record-discussion.js` — **New.** The staged command:
  pure `parseArgs` / `requestFor` above a `require.main` block that writes
  the request and waits for the reply.
- `src/shared/ipcChannels.js` — **Modified.** `CLOUD_BRIEF_DISCUSS`,
  `CLOUD_BRIEF_DISCUSSION_RECORDED`.
- `src/main/index.js` — **Modified.** Require, `init(window)` and `setupIPC`
  for `cloudDiscussionsService`.
- `src/renderer/agentDispatch.js` — **Modified.** Brief lane info, dot and
  activity subscription.
- `src/renderer/cloudBriefsCopy.js` — **Modified.** The event case,
  `discussionRecords`, the Discuss labels and error sentences.
- `src/renderer/cloudBriefsPanel.js` — **Modified.** Discuss / Go to
  discussion, the card dot, the Discussions section, reload on push.
- `src/renderer/styles/components/cloud-briefs.css` — **Modified.** The
  header button and the Discussions list.
- `test/cloudBriefs.test.js` — **Modified.** `recordDiscussion` sends the
  right procedure and input.
- `test/cloudDiscussions.test.js` — **New.** Prompt contents per tool,
  validation, every `handleRecordRequest` branch, store pruning.
- `test/recordDiscussion.test.js` — **New.** Argument parsing and the
  request/reply file protocol against a temp bus, including the timeout.
- `test/cloudBriefsCopy.test.js` — **Modified.** The event sentence,
  `discussionRecords` ordering, `discussErrorMessage`.

## Footprint

- src/main/cloud/cloudBriefs.js
- src/main/cloud/cloudDiscussions.js
- src/main/cloud/cloudDiscussionsService.js
- src/templates/bin/record-discussion.js
- src/shared/ipcChannels.js
- src/main/index.js
- src/renderer/agentDispatch.js
- src/renderer/cloudBriefsCopy.js
- src/renderer/cloudBriefsPanel.js
- src/renderer/styles/components/cloud-briefs.css
- test/cloudBriefs.test.js
- test/cloudDiscussions.test.js
- test/recordDiscussion.test.js
- test/cloudBriefsCopy.test.js

## Dependencies

None.

## Sequencing

1. **The call.** Add `recordDiscussion` and `LIMITS.provider` to
   `cloudBriefs.js`, with its case in `test/cloudBriefs.test.js`.
2. **The pure core.** Write `cloudDiscussions.js` — ids, store operations,
   `validateRecordInput`, `buildDiscussPrompt`, `handleRecordRequest`,
   `replyMessage` — with `test/cloudDiscussions.test.js`.
3. **The command.** Write `src/templates/bin/record-discussion.js` (args,
   stdin, atomic request, bounded wait, printed reply) with
   `test/recordDiscussion.test.js`.
4. **The service.** Write `cloudDiscussionsService.js` (userData folder,
   persisted store, staged script, bus watcher, `CLOUD_BRIEF_DISCUSS`,
   recorded push), add the two channels to `ipcChannels.js` and wire it in
   `index.js`.
5. **The lane.** Add `getBriefLaneInfo`, `briefStatusDotHtml` and
   `onBriefLaneActivity` to `agentDispatch.js`.
6. **The words.** Add the `discussion-recorded` case, `discussionRecords`,
   the Discuss labels and `discussErrorMessage` to `cloudBriefsCopy.js`, with
   their cases in `test/cloudBriefsCopy.test.js`.
7. **The panel.** In `cloudBriefsPanel.js`: Discuss / Go to discussion in the
   detail header, the dot on cards, the Discussions section in Description,
   the reload on `CLOUD_BRIEF_DISCUSSION_RECORDED`; styles in
   `cloud-briefs.css`.
8. **Walk it in Frame.** On a connected folder: Discuss a proposal, record
   twice through the agent (once with an artifact link), see the dot and Go
   to discussion, see both records under Description and in History, and
   confirm the command's messages for an ended proposal and with Frame
   closed.
