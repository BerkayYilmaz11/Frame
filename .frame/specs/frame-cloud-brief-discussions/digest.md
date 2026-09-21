---
keywords: frame cloud, brief discussion, discuss, proposal, discussion record, lane, command bus, recordDiscussion
related: frame-cloud-briefs-read-only, frame-cloud-briefs-create, agent-dispatch
---
Frame became the place to talk a Frame Cloud proposal over with an agent: Discuss (drawer header or card) opens a lane with the default AI tool and a prompt carrying the brief, its links and every earlier record; on the user's yes the agent runs a staged command and main calls `brief.recordDiscussion` (the only new write — no `brief.update`, no attachments).
Path: main issues a 24-hex discussion id (persisted 90 days in `<userData>/cloud-discussions/discussions.json`), stages `record-discussion.js` beside a file bus in userData (nothing in the user's repo), and the command sends only that id + summary (stdin heredoc) + optional http(s) url. Rejected: env-var bus, in-memory ids, summary as an argument, token/brief id in the terminal.
Bus protocol: tmp + rename requests; main claims by rename to `.taken`, answers in `replies/`; the command waits 30 s, withdraws its request on timeout and says "did not answer" only when the withdrawal succeeded; main drops requests older than the wait at start instead of recording them.
`call()` folds NOT_A_PROPOSAL/ALREADY_CLOSED into badRequest, so `handleRecordRequest` catches those codes inside the called function and returns them as values.
Prompt rules: brief content fenced as data; only fate-deciding questions stay open; Claude Code asks at wrap-up to publish a claude.ai artifact (becomes the record's url); Codex gets no document offer; never a local file.
UI: lanes carry `assignment.kind: 'brief'` (current-project lookup, since numbers are per project); the chip opens the brief (`cloudBriefsPanel.openBrief`); cards are containers (open button + sibling controls — never nest controls in the card button) with Discuss / "Discussing in <lane>" / "N discussions recorded", counted from `brief.events` per open proposal.
A write-up link lives on the discussion record (Discussions list, "Read the write-up"), not under Links; transforming to Work does not copy it.
Open: the heredoc assumes a POSIX shell (Windows PowerShell lanes); per-proposal events requests could become one `discussionCount` on `brief.list`.

Chain: spec.md → plan.md → tasks.md → outcome.md
