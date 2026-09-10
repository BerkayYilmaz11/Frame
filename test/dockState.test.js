/**
 * The dock's state machine (dock-panel-readonly-views spec, C9 / D2).
 *
 * Pure by design: CI runs `npm test` with no `npm ci`, so this module may
 * not reach `electron`, `lucide` or the DOM. Requiring it at the top is half
 * the test — if the dock's state ever grows a renderer dependency, this
 * suite stops loading.
 *
 * What is pinned is what a reader would get wrong twice: the three
 * `toggleTab` transitions, that garbage input always yields a valid state,
 * and that sizes clamp at both ends on both sides.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const dockState = require('../src/renderer/dock/dockState');

const {
  TABS, LIMITS, defaults, load, open, close, toggle, toggleTab,
  setPosition, resize, serialize
} = dockState;

// ─── defaults ─────────────────────────────────────────────

test('defaults: closed, at the bottom, on the first tab, default sizes', () => {
  assert.deepEqual(defaults(), {
    open: false,
    position: 'bottom',
    tab: TABS[0],
    size: { bottom: LIMITS.bottom.default, right: LIMITS.right.default }
  });
});

test('defaults: every call is a fresh object', () => {
  const a = defaults();
  a.size.bottom = 1;
  assert.equal(defaults().size.bottom, LIMITS.bottom.default);
});

test('TABS lists the five dock surfaces in strip order', () => {
  assert.deepEqual(TABS, ['decisions', 'structure', 'prompts', 'activity', 'feedback']);
});

// ─── load ─────────────────────────────────────────────────

test('load: non-object input yields defaults', () => {
  for (const raw of [null, undefined, 42, true, [], 'not json', '']) {
    assert.deepEqual(load(raw), defaults(), `input ${JSON.stringify(raw)}`);
  }
});

test('load: unknown tab and position fall back, open must be exactly true', () => {
  const state = load({ open: 'yes', position: 'left', tab: 'terminals' });
  assert.equal(state.open, false);
  assert.equal(state.position, 'bottom');
  assert.equal(state.tab, 'decisions');
});

test('load: sizes below the floor are raised, garbage sizes use the default', () => {
  const state = load({ size: { bottom: 10, right: 'wide' } });
  assert.equal(state.size.bottom, LIMITS.bottom.min);
  assert.equal(state.size.right, LIMITS.right.default);
});

test('load: a missing size block keeps both defaults', () => {
  const state = load({ open: true, tab: 'activity', position: 'right' });
  assert.deepEqual(state.size, { bottom: LIMITS.bottom.default, right: LIMITS.right.default });
  assert.equal(state.open, true);
  assert.equal(state.tab, 'activity');
  assert.equal(state.position, 'right');
});

test('load: accepts the JSON string serialize() writes', () => {
  const state = load(serialize({ open: true, position: 'right', tab: 'prompts', size: { bottom: 200, right: 500 } }));
  assert.deepEqual(state, { open: true, position: 'right', tab: 'prompts', size: { bottom: 200, right: 500 } });
});

// ─── toggleTab: the three transitions ─────────────────────

test('toggleTab: closed → opens on that tab', () => {
  const next = toggleTab(defaults(), 'activity');
  assert.equal(next.open, true);
  assert.equal(next.tab, 'activity');
});

test('toggleTab: open on another tab → switches, stays open', () => {
  const state = open(defaults(), 'prompts');
  const next = toggleTab(state, 'structure');
  assert.equal(next.open, true);
  assert.equal(next.tab, 'structure');
});

test('toggleTab: open on that tab → closes, remembers the tab', () => {
  const state = open(defaults(), 'prompts');
  const next = toggleTab(state, 'prompts');
  assert.equal(next.open, false);
  assert.equal(next.tab, 'prompts');
});

test('toggleTab: an unknown tab changes nothing', () => {
  const state = open(defaults(), 'feedback');
  assert.deepEqual(toggleTab(state, 'nope'), state);
});

test('toggleTab never mutates its input', () => {
  const state = defaults();
  const frozen = JSON.stringify(state);
  toggleTab(state, 'activity');
  assert.equal(JSON.stringify(state), frozen);
});

// ─── open / close / toggle ────────────────────────────────

test('open without a tab reopens on the last tab', () => {
  const state = close(open(defaults(), 'structure'));
  const next = open(state);
  assert.equal(next.open, true);
  assert.equal(next.tab, 'structure');
});

test('open with an unknown tab changes nothing', () => {
  assert.deepEqual(open(defaults(), 'nope'), defaults());
});

test('toggle flips open and keeps tab and size', () => {
  const state = resize(open(defaults(), 'activity'), 200, 1000);
  const closed = toggle(state);
  assert.equal(closed.open, false);
  const reopened = toggle(closed);
  assert.equal(reopened.open, true);
  assert.equal(reopened.tab, 'activity');
  assert.equal(reopened.size.bottom, 200);
});

// ─── setPosition ──────────────────────────────────────────

test('setPosition keeps the tab and both sizes', () => {
  const state = resize(open(defaults(), 'decisions'), 250, 1000);
  const right = setPosition(state, 'right');
  assert.equal(right.position, 'right');
  assert.equal(right.tab, 'decisions');
  assert.equal(right.open, true);
  assert.equal(right.size.bottom, 250);
  assert.equal(right.size.right, LIMITS.right.default);
});

test('setPosition ignores an unknown side', () => {
  assert.deepEqual(setPosition(defaults(), 'top'), defaults());
});

// ─── resize: clamped at both ends, both sides ─────────────

test('resize at the bottom clamps to the floor', () => {
  const next = resize(defaults(), 5, 1000);
  assert.equal(next.size.bottom, LIMITS.bottom.min);
  assert.equal(next.size.right, LIMITS.right.default, 'the other side is untouched');
});

test('resize at the bottom clamps to 80% of the available height', () => {
  const next = resize(defaults(), 5000, 1000);
  assert.equal(next.size.bottom, 800);
});

test('resize on the right clamps to the floor', () => {
  const state = setPosition(defaults(), 'right');
  const next = resize(state, 100, 2000);
  assert.equal(next.size.right, LIMITS.right.min);
  assert.equal(next.size.bottom, LIMITS.bottom.default, 'the other side is untouched');
});

test('resize on the right clamps to 80% of the available width', () => {
  const state = setPosition(defaults(), 'right');
  const next = resize(state, 5000, 2000);
  assert.equal(next.size.right, 1600);
});

test('resize: the floor wins when 80% of available is below it', () => {
  const next = resize(defaults(), 200, 100);
  assert.equal(next.size.bottom, LIMITS.bottom.min);
});

test('resize: a value inside the range is kept, rounded', () => {
  const next = resize(defaults(), 333.6, 1000);
  assert.equal(next.size.bottom, 334);
});

test('resize: a non-numeric value falls back to the default', () => {
  const next = resize(defaults(), 'big', 1000);
  assert.equal(next.size.bottom, LIMITS.bottom.default);
});

// ─── serialize → load round-trip ──────────────────────────

test('serialize → load round-trips a valid state', () => {
  let state = defaults();
  state = open(state, 'feedback');
  state = setPosition(state, 'right');
  state = resize(state, 600, 2000);
  state = setPosition(state, 'bottom');
  state = resize(state, 260, 1000);
  assert.deepEqual(load(serialize(state)), state);
});

test('serialize drops anything that is not dock state', () => {
  const state = Object.assign(defaults(), { extra: 'ignored' });
  assert.deepEqual(Object.keys(JSON.parse(serialize(state))).sort(), ['open', 'position', 'size', 'tab']);
});
