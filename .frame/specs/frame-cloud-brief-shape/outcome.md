# Outcome — Frame Cloud brief shape

## T01 — Read shaped briefs in cloudBriefs.js

Added `shapedAt` to `normalizeBrief`, swapped `why` for `definition` (`''` when absent) in `normalizePart`, and added `shapeBrief` (POST `brief.shape`, returns `normalizeBriefDetail`) in `src/main/cloud/cloudBriefs.js`. Tests in `test/cloudBriefs.test.js` cover normalizing, the wire call and an `ALREADY_SHAPED` refusal. The panel still reads `part.why` until T02 and draws nothing in the meantime.

_Captured: 2026-09-24 · 2 file change(s)_

---

## T02 — Show shaped briefs in the Parts tab

Added the `shaped` event sentence (reads `data.count`, as FrameCloud writes it), `shapedLine` and `PART_DEFINITION_LABEL` to `src/renderer/cloudBriefsCopy.js`. The Parts tab in `src/renderer/cloudBriefsPanel.js` now shows "Shaped <date>" and each non-empty definition in a collapsed, escaped, pre-wrapped `<details>`, and `why` is dropped. Styles are in `cloud-briefs.css` and tests in `test/cloudBriefsCopy.test.js`.

_Captured: 2026-09-24 · 4 file change(s)_

---

## T03 — The pure core of Shape (cloudShape.js)

Exported `briefData`, `commentLines`, `fence` and `shellQuote` from `cloudDiscussions.js` and wrote the pure `src/main/cloud/cloudShape.js`: the store, the prompt-file helpers, `validateShapeInput` (which names the field and the part's index), `buildShapePrompt`, `shapeThrough`, `handleShapeRequest` and `replyMessage`. The request handler leaves the kind and `shapedAt` checks to the server, whose refusals come back as `notWork` / `alreadyClosed` / `alreadyShaped` / `notFound`. `test/cloudShape.test.js` covers each branch, including exactly one `brief.shape` with the parts in order.

_Captured: 2026-09-24 · 3 file change(s)_

---

## T04 — The shape-brief command

Wrote the self-contained `src/templates/bin/shape-brief.js` (`parseArgs`, `requestFor`, `run`, `WAIT_MS`). It reads the parts as a JSON array on stdin and uses `record-discussion.js`'s bus protocol and both timeout messages, reworded for shaping. `test/shapeBrief.test.js` covers the argument errors, malformed JSON, an empty array, each bad field, a reply, a refusal, both timeouts and a spawned run over stdin.

_Captured: 2026-09-24 · 2 file change(s)_

---

## T05 — The Shape service and its wiring

Wrote `src/main/cloud/cloudShapeService.js` as a sibling of `cloudDiscussionsService.js`: the `cloud-shapes/` store, the staged command, the prompt files, `shape()` with `notShapeable` for anything but open unshaped work, and the bus watcher that pushes `CLOUD_BRIEF_SHAPED`. Added `CLOUD_BRIEF_SHAPE` and `CLOUD_BRIEF_SHAPED` to `src/shared/ipcChannels.js` in their own commented block, and wired `setupIPC` and `init` in `src/main/index.js`. As the plan's test posture says, the Electron shell has no unit tests.

_Captured: 2026-09-24 · 3 file change(s)_

---

## T06 — Give brief lanes a purpose

`getBriefLaneInfo` (`src/renderer/agentDispatch.js`) now returns `purpose`, defaulting to `'discuss'`. `assignmentIcon` (`src/renderer/laneStatus.js`) shows lucide `Shapes` for a shape lane, and `discuss()` in `src/renderer/cloudBriefsPanel.js` dispatches with `purpose: 'discuss'`. `setAssignment` stores the assignment object whole, so no other code path needed a change.

_Captured: 2026-09-24 · 3 file change(s)_

---

## T07 — The Shape words in cloudBriefsCopy

Added `workStage`, `laneLabel`, `SHAPE_LABEL`, `SHAPE_HINT`, `GO_TO_SHAPING_LABEL` and `shapeErrorMessage` to `src/renderer/cloudBriefsCopy.js`, and named shaping as a write in its header. `laneLabel` builds on `discussingIn`, which stays exported. `test/cloudBriefsCopy.test.js` covers each stage, a lane with no purpose, and every error sentence.

_Captured: 2026-09-24 · 2 file change(s)_

---

## T08 — Shape in the Briefs view

Added Shape to `src/renderer/cloudBriefsPanel.js`. An open lane of either purpose renders first (a `laneLabel` link on the card, Go to discussion or Go to shaping in the detail). Open unshaped work gets a primary Shape button, and `discuss()` and `shape()` share one `startLane()` behind the renamed `starting` guard. `CLOUD_BRIEF_SHAPED` reloads the board and the open detail through the shared `onBriefWritten`. The detail's lane action was renamed from `go-to-discussion` to `go-to-brief-lane`.

_Captured: 2026-09-24 · 1 file change(s)_

---

