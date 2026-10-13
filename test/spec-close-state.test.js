/**
 * Spec close state — helper tests.
 * Runs with Node's built-in runner: `npm test` (node --test test/).
 *
 * The helper is the one place that decides whether a closed spec is owed a
 * reminder, and both hooks trust its answer without a second look. So every
 * way of staying quiet is asserted here by its reason, alongside the one way
 * of speaking — a reminder that fires when it should not is worse than one
 * that never fires.
 *
 * Time is passed in rather than read: the baseline, the per-day session key
 * and the seven-day cleanup are all functions of `now`.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const closeStateLib = require('../scripts/spec-close-state');
const {
  CLOSE_ITEMS, STATE_REL, SESSIONS_REL, SESSION_TTL_MS,
  closedSpecs, closeState, isOrchestrated, missingItems, pending, reminder, sessionKey
} = closeStateLib;

const T0 = Date.parse('2026-01-01T00:00:00Z'); // the baseline every project starts from
const BEFORE = '2025-12-01T10:00:00Z';
const AFTER = '2026-02-01T10:00:00Z';
const LATER = Date.parse('2026-03-01T00:00:00Z');

const task = (slug, n, status, completedAt = null) => ({
  id: `task-spec-${slug}-T0${n}`, title: `t${n}`, source: `spec:${slug}:T0${n}`, status, completedAt
});

const closed = (slug, at = AFTER) => [task(slug, 1, 'completed', at), task(slug, 2, 'completed', at)];

let tick = 0;
/** Write tasks.json with an mtime no earlier write shared. */
function writeTasks(root, tasks, { raw = null } = {}) {
  const file = path.join(root, '.frame', 'tasks.json');
  fs.writeFileSync(file, raw !== null ? raw : JSON.stringify({ tasks }));
  tick += 1;
  const at = new Date(Date.parse('2026-01-02T00:00:00Z') + tick * 1000);
  fs.utimesSync(file, at, at);
  return file;
}

function mkSpec(root, slug, { digest = false, status = null } = {}) {
  const dir = path.join(root, '.frame', 'specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  if (status) fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(status));
  if (digest) fs.writeFileSync(path.join(dir, 'digest.md'), '---\nkeywords: a\n---\nDone.\n');
  return dir;
}

/** A project whose baseline is T0, holding the given specs and tasks. */
function mkProject({ specs = [], tasks = [], baseline = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-specclose-'));
  fs.mkdirSync(path.join(root, '.frame'), { recursive: true });
  if (baseline) {
    writeTasks(root, []);
    closeState(root, T0);
  }
  for (const slug of specs) mkSpec(root, slug);
  writeTasks(root, tasks);
  return root;
}

const readState = (root) => JSON.parse(fs.readFileSync(path.join(root, STATE_REL), 'utf8'));

// ─── closed specs ─────────────────────────────────────────

test('a spec is closed when it has spec tasks and all of them are completed', () => {
  const root = mkProject({
    specs: ['done-spec', 'half-spec', 'idle-spec'],
    tasks: [
      ...closed('done-spec'),
      task('half-spec', 1, 'completed', AFTER), task('half-spec', 2, 'in_progress'),
      task('idle-spec', 1, 'pending'),
      { id: 'plain', title: 'not a spec task', status: 'completed', completedAt: AFTER }
    ]
  });
  assert.deepEqual(closedSpecs(root).map((s) => s.slug), ['done-spec']);
});

test('a spec with no tasks in tasks.json is not closed, whatever its folder holds', () => {
  const root = mkProject({ specs: ['no-tasks'], tasks: [] });
  assert.deepEqual(closedSpecs(root), []);
});

test('completed tasks whose spec folder is gone do not make a closed spec', () => {
  const root = mkProject({ specs: [], tasks: closed('deleted-spec') });
  assert.deepEqual(closedSpecs(root), []);
  assert.equal(reminder(root, 's', LATER), null);
});

test('the close time is the latest completedAt among the spec tasks', () => {
  const root = mkProject({
    specs: ['a'],
    tasks: [task('a', 1, 'completed', '2026-02-01T10:00:00Z'), task('a', 2, 'completed', '2026-02-03T09:30:00Z')]
  });
  assert.deepEqual(closedSpecs(root), [{ slug: 'a', closedAt: '2026-02-03T09:30:00.000Z' }]);
});

test('with no completedAt the close time falls back to status.json last_phase_at', () => {
  const root = mkProject({ tasks: [task('a', 1, 'completed'), task('a', 2, 'completed')] });
  mkSpec(root, 'a', { status: { slug: 'a', phase: 'done', last_phase_at: '2026-02-05T08:00:00Z' } });
  assert.deepEqual(closedSpecs(root), [{ slug: 'a', closedAt: '2026-02-05T08:00:00.000Z' }]);
});

test('a date with no time counts as the end of that day', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a', '2026-02-01') });
  assert.equal(closedSpecs(root)[0].closedAt, '2026-02-01T23:59:59.999Z');
});

test('a slug that is not a plain folder name is never read as a spec', () => {
  const root = mkProject({ specs: ['ok'], tasks: [] });
  fs.mkdirSync(path.join(root, 'outside'), { recursive: true });
  writeTasks(root, [
    { id: 'x', source: 'spec:../../outside:T01', status: 'completed', completedAt: AFTER },
    { id: 'y', source: 'spec:-rf:T01', status: 'completed', completedAt: AFTER }
  ]);
  assert.deepEqual(closedSpecs(root), []);
  assert.equal(isOrchestrated(root, '../../outside'), null);
});

test('tasks.json as a bare array is read the same way', () => {
  const root = mkProject({ specs: ['a'] });
  writeTasks(root, null, { raw: JSON.stringify(closed('a')) });
  assert.deepEqual(closedSpecs(root).map((s) => s.slug), ['a']);
});

// ─── close items ──────────────────────────────────────────

test('the digest is the one close item, missing until digest.md exists', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  assert.deepEqual(CLOSE_ITEMS.map((i) => i.id), ['digest']);
  assert.deepEqual(missingItems(root, 'a'), ['digest']);
  mkSpec(root, 'a', { digest: true });
  assert.deepEqual(missingItems(root, 'a'), []);
});

test('a second close item joins the list without anything around it changing', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  mkSpec(root, 'a', { digest: true });
  CLOSE_ITEMS.push({ id: 'cards', label: 'decision cards', missing: () => true });
  try {
    assert.deepEqual(missingItems(root, 'a'), ['cards']);
    assert.match(reminder(root, 's', LATER).line, /but no decision cards — run:/);
  } finally {
    CLOSE_ITEMS.pop();
  }
});

// ─── the reminder ─────────────────────────────────────────

test('a spec closed after the baseline with no digest gets the one-line reminder', () => {
  const root = mkProject({ specs: ['close-me'], tasks: closed('close-me') });
  const out = reminder(root, 's1', LATER);
  assert.deepEqual(out.slugs, ['close-me']);
  assert.equal(out.line,
    'Spec "close-me" has every task completed but no digest — run: node .frame/bin/spec-close.js close-me');
  assert.ok(!out.line.includes('\n'), 'one line');
  assert.deepEqual(pending(root, LATER).map((s) => s.slug), ['close-me']);
});

test('once the digest exists there is nothing to say and nothing to record', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  mkSpec(root, 'a', { digest: true });
  assert.equal(reminder(root, 's1', LATER), null);
  assert.deepEqual(pending(root, LATER), []);
});

test('a digest written after the reminder is seen without tasks.json changing', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  assert.ok(reminder(root, 's1', LATER).line);
  mkSpec(root, 'a', { digest: true });
  assert.equal(reminder(root, 's2', LATER), null);
});

test('a spec is announced once per session, then recorded as session-dedup once', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  assert.ok(reminder(root, 's1', LATER).line);
  assert.deepEqual(reminder(root, 's1', LATER), { quiet: 'session-dedup', reasons: ['session-dedup'] });
  assert.equal(reminder(root, 's1', LATER), null, 'the quiet reason is not recorded per call');
  assert.ok(reminder(root, 's2', LATER).line, 'a new session hears it again');
});

test('a spec closed before the baseline is never announced', () => {
  const root = mkProject({ specs: ['old'], tasks: closed('old', BEFORE) });
  assert.deepEqual(reminder(root, 's1', LATER), { quiet: 'before-baseline', reasons: ['before-baseline'] });
  assert.equal(reminder(root, 's1', LATER), null);
  assert.deepEqual(pending(root, LATER), []);
});

test('the first run sets the baseline, so everything already closed stays quiet', () => {
  const root = mkProject({ specs: ['old'], tasks: closed('old', AFTER), baseline: false });
  assert.equal(reminder(root, 's1', LATER).quiet, 'before-baseline');
  assert.equal(readState(root).baseline, new Date(LATER).toISOString());
  // …and the baseline does not move on a later run.
  closeState(root, LATER + 5000);
  assert.equal(readState(root).baseline, new Date(LATER).toISOString());
});

test('a closed spec with no close time is skipped, with its own reason', () => {
  const root = mkProject({ specs: ['timeless'], tasks: [task('timeless', 1, 'completed')] });
  assert.deepEqual(closedSpecs(root), [{ slug: 'timeless', closedAt: null }]);
  assert.deepEqual(reminder(root, 's1', LATER), { quiet: 'no-close-time', reasons: ['no-close-time'] });
});

test('more than three are named three at a time, the rest counted', () => {
  const slugs = ['a', 'b', 'c', 'd', 'e'];
  const root = mkProject({
    specs: slugs,
    tasks: slugs.flatMap((slug, i) => closed(slug, `2026-02-0${i + 1}T10:00:00Z`))
  });
  const first = reminder(root, 's1', LATER);
  assert.deepEqual(first.slugs, ['e', 'd', 'c'], 'newest close first');
  assert.equal(first.more, 2);
  assert.match(first.line, /^Specs "e", "d", "c" and 2 more have every task completed but no digest — run for each: node \S+ <slug>$/);
  const second = reminder(root, 's1', LATER);
  assert.deepEqual(second.slugs, ['b', 'a'], 'the counted ones are named next');
  assert.equal(second.more, 0);
});

test('a result can announce one spec and record why another is withheld', () => {
  const root = mkProject({
    specs: ['old', 'new'],
    tasks: [...closed('old', BEFORE), ...closed('new', AFTER)]
  });
  const out = reminder(root, 's1', LATER);
  assert.deepEqual(out.slugs, ['new']);
  assert.deepEqual(out.reasons, ['before-baseline']);
});

// ─── orchestration ────────────────────────────────────────

test('a spec with a worktree folder is orchestrated and never announced', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  fs.mkdirSync(path.join(root, '.frame', 'worktrees', 'a'), { recursive: true });
  assert.equal(isOrchestrated(root, 'a'), true);
  assert.deepEqual(reminder(root, 's1', LATER), { quiet: 'orchestrated', reasons: ['orchestrated'] });
  assert.deepEqual(pending(root, LATER), []);
});

function gitInit(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  return git;
}

test('a spec with a frame/<slug>/ branch is orchestrated; its neighbour is not', () => {
  const root = mkProject({ specs: ['a', 'ab'], tasks: [...closed('a'), ...closed('ab')] });
  const git = gitInit(root);
  git('branch', 'frame/a/work');
  assert.equal(isOrchestrated(root, 'a'), true);
  assert.equal(isOrchestrated(root, 'ab'), false, 'a prefix of another slug is not a match');
  const out = reminder(root, 's1', LATER);
  assert.deepEqual(out.slugs, ['ab']);
  assert.deepEqual(out.reasons, ['orchestrated']);
});

test('git is asked once per candidate per session', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  const git = gitInit(root);
  git('branch', 'frame/a/integration');
  assert.equal(reminder(root, 's1', LATER).quiet, 'orchestrated');
  // The branch goes away; the session already has its answer and keeps it.
  git('branch', '-D', 'frame/a/integration');
  assert.equal(reminder(root, 's1', LATER), null);
  assert.ok(reminder(root, 's2', LATER).line, 'a new session asks again');
});

test('when git will not answer the spec stays quiet, with its own reason', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: /nowhere/at/all\n'); // a repository git cannot open
  assert.equal(isOrchestrated(root, 'a'), null);
  assert.deepEqual(reminder(root, 's1', LATER), { quiet: 'git-unavailable', reasons: ['git-unavailable'] });
});

// ─── tasks.json that cannot be read ───────────────────────

test('no tasks.json means nothing to say and no state written', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-specclose-'));
  fs.mkdirSync(path.join(root, '.frame'), { recursive: true });
  assert.equal(closeState(root, T0), null);
  assert.equal(reminder(root, 's1', LATER), null);
  assert.ok(!fs.existsSync(path.join(root, STATE_REL)));
});

test('an unreadable tasks.json is recorded once per change of the file, not per call', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  writeTasks(root, null, { raw: '{ "tasks": [ truncated' });
  assert.equal(closedSpecs(root), null);
  assert.deepEqual(reminder(root, 's1', LATER), { quiet: 'no-index', reasons: ['no-index'] });
  assert.equal(reminder(root, 's1', LATER), null);
  assert.equal(reminder(root, 's2', LATER), null);
  assert.deepEqual(pending(root, LATER), []);
  // Repaired: the next call reads it again.
  writeTasks(root, closed('a'));
  assert.ok(reminder(root, 's1', LATER).line);
});

test('a tasks.json with no task list is unreadable, not empty', () => {
  const root = mkProject({ specs: ['a'] });
  writeTasks(root, null, { raw: JSON.stringify({ tasks: { pending: [] } }) });
  assert.equal(closedSpecs(root), null);
});

// ─── the cache ────────────────────────────────────────────

test('a cache hit does not re-read tasks.json', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  const file = path.join(root, '.frame', 'tasks.json');
  assert.equal(closeState(root, LATER).hit, false);

  // Same size, same mtime, different content: if the helper read the file it
  // would find no closed spec.
  const stat = fs.statSync(file);
  const original = fs.readFileSync(file, 'utf8');
  const reopened = original.replace(/"completed"/g, '"compIeted"');
  assert.equal(Buffer.byteLength(reopened), stat.size);
  fs.writeFileSync(file, reopened);
  fs.utimesSync(file, stat.atime, stat.mtime);

  const state = closeState(root, LATER);
  assert.equal(state.hit, true);
  assert.deepEqual(state.closed.map((s) => s.slug), ['a']);
  assert.deepEqual(closedSpecs(root), [], 'a fresh read sees the new content');
});

test('a changed mtime or size is a miss and the list is rebuilt', () => {
  const root = mkProject({ specs: ['a', 'b'], tasks: closed('a') });
  assert.deepEqual(closeState(root, LATER).closed.map((s) => s.slug), ['a']);
  writeTasks(root, [...closed('a'), ...closed('b')]);
  const state = closeState(root, LATER);
  assert.equal(state.hit, false);
  assert.deepEqual(state.closed.map((s) => s.slug), ['a', 'b']);
  assert.equal(closeState(root, LATER).hit, true);
});

test('a corrupt state file costs a re-read and a new baseline, never an exception', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  fs.writeFileSync(path.join(root, STATE_REL), '{ not json');
  const state = closeState(root, LATER);
  assert.equal(state.hit, false);
  assert.equal(state.baseline, new Date(LATER).toISOString());
});

// ─── session keys and cleanup ─────────────────────────────

test('without a session id the reminder is keyed by calendar day', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  const day1 = Date.parse('2026-03-01T09:00:00Z');
  assert.equal(sessionKey(undefined, day1), 'day-2026-03-01');
  assert.ok(reminder(root, undefined, day1).line);
  assert.equal(reminder(root, undefined, day1 + 3600e3).quiet, 'session-dedup', 'same day: once');
  assert.ok(reminder(root, undefined, day1 + 24 * 3600e3).line, 'next day: again');
});

test('a session id is made safe for a file name', () => {
  assert.equal(sessionKey('../../etc/passwd', T0), '______etc_passwd');
  assert.equal(sessionKey('a'.repeat(200), T0).length, 80);
});

test('session files older than seven days are removed when one is written', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a') });
  const dir = path.join(root, SESSIONS_REL);
  fs.mkdirSync(dir, { recursive: true });
  const stale = path.join(dir, 'old-session.json');
  fs.writeFileSync(stale, '{}');
  const now = Date.now();
  const old = new Date(now - SESSION_TTL_MS - 60e3);
  fs.utimesSync(stale, old, old);
  reminder(root, 's1', now);
  assert.ok(!fs.existsSync(stale), 'stale session removed');
  assert.ok(fs.existsSync(path.join(dir, 's1.json')), 'current session kept');
});

// ─── never break ──────────────────────────────────────────

test('a root that does not exist is nothing to say', () => {
  const nowhere = path.join(os.tmpdir(), 'frame-specclose-missing', 'x');
  assert.equal(reminder(nowhere, 's1', LATER), null);
  assert.deepEqual(pending(nowhere, LATER), []);
  assert.equal(closedSpecs(nowhere), null);
});

test('a read-only runtime directory degrades to quiet, not to an exception', () => {
  const root = mkProject({ specs: ['a'], tasks: closed('a'), baseline: false });
  // A file where the state directory should be: nothing under it can be written.
  fs.mkdirSync(path.join(root, '.frame', 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(root, '.frame', 'runtime', 'spec-close'), 'in the way');
  const out = reminder(root, 's1', LATER);
  assert.equal(out.quiet, 'before-baseline', 'a baseline that cannot be kept is "now" every time');
});
