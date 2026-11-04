/**
 * Update Checker Module
 *
 * Polls the GitHub Releases API for newer versions on launch and every
 * RECHECK_INTERVAL_MS while the app stays open. Notifies the renderer
 * with UPDATE_AVAILABLE; the renderer decides how to present (bell
 * button, sidebar notification dot, Settings About section).
 *
 * Dismiss support: a version the user has dismissed is recorded in
 * userSettings (dismissedUpdateVersion). The dismissed version still
 * appears in manual checks and in the About panel, but the renderer
 * uses the dismissed flag to suppress passive indicators.
 *
 * Auto-update (in-app-auto-update spec): on a packaged macOS build the
 * check goes through electron-updater instead, which also downloads the
 * update in the background and sends UPDATE_DOWNLOADED when it is ready.
 * It installs when the user asks (INSTALL_UPDATE) or quits Frame normally
 * — never on its own. Dev runs, Windows and Linux keep the GitHub check.
 */

const { app, ipcMain } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const https = require('https');
const pollGate = require('./pollGate');
const logger = require('./logger');
const { isNewerVersion, toInfo, errorReason } = require('./updateState');

const REPO_OWNER = 'kaanozhan';
const REPO_NAME = 'Frame';
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let mainWindow = null;
let recheckTimer = null;
let lastCheckedAt = null;
let lastResult = null;
let lastStatus = null; // 'update-available' | 'up-to-date' | 'error'
let lastErrorReason = null; // 'network' | 'timeout' | 'parse' | 'download' | null
let updater = null; // electron-updater's autoUpdater, created on first use
let downloaded = false; // the update in lastResult is downloaded and ready to install

function init(window) {
  mainWindow = window;
  startPeriodicRecheck();
}

function setupIPC() {
  ipcMain.handle(IPC.CHECK_FOR_UPDATE, async () => {
    return checkForUpdate();
  });
  ipcMain.handle(IPC.GET_UPDATE_STATUS, () => ({
    lastCheckedAt,
    lastStatus,
    lastErrorReason,
    result: lastResult,
    downloaded,
    autoUpdate: usesUpdater(),
    currentVersion: require('../../package.json').version
  }));
  // "Restart to install". quitAndInstall closes the window first, so the
  // live-agent confirmation in index.js still runs; if the user cancels
  // there, Frame stays open and the update installs on the next quit.
  ipcMain.handle(IPC.INSTALL_UPDATE, () => {
    if (!usesUpdater() || !downloaded) return false;
    // Let this reply reach the renderer before the app starts quitting.
    setImmediate(() => getUpdater().quitAndInstall());
    return true;
  });
}

function startPeriodicRecheck() {
  if (recheckTimer) recheckTimer.dispose();
  // Visibility-gated; no refresh-on-show — a 6h cadence must not fire a
  // network check every time the window reappears.
  recheckTimer = pollGate.gatedInterval(() => {
    checkForUpdate().catch(() => {});
  }, RECHECK_INTERVAL_MS, { refreshOnShow: false });
}

/**
 * Only a packaged macOS build can update itself: electron-updater needs the
 * app-update.yml electron-builder embeds, and Squirrel.Mac needs a signed
 * app. Everything else keeps the passive GitHub check.
 */
function usesUpdater() {
  return app.isPackaged && process.platform === 'darwin';
}

function notify(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * Required lazily so tests and dev runs never load electron-updater.
 */
function getUpdater() {
  if (updater) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = {
    info: (...args) => logger.info('updater', ...args),
    warn: (...args) => logger.warn('updater', ...args),
    error: (...args) => logger.error('updater', ...args),
    debug: () => {}
  };
  updater.on('update-downloaded', (updateInfo) => {
    downloaded = true;
    lastResult = toInfo(updateInfo, app.getVersion());
    lastStatus = 'update-available';
    notify(IPC.UPDATE_DOWNLOADED, lastResult);
  });
  // A failed download is logged and retried on the next check; the update
  // stays "available" so the user still sees it and can get the release.
  updater.on('error', (err) => {
    logger.warn('updater', 'update error:', err && err.message);
  });
  return updater;
}

/**
 * Check for a newer version. Resolves the same discriminated result on
 * every platform:
 *   { status: 'update-available', info, downloaded }
 *   { status: 'up-to-date', checkedAt }
 *   { status: 'error', reason: 'network' | 'timeout' | 'parse' | 'download', checkedAt }
 * Never rejects.
 */
function checkForUpdate() {
  return usesUpdater() ? checkWithUpdater() : checkWithGitHub();
}

function record(status, extra = {}) {
  lastCheckedAt = new Date().toISOString();
  lastStatus = status;
  lastErrorReason = status === 'error' ? extra.reason : null;
  if (status !== 'update-available') lastResult = null;
  return { status, checkedAt: lastCheckedAt, ...extra };
}

async function checkWithUpdater() {
  // Already downloaded: nothing new to fetch until the user installs it.
  if (downloaded && lastResult) {
    return { status: 'update-available', checkedAt: lastCheckedAt, info: lastResult, downloaded: true };
  }
  try {
    const result = await getUpdater().checkForUpdates();
    const updateInfo = result && result.updateInfo;
    const currentVersion = app.getVersion();
    const available = result && typeof result.isUpdateAvailable === 'boolean'
      ? result.isUpdateAvailable
      : !!(updateInfo && isNewerVersion(currentVersion, String(updateInfo.version)));
    if (!available) return record('up-to-date');

    // The download runs on; its failure is reported through the 'error' event.
    if (result.downloadPromise) result.downloadPromise.catch(() => {});
    const info = toInfo(updateInfo, currentVersion);
    lastResult = info;
    notify(IPC.UPDATE_AVAILABLE, info);
    return record('update-available', { info, downloaded });
  } catch (err) {
    return record('error', { reason: errorReason(err) });
  }
}

/**
 * Check GitHub for a newer release.
 *
 * Resolves a discriminated result — the UI must be able to tell "you're
 * current" apart from "the check failed" (they used to both resolve null):
 *   { status: 'update-available', info }
 *   { status: 'up-to-date', checkedAt }
 *   { status: 'error', reason: 'network' | 'timeout' | 'parse', checkedAt }
 * Never rejects.
 */
function checkWithGitHub() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status, extra = {}) => {
      if (settled) return;
      settled = true;
      resolve(record(status, extra));
    };

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      headers: { 'User-Agent': 'Frame-App' }
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          if (!release.tag_name) {
            // No releases published — current by definition.
            finish('up-to-date');
            return;
          }
          const latestVersion = release.tag_name.replace(/^v/, '');
          const currentVersion = require('../../package.json').version;

          if (isNewerVersion(currentVersion, latestVersion)) {
            const info = {
              currentVersion,
              latestVersion,
              releaseUrl: release.html_url,
              releaseName: release.name || release.tag_name,
              publishedAt: release.published_at,
              releaseNotes: release.body || ''
            };
            lastResult = info;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(IPC.UPDATE_AVAILABLE, info);
            }
            finish('update-available', { info });
          } else {
            finish('up-to-date');
          }
        } catch {
          finish('error', { reason: 'parse' });
        }
      });
    });

    req.on('error', () => finish('error', { reason: 'network' }));
    req.setTimeout(10000, () => { req.destroy(); finish('error', { reason: 'timeout' }); });
  });
}

module.exports = { init, setupIPC, checkForUpdate };
