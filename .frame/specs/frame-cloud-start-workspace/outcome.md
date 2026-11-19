# Outcome — Start Work in workspaces

## T01 — The task run names its tasks file

Added an optional `tasksPath` to `buildTaskPrompt` in `src/renderer/tasks/runPrompt.js`. When it is set, the completion line names that absolute path and adds "Use that exact file, not a tasks.json inside the working folder". A blank or missing value leaves the prompt byte-identical. Beyond the plan, which named only the completion sentence, the format step's "Read this task in tasks.json" now names the same path, because a Begin task row with no acceptance criteria would otherwise send the agent to the worktree's copy, where the row does not exist. Tests in `test/taskRunPrompt.test.js`.

_Captured: 2026-11-19 · 2 file change(s)_

---
