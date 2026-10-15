/**
 * The Tasks screen list model (tasks-list-view spec, T01 / S15).
 *
 * Pure by design: requiring it must not reach `electron` or the DOM.
 * Pinned: each scope's sections and the unknown-status fallback, spec tasks
 * hidden by default and, when revealed, listed in their status sections in
 * file order (T09), the completed window in `all` / `done` with `showOlder`
 * and window 0, the filter narrowing before counts, stable sort, and counts
 * that equal what each scope lists with and without the reveal (S10).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { SCOPES, SECTIONS, specSlugOf, isSpecTask, buildListModel } = require('../src/renderer/tasks/listModel');
const { DAY_MS } = require('../src/shared/doneWindow');

const NOW = Date.parse('2026-10-15T12:00:00Z');
const ago = (d) => new Date(NOW - d * DAY_MS).toISOString();

const task = (id, status, extra = {}) => ({ id, title: id, status, priority: 'medium', category: 'feature', ...extra });
const spec = (slug, n, status, extra = {}) =>
  task(`${slug}-T${n}`, status, { source: `spec:${slug}:T${n}`, ...extra });

// Interleaved on purpose so file order is observable everywhere.
function fixture() {
  return [
    task('p1', 'pending', { priority: 'low', category: 'refactor' }),
    spec('beta', '01', 'completed', { completedAt: ago(1) }),
    task('i1', 'in_progress'),
    task('c-old', 'completed', { completedAt: ago(20) }),
    spec('alpha', '01', 'pending'),
    task('p2', 'pending', { priority: 'high', category: 'bug' }),
    task('c-new', 'completed', { completedAt: ago(2) }),
    spec('beta', '02', 'in_progress'),
    task('odd', 'blocked'),
    spec('alpha', '02', 'completed', { completedAt: ago(30) }),
    task('p3', 'pending', { priority: 'high', category: 'feature' }),
    spec('alpha', '03', 'pending')
  ];
}

const ids = (list) => list.map(t => t.id);
const section = (m, id) => m.sections.find(s => s.id === id);
const listed = (m) => m.sections.reduce((n, s) => n + s.tasks.length, 0);

test('exports the three scopes and three sections', () => {
  assert.deepEqual(SCOPES, ['all', 'active', 'done']);
  assert.deepEqual(SECTIONS.map(s => s.id), ['in_progress', 'pending', 'completed']);
});

test('spec tasks are told apart by source, slug is the second field', () => {
  assert.equal(isSpecTask({ source: 'spec:alpha:T01' }), true);
  assert.equal(isSpecTask({ source: 'manual' }), false);
  assert.equal(isSpecTask({}), false);
  assert.equal(specSlugOf({ source: 'spec:alpha:T01' }), 'alpha');
  assert.equal(specSlugOf({ source: 'claude' }), null);
});

test('active (default scope): in progress first, then pending; no completed section', () => {
  const m = buildListModel({ tasks: fixture(), now: NOW });
  assert.equal(m.scope, 'active');
  assert.deepEqual(m.sections.map(s => s.id), ['in_progress', 'pending']);
  assert.deepEqual(ids(section(m, 'in_progress').tasks), ['i1']);
  assert.deepEqual(ids(section(m, 'pending').tasks), ['p1', 'p2', 'odd', 'p3']);
  assert.equal(m.olderCount, 0);
});

test('an unknown status counts as pending', () => {
  const m = buildListModel({ tasks: [task('x', 'weird'), task('y', undefined)], now: NOW });
  assert.deepEqual(ids(section(m, 'pending').tasks), ['x', 'y']);
  assert.equal(m.counts.active, 2);
});

test('done: completed only; all: the three sections', () => {
  const done = buildListModel({ tasks: fixture(), scope: 'done', now: NOW });
  assert.deepEqual(done.sections.map(s => s.id), ['completed']);
  assert.deepEqual(ids(section(done, 'completed').tasks), ['c-old', 'c-new']);

  const all = buildListModel({ tasks: fixture(), scope: 'all', now: NOW });
  assert.deepEqual(all.sections.map(s => s.id), ['in_progress', 'pending', 'completed']);
});

test('an unknown scope falls back to active', () => {
  const m = buildListModel({ tasks: fixture(), scope: 'nope', now: NOW });
  assert.equal(m.scope, 'active');
});

test('spec tasks are hidden by default: no section lists them', () => {
  for (const scope of SCOPES) {
    const m = buildListModel({ tasks: fixture(), scope, now: NOW });
    assert.equal(m.specGroups, undefined);
    for (const s of m.sections) assert.ok(s.tasks.every(t => !isSpecTask(t)), `${scope}/${s.id}`);
  }
});

test('revealed spec tasks join the section of their status, in file order with the others', () => {
  const m = buildListModel({ tasks: fixture(), scope: 'all', showSpecTasks: true, windowDays: 0, now: NOW });
  assert.deepEqual(m.sections.map(s => s.id), ['in_progress', 'pending', 'completed']);
  assert.deepEqual(ids(section(m, 'in_progress').tasks), ['i1', 'beta-T02']);
  assert.deepEqual(ids(section(m, 'pending').tasks), ['p1', 'alpha-T01', 'p2', 'odd', 'p3', 'alpha-T03']);
  assert.deepEqual(ids(section(m, 'completed').tasks), ['beta-T01', 'c-old', 'c-new', 'alpha-T02']);
});

test('revealed spec tasks follow the scope', () => {
  const active = buildListModel({ tasks: fixture(), showSpecTasks: true, now: NOW });
  assert.deepEqual(ids(section(active, 'in_progress').tasks), ['i1', 'beta-T02']);
  assert.deepEqual(ids(section(active, 'pending').tasks), ['p1', 'alpha-T01', 'p2', 'odd', 'p3', 'alpha-T03']);
  const done = buildListModel({ tasks: fixture(), scope: 'done', showSpecTasks: true, now: NOW });
  assert.deepEqual(ids(section(done, 'completed').tasks), ['beta-T01', 'c-old', 'c-new', 'alpha-T02']);
});

test('the completed window drops older tasks into olderCount in all and done', () => {
  for (const scope of ['all', 'done']) {
    const m = buildListModel({ tasks: fixture(), scope, windowDays: 7, now: NOW });
    assert.deepEqual(ids(section(m, 'completed').tasks), ['c-new'], scope);
    assert.equal(m.olderCount, 1, scope);
    assert.equal(m.counts.done, 1);
    assert.equal(m.counts.doneTotal, 2);
  }
});

test('active is never windowed and has no older tile', () => {
  const m = buildListModel({ tasks: fixture(), scope: 'active', windowDays: 7, now: NOW });
  assert.equal(m.olderCount, 0);
  assert.equal(section(m, 'pending').tasks.length, 4);
});

test('showOlder and window 0 both list every completed task', () => {
  const revealed = buildListModel({ tasks: fixture(), scope: 'done', windowDays: 7, showOlder: true, now: NOW });
  assert.deepEqual(ids(section(revealed, 'completed').tasks), ['c-old', 'c-new']);
  assert.equal(revealed.olderCount, 0);
  const off = buildListModel({ tasks: fixture(), scope: 'done', windowDays: 0, now: NOW });
  assert.deepEqual(ids(section(off, 'completed').tasks), ['c-old', 'c-new']);
  assert.equal(off.olderCount, 0);
});

test('the window applies to revealed spec tasks, and their older ones count only while revealed', () => {
  const hiddenSpec = buildListModel({ tasks: fixture(), scope: 'done', windowDays: 7, now: NOW });
  assert.equal(hiddenSpec.olderCount, 1);
  const shown = buildListModel({ tasks: fixture(), scope: 'done', windowDays: 7, showSpecTasks: true, now: NOW });
  assert.deepEqual(ids(section(shown, 'completed').tasks), ['beta-T01', 'c-new']);
  assert.equal(shown.olderCount, 2);
});

test('a completed task with no date counts as recent', () => {
  const m = buildListModel({ tasks: [task('nodate', 'completed')], scope: 'done', windowDays: 7, now: NOW });
  assert.deepEqual(ids(section(m, 'completed').tasks), ['nodate']);
  assert.equal(m.olderCount, 0);
});

test('the window reads completedAt, falling back to updatedAt', () => {
  const tasks = [
    task('by-updated', 'completed', { updatedAt: ago(20) }),
    task('by-completed', 'completed', { completedAt: ago(1), updatedAt: ago(20) })
  ];
  const m = buildListModel({ tasks, scope: 'done', windowDays: 7, now: NOW });
  assert.deepEqual(ids(section(m, 'completed').tasks), ['by-completed']);
  assert.equal(m.olderCount, 1);
});

test('the filter narrows the pool before anything is counted', () => {
  const matches = (t) => t.priority === 'high';
  const m = buildListModel({ tasks: fixture(), matches, showSpecTasks: true, now: NOW });
  assert.deepEqual(ids(section(m, 'pending').tasks), ['p2', 'p3']);
  assert.deepEqual(section(m, 'in_progress').tasks, []);
  assert.equal(m.counts.active, 2);
  assert.equal(m.counts.all, 2);
  assert.equal(m.counts.specTasks, 0);
});

test('sort by priority is stable on file order inside a section', () => {
  const m = buildListModel({ tasks: fixture(), sortMode: 'priority', now: NOW });
  // p2 and p3 are both high: file order keeps p2 first; odd is medium, p1 low.
  assert.deepEqual(ids(section(m, 'pending').tasks), ['p2', 'p3', 'odd', 'p1']);
});

test('sort by category is stable on file order inside a section', () => {
  const tasks = [
    task('f1', 'pending', { category: 'feature' }),
    task('b1', 'pending', { category: 'bug' }),
    task('f2', 'pending', { category: 'feature' }),
    task('none', 'pending', { category: undefined })
  ];
  const m = buildListModel({ tasks, sortMode: 'category', now: NOW });
  assert.deepEqual(ids(section(m, 'pending').tasks), ['none', 'b1', 'f1', 'f2']);
});

test('revealed spec tasks sort with the others in their section', () => {
  const tasks = [
    spec('alpha', '01', 'pending', { priority: 'low' }),
    task('p', 'pending', { priority: 'medium' }),
    spec('alpha', '02', 'pending', { priority: 'high' })
  ];
  const m = buildListModel({ tasks, sortMode: 'priority', showSpecTasks: true, now: NOW });
  assert.deepEqual(ids(section(m, 'pending').tasks), ['alpha-T02', 'p', 'alpha-T01']);
});

test('the default sort keeps file order', () => {
  const m = buildListModel({ tasks: fixture(), now: NOW });
  assert.deepEqual(ids(section(m, 'pending').tasks), ['p1', 'p2', 'odd', 'p3']);
});

test('counts without the reveal leave spec tasks out and say how many the scope would add', () => {
  const m = buildListModel({ tasks: fixture(), scope: 'active', windowDays: 7, now: NOW });
  assert.deepEqual(m.counts, { all: 6, active: 5, done: 1, doneTotal: 2, specTasks: 3 });
  const done = buildListModel({ tasks: fixture(), scope: 'done', windowDays: 7, now: NOW });
  assert.equal(done.counts.specTasks, 1);
  const all = buildListModel({ tasks: fixture(), scope: 'all', windowDays: 7, now: NOW });
  assert.equal(all.counts.specTasks, 4);
});

test('counts with the reveal include spec tasks under the same window', () => {
  const m = buildListModel({ tasks: fixture(), scope: 'active', windowDays: 7, showSpecTasks: true, now: NOW });
  assert.deepEqual(m.counts, { all: 10, active: 8, done: 2, doneTotal: 4, specTasks: 3 });
});

test('S10 · each scope count equals what that scope lists, with and without the reveal', () => {
  for (const showSpecTasks of [false, true]) {
    for (const windowDays of [0, 7]) {
      for (const showOlder of [false, true]) {
        const opts = { tasks: fixture(), showSpecTasks, windowDays, showOlder, now: NOW };
        const scopeCounts = ({ all, active, done, doneTotal }) => ({ all, active, done, doneTotal });
        const counts = buildListModel({ ...opts, scope: 'active' }).counts;
        for (const scope of SCOPES) {
          const m = buildListModel({ ...opts, scope });
          assert.equal(listed(m), counts[scope], `${scope} spec=${showSpecTasks} window=${windowDays} older=${showOlder}`);
          // The segment counts are the same whichever segment is selected.
          assert.deepEqual(scopeCounts(m.counts), scopeCounts(counts));
        }
      }
    }
  }
});
