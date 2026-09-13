/**
 * The GitHub panel's access resolver (github-view-tree-layout spec, G3 / D6).
 *
 * Pure by design — no `electron`, no DOM. Pinned: the four states, which
 * sections each one makes available (git sections always; GitHub sections
 * only in `ok`), and the copy that carries the user forward.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { STATES, stateOf, availabilityOf, resolve, isAvailable } =
  require('../src/renderer/github/accessState');

test('STATES lists the four states', () => {
  assert.deepEqual(STATES, ['no-gh', 'no-auth', 'no-remote', 'ok']);
});

// ─── stateOf ──────────────────────────────────────────────

test('stateOf: gh missing → no-gh, regardless of the rest', () => {
  assert.equal(stateOf({ gh: false, authed: true, repoName: 'a/b' }), 'no-gh');
  assert.equal(stateOf({}), 'no-gh');
  assert.equal(stateOf(null), 'no-gh');
  assert.equal(stateOf('nope'), 'no-gh');
});

test('stateOf: gh present but not signed in → no-auth', () => {
  assert.equal(stateOf({ gh: true, authed: false, repoName: 'a/b' }), 'no-auth');
  assert.equal(stateOf({ gh: true }), 'no-auth');
});

test('stateOf: signed in without a GitHub remote → no-remote', () => {
  assert.equal(stateOf({ gh: true, authed: true, repoName: null }), 'no-remote');
  assert.equal(stateOf({ gh: true, authed: true, repoName: '' }), 'no-remote');
  assert.equal(stateOf({ gh: true, authed: true, repoName: '   ' }), 'no-remote');
});

test('stateOf: everything in place → ok', () => {
  assert.equal(stateOf({ gh: true, authed: true, repoName: 'denizmrtoglu/Frame' }), 'ok');
});

// ─── availability ─────────────────────────────────────────

test('availabilityOf: git sections in every state, GitHub sections only in ok', () => {
  for (const s of ['no-gh', 'no-auth', 'no-remote']) {
    assert.deepEqual(availabilityOf(s), { prs: false, issues: false, branches: true, worktrees: true }, s);
  }
  assert.deepEqual(availabilityOf('ok'), { prs: true, issues: true, branches: true, worktrees: true });
});

// ─── resolve ──────────────────────────────────────────────

test('resolve: ok carries the repo name and no copy', () => {
  const r = resolve({ gh: true, authed: true, repoName: ' owner/repo ' });
  assert.equal(r.state, 'ok');
  assert.equal(r.repoName, 'owner/repo');
  assert.equal(r.copy, null);
  assert.equal(isAvailable(r, 'prs'), true);
  assert.equal(isAvailable(r, 'issues'), true);
});

test('resolve: no-gh offers the install link', () => {
  const r = resolve({ gh: false });
  assert.equal(r.state, 'no-gh');
  assert.equal(r.repoName, null);
  assert.equal(r.copy.action, 'install');
  assert.equal(r.copy.actionUrl, 'https://cli.github.com/');
  assert.match(r.copy.title, /GitHub CLI/);
  assert.equal(isAvailable(r, 'prs'), false);
  assert.equal(isAvailable(r, 'branches'), true);
});

test('resolve: no-auth offers Sign in and says to refresh when done', () => {
  const r = resolve({ gh: true, authed: false });
  assert.equal(r.state, 'no-auth');
  assert.equal(r.copy.action, 'signin');
  assert.equal(r.copy.actionLabel, 'Sign in to GitHub');
  assert.match(r.copy.message, /Refresh when done/);
  assert.equal(isAvailable(r, 'issues'), false);
  assert.equal(isAvailable(r, 'worktrees'), true);
});

test('resolve: no-remote is a note with no action; a main-side error is appended', () => {
  const r = resolve({ gh: true, authed: true, repoName: null });
  assert.equal(r.state, 'no-remote');
  assert.equal(r.copy.action, null);
  assert.match(r.copy.title, /Not a GitHub remote/);
  assert.doesNotMatch(r.copy.message, /\(/);

  const withErr = resolve({ gh: true, authed: true, repoName: null, error: 'timed out' });
  assert.match(withErr.copy.message, /\(timed out\)$/);
});

test('resolve: copy is a fresh object each call', () => {
  const a = resolve({ gh: false });
  a.copy.title = 'changed';
  assert.notEqual(resolve({ gh: false }).copy.title, 'changed');
});

test('isAvailable: tolerates a missing resolution', () => {
  assert.equal(isAvailable(null, 'prs'), false);
  assert.equal(isAvailable({}, 'prs'), false);
});
