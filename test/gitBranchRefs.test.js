/**
 * gitBranchesManager's pure half (status-bar-branch-picker spec, D6 / D9).
 *
 * Pure by design: requiring it at the top must not reach electron, child
 * processes or the filesystem. Pinned: the six-field line parse (subject
 * with `|` inside), the remote-HEAD pointer shape, and `splitRemoteRef`
 * across one remote, two remotes, a remote named `a/b`, a branch named
 * `feat/x`, and a name no remote prefixes.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { BRANCH_FORMAT, parseBranchLine, splitRemoteRef } = require('../src/main/gitBranchRefs');

test('BRANCH_FORMAT has six fields with the subject last', () => {
  const fields = BRANCH_FORMAT.split('|');
  assert.equal(fields.length, 6);
  assert.equal(fields[4], '%(committerdate:unix)');
  assert.equal(fields[5], '%(subject)');
});

test('parseBranchLine reads a local branch', () => {
  const row = parseBranchLine('refs/heads/main|main|a1b2c3d|2 hours ago|1757760000|Initial commit');
  assert.deepEqual(row, {
    refname: 'refs/heads/main', name: 'main', commit: 'a1b2c3d', date: '2 hours ago',
    time: 1757760000, message: 'Initial commit', isRemote: false
  });
});

test('parseBranchLine reads a remote branch and keeps | inside the subject', () => {
  const row = parseBranchLine('refs/remotes/origin/feat|origin/feat|deadbee|3 days ago|1757500000|fix(a|b): pipe | in subject');
  assert.equal(row.isRemote, true);
  assert.equal(row.name, 'origin/feat');
  assert.equal(row.message, 'fix(a|b): pipe | in subject');
});

test('parseBranchLine tolerates missing fields and garbage', () => {
  assert.equal(parseBranchLine(''), null);
  assert.equal(parseBranchLine('   '), null);
  assert.equal(parseBranchLine(undefined), null);
  assert.equal(parseBranchLine('refs/heads/x|'), null);
  const row = parseBranchLine('refs/heads/x|x|||notanumber|');
  assert.equal(row.time, 0);
  assert.equal(row.commit, '');
  assert.equal(row.date, '');
  assert.equal(row.message, '');
});

test('parseBranchLine keeps the remote HEAD pointer identifiable by refname', () => {
  const row = parseBranchLine('refs/remotes/origin/HEAD|origin|a1b2c3d|now|1|x');
  assert.equal(row.refname.endsWith('/HEAD'), true);
  assert.equal(row.name, 'origin');
});

test('splitRemoteRef with one remote', () => {
  assert.deepEqual(splitRemoteRef('origin/main', ['origin']), { remote: 'origin', shortName: 'main' });
});

test('splitRemoteRef with two remotes picks the right one', () => {
  const remotes = ['origin', 'upstream'];
  assert.deepEqual(splitRemoteRef('upstream/baz', remotes), { remote: 'upstream', shortName: 'baz' });
  assert.deepEqual(splitRemoteRef('origin/baz', remotes), { remote: 'origin', shortName: 'baz' });
});

test('splitRemoteRef prefers the longest matching remote', () => {
  const remotes = ['a', 'a/b'];
  assert.deepEqual(splitRemoteRef('a/b/feat', remotes), { remote: 'a/b', shortName: 'feat' });
  assert.deepEqual(splitRemoteRef('a/feat', remotes), { remote: 'a', shortName: 'feat' });
});

test('splitRemoteRef keeps slashes inside the branch name', () => {
  assert.deepEqual(splitRemoteRef('origin/feat/x', ['origin']), { remote: 'origin', shortName: 'feat/x' });
});

test('splitRemoteRef returns null when no remote prefixes the name', () => {
  assert.equal(splitRemoteRef('main', ['origin']), null);
  assert.equal(splitRemoteRef('originx/main', ['origin']), null);
  assert.equal(splitRemoteRef('origin/', ['origin']), null);
  assert.equal(splitRemoteRef('origin/main', []), null);
  assert.equal(splitRemoteRef(undefined, ['origin']), null);
  assert.equal(splitRemoteRef('origin/main', undefined), null);
});
