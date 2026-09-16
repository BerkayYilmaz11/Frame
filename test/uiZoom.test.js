/**
 * The UI zoom ladder (src/shared/uiZoom.js).
 *
 * Pure by design: main seeds the window from it and the renderer computes the
 * next step with it, so requiring it without electron is half the test.
 *
 * Pinned: the five factors, clamping at both ends, what a bad stored value
 * turns into, and the labels / percents the UI shows.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const zoom = require('../src/shared/uiZoom');
const {
  MIN_STEP, MAX_STEP, DEFAULT_STEP, STEPS, LADDER,
  clampStep, parseStep, factorFor, percentFor, labelFor
} = zoom;

test('ladder: five steps, −2…+2, with the decided factors', () => {
  assert.equal(MIN_STEP, -2);
  assert.equal(MAX_STEP, 2);
  assert.equal(DEFAULT_STEP, 0);
  assert.deepEqual(STEPS, [-2, -1, 0, 1, 2]);
  assert.deepEqual(STEPS.map(factorFor), [0.85, 0.92, 1.0, 1.10, 1.20]);
  assert.equal(Object.keys(LADDER).length, STEPS.length);
  // Step 0 is the untouched rendering.
  assert.equal(factorFor(0), 1.0);
  assert.equal(factorFor(DEFAULT_STEP), 1.0);
});

test('clampStep: stops at the ends, truncates, defaults on garbage', () => {
  assert.equal(clampStep(3), 2);
  assert.equal(clampStep(99), 2);
  assert.equal(clampStep(-3), -2);
  assert.equal(clampStep(-99), -2);
  assert.equal(clampStep(1), 1);
  assert.equal(clampStep(-2), -2);
  assert.equal(clampStep(1.7), 1);
  assert.equal(clampStep(-1.2), -1);
  assert.equal(clampStep(NaN), 0);
  assert.equal(clampStep(Infinity), 0);
  assert.equal(clampStep('2'), 0);
  assert.equal(clampStep(undefined), 0);
  assert.equal(clampStep(null), 0);
  // A step at the end stays put — pressing ⌘= at +2 is a no-op.
  assert.equal(clampStep(MAX_STEP + 1), MAX_STEP);
  assert.equal(clampStep(MIN_STEP - 1), MIN_STEP);
});

test('parseStep: only an in-range integer survives a round trip', () => {
  for (const s of STEPS) assert.equal(parseStep(s), s);
  assert.equal(parseStep(null), 0);
  assert.equal(parseStep(undefined), 0);
  assert.equal(parseStep('1'), 0);
  assert.equal(parseStep('-2'), 0);
  assert.equal(parseStep(1.5), 0);
  assert.equal(parseStep(0.5), 0);
  assert.equal(parseStep(3), 0);
  assert.equal(parseStep(-3), 0);
  assert.equal(parseStep(NaN), 0);
  assert.equal(parseStep({}), 0);
  assert.equal(parseStep(true), 0);
});

test('factorFor: any input maps onto a ladder value', () => {
  const values = new Set(Object.values(LADDER));
  for (const input of [-10, -2, -1, 0, 1, 2, 10, 0.5, NaN, null, 'x']) {
    assert.ok(values.has(factorFor(input)), `factorFor(${input}) is on the ladder`);
  }
});

test('percentFor and labelFor: what the UI shows', () => {
  assert.deepEqual(STEPS.map(percentFor), [85, 92, 100, 110, 120]);
  assert.deepEqual(STEPS.map(labelFor), ['Smallest', 'Smaller', 'Default', 'Larger', 'Largest']);
  // Clamped inputs get the end's label, not undefined.
  assert.equal(labelFor(5), 'Largest');
  assert.equal(labelFor(-5), 'Smallest');
  assert.equal(percentFor(5), 120);
});
