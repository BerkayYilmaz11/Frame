# Outcome — Terminal Context Boundary

## T01 — Add pure `src/main/launchEnv.js`

Added `src/main/launchEnv.js` with `supportsWrappers(platform)`, `frameBinDir(projectPath)` and `prependFrameBin(pathValue, projectPath, platform)`; it requires only `node:path` and `frameConstants`. `prependFrameBin` removes a later copy of the bin directory rather than returning early when it is present anywhere — an entry that is not *first* is useless, since a real `claude` earlier on `PATH` would win. Platform is a defaulted parameter so the non-POSIX branch is testable without stubbing `process.platform`. No consumer yet; T09 wires it into the PTY spawn env.

_Captured: 2026-08-01 · 1 file change_

---
