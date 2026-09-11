/**
 * envPath tests.
 *
 * The bug this module exists for is invisible in development — `npm start`
 * inherits the developer's shell PATH, so every child process works and the
 * failure only appears in a packaged app launched from Finder. These tests
 * therefore pin the behaviour that cannot be observed by running the app:
 * that a resolved PATH wins, that a failing probe degrades to the status quo
 * instead of to an empty PATH, and that the shell is consulted exactly once.
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const envPath = require('../src/main/envPath');

const REAL_PATH = process.env.PATH;

beforeEach(() => {
  process.env.PATH = REAL_PATH;
  envPath.__setProbeForTests(null);
});

test('mergePath puts the login shell PATH first and keeps what we already had', () => {
  assert.equal(
    envPath.mergePath('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin'),
    '/opt/homebrew/bin:/usr/bin:/bin'
  );
});

test('mergePath drops duplicates and empty segments', () => {
  assert.equal(
    envPath.mergePath('/a::/b:/a', '/b:/c:'),
    '/a:/b:/c'
  );
});

test('mergePath survives a missing side', () => {
  assert.equal(envPath.mergePath(null, '/usr/bin'), '/usr/bin');
  assert.equal(envPath.mergePath('/usr/bin', null), '/usr/bin');
  assert.equal(envPath.mergePath(null, null), '');
});

test('the launchd PATH gains the Homebrew bin the login shell reports', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX-only path repair');

  process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
  envPath.__setProbeForTests(async () => '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');

  const resolved = await envPath.resolveLoginPath();
  assert.ok(resolved.split(':').includes('/opt/homebrew/bin'));
  assert.equal(resolved.split(':')[0], '/opt/homebrew/bin');
});

test('a failing probe degrades to the PATH we already had, never to empty', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX-only path repair');

  process.env.PATH = '/usr/bin:/bin';
  envPath.__setProbeForTests(async () => null);

  assert.equal(await envPath.resolveLoginPath(), '/usr/bin:/bin');
});

test('a throwing probe is caught, not propagated to the caller', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX-only path repair');

  process.env.PATH = '/usr/bin:/bin';
  envPath.__setProbeForTests(async () => { throw new Error('shell exploded'); });

  assert.equal(await envPath.resolveLoginPath(), '/usr/bin:/bin');
});

test('the shell is spawned once no matter how many callers ask', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX-only path repair');

  let calls = 0;
  envPath.__setProbeForTests(async () => { calls += 1; return '/opt/homebrew/bin'; });

  await Promise.all([
    envPath.resolveLoginPath(),
    envPath.resolveLoginPath(),
    envPath.childEnv(),
    envPath.childEnv()
  ]);

  assert.equal(calls, 1);
});

test('childEnv carries the rest of the environment through unchanged', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX-only path repair');

  process.env.PATH = '/usr/bin';
  process.env.FRAME_ENVPATH_FIXTURE = 'kept';
  envPath.__setProbeForTests(async () => '/opt/homebrew/bin');

  const env = await envPath.childEnv();
  assert.equal(env.FRAME_ENVPATH_FIXTURE, 'kept');
  assert.equal(env.PATH, '/opt/homebrew/bin:/usr/bin');

  delete process.env.FRAME_ENVPATH_FIXTURE;
});

test('childEnv overrides win over the resolved PATH', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX-only path repair');

  envPath.__setProbeForTests(async () => '/opt/homebrew/bin');
  const env = await envPath.childEnv({ PATH: '/only/this' });
  assert.equal(env.PATH, '/only/this');
});
