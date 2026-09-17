/**
 * sessionStore — where the Frame Cloud session lives between launches.
 *
 * One file, `userData/cloud-session.json`, written through fsSafe. The token
 * is `safeStorage.encryptString` output in base64; everything else is plain
 * JSON. When the OS offers no encryption (Linux without a keyring) nothing is
 * written: the session is kept in memory until quit and `save()` answers
 * `{ ephemeral: true }` so the Account section can say so.
 *
 * Log lines name the path and the outcome only — never the session.
 */

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const fsSafe = require('../fsSafe');
const logger = require('../logger');

const FILE_NAME = 'cloud-session.json';
const VERSION = 1;

let memory = null;

function sessionPath() {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function pickSession(source, token) {
  return {
    serverUrl: source.serverUrl,
    token,
    deviceId: source.deviceId,
    user: source.user,
    workspace: source.workspace,
    device: source.device,
    savedAt: source.savedAt,
  };
}

/**
 * The stored session for `serverUrl`, or null. A session saved for another
 * server, an unknown version or a token that no longer decrypts all count as
 * absent. Never throws.
 */
function load(serverUrl) {
  if (!serverUrl) return null;
  if (memory) {
    return memory.serverUrl === serverUrl ? { ...memory, ephemeral: true } : null;
  }
  const file = sessionPath();
  try {
    const { data, error } = fsSafe.readJsonWithRecovery(file);
    if (!data) {
      if (error) logger.warn('cloudSession', `unreadable session file ${file}`);
      return null;
    }
    if (data.version !== VERSION || data.serverUrl !== serverUrl || typeof data.token !== 'string') {
      return null;
    }
    if (!encryptionAvailable()) return null;
    const token = safeStorage.decryptString(Buffer.from(data.token, 'base64'));
    if (!token) return null;
    return { ...pickSession(data, token), ephemeral: false };
  } catch {
    logger.warn('cloudSession', `could not read the stored session at ${file}`);
    return null;
  }
}

/**
 * Persist `session` ({ serverUrl, token, deviceId, user, workspace, device }).
 * Returns `{ ephemeral }` — true when the session only lives in memory.
 */
function save(session) {
  const record = pickSession({ ...session, savedAt: new Date().toISOString() }, session.token);
  if (!encryptionAvailable()) {
    memory = record;
    logger.info('cloudSession', 'secure storage unavailable — session kept in memory only');
    return { ephemeral: true };
  }
  const file = sessionPath();
  try {
    const encrypted = safeStorage.encryptString(session.token).toString('base64');
    fsSafe.writeFileAtomic(file, JSON.stringify({ version: VERSION, ...record, token: encrypted }, null, 2));
    memory = null;
    return { ephemeral: false };
  } catch {
    memory = record;
    logger.warn('cloudSession', `could not write ${file} — session kept in memory only`);
    return { ephemeral: true };
  }
}

/** Forget the session: the file, its fsSafe backup and the memory copy. */
function clear() {
  memory = null;
  const file = sessionPath();
  for (const target of [file, `${file}.bak`, `${file}.tmp`]) {
    try {
      fs.unlinkSync(target);
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn('cloudSession', `could not delete ${target}`);
    }
  }
}

module.exports = { load, save, clear };
