/**
 * shellEnv: the main-process PATH is resolved once from the login shell,
 * with sentinel parsing, a timeout, and well-known fallback dirs so a
 * Finder-launched app finds gh on every machine — and a genuinely missing
 * CLI still reports as missing.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const shellEnv = require('../src/main/shellEnv');

const isWin = process.platform === 'win32';
let tmp;
const fakeShells = {};

// Fake login shells. Each receives `-ilc <command>` exactly like a real
// shell; the honest one runs the command under a controlled PATH, the
// others misbehave the way user rc files do.
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-shellenv-'));
  const write = (name, body) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
    fs.chmodSync(p, 0o755);
    fakeShells[name] = p;
  };
  // rc noise on stdout before and after the real command output
  write('honest.sh', [
    'echo "Welcome to my shell rc"',
    'echo "__FRAME_PATH_BEGIN__"',           // a stray marker printed by the rc — must not win
    'echo "garbage"',
    'export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"',
    'eval "$2"',
    'echo "trailing rc noise"',
  ].join('\n'));
  write('hang.sh', 'sleep 30');
  write('garbage.sh', 'echo "no sentinels here"; exit 0');
  write('failing.sh', 'echo "rc exploded" >&2; exit 1');
});

after(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ─── extractPath(): sentinel parsing ──────────────────────

test('extractPath pulls the value between the last sentinel pair', () => {
  const out = 'noise\n__FRAME_PATH_BEGIN__\nstale\n__FRAME_PATH_BEGIN__\n/a:/b\n__FRAME_PATH_END__\nmore';
  assert.equal(shellEnv.extractPath(out), '/a:/b');
});

test('extractPath returns null without a complete sentinel pair', () => {
  assert.equal(shellEnv.extractPath('nothing here'), null);
  assert.equal(shellEnv.extractPath('__FRAME_PATH_BEGIN__\n/a'), null);
  assert.equal(shellEnv.extractPath('__FRAME_PATH_BEGIN__\n\n__FRAME_PATH_END__'), null);
  assert.equal(shellEnv.extractPath(undefined), null);
});

test('probe command never contains the joined sentinel (set -x safety)', () => {
  assert.ok(!shellEnv.PROBE_COMMAND.includes('__FRAME_PATH_BEGIN__'));
  assert.ok(!shellEnv.PROBE_COMMAND.includes('__FRAME_PATH_END__'));
});

// ─── mergePaths(): order and de-dup ───────────────────────

test('mergePaths keeps login-shell entries first, then current, then fallback, de-duplicated', () => {
  const merged = shellEnv.mergePaths([
    ['/opt/homebrew/bin', '/usr/bin', '/bin'],
    ['/usr/bin', '/bin', '/usr/sbin'],
    ['/usr/local/bin', '/opt/homebrew/bin'],
  ], ':');
  assert.deepEqual(merged, ['/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/usr/local/bin']);
});

test('mergePaths de-dups case-insensitively on Windows', () => {
  const merged = shellEnv.mergePaths([['C:\\Tools'], ['c:\\tools', 'D:\\x']], ';');
  assert.deepEqual(merged, ['C:\\Tools', 'D:\\x']);
});

// ─── fallback dirs: filtered by existence ─────────────────

test('fallback candidates are platform-aware and only existing dirs are appended', async () => {
  const darwin = shellEnv.fallbackCandidates('darwin', '/Users/me');
  assert.ok(darwin.includes('/opt/homebrew/bin'));
  assert.ok(darwin.includes('/usr/local/bin'));
  assert.ok(darwin.includes('/Users/me/.local/bin'));
  assert.ok(!darwin.includes('/snap/bin'));

  const linux = shellEnv.fallbackCandidates('linux', '/home/me');
  assert.ok(linux.includes('/snap/bin'));
  assert.ok(!linux.includes('/opt/homebrew/bin'));

  const env = { PATH: '/usr/bin:/bin' };
  const res = await shellEnv.resolve({
    platform: 'darwin',
    env,
    home: '/Users/me',
    shell: fakeShells['garbage.sh'],
    existsSync: (p) => p === '/opt/homebrew/bin', // only one dir "exists"
    timeoutMs: 2000,
  });
  assert.equal(res.source, 'fallback');
  assert.equal(env.PATH, '/usr/bin:/bin:/opt/homebrew/bin');
});

// ─── resolve(): the real thing with fake shells ───────────

test('resolve takes PATH from the login shell despite rc noise and stray markers', { skip: isWin }, async () => {
  const env = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
  const res = await shellEnv.resolve({
    platform: 'darwin',
    env,
    home: '/nonexistent-home',
    shell: fakeShells['honest.sh'],
    existsSync: () => false,
    timeoutMs: 5000,
  });
  assert.equal(res.source, 'shell');
  assert.equal(env.PATH, '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  assert.equal(res.path, env.PATH);
});

test('resolve falls back when the shell prints garbage without sentinels', { skip: isWin }, async () => {
  const env = { PATH: '/usr/bin:/bin' };
  const res = await shellEnv.resolve({
    platform: 'darwin', env, home: '/nonexistent-home',
    shell: fakeShells['garbage.sh'], existsSync: () => false, timeoutMs: 2000,
  });
  assert.equal(res.source, 'fallback');
  assert.equal(env.PATH, '/usr/bin:/bin'); // untouched — nothing corrupt merged in
});

test('resolve falls back when the shell exits non-zero', { skip: isWin }, async () => {
  const env = { PATH: '/usr/bin:/bin' };
  const res = await shellEnv.resolve({
    platform: 'darwin', env, home: '/nonexistent-home',
    shell: fakeShells['failing.sh'], existsSync: () => false, timeoutMs: 2000,
  });
  assert.equal(res.source, 'fallback');
  assert.equal(env.PATH, '/usr/bin:/bin');
});

test('resolve does not block past the timeout when the rc file hangs', { skip: isWin }, async () => {
  const env = { PATH: '/usr/bin:/bin' };
  const started = Date.now();
  const res = await shellEnv.resolve({
    platform: 'darwin', env, home: '/nonexistent-home',
    shell: fakeShells['hang.sh'], existsSync: (p) => p === '/usr/local/bin', timeoutMs: 300,
  });
  const elapsed = Date.now() - started;
  assert.equal(res.source, 'timeout');
  assert.ok(elapsed < 3000, `took ${elapsed}ms`);
  assert.equal(env.PATH, '/usr/bin:/bin:/usr/local/bin'); // fallback still applied
});

test('resolve survives a shell that cannot be spawned', async () => {
  const env = { PATH: '/usr/bin' };
  const res = await shellEnv.resolve({
    platform: 'linux', env, home: '/nonexistent-home',
    shell: path.join(tmp, 'does-not-exist.sh'), existsSync: () => false, timeoutMs: 1000,
  });
  assert.equal(res.source, 'fallback');
  assert.equal(env.PATH, '/usr/bin');
});

test('resolve skips the shell probe on win32 and only appends existing fallback dirs', async () => {
  let spawned = false;
  const env = { Path: 'C:\\Windows\\system32;C:\\Windows', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', ProgramFiles: 'C:\\Program Files' };
  const res = await shellEnv.resolve({
    platform: 'win32', env, home: 'C:\\Users\\me',
    spawnFn: () => { spawned = true; throw new Error('must not spawn'); },
    existsSync: (p) => p === 'C:\\Program Files\\GitHub CLI',
  });
  assert.equal(spawned, false);
  assert.equal(res.source, 'skipped');
  assert.equal(env.Path, 'C:\\Windows\\system32;C:\\Windows;C:\\Program Files\\GitHub CLI');
});
