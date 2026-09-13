/**
 * The pure half of drag-to-reorder (src/renderer/dnd/reorder.js): index
 * moves and the repair of a saved order against what exists. Every strip
 * that persists an order leans on these two, so their edges are pinned
 * once here rather than per caller.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { moveItem, moveId, normalizeOrder } = require('../src/renderer/dnd/reorder');

test('moveItem: forwards and backwards, returning a new array', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(list, 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

test('moveItem: a no-op move and out-of-range indexes are safe', () => {
  assert.deepEqual(moveItem(['a', 'b'], 1, 1), ['a', 'b']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 99), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], -1, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem([], 0, 1), []);
  assert.deepEqual(moveItem(null, 0, 1), []);
});

test('moveId: by identity; unknown ids leave the list as is', () => {
  assert.deepEqual(moveId(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(moveId(['a', 'b', 'c'], 'z', 0), ['a', 'b', 'c']);
});

test('normalizeOrder: drops unknown ids and duplicates, appends the missing in canonical order', () => {
  const canon = ['a', 'b', 'c'];
  assert.deepEqual(normalizeOrder(['c', 'x', 'c', 'a'], canon), ['c', 'a', 'b']);
  assert.deepEqual(normalizeOrder([], canon), canon);
  assert.deepEqual(normalizeOrder(undefined, canon), canon);
  assert.deepEqual(normalizeOrder('abc', canon), canon);
  assert.deepEqual(normalizeOrder(['b', 'a'], null), []);
});
