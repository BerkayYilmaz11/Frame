/**
 * Frame Settings
 *
 * Frame's own settings, opened by the gear in the sidebar header (and Cmd+,,
 * and the app menu's Settings item). Machine-wide: privacy choices and the
 * About panel with the updater are the same whichever project is open, and
 * they outlive every one of them.
 *
 * The project's own settings are a separate surface (projectSettingsModal),
 * reached from the sliders button at the foot of the sidebar rail. The gear
 * is here because a gear means application preferences everywhere else; the
 * project's scope wears a different mark for the same reason.
 *
 * The sidebar's update dot and banner lead here — into About, which is where
 * the release they are announcing can actually be read.
 *
 * Account (Frame Cloud) only draws the session state main pushes over
 * CLOUD_SESSION_STATE; its buttons invoke channels and wait for the next
 * push. The token never comes this way.
 */

const { ipcRenderer, shell, clipboard } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const settingsOverlay = require('./settingsOverlay');

const TELEMETRY_KEY = 'telemetryEnabled';
const CRASH_DUMPS_KEY = 'crashDumpsEnabled';
const DISMISSED_VERSION_KEY = 'dismissedUpdateVersion';

let overlay = null;
let toggleEl = null;
let crashDumpsToggleEl = null;

// About section elements + state
let aboutVersionEl = null;
let aboutStatusEl = null;
let aboutCheckBtn = null;
let updateBanner = null;
let updateLatestEl = null;
let updateReleasedEl = null;
let updateLinkEl = null;
let updateDismissBtn = null;
let currentUpdateInfo = null;

// Account section elements + the last state main pushed
let accountSection = null;
let accountState = { state: 'unavailable' };
let signedInNoteTimer = null;

const SIGNED_IN_NOTE_MS = 4000;

const ACCOUNT_REASONS = {
  denied: 'Sign-in was denied in the browser.',
  expired: 'The code expired. Start again.',
  network: "Frame Cloud couldn't be reached.",
  rateLimited: 'Too many sign-in attempts. Wait a minute and try again.',
  noWorkspace: 'Create a workspace on the web first.'
};

function init() {
  toggleEl = document.getElementById('settings-telemetry-toggle');
  crashDumpsToggleEl = document.getElementById('settings-crash-dumps-toggle');

  // About section
  aboutVersionEl = document.getElementById('settings-version');
  aboutStatusEl = document.getElementById('settings-update-status');
  aboutCheckBtn = document.getElementById('settings-check-updates');
  updateBanner = document.getElementById('settings-update-available');
  updateLatestEl = document.getElementById('settings-update-latest');
  updateReleasedEl = document.getElementById('settings-update-released');
  updateLinkEl = document.getElementById('settings-update-link');
  updateDismissBtn = document.getElementById('settings-update-dismiss');

  overlay = settingsOverlay.create('frame-settings-overlay', () => {
    syncToggleFromSettings();
    refreshAccountOnOpen();
  });
  if (!overlay || !toggleEl) {
    if (!toggleEl) console.error('Frame settings: required elements not found');
    return;
  }

  // Load current value
  syncToggleFromSettings();
  initAccountSection();
  initAboutSection();

  // Toggle: persist + tell main process to enable/disable Aptabase
  toggleEl.addEventListener('change', async () => {
    const enabled = toggleEl.checked;
    await ipcRenderer.invoke(IPC.SET_USER_SETTING, TELEMETRY_KEY, enabled);
    await ipcRenderer.invoke(IPC.TELEMETRY_SET_ENABLED, enabled);
  });

  // Crash dumps: persisted setting only — crashGuard reads it at startup
  // (the reporter can't be stopped once started, so changes apply on next launch)
  if (crashDumpsToggleEl) {
    crashDumpsToggleEl.addEventListener('change', async () => {
      await ipcRenderer.invoke(IPC.SET_USER_SETTING, CRASH_DUMPS_KEY, crashDumpsToggleEl.checked);
    });
  }

  // Open from menu trigger — the app menu's Settings item is application
  // preferences, so it lands here rather than on the project's panel.
  ipcRenderer.on(IPC.OPEN_SETTINGS, () => overlay.open());

  // Push updates from periodic recheck refresh the About panel state
  ipcRenderer.on(IPC.UPDATE_AVAILABLE, (event, info) => {
    currentUpdateInfo = info;
    renderUpdateState({ checked: true, found: true, info });
  });
}

// ─── Account (Frame Cloud) ────────────────────────────────

function initAccountSection() {
  accountSection = document.getElementById('settings-account');
  if (!accountSection) {
    console.error('Frame settings: #settings-account not found — Frame Cloud sign-in is unavailable');
    return;
  }

  accountSection.querySelectorAll('[data-account-action]').forEach((btn) => {
    btn.addEventListener('click', () => onAccountAction(btn.dataset.accountAction, btn));
  });

  const webLink = document.getElementById('settings-account-web-link');
  if (webLink) {
    webLink.addEventListener('click', (e) => {
      e.preventDefault();
      const origin = webOrigin(accountState.verificationUrl);
      if (origin) shell.openExternal(origin);
    });
  }

  ipcRenderer.on(IPC.CLOUD_SESSION_STATE, (event, state) => renderAccount(state));
  pullAccountState();
}

function pullAccountState() {
  return ipcRenderer
    .invoke(IPC.CLOUD_GET_STATE)
    .then((state) => {
      renderAccount(state);
      return state;
    })
    .catch((err) => {
      console.error('Frame settings: could not read the Frame Cloud state', err);
      return null;
    });
}

// Opening the modal re-reads the session, and a signed-in one asks the server
// once (device.me) so a plan changed on the web shows up here.
function refreshAccountOnOpen() {
  if (!accountSection) return;
  pullAccountState().then((state) => {
    if (state && state.state === 'signedIn') {
      ipcRenderer.invoke(IPC.CLOUD_REFRESH).then(renderAccount).catch(() => {});
    }
  });
}

async function onAccountAction(action, btn) {
  switch (action) {
    case 'signIn':
      return invokeAccount(IPC.CLOUD_SIGN_IN, btn);
    case 'cancel':
      return invokeAccount(IPC.CLOUD_CANCEL_SIGN_IN, btn);
    case 'signOut':
      return invokeAccount(IPC.CLOUD_SIGN_OUT, btn);
    case 'openBrowser':
      if (isWebUrl(accountState.verificationUrl)) shell.openExternal(accountState.verificationUrl);
      return;
    case 'copyUrl':
      if (!accountState.verificationUrl) return;
      clipboard.writeText(accountState.verificationUrl);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      return;
    default:
      return;
  }
}

async function invokeAccount(channel, btn) {
  if (btn) btn.disabled = true;
  try {
    renderAccount(await ipcRenderer.invoke(channel));
  } catch (err) {
    console.error(`Frame settings: ${channel} failed`, err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderAccount(state) {
  if (!accountSection) return;
  const previous = accountState.state;
  accountState = state && state.state ? state : { state: 'unavailable' };
  const s = accountState;

  accountSection.hidden = s.state === 'unavailable';
  accountSection.querySelectorAll('[data-account-state]').forEach((pane) => {
    pane.hidden = pane.dataset.accountState !== s.state;
  });
  setNote('signedOutUnreachable', s.state === 'signedOut' && s.serverUnreachable);
  setNote('ephemeral', s.state === 'signedIn' && s.ephemeral);
  setNote('signedInUnreachable', s.state === 'signedIn' && s.serverUnreachable);
  if (s.state !== 'signedIn') setNote('justSignedIn', false);

  if (s.state === 'awaitingApproval') {
    setText('settings-account-code', s.userCode || '');
    setText('settings-account-url', s.verificationUrl || '');
  } else if (s.state === 'signedIn') {
    renderSignedIn(s);
    // Main brought the window forward; land the user on the result.
    if (previous === 'registering') showSignedInNote();
  } else if (s.state === 'failed') {
    setText('settings-account-reason', ACCOUNT_REASONS[s.reason] || ACCOUNT_REASONS.network);
    const webLink = document.getElementById('settings-account-web-link');
    if (webLink) webLink.hidden = !(s.reason === 'noWorkspace' && webOrigin(s.verificationUrl));
  }
}

function showSignedInNote() {
  if (overlay && !overlay.isOpen()) overlay.open();
  accountSection.scrollIntoView({ block: 'start' });
  setNote('justSignedIn', true);
  clearTimeout(signedInNoteTimer);
  signedInNoteTimer = setTimeout(() => setNote('justSignedIn', false), SIGNED_IN_NOTE_MS);
}

function renderSignedIn(s) {
  const user = s.user || {};
  const workspace = s.workspace || {};
  const device = s.device || {};
  setValue('settings-account-user', user.name || user.email || '—', user.name ? user.email : '');
  setValue('settings-account-workspace', workspace.name || workspace.slug || '—', workspace.name ? workspace.slug : '');
  // Plan is display text from the server; Frame never compares it.
  setText('settings-account-plan', (s.access && s.access.planLabel) || '—');
  const lastSeen = device.lastSeenAt || device.last_seen_at;
  const seen = lastSeen ? `last seen ${formatRelative(new Date(lastSeen))}` : '';
  setValue('settings-account-device', device.name || '—', seen);
}

function setNote(name, visible) {
  const el = accountSection.querySelector(`[data-account-note="${name}"]`);
  if (el) el.hidden = !visible;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// "Primary · secondary", built from text nodes — server strings never become HTML.
function setValue(id, primary, secondary) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = primary;
  if (secondary) {
    const sub = document.createElement('span');
    sub.className = 'settings-account-sub';
    sub.textContent = secondary;
    el.appendChild(sub);
  }
}

function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function webOrigin(url) {
  if (!isWebUrl(url)) return '';
  try {
    return new URL(url).origin;
  } catch (e) {
    return '';
  }
}

/** Palette "Frame Cloud: Sign in": open on Account and start the flow. */
function signIn() {
  if (!overlay) return;
  overlay.open();
  if (accountSection) accountSection.scrollIntoView({ block: 'start' });
  invokeAccount(IPC.CLOUD_SIGN_IN);
}

/** Palette "Frame Cloud: Sign out": no modal. */
function signOut() {
  return invokeAccount(IPC.CLOUD_SIGN_OUT);
}

// ─── About ────────────────────────────────────────────────

function initAboutSection() {
  // Version text from package.json
  try {
    const pkgVersion = require('../../package.json').version;
    if (aboutVersionEl) aboutVersionEl.textContent = `v${pkgVersion}`;
  } catch (e) { /* ignore */ }

  if (aboutCheckBtn) {
    aboutCheckBtn.addEventListener('click', () => {
      runCheck(true);
    });
  }

  // Diagnostics: reveal the rotating (redacted) log file — the first thing
  // to grab when filing a bug report. Location documented in PRIVACY.md.
  const openLogsBtn = document.getElementById('settings-open-logs');
  if (openLogsBtn) {
    openLogsBtn.addEventListener('click', async () => {
      try {
        const info = await ipcRenderer.invoke(IPC.GET_LOG_INFO);
        if (info && info.logPath) shell.showItemInFolder(info.logPath);
        else if (info && info.logsDir) shell.openPath(info.logsDir);
      } catch (err) {
        console.error('Settings: could not open logs folder', err);
      }
    });
  }

  if (updateLinkEl) {
    updateLinkEl.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentUpdateInfo && currentUpdateInfo.releaseUrl) {
        shell.openExternal(currentUpdateInfo.releaseUrl);
      }
    });
  }

  if (updateDismissBtn) {
    updateDismissBtn.addEventListener('click', async () => {
      if (!currentUpdateInfo) return;
      await ipcRenderer.invoke(
        IPC.SET_USER_SETTING,
        DISMISSED_VERSION_KEY,
        currentUpdateInfo.latestVersion
      );
      // Hide the banner immediately; sidebar dot is also gated by this flag.
      hideUpdateBanner();
      hideSidebarDot();
    });
  }

  // Hydrate from main's cached status (no extra network call)
  ipcRenderer
    .invoke(IPC.GET_UPDATE_STATUS)
    .then((status) => {
      if (!status) return;
      if (status.result) {
        currentUpdateInfo = status.result;
        renderUpdateState({
          checked: !!status.lastCheckedAt,
          found: true,
          info: status.result,
          checkedAt: status.lastCheckedAt
        });
      } else if (status.lastStatus === 'error') {
        renderUpdateState({
          checked: true,
          failed: true,
          failReason: status.lastErrorReason,
          checkedAt: status.lastCheckedAt
        });
      } else if (status.lastCheckedAt) {
        renderUpdateState({
          checked: true,
          found: false,
          checkedAt: status.lastCheckedAt
        });
      } else {
        // Not yet checked since launch — fire one to populate
        runCheck(false);
      }
    })
    .catch(() => {});
}

async function runCheck(userInitiated) {
  if (aboutStatusEl) aboutStatusEl.textContent = 'Checking…';
  if (aboutCheckBtn) aboutCheckBtn.disabled = true;
  try {
    // Discriminated result: 'update-available' | 'up-to-date' | 'error'.
    // A failed check must never render as "you're up to date".
    const res = await ipcRenderer.invoke(IPC.CHECK_FOR_UPDATE);
    if (res && res.status === 'update-available') {
      currentUpdateInfo = res.info;
      renderUpdateState({
        checked: true,
        found: true,
        info: res.info,
        checkedAt: res.checkedAt,
        userInitiated
      });
    } else if (res && res.status === 'error') {
      renderUpdateState({
        checked: true,
        failed: true,
        failReason: res.reason,
        checkedAt: res.checkedAt,
        userInitiated
      });
    } else {
      renderUpdateState({
        checked: true,
        found: false,
        checkedAt: res ? res.checkedAt : null,
        userInitiated
      });
    }
  } catch (err) {
    if (aboutStatusEl) aboutStatusEl.textContent = 'Could not check for updates.';
  } finally {
    if (aboutCheckBtn) aboutCheckBtn.disabled = false;
  }
}

function renderUpdateState({ checked, found, failed, failReason, info, checkedAt, userInitiated }) {
  if (!aboutStatusEl) return;
  const stamp = checkedAt ? formatRelative(new Date(checkedAt)) : '';
  if (found && info) {
    aboutStatusEl.textContent = stamp ? `Last checked ${stamp}.` : '';
    showUpdateBanner(info);
  } else if (failed) {
    const why = failReason === 'timeout'
      ? 'timed out'
      : failReason === 'parse'
        ? 'unexpected response'
        : 'network error';
    aboutStatusEl.textContent = `Update check failed (${why}) — you may not be on the latest version.`;
    hideUpdateBanner();
  } else if (checked) {
    aboutStatusEl.textContent = stamp
      ? `You're up to date. Last checked ${stamp}.`
      : "You're up to date.";
    hideUpdateBanner();
  } else {
    aboutStatusEl.textContent = 'Not checked yet.';
  }
}

function showUpdateBanner(info) {
  if (!updateBanner) return;
  updateBanner.style.display = '';
  if (updateLatestEl) updateLatestEl.textContent = `v${info.latestVersion}`;
  if (updateReleasedEl) {
    const released = info.publishedAt ? formatRelative(new Date(info.publishedAt)) : '';
    updateReleasedEl.textContent = released ? `— Released ${released}` : '';
  }
  if (updateLinkEl) updateLinkEl.setAttribute('href', info.releaseUrl || '#');
}

function hideUpdateBanner() {
  if (updateBanner) updateBanner.style.display = 'none';
}

function hideSidebarDot() {
  // The header's pulsing dot is gone (2026-09-14); only the banner remains.
  const banner = document.getElementById('sidebar-update-banner');
  if (banner) banner.style.display = 'none';
}

function formatRelative(date) {
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function syncToggleFromSettings() {
  if (!toggleEl) return;
  const value = await ipcRenderer.invoke(IPC.GET_USER_SETTING, TELEMETRY_KEY);
  // Default ON when unset (opt-out semantics)
  toggleEl.checked = value !== false;

  if (crashDumpsToggleEl) {
    const dumps = await ipcRenderer.invoke(IPC.GET_USER_SETTING, CRASH_DUMPS_KEY);
    // Default ON when unset (local-only; nothing is uploaded)
    crashDumpsToggleEl.checked = dumps !== false;
  }
}

module.exports = {
  init,
  open: () => overlay && overlay.open(),
  close: () => overlay && overlay.close(),
  toggle: () => overlay && overlay.toggle(),
  signIn,
  signOut,
  accountState: () => accountState.state
};
