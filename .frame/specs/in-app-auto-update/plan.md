# Plan — In-app auto-update via electron-updater

## Architecture

### Resolved plan-time decisions

**Business**

- **When a downloaded update installs** → on the "Restart to install" click,
  *and* when the user quits Frame normally (`autoInstallOnAppQuit: true`).
  Rejected: click-only. Rationale (user choice): the update spreads without
  nagging, the way VS Code behaves; nothing ever restarts Frame on its own,
  which is what the spec's "no silent installs / not Chrome" constraint
  protects.
- **Project state after the update relaunch** → same as any restart today:
  Frame opens `projects[0]` (`src/renderer/projectListUI.js:66-75` — nothing
  restores a previous session's project), terminals end, and the existing
  live-agent confirmation (`src/main/index.js:380`) still guards the quit.
  Rejected: restoring the last active project. Rationale (user choice):
  session restore is a separate feature; the spec's S3 wording "preserving
  any open project state" is narrowed to "behaves like a normal restart".
- **Where "Update ready · Restart to install" appears** → the three existing
  surfaces change state when the download finishes: the header bell
  (`appHeader.js`), the sidebar banner (`#sidebar-update-banner`), and the
  Settings → About banner (`#settings-update-available`). No new surface.
  Rejected: a new window-level banner. Rationale (user choice): no new UI to
  maintain; all three are already wired to the update state.
- **Dismissed versions** (silent) → "Dismiss this version" keeps hiding the
  passive indicators exactly as today. The download still happens and the
  update still installs on the next normal quit. Rationale: dismiss means
  "stop telling me", which is what it does today; it was never "never
  install".
- **Telemetry** (silent) → no new analytics events; the opt-out model is
  untouched (spec C5). Rationale: nothing in the spec asks to measure
  update adoption, and adding events is scope the user did not request.
- **Rollback** (silent) → unchanged: a user re-downloads an older dmg from
  the releases page (spec S5). The dmg stays a release asset, so this keeps
  working.
- **Scope of platforms** (silent) → the updater runs only for a packaged
  macOS build. Dev runs (`!app.isPackaged`), Windows and Linux keep today's
  passive GitHub check. Rationale: spec constraint C1; electron-updater cannot
  update an unpackaged app.

**Technical**

- **updateChecker vs electron-updater** → `updateChecker.js` stays the single
  module and keeps its IPC contract; on a packaged mac build its internals
  delegate checking and downloading to electron-updater, otherwise it runs
  today's GitHub Releases API check. Rejected: running both side by side.
  Rationale (user choice): one source of truth; two pollers could disagree
  about the same version.
- **Test posture** → pure logic only. Rationale (user choice): matches the
  project's convention (`PROJECT_NOTES.md` → Testing: test the pure module,
  skip the Electron-coupled wrapper). CI runs no `npm ci`, so anything that
  reaches `electron-updater` cannot be tested there anyway.
- **Mac artifacts** (silent, spec drift) → `build.mac.target` becomes
  `["dmg", "zip"]` and `build.publish` is set to
  `{ provider: "github", owner: "kaanozhan", repo: "Frame" }`. The spec
  assumed `dist:mac` already produces `latest-mac.yml` + what the updater
  needs; it does not — v2.8.2's release has only the `.dmg` and its
  blockmap. Squirrel.Mac installs from the `.zip`; the dmg stays for first
  installs. Signing and notarization are unchanged (C2 still holds: no
  re-signing).
- **Publishing stays manual** (silent) → `dist:mac*` scripts gain
  `--publish never` so electron-builder never uploads on its own; releases
  remain `gh release create` with three more files attached. Rationale: the
  current procedure is manual and credentials live outside the repo.
- **Public repo, no token** (silent) → the GitHub provider downloads public
  release assets anonymously; nothing is embedded in the app.
- **Lazy require** (silent) → `electron-updater` is required inside the
  packaged-mac branch only, the same way `posthog-node` is lazily required in
  `src/main/analytics.js`, so tests and dev runs never load it.
- **Check cadence** (silent) → unchanged: one check on `did-finish-load`
  (`src/main/index.js:160-163`) and the visibility-gated 6-hour recheck via
  `pollGate.gatedInterval(..., { refreshOnShow: false })`
  (`src/main/updateChecker.js:49-56`). Rationale: honours the
  audit-q3-performance-resources decision recorded on that file. A 6-hour
  cadence still meets S1 (downloaded within 24h for anyone who has Frame
  open).
- **In-flight footprint overlap** (silent) → `updateChecker.js`,
  `src/main/index.js`, `index.html` sit in audit-q3-performance-resources'
  footprint (phase `implementing`, untouched since 2026-08-26);
  `src/renderer/index.js`, `ipcChannels.js`, `package.json` sit in
  audit-q3-cross-platform's (phase `planned`). Neither is running; the
  footprint below lets the conductor serialise if one is dispatched.

### Update state

`updateChecker.js` keeps one state object, built by a new pure module
`src/main/updateState.js`:

```
{
  status: 'idle' | 'checking' | 'up-to-date' | 'update-available'
        | 'downloaded' | 'error',
  info:   { currentVersion, latestVersion, releaseUrl, releaseName,
            publishedAt, releaseNotes } | null,   // today's shape, unchanged
  errorReason: 'network' | 'timeout' | 'parse' | 'download' | null,
  lastCheckedAt: ISO string | null
}
```

`updateState.js` exports pure functions with no `electron` require:

- `isNewerVersion(current, latest)` — moved from `updateChecker.js:128-136`.
- `toInfo(updateInfo, currentVersion)` — electron-updater's `UpdateInfo`
  (`version`, `releaseName`, `releaseNotes`, `releaseDate`) → today's `info`
  shape; `releaseUrl` is
  `https://github.com/kaanozhan/Frame/releases/tag/v<version>`;
  `releaseNotes` arrays are joined to text.
- `errorReason(err)` — maps an updater error to the existing reasons
  (`ENOTFOUND`/`ECONNRESET`/… → `network`, `ETIMEDOUT` → `timeout`,
  YAML/JSON parse failures → `parse`, everything else → `download`).

`checkForUpdate()` keeps resolving the discriminated result the renderer
already reads (`update-available` / `up-to-date` / `error`) and never
rejects. A downloaded update reports `update-available` with
`downloaded: true` added, so existing callers keep working.

### Main-process flow (packaged macOS)

```
did-finish-load / 6h recheck
  → autoUpdater.checkForUpdates()          (autoDownload: true)
  → 'update-available'   → state=update-available, push UPDATE_AVAILABLE(info)
  → (background download)
  → 'update-downloaded'  → state=downloaded,       push UPDATE_DOWNLOADED(info)
  → 'update-not-available' → state=up-to-date
  → 'error'              → state=error(errorReason)

renderer INSTALL_UPDATE → autoUpdater.quitAndInstall()
  → before-quit live-agent confirmation (index.js:380) still runs;
    cancelling it leaves the update to install on the next normal quit
user quits normally   → autoInstallOnAppQuit installs it
```

New IPC in `src/shared/ipcChannels.js`: `UPDATE_DOWNLOADED`
(main → renderer push) and `INSTALL_UPDATE` (renderer → main invoke).
`GET_UPDATE_STATUS` gains `downloaded: boolean`.

### Renderer surfaces

- **Settings → About** (`frameSettingsModal.js`, `index.html:1624-1632`):
  when downloaded, the banner title reads "Update ready: vX" and a primary
  "Restart to install" button (New, `#settings-update-install`) invokes
  `INSTALL_UPDATE`; "View Release Notes" and "Dismiss this version" stay.
  While a download is in flight the status line reads "Downloading in the
  background…". Hydration from `GET_UPDATE_STATUS` honours `downloaded`.
- **Sidebar banner** (`src/renderer/index.js:533-555`): title switches from
  "New version available" to "Restart to install"; click still opens
  Settings → About, where the install button is. Dismiss gating unchanged.
- **Header bell** (`appHeader.js:123-140`): when downloaded, title becomes
  "Restart to install vX" and a click invokes `INSTALL_UPDATE`; before the
  download finishes it keeps opening the release page.
- On non-updater builds no `UPDATE_DOWNLOADED` ever arrives, so every surface
  behaves exactly as today.

## Files

- `src/main/updateState.js` — **New**. Pure update-state helpers:
  `isNewerVersion`, `toInfo`, `errorReason`.
- `test/updateState.test.js` — **New**. Tests for the three helpers.
- `src/main/updateChecker.js` — **Modified**. Packaged-mac branch on
  electron-updater (lazy require, auto-download, install-on-quit), legacy
  GitHub check elsewhere, `UPDATE_DOWNLOADED` push, `INSTALL_UPDATE`
  handler, `downloaded` in `GET_UPDATE_STATUS`.
- `src/shared/ipcChannels.js` — **Modified**. Add `UPDATE_DOWNLOADED`,
  `INSTALL_UPDATE`.
- `src/renderer/frameSettingsModal.js` — **Modified**. Downloaded state,
  install button, background-download status line.
- `index.html` — **Modified**. `#settings-update-install` button in the
  About banner; id hook for the sidebar banner title.
- `src/renderer/index.js` — **Modified**. Sidebar banner "Restart to
  install" state on `UPDATE_DOWNLOADED`.
- `src/renderer/appHeader.js` — **Modified**. Bell installs once downloaded.
- `package.json` — **Modified**. `electron-updater` dependency;
  `build.publish`; `build.mac.target` adds `zip`; `--publish never` on the
  `dist:mac*` scripts.
- `package-lock.json` — **Modified**. Lockfile for `electron-updater`.
- `RELEASE.local.md` — **Modified** (local, gitignored). Step 4 uploads the
  `.zip`, its `.blockmap`, and `latest-mac.yml` alongside the dmg.

## Footprint

- src/main/updateState.js
- test/updateState.test.js
- src/main/updateChecker.js
- src/shared/ipcChannels.js
- src/renderer/frameSettingsModal.js
- index.html
- src/renderer/index.js
- src/renderer/appHeader.js
- package.json
- package-lock.json
- RELEASE.local.md

## Dependencies

- `electron-updater` `^6.8.9` (runtime `dependencies`, not dev — it ships
  inside the app). The updater half of electron-builder, which the project
  already builds with (`electron-builder ^26.7.0`); reads `latest-mac.yml`
  from GitHub Releases and drives Squirrel.Mac.

## Sequencing

1. **Pure update-state module.** Create `src/main/updateState.js` with
   `isNewerVersion` (moved from `updateChecker.js`), `toInfo`, and
   `errorReason`; switch `updateChecker.js` to import `isNewerVersion` from
   it. Write `test/updateState.test.js` covering version comparison,
   `UpdateInfo` → `info` mapping (string and array release notes, missing
   fields), and each error-reason mapping. No behaviour change yet.
2. **Packaging config.** Add `electron-updater` to `dependencies`; set
   `build.publish` to the GitHub provider; add `zip` to `build.mac.target`;
   append `--publish never` to `dist:mac`, `dist:mac:unsigned`, and `dist`.
   Done when `npm run dist:mac` writes `Frame-X-arm64-mac.zip`,
   its `.blockmap`, and `latest-mac.yml` into `release/`.
3. **Main-process updater.** In `updateChecker.js`, branch on
   `app.isPackaged && process.platform === 'darwin'`: lazily require
   `electron-updater`, set `autoDownload` and `autoInstallOnAppQuit` to true,
   map its events onto the state via `toInfo`/`errorReason`, keep
   `checkForUpdate()`'s discriminated result, push `UPDATE_DOWNLOADED`, and
   register `INSTALL_UPDATE` → `quitAndInstall()`. Add the two channels to
   `ipcChannels.js` and `downloaded` to `GET_UPDATE_STATUS`. Other builds run
   the existing GitHub check unchanged.
4. **Settings → About.** Add `#settings-update-install` to the About banner
   in `index.html`; in `frameSettingsModal.js` render the downloaded state
   ("Update ready", install button → `INSTALL_UPDATE`), the
   "Downloading in the background…" status, and hydrate `downloaded` from
   `GET_UPDATE_STATUS`.
5. **Sidebar banner and header bell.** On `UPDATE_DOWNLOADED`, switch the
   sidebar banner title to "Restart to install" (`src/renderer/index.js`,
   id hook in `index.html`) and make the bell install on click with title
   "Restart to install vX" (`appHeader.js`). Dismiss gating unchanged.
6. **Release procedure.** *Done at plan time (2026-10-08), at the user's
   request — no task needed.* Update step 4 of `RELEASE.local.md` to attach
   `Frame-X.X.X-arm64-mac.zip`, `Frame-X.X.X-arm64-mac.zip.blockmap`, and
   `latest-mac.yml` to `gh release create`, with a note that the first
   release carrying the updater still reaches existing users through the
   manual download.
