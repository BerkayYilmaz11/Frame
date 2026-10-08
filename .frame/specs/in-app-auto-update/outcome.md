## T01 — Pure update-state module

Created src/main/updateState.js (isNewerVersion moved from updateChecker.js, plus toInfo and errorReason) and test/updateState.test.js (10 tests). Beyond the plan, the module also exports releaseUrlFor, which toInfo uses to build the release-page URL. A release missing latest-mac.yml (ERR_UPDATER_CHANNEL_FILE_NOT_FOUND) maps to parse, matching the plan's risk table.

_Captured: 2026-10-08 · 3 file change(s)_

---

