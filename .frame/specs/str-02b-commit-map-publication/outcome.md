# Outcome — STR-02b — Commit Map Publication

## T01 — Build the commit map from the staged snapshot

Added `scripts/structure-commit.js` with `buildStaged`: effective index (`GIT_INDEX_FILE` or `rev-parse --git-path index`), `ls-files -s -z` entries (any unmerged stage → `unavailable`), blobs via `cat-file --batch-check`/`--batch`, and a read-only fs adapter over the staged tree that STR-01 discovery and `buildFull` run on unchanged; policy from the staged config or recorded defaults, the staged map as prior, working-tree curation, and the STR-02 extraction cache keyed by blob content. Deviation outside the planned footprint: a one-line change in `scripts/structure-snapshot.js` so the extraction cache parses from the caller's fs (the index adapter) instead of always from disk — without it, cache reuse across views (planned) would have read working-tree bytes. Files touched: `scripts/structure-commit.js` (new), `scripts/structure-snapshot.js`, `test/structureCommit.test.js` (new).

_Captured: 2026-09-26 · 3 file change(s)_

---
