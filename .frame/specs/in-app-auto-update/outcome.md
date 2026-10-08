## T01 — Pure update-state module

Created src/main/updateState.js (isNewerVersion moved from updateChecker.js, plus toInfo and errorReason) and test/updateState.test.js (10 tests). Beyond the plan, the module also exports releaseUrlFor, which toInfo uses to build the release-page URL. A release missing latest-mac.yml (ERR_UPDATER_CHANNEL_FILE_NOT_FOUND) maps to parse, matching the plan's risk table.

_Captured: 2026-10-08 · 3 file change(s)_

---

## T02 — Add electron-updater dependency

Added electron-updater ^6.8.9 to dependencies and updated package-lock.json with --package-lock-only, so nothing was installed or rebuilt. Seven packages that electron-builder already pulled in (js-yaml, fs-extra, jsonfile, universalify, lazy-val, sax, argparse) moved from dev to runtime in the lockfile, which is expected: they now ship inside the app.

_Captured: 2026-10-08 · 2 file change(s)_

---

## T03 — Packaging config for the updater

Added zip to build.mac.target, a GitHub build.publish block (kaanozhan/Frame), and --publish never on the three dist scripts in package.json. That the build actually writes the zip, its blockmap and latest-mac.yml was not verified in this run, because a signed build needs the Apple credentials and notarization. The first release build is where that is confirmed.

_Captured: 2026-10-08 · 1 file change(s)_

---

## T04 — IPC channels for the downloaded state and install

Added UPDATE_DOWNLOADED and INSTALL_UPDATE to the Update Check block of src/shared/ipcChannels.js. Checked that no channel value is duplicated. No deviation from the plan.

_Captured: 2026-10-08 · 1 file change(s)_

---

## T05 — electron-updater path in updateChecker

Split updateChecker.js into checkWithUpdater (packaged macOS, lazily requires electron-updater, auto-download and install-on-quit on, pushes UPDATE_AVAILABLE and UPDATE_DOWNLOADED) and checkWithGitHub (unchanged logic, sharing a new record() helper). A failed background download is logged and keeps the update 'available' instead of reporting an error, a choice the plan left open. A smoke run with stubbed electron and electron-updater exercised available, downloaded, up-to-date and error (missing latest-mac.yml → parse) paths, and a rejected downloadPromise caused no unhandled rejection. The plan's note that posthog-node is lazily required in analytics.js no longer holds after PR #165 (it is a top-level require); electron-updater is lazy regardless.

_Captured: 2026-10-08 · 1 file change(s)_

---

## T06 — Install handler and downloaded status

Added the INSTALL_UPDATE handler (quitAndInstall via setImmediate, false unless packaged macOS with a downloaded update) and downloaded to GET_UPDATE_STATUS in src/main/updateChecker.js. Correction to the plan: quitAndInstall closes the window before before-quit fires, so the live-agent prompt comes from the window's 'close' handler (src/main/index.js), with the same effect. A stubbed smoke run confirmed install is refused before the download and calls quitAndInstall once after it.

_Captured: 2026-10-08 · 1 file change(s)_

---

