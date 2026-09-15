# Outcome — How to Use Frame guide

## T01 — Create the pure guide content module with chapter 1

Added `src/renderer/guide/guideContent.js`: CHAPTERS, SKETCH_KINDS (20), ACTION_IDS, STAY_IDS, `flattenPages`, `validate`, and chapter 1 (`start.what`, `start.agent`, `start.open`) written against aiToolManager's tool registry and first-run probe. Beyond the plan, exported `parseInline` (splits `{kbd:id}` and backtick code out of plain text) so the host's only text parsing is pure and testable; ACTION_IDS holds the full allowlist for all chapters up front instead of growing per chapter. 1 file.

_Captured: 2026-09-15 · 1 file change(s)_

---

## T02 — Write the guide content test suite

Added `test/guideContent.test.js` (19 tests): the shipped content validates clean with unique ids, known sketch kinds and allowlisted commands; `flattenPages` order across chapters; `parseInline` segments; and a sound fixture broken one rule at a time proves `validate` reports each mistake. Also pins SKETCH_KINDS at twenty and the first page as `start.what`. 1 file.

_Captured: 2026-09-15 · 1 file change(s)_

---

