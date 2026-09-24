# Outcome — Frame Cloud brief shape

## T01 — Read shaped briefs in cloudBriefs.js

Added `shapedAt` to `normalizeBrief`, swapped `why` for `definition` (`''` when absent) in `normalizePart`, and added `shapeBrief` (POST `brief.shape`, returns `normalizeBriefDetail`) in `src/main/cloud/cloudBriefs.js`. Tests in `test/cloudBriefs.test.js` cover normalizing, the wire call and an `ALREADY_SHAPED` refusal. The panel still reads `part.why` until T02 and draws nothing in the meantime.

_Captured: 2026-09-24 · 2 file change(s)_

---

## T02 — Show shaped briefs in the Parts tab

Added the `shaped` event sentence (reads `data.count`, as FrameCloud writes it), `shapedLine` and `PART_DEFINITION_LABEL` to `src/renderer/cloudBriefsCopy.js`. The Parts tab in `src/renderer/cloudBriefsPanel.js` now shows "Shaped <date>" and each non-empty definition in a collapsed, escaped, pre-wrapped `<details>`, and `why` is dropped. Styles are in `cloud-briefs.css` and tests in `test/cloudBriefsCopy.test.js`.

_Captured: 2026-09-24 · 4 file change(s)_

---

