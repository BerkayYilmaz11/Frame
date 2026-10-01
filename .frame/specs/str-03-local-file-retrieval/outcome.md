# Outcome — STR-03 — Local File Retrieval

## T01 — Frozen corpus, benchmark runner, legacy baseline

`scripts/eval/retrieval-cases.json` holds 194 labelled queries against pinned 262f91b: 72 development and 122 held-out, disjoint by family. It includes 35 Turkish queries (10 purely Turkish), 39 negatives, 72 whose files belong to no intent group, and three tree mutations (removed, renamed, not yet indexed). Each split carries the SHA-256 of its cases. Deviation: the plan said 180 (60/120); the corpus came out larger, and the tests assert minimums (≥60/≥120/≥180, ≥30 Turkish, ≥30 negatives, ≥20 singletons). Labels were checked against the pinned map while authoring, and `test/retrievalEval.test.js` re-checks them against `git ls-tree` of the pinned commit.

`scripts/eval/run-retrieval.js` exports the pinned commit, builds its map with `--full`, and runs every case through `find-module` and the real hook in the Claude (Grep/Glob/Bash) and Codex (Bash, `search codex`) payload shapes. It measures synthetic 1k/10k-file projects too. Engine selection is via `project.retrieval.engine`, with `--json` used when the CLI supports it. Activity records go to a temporary `FRAME_ACTIVITY_HOME`. Metric and gate functions are exported and tested.

Legacy baseline on held-out (recorded in `scripts/eval/README.md`):
- CLI: recall@5 57.4%, exact recall 64.9%, P@1 55.3%.
- Hook: precision 56.6%, false hints 10.7%, p95 33 ms.
- 10k files: hook p95 60 ms.
- 8 gates fail.

Files touched: `scripts/eval/retrieval-cases.json`, `scripts/eval/run-retrieval.js`, `scripts/eval/README.md`, `test/retrievalEval.test.js`.

_Captured: 2026-10-01 · 4 file change(s)_

---
