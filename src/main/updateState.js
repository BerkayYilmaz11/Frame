/**
 * Update State Module
 *
 * The pure half of the update checker: version comparison, the mapping
 * from electron-updater's UpdateInfo to the `info` shape the renderer
 * already reads, and the mapping from an updater error to the reasons the
 * About panel knows how to word. No electron require, so it is testable
 * without the app (in-app-auto-update spec).
 */

const REPO_OWNER = 'kaanozhan';
const REPO_NAME = 'Frame';

const NETWORK_CODES = new Set([
  'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'
]);
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT']);
// A release without (or with a malformed) latest-mac.yml surfaces as one of
// these — the check reached GitHub but could not read what it found.
const PARSE_CODES = new Set([
  'ERR_UPDATER_INVALID_UPDATE_INFO',
  'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
  'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
  'ERR_UPDATER_NO_PUBLISHED_VERSIONS'
]);

/**
 * Compare semver: returns true if latest > current
 */
function isNewerVersion(current, latest) {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function releaseUrlFor(version) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${version}`;
}

/**
 * electron-updater's release notes are a string, an array of
 * { version, note } (when it collects notes across versions), or absent.
 */
function notesText(releaseNotes) {
  if (!releaseNotes) return '';
  if (typeof releaseNotes === 'string') return releaseNotes;
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((n) => (n && typeof n.note === 'string' ? n.note : ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

/**
 * UpdateInfo → the `info` shape updateChecker has always sent:
 * { currentVersion, latestVersion, releaseUrl, releaseName, publishedAt,
 *   releaseNotes }
 */
function toInfo(updateInfo, currentVersion) {
  const version = String((updateInfo && updateInfo.version) || '').replace(/^v/, '');
  return {
    currentVersion,
    latestVersion: version,
    releaseUrl: releaseUrlFor(version),
    releaseName: (updateInfo && updateInfo.releaseName) || `v${version}`,
    publishedAt: (updateInfo && updateInfo.releaseDate) || null,
    releaseNotes: notesText(updateInfo && updateInfo.releaseNotes)
  };
}

/**
 * Updater error → 'network' | 'timeout' | 'parse' | 'download'.
 * Chromium net errors arrive as messages ("net::ERR_TIMED_OUT"), Node's as
 * codes, electron-updater's own as ERR_UPDATER_* codes.
 */
function errorReason(err) {
  const code = (err && err.code) || '';
  const message = String((err && err.message) || '');
  const name = (err && err.name) || '';

  if (TIMEOUT_CODES.has(code) || message.includes('net::ERR_TIMED_OUT')) return 'timeout';
  if (NETWORK_CODES.has(code) || message.includes('net::ERR_')) return 'network';
  if (PARSE_CODES.has(code) || name === 'YAMLException' || err instanceof SyntaxError) return 'parse';
  return 'download';
}

module.exports = { isNewerVersion, toInfo, errorReason, releaseUrlFor };
