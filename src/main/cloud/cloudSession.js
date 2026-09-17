/**
 * cloudSession — the Electron shell around the Frame Cloud device flow.
 *
 * Holds no flow logic (that is deviceFlow.js). It builds the core's
 * dependencies from Electron — `net.fetch` for HTTP (system proxy and
 * certificate store), `shell.openExternal` for the browser, sessionStore for
 * persistence — owns the one public state object, and pushes it to the
 * renderer on every transition.
 *
 * The token lives in a module variable and never enters the state object:
 * the renderer runs with nodeIntegration, so the push payload is built by an
 * allowlist (toPublicState), not by deleting a field.
 *
 * Nothing here holds the app: startup() is fire-and-forget, every request has
 * a 15 s timeout, and quitting does not wait on an in-flight call.
 */

const os = require('os');
const { execFileSync } = require('child_process');
const { app, net, shell } = require('electron');
const { IPC } = require('../../shared/ipcChannels');
const userSettings = require('../userSettings');
const logger = require('../logger');
const sessionStore = require('./sessionStore');
const {
  resolveServerUrl,
  formatDeviceInfo,
  runSignIn,
  refreshSession,
  signOutDevice,
} = require('./deviceFlow');

// No FrameCloud is deployed yet: packaged builds resolve to nothing and the
// Account section stays hidden. Developers set FRAME_CLOUD_URL.
const DEFAULT_CLOUD_SERVER_URL = '';
const REQUEST_TIMEOUT_MS = 15000;

const PUBLIC_KEYS = [
  'state',
  'ephemeral',
  'serverUrl',
  'userCode',
  'verificationUrl',
  'user',
  'workspace',
  'device',
  'reason',
  'serverUnreachable',
];

let mainWindow = null;
let state = { state: 'unavailable' };
let token = null;
let attempt = null; // AbortController of the running sign-in
let refreshing = null;
let started = false;

// ─── Dependencies for the core ────────────────────────────────

function resolveUrl() {
  return resolveServerUrl({
    env: process.env.FRAME_CLOUD_URL,
    setting: userSettings.get('cloudServerUrl'),
    defaultUrl: DEFAULT_CLOUD_SERVER_URL,
  });
}

/**
 * `net.fetch` → `{ status, body }`. A timeout rejects with a plain Error so
 * the core reads it as a network failure, not as the user cancelling.
 */
async function fetchJson(url, { method = 'GET', body, token: bearer, signal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  try {
    const res = await net.fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  } catch (err) {
    if (timedOut) throw new Error('Frame Cloud request timed out');
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const abortError = () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return err;
    };
    if (signal && signal.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function openUrl(url) {
  // The URL comes from the server; only hand web addresses to the OS.
  if (!/^https?:\/\//i.test(url || '')) return;
  shell.openExternal(url).catch(() => {
    /* the URL stays on screen with a Copy button */
  });
}

// The name the user gave this machine. On macOS `os.hostname()` is often a
// DHCP address, while ComputerName is what System Settings shows ("MacBook
// Pro"); LocalHostName is the Bonjour fallback. Read once, then cached.
let computerName = null;

function readComputerName() {
  if (computerName !== null) return computerName;
  computerName = '';
  if (process.platform !== 'darwin') return computerName;
  for (const key of ['ComputerName', 'LocalHostName']) {
    try {
      const value = execFileSync('/usr/sbin/scutil', ['--get', key], {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (value) {
        computerName = value;
        break;
      }
    } catch {
      /* not set — try the next one, then the hostname */
    }
  }
  return computerName;
}

function deviceInfo() {
  return formatDeviceInfo({
    computerName: readComputerName(),
    hostname: os.hostname(),
    platform: process.platform,
    release: os.release(),
    appVersion: app.getVersion(),
  });
}

// ─── Public state ─────────────────────────────────────────────

function toPublicState() {
  const out = {};
  for (const key of PUBLIC_KEYS) {
    if (state[key] !== undefined) out[key] = state[key];
  }
  return out;
}

function getPublicState() {
  return toPublicState();
}

function publish() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC.CLOUD_SESSION_STATE, toPublicState());
}

function setState(next) {
  state = next;
  publish();
}

function signedInState(serverUrl, session, ephemeral) {
  return {
    state: 'signedIn',
    serverUrl,
    ephemeral: Boolean(ephemeral),
    user: session.user,
    workspace: session.workspace,
    device: session.device,
  };
}

// Device flow has no redirect back to the app, so a completed sign-in is what
// brings Frame to the front. macOS will not hand focus over from the browser
// to a plain focus(); `steal` makes Frame the active app.
function bringToFront() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === 'darwin') app.focus({ steal: true });
}

function abortAttempt() {
  if (!attempt) return;
  attempt.abort();
  attempt = null;
}

// ─── Actions ──────────────────────────────────────────────────

/** Start a sign-in. Resolves when the attempt ends; callers need not wait. */
async function signIn() {
  if (state.state === 'signedIn') return getPublicState();
  abortAttempt();
  started = true; // a later getState() must not reload over this attempt

  const serverUrl = resolveUrl();
  if (!serverUrl) {
    setState({ state: 'unavailable' });
    return getPublicState();
  }

  const controller = new AbortController();
  attempt = controller;
  let verificationUrl;
  setState({ state: 'requestingCode', serverUrl });

  const result = await runSignIn({
    api: serverUrl,
    fetchJson,
    sleep,
    now: Date.now,
    signal: controller.signal,
    openUrl,
    deviceInfo: deviceInfo(),
    onState: (patch) => {
      if (attempt !== controller) return;
      if (patch.verificationUrl) verificationUrl = patch.verificationUrl;
      setState({ ...patch, serverUrl });
    },
  });

  // Cancelled or superseded: whoever took over has already set the state.
  if (attempt !== controller) return getPublicState();
  attempt = null;

  if (result.ok) {
    token = result.token;
    const { ephemeral } = sessionStore.save({ serverUrl, token, ...result.session });
    setState(signedInState(serverUrl, result.session, ephemeral));
    bringToFront();
    // register does not describe the device; me does.
    refresh();
  } else if (result.reason === 'cancelled') {
    setState({ state: 'signedOut', serverUrl });
  } else {
    logger.info('cloudSession', `sign-in ended: ${result.reason}`);
    setState({ state: 'failed', serverUrl, reason: result.reason, verificationUrl });
  }
  return getPublicState();
}

function cancel() {
  if (!attempt) return getPublicState();
  abortAttempt();
  setState({ state: 'signedOut', serverUrl: state.serverUrl });
  return getPublicState();
}

/** One silent device.me. A dead token signs out quietly; an unreachable server keeps the last data. */
function refresh() {
  if (state.state !== 'signedIn' || !token) return Promise.resolve(getPublicState());
  if (refreshing) return refreshing;

  const current = token;
  const serverUrl = state.serverUrl;
  refreshing = (async () => {
    const result = await refreshSession({ api: serverUrl, token: current, deviceInfo: deviceInfo(), fetchJson });
    if (token !== current) return; // signed out meanwhile
    if (result.ok) {
      const { ephemeral } = sessionStore.save({ serverUrl, token: current, ...result.session });
      setState(signedInState(serverUrl, result.session, ephemeral));
    } else if (result.reason === 'unauthorized') {
      logger.info('cloudSession', 'session no longer valid — signed out');
      token = null;
      sessionStore.clear();
      setState({ state: 'signedOut', serverUrl });
    } else if (result.reason === 'network') {
      setState({ ...state, serverUnreachable: true });
    }
  })()
    .catch(() => {})
    .then(() => {
      refreshing = null;
      return getPublicState();
    });
  return refreshing;
}

/** Tell the server, then forget the session locally whatever it said. */
async function signOut() {
  abortAttempt();
  const current = token;
  const serverUrl = state.serverUrl || resolveUrl();
  token = null;

  let serverUnreachable = false;
  if (current && serverUrl) {
    try {
      await signOutDevice({ api: serverUrl, token: current, fetchJson });
    } catch (err) {
      serverUnreachable = err.kind === 'network' || err.kind === 'rate_limited';
    }
  }
  sessionStore.clear();
  const next = { state: 'signedOut', serverUrl };
  if (serverUnreachable) next.serverUnreachable = true;
  setState(serverUrl ? next : { state: 'unavailable' });
  return getPublicState();
}

/**
 * Launch: show the stored session at once, then refresh it in the background.
 * Runs once — the renderer's first CLOUD_GET_STATE may already have done it.
 */
function startup() {
  if (!started) loadSession();
}

function loadSession() {
  started = true;
  abortAttempt();
  const serverUrl = resolveUrl();
  if (!serverUrl) {
    token = null;
    setState({ state: 'unavailable' });
    return;
  }
  const stored = sessionStore.load(serverUrl);
  if (!stored) {
    token = null;
    setState({ state: 'signedOut', serverUrl });
    return;
  }
  token = stored.token;
  setState(signedInState(serverUrl, stored, stored.ephemeral));
  refresh();
}

/** The current state, re-resolving first if the server address changed underneath. */
function getState() {
  if (!started || (!attempt && resolveUrl() !== (state.serverUrl || ''))) loadSession();
  return getPublicState();
}

// ─── Wiring ───────────────────────────────────────────────────

function init(window) {
  mainWindow = window;
}

function setupIPC(ipcMain) {
  ipcMain.handle(IPC.CLOUD_SIGN_IN, () => {
    // The attempt can wait minutes for the browser; the renderer follows pushes.
    signIn().catch((err) => logger.error('cloudSession', 'sign-in crashed', err));
    return getPublicState();
  });
  ipcMain.handle(IPC.CLOUD_CANCEL_SIGN_IN, () => cancel());
  ipcMain.handle(IPC.CLOUD_SIGN_OUT, () => signOut());
  ipcMain.handle(IPC.CLOUD_GET_STATE, () => getState());
  ipcMain.handle(IPC.CLOUD_REFRESH, () => refresh());
}

module.exports = {
  init,
  setupIPC,
  startup,
  signIn,
  cancel,
  refresh,
  signOut,
  getState,
  getPublicState,
  toPublicState,
};
