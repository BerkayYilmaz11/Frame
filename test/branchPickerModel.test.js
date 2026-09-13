/**
 * The status bar branch picker's list model (status-bar-branch-picker spec,
 * D4 / C12).
 *
 * Pure by design: requiring it at the top must not reach `electron`,
 * `lucide` or the DOM. Pinned: local/remote grouping, a remote hidden by
 * its local twin, current-first-then-recency ordering, the case-insensitive
 * substring filter, worktree disabling (other path disables, own path does
 * not, trailing slashes and backslashes normalised), the create row's four
 * states, the `empty` flag, and keyboard movement that skips disabled rows
 * and wraps.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRows, worktreeFor, flatten, moveHighlight, initialHighlight
} = require('../src/renderer/statusBar/branchPickerModel');

const PROJECT = '/home/u/proj';

function branch(name, extra = {}) {
  return { name, commit: 'abc', date: 'x ago', message: '', isRemote: false, isCurrent: false, time: 0, ...extra };
}
function remote(name, shortName, extra = {}) {
  return branch(name, { isRemote: true, remote: name.split('/')[0], shortName, ...extra });
}

const BASE = {
  branches: [
    branch('main', { time: 100 }),
    branch('feat/x', { time: 300 }),
    branch('old', { time: 50 }),
    remote('origin/main', 'main', { time: 100 }),
    remote('origin/feat/x', 'feat/x', { time: 300 }),
    remote('origin/bar', 'bar', { time: 200 }),
    remote('upstream/baz', 'baz', { time: 400 })
  ],
  currentBranch: 'main',
  worktrees: [{ path: PROJECT, branch: 'main', isMain: true }],
  projectPath: PROJECT,
  filter: ''
};

test('groups local and remote, hiding remotes with a local twin', () => {
  const out = buildRows(BASE);
  assert.deepEqual(out.local.map((r) => r.name), ['main', 'feat/x', 'old']);
  assert.deepEqual(out.remote.map((r) => r.name), ['upstream/baz', 'origin/bar']);
  assert.equal(out.empty, false);
});

test('current branch is pinned first, then most recent commit, ties by name', () => {
  const out = buildRows({
    ...BASE,
    branches: [branch('b', { time: 5 }), branch('a', { time: 5 }), branch('cur', { time: 1 }), branch('new', { time: 9 })],
    currentBranch: 'cur'
  });
  assert.deepEqual(out.local.map((r) => r.name), ['cur', 'new', 'a', 'b']);
  assert.equal(out.local[0].current, true);
  assert.equal(out.local[1].current, false);
});

test('detached HEAD marks nothing current', () => {
  const out = buildRows({ ...BASE, currentBranch: '' });
  assert.equal(out.local.some((r) => r.current), false);
});

test('a remote row without a shortName is kept rather than guessed away', () => {
  const out = buildRows({ ...BASE, branches: [branch('main'), remote('weird/main', undefined)] });
  assert.deepEqual(out.remote.map((r) => r.name), ['weird/main']);
  assert.equal(out.remote[0].shortName, 'weird/main');
});

test('filter is a case-insensitive substring on the full name', () => {
  const out = buildRows({ ...BASE, filter: 'FEAT' });
  assert.deepEqual(out.local.map((r) => r.name), ['feat/x']);
  assert.deepEqual(out.remote.map((r) => r.name), []);
  const out2 = buildRows({ ...BASE, filter: 'stream' });
  assert.deepEqual(out2.remote.map((r) => r.name), ['upstream/baz']);
  assert.equal(out2.local.length, 0);
});

test('filter that matches nothing sets empty and leaves the create row', () => {
  const out = buildRows({ ...BASE, filter: 'zzz' });
  assert.equal(out.empty, true);
  assert.equal(out.create.hidden, false);
  assert.equal(out.create.valid, true);
  assert.equal(out.create.name, 'zzz');
});

test('worktreeFor: another path disables, the project path does not, paths normalise', () => {
  const wts = [
    { path: PROJECT + '/', branch: 'main' },
    { path: '/home/u/proj/.frame/worktrees/slug/', branch: 'frame/slug/work' },
    { path: 'C:\\repo\\wt', branch: 'win' }
  ];
  assert.equal(worktreeFor('main', wts, PROJECT), null);
  assert.deepEqual(worktreeFor('frame/slug/work', wts, PROJECT), {
    path: '/home/u/proj/.frame/worktrees/slug/', branch: 'frame/slug/work'
  });
  assert.equal(worktreeFor('win', wts, 'C:/repo/wt/'), null);
  assert.notEqual(worktreeFor('win', wts, 'C:/repo/other'), null);
  assert.equal(worktreeFor('nope', wts, PROJECT), null);
  assert.equal(worktreeFor('main', undefined, PROJECT), null);
});

test('local rows in another worktree are disabled with the folder named', () => {
  const out = buildRows({
    ...BASE,
    branches: [branch('main'), branch('frame/slug/work')],
    worktrees: [
      { path: PROJECT, branch: 'main' },
      { path: PROJECT + '/.frame/worktrees/slug', branch: 'frame/slug/work' }
    ]
  });
  const row = out.local.find((r) => r.name === 'frame/slug/work');
  assert.equal(row.disabledReason, 'in worktree slug');
  assert.equal(out.local.find((r) => r.name === 'main').disabledReason, null);
});

test('create row: empty filter is present but invalid with a hint', () => {
  const out = buildRows(BASE);
  assert.deepEqual(out.create, { kind: 'create', name: '', valid: false, hidden: false, reason: 'Type a name' });
});

test('create row: invalid name is present, invalid, with a reason', () => {
  const out = buildRows({ ...BASE, filter: 'bad name' });
  assert.equal(out.create.valid, false);
  assert.equal(out.create.hidden, false);
  assert.equal(out.create.reason, 'Invalid branch name');
});

test('create row: valid unmatched name is enabled', () => {
  const out = buildRows({ ...BASE, filter: '  new-feature ' });
  assert.deepEqual(out.create, { kind: 'create', name: 'new-feature', valid: true, hidden: false, reason: null });
});

test('create row: exact local match hides it', () => {
  const out = buildRows({ ...BASE, filter: 'main' });
  assert.equal(out.create.hidden, true);
  // but a remote-only exact match does not
  const out2 = buildRows({ ...BASE, filter: 'bar' });
  assert.equal(out2.create.hidden, false);
  assert.equal(out2.create.valid, true);
});

test('flatten walks create → local → remote → manage with enabled flags', () => {
  const out = buildRows({
    ...BASE,
    filter: 'x',
    branches: [branch('feat/x'), branch('wt/x'), remote('origin/rx', 'rx')],
    worktrees: [{ path: '/elsewhere', branch: 'wt/x' }]
  });
  const items = flatten(out);
  assert.deepEqual(items.map((i) => i.kind), ['create', 'local', 'local', 'remote', 'manage']);
  assert.deepEqual(items.map((i) => i.enabled), [true, true, false, true, true]);
});

test('flatten omits a hidden create row', () => {
  const items = flatten(buildRows({ ...BASE, filter: 'main' }));
  assert.equal(items[0].kind, 'local');
  assert.equal(items[items.length - 1].kind, 'manage');
});

test('moveHighlight skips disabled rows and wraps both ways', () => {
  const items = [
    { enabled: false }, { enabled: true }, { enabled: false }, { enabled: true }, { enabled: true }
  ];
  assert.equal(moveHighlight(items, -1, 1), 1);
  assert.equal(moveHighlight(items, 1, 1), 3);
  assert.equal(moveHighlight(items, 3, 1), 4);
  assert.equal(moveHighlight(items, 4, 1), 1);   // wrap forward past index 0 (disabled)
  assert.equal(moveHighlight(items, 1, -1), 4);  // wrap backward past index 0 (disabled)
  assert.equal(moveHighlight(items, -1, -1), 4);
  assert.equal(moveHighlight([{ enabled: false }], -1, 1), -1);
  assert.equal(moveHighlight([], 0, 1), -1);
});

test('initialHighlight prefers the current row, else the first enabled', () => {
  const items = flatten(buildRows(BASE));
  const idx = initialHighlight(items);
  assert.equal(items[idx].name, 'main');
  const items2 = flatten(buildRows({ ...BASE, currentBranch: '', filter: 'zzz' }));
  assert.equal(items2[initialHighlight(items2)].kind, 'create');
});

test('garbage input yields an empty, valid shape', () => {
  const out = buildRows(undefined);
  assert.deepEqual(out.local, []);
  assert.deepEqual(out.remote, []);
  assert.equal(out.empty, true);
  assert.equal(out.create.reason, 'Type a name');
});
