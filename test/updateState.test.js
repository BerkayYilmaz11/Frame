/**
 * Update state — the pure half of the update checker.
 *
 * What these protect: the renderer keeps receiving the same `info` shape
 * whether the check came from electron-updater or the GitHub API, and a
 * failed check is always worded as a failure the About panel understands.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isNewerVersion, toInfo, errorReason } = require('../src/main/updateState');

// ─── isNewerVersion ─────────────────────────────────────────

test('a higher major, minor or patch is newer', () => {
  assert.equal(isNewerVersion('2.8.2', '3.0.0'), true);
  assert.equal(isNewerVersion('2.8.2', '2.9.0'), true);
  assert.equal(isNewerVersion('2.8.2', '2.8.3'), true);
});

test('the same or a lower version is not newer', () => {
  assert.equal(isNewerVersion('2.8.2', '2.8.2'), false);
  assert.equal(isNewerVersion('2.8.2', '2.8.1'), false);
  assert.equal(isNewerVersion('2.8.2', '1.99.99'), false);
});

test('missing segments count as zero', () => {
  assert.equal(isNewerVersion('2.8', '2.8.1'), true);
  assert.equal(isNewerVersion('2.8.0', '2.8'), false);
});

// ─── toInfo ─────────────────────────────────────────────────

test('UpdateInfo maps onto the info shape the renderer reads', () => {
  const info = toInfo({
    version: '2.9.0',
    releaseName: 'v2.9.0 — auto-update',
    releaseNotes: '## What\'s New\n- auto-update',
    releaseDate: '2026-10-10T10:00:00.000Z'
  }, '2.8.2');
  assert.deepEqual(info, {
    currentVersion: '2.8.2',
    latestVersion: '2.9.0',
    releaseUrl: 'https://github.com/kaanozhan/Frame/releases/tag/v2.9.0',
    releaseName: 'v2.9.0 — auto-update',
    publishedAt: '2026-10-10T10:00:00.000Z',
    releaseNotes: '## What\'s New\n- auto-update'
  });
});

test('array release notes are joined in order', () => {
  const info = toInfo({
    version: '2.9.0',
    releaseNotes: [{ version: '2.9.0', note: 'second' }, { version: '2.8.3', note: 'first' }, { version: '2.8.4', note: null }]
  }, '2.8.2');
  assert.equal(info.releaseNotes, 'second\n\nfirst');
});

test('missing fields fall back instead of leaking undefined', () => {
  const info = toInfo({ version: 'v2.9.0' }, '2.8.2');
  assert.equal(info.latestVersion, '2.9.0');
  assert.equal(info.releaseName, 'v2.9.0');
  assert.equal(info.publishedAt, null);
  assert.equal(info.releaseNotes, '');
});

// ─── errorReason ────────────────────────────────────────────

test('Node network codes and Chromium net errors are network failures', () => {
  assert.equal(errorReason(Object.assign(new Error('x'), { code: 'ENOTFOUND' })), 'network');
  assert.equal(errorReason(Object.assign(new Error('x'), { code: 'ECONNRESET' })), 'network');
  assert.equal(errorReason(new Error('net::ERR_INTERNET_DISCONNECTED')), 'network');
});

test('timeouts are told apart from other network failures', () => {
  assert.equal(errorReason(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })), 'timeout');
  assert.equal(errorReason(new Error('net::ERR_TIMED_OUT')), 'timeout');
});

test('an unreadable or missing latest-mac.yml is a parse failure', () => {
  assert.equal(errorReason(Object.assign(new Error('x'), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' })), 'parse');
  assert.equal(errorReason(Object.assign(new Error('x'), { code: 'ERR_UPDATER_INVALID_UPDATE_INFO' })), 'parse');
  assert.equal(errorReason(Object.assign(new Error('bad yaml'), { name: 'YAMLException' })), 'parse');
  assert.equal(errorReason(new SyntaxError('Unexpected token')), 'parse');
});

test('anything else is a download failure, and no input throws', () => {
  assert.equal(errorReason(new Error('sha512 checksum mismatch')), 'download');
  assert.equal(errorReason(null), 'download');
  assert.equal(errorReason(undefined), 'download');
  assert.equal(errorReason('a string'), 'download');
});
