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

## T02 — Retrieval core

`scripts/structure-retrieval.js` (pure, dependency-free) provides:
- `compileIndex`: files `[[path, description]]`; postings keyed `<tier>:<folded term>` for path, basename (with and without extension), symbol (functions, exports, IPC channels), path words and description words, capped at 64 per term with truncation recorded; concepts `[[name, fileIds, synonyms]]` in intentIndex order.
- `normalizeQuery`: NFKC, Turkish folding (including İ), accent stripping, camel/snake/kebab splitting, regex escapes and glob prefixes stripped, `|` alternatives tried in order, at most 512 characters and 8 units.
- `retrieve`, with the eight tiers.
- `legacyRetrieve`, reproducing find-module's four tiers and the hook's three; a parity test runs the current `find-module.js`.

Rules added during development-split tuning (the held-out split has not been run against v2):
- Every identifier word must be explained by some match. Words with a non-ASCII letter are prose and may stay unexplained.
- When no file carries every word, files rank by how many they carry ("GitHub paneli").
- The hook shows only the leading group (same coverage, tier and score).
- Partial concepts need ≥ 4 letters on both sides (the case that prompted it: "foo|bar" hinted the sidebar group).
- Comment markers (TODO/FIXME/XXX/HACK) are ignored by the hook.

Development split, in process on the pinned map: recall@5 95.1%, P@1 98.3%, hook precision 100%, false hints 0/11. The remaining misses are 2 purely Turkish queries. The pinned map's index is 130 KB, against the 662 KB map. Honest note: the corpus and these rules share an author, so the held-out split guards against tuning, not against that bias. Files touched: `scripts/structure-retrieval.js`, `test/structureRetrieval.test.js`.

_Captured: 2026-10-01 · 2 file change(s)_

---
