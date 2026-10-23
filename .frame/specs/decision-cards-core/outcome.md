# Outcome — Decision cards core

## T01 — Card reader, store path and meta guard

Added `scripts/decision-cards.js`, which reads `.frame/decisions.jsonl` line by line: a torn or invalid line is skipped and reported by line number, an identical repeated id is dropped silently and a conflicting one reported, superseded cards leave the current set, and cards match by file or by spec-hint's token weights at score ≥ 3, rendered as full, compact or catalog lines. Validation is shape only; whether a source resolves and whether named ids exist is left to `decision.js add`, which has the project on disk. Added `frameStore.decisionsPath()` as a flat join with no legacy root fallback, `FRAME_FILES.DECISIONS`, `decisions.jsonl` in the data class and `ORCH_META_FILES`, and a `metaPathGuard` check that fails on a card-file join outside frameStore and pins the helper's literal. Beyond the plan, the helper also exports `relatedCards` (shared file weighs 3, plus the word score) for T02, and a card's word bag is its keywords, decision and file basenames, not its why.

_Captured: 2026-10-23 · 6 file change(s)_

---
