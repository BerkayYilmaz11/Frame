/**
 * The GitHub panel's section store (github-view-tree-layout spec, D7 / C10).
 *
 * Pure by design: CI runs `npm test` with no `npm ci`, so this module may
 * not reach `electron`, `lucide` or the DOM. Requiring it at the top is half
 * the test.
 *
 * Pinned: the D3 defaults, that garbage input always yields a valid state
 * (per key, so one bad value never resets the others), toggle, and that a
 * serialize → load round-trip is the identity.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const sectionState = require('../src/renderer/github/sectionState');
const {
  STORAGE_KEY, SECTIONS, SUBGROUPS, defaults, load, toggle, setExpanded,
  isExpanded, expandedSections, serialize
} = sectionState;

// ─── defaults ─────────────────────────────────────────────

test('defaults: Pull Requests and Branches expanded, the rest collapsed (D3)', () => {
  assert.deepEqual(defaults(), {
    prs: true, issues: false, branches: true, worktrees: false, remote: false
  });
});

test('defaults: every call is a fresh object', () => {
  const a = defaults();
  a.prs = false;
  assert.equal(defaults().prs, true);
});

test('SECTIONS is the panel order; the Remote sub-group is separate', () => {
  assert.deepEqual(SECTIONS, ['prs', 'issues', 'branches', 'worktrees']);
  assert.deepEqual(SUBGROUPS, ['remote']);
  assert.equal(STORAGE_KEY, 'frame-github-sections');
});

// ─── load ─────────────────────────────────────────────────

test('load: nothing, garbage strings, arrays and primitives → defaults', () => {
  for (const raw of [undefined, null, '', 'not json', '[]', [], 42, true, '"str"']) {
    assert.deepEqual(load(raw), defaults(), `raw=${JSON.stringify(raw)}`);
  }
});

test('load: a JSON string restores what serialize wrote', () => {
  const s = { prs: false, issues: true, branches: false, worktrees: true, remote: true };
  assert.deepEqual(load(JSON.stringify(s)), s);
});

test('load: a parsed object is accepted too', () => {
  assert.deepEqual(load({ issues: true }).issues, true);
});

test('load: a non-boolean value falls back for that key only', () => {
  const out = load({ prs: 'yes', issues: true, branches: 0, worktrees: null });
  assert.deepEqual(out, { prs: true, issues: true, branches: true, worktrees: false, remote: false });
});

test('load: unknown keys are dropped', () => {
  const out = load({ prs: false, actions: true });
  assert.equal('actions' in out, false);
  assert.equal(out.prs, false);
});

// ─── toggle / setExpanded ─────────────────────────────────

test('toggle: flips one section and leaves the others', () => {
  const a = defaults();
  const b = toggle(a, 'issues');
  assert.equal(b.issues, true);
  assert.equal(b.prs, a.prs);
  assert.equal(b.branches, a.branches);
  assert.equal(a.issues, false, 'input is not mutated');
  assert.equal(toggle(b, 'issues').issues, false);
});

test('toggle: the Remote sub-group toggles like a section', () => {
  assert.equal(toggle(defaults(), 'remote').remote, true);
});

test('toggle: an unknown id is a no-op copy', () => {
  const a = defaults();
  const b = toggle(a, 'actions');
  assert.deepEqual(b, a);
  assert.notEqual(b, a);
});

test('setExpanded: sets explicitly; unknown id is a no-op', () => {
  assert.equal(setExpanded(defaults(), 'prs', false).prs, false);
  assert.equal(setExpanded(defaults(), 'worktrees', true).worktrees, true);
  assert.deepEqual(setExpanded(defaults(), 'nope', true), defaults());
});

test('isExpanded / expandedSections read the state in panel order', () => {
  const s = load({ prs: false, issues: true, branches: true, worktrees: true });
  assert.equal(isExpanded(s, 'prs'), false);
  assert.equal(isExpanded(s, 'issues'), true);
  assert.equal(isExpanded(s, 'remote'), false);
  assert.equal(isExpanded(s, 'nope'), false);
  assert.deepEqual(expandedSections(s), ['issues', 'branches', 'worktrees']);
});

// ─── round-trip ───────────────────────────────────────────

test('serialize → load is the identity', () => {
  let s = defaults();
  s = toggle(s, 'issues');
  s = toggle(s, 'branches');
  s = toggle(s, 'remote');
  assert.deepEqual(load(serialize(s)), s);
});
