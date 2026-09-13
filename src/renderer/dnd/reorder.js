/**
 * Reorder — the pure half of drag-and-drop ordering.
 *
 * Every draggable strip in Frame (the dock's tabs today; panes, sidebar
 * sections and editor groups when the layout turns VS Code-flexible) comes
 * down to the same two questions: "move this item to that index" and "is
 * this saved order still valid against what actually exists". Both live
 * here, with no DOM, so `test/reorder.test.js` can pin them and so any
 * state module (dockState first) can persist an order without re-deriving
 * the edge cases.
 */

/**
 * Move the item at `from` so it lands at index `to`, returning a new array.
 * Indexes are clamped to the list; a no-op move returns a copy.
 */
function moveItem(list, from, to) {
  const arr = Array.isArray(list) ? list.slice() : [];
  if (arr.length === 0) return arr;
  const clamp = (i) => Math.max(0, Math.min(arr.length - 1, Number.isFinite(i) ? Math.trunc(i) : 0));
  const a = clamp(from);
  const b = clamp(to);
  if (a === b) return arr;
  const [item] = arr.splice(a, 1);
  arr.splice(b, 0, item);
  return arr;
}

/** `moveItem` by identity rather than index; unknown ids leave the list as is. */
function moveId(list, id, to) {
  const arr = Array.isArray(list) ? list : [];
  const from = arr.indexOf(id);
  if (from < 0) return arr.slice();
  return moveItem(arr, from, to);
}

/**
 * A saved order made valid against `canonical` (the ids that exist, in
 * their default order): unknown ids and duplicates drop out, ids the saved
 * list never saw are appended in canonical order. Anything that is not an
 * array yields the canonical order itself.
 */
function normalizeOrder(saved, canonical) {
  const known = Array.isArray(canonical) ? canonical : [];
  const input = Array.isArray(saved) ? saved : [];
  const seen = new Set();
  const out = [];
  for (const id of input) {
    if (!known.includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of known) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

module.exports = { moveItem, moveId, normalizeOrder };
