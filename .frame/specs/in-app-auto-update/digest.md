---
keywords: auto-update, electron-updater, updateChecker, restart to install, latest-mac.yml, release, squirrel
related: audit-q3-performance-resources
---
Packaged macOS Frame now downloads new releases in the background through
electron-updater and offers "Restart to install" on the existing header
bell, sidebar banner and Settings → About. Install happens on that click or
on a normal quit (`autoInstallOnAppQuit`), never on its own. Dev, Windows and
Linux keep the passive GitHub Releases check.
Why this path: one source of truth. `updateChecker.js` keeps its IPC contract
and delegates to electron-updater on packaged macOS. Running both side by
side was rejected (two pollers can disagree), and so was a new window banner
(more UI to maintain).
Rules for future work:
- Every release must attach `Frame-X-arm64-mac.zip`, its `.blockmap` and
  `latest-mac.yml` next to the dmg. Squirrel.Mac installs from the zip, and
  without the yml users never see the update. Builds pass `--publish never`;
  uploading stays manual (`RELEASE.local.md`).
- Pure mapping (`isNewerVersion`, `toInfo`, `errorReason`) lives in
  `src/main/updateState.js`, which is tested. Keep electron-updater lazily
  required so CI (no `npm ci`) never loads it.
- `GET_UPDATE_STATUS` carries `downloaded` and `autoUpdate`. The renderer
  needs `autoUpdate` to avoid claiming a background download on builds
  without the updater.
- A failed background download is logged and leaves the update "available";
  the next 6h check retries it.
- The live-agent prompt before install comes from the window `close`
  handler, because quitAndInstall closes windows before `before-quit` fires.
- Relaunch after an update behaves like any restart (no session restore).
Not yet proven end to end: the first signed release carrying the updater
confirms the zip and yml output, and the release after it confirms the
install.

Chain: spec.md → plan.md → tasks.md → outcome.md
