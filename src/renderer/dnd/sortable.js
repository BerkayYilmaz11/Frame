/**
 * Sortable — drag-to-reorder for a row or column of siblings.
 *
 * The one drag-and-drop primitive Frame's chrome is meant to grow on: the
 * dock's tab strip first, then panes, sidebar sections and whatever else a
 * VS Code-flexible layout wants to let the user rearrange. It is
 * deliberately not the HTML5 drag-and-drop API — that one paints its own
 * ghost, fires no events past a threshold, and behaves differently per
 * platform inside Electron. Pointer events give one behaviour everywhere:
 *
 *   • press, move past a small threshold → the item lifts and follows the
 *     pointer along the strip's axis (a plain click stays a click);
 *   • crossing a sibling's midpoint slides the item into that slot live,
 *     so the strip always shows the order a release would commit;
 *   • release → `onReorder` once, only if the order changed; Escape puts
 *     the item back where it started.
 *
 * The module owns no state beyond the drag in flight: the caller renders
 * the items, and `onReorder` hands back the new order of ids for the
 * caller's own state to persist — the DOM is already in that order.
 *
 *   const sortable = makeSortable(strip, {
 *     items: '.dock-tab',              // which children can be dragged
 *     axis: 'x',                       // 'x' (row) or 'y' (column)
 *     getId: (el) => el.dataset.tab,   // what `order` is made of
 *     onReorder: ({ id, from, to, order }) => { ... }
 *   });
 *   sortable.destroy();
 *
 * Classes while dragging (styled by the caller): `sortable-dragging` on
 * the lifted item, `sortable-active` on the container and `sortable-drag`
 * on <body> (cursor, user-select).
 */

const DEFAULT_THRESHOLD_PX = 4;

function makeSortable(container, options = {}) {
  if (!container) throw new Error('makeSortable: container is required');
  const {
    items: itemSelector = ':scope > *',
    axis = 'x',
    handle = null,
    threshold = DEFAULT_THRESHOLD_PX,
    getId = (el) => el.dataset.id || el.id || '',
    canDrag = () => true,
    onReorder = () => {}
  } = options;

  const horizontal = axis !== 'y';
  const coord = (e) => (horizontal ? e.clientX : e.clientY);

  let drag = null; // the drag in flight, or null

  function itemsOf() {
    return Array.from(container.querySelectorAll(itemSelector))
      .filter((el) => el.parentNode === container);
  }

  function orderOf() {
    return itemsOf().map(getId);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || drag) return;
    const item = e.target.closest(itemSelector);
    if (!item || item.parentNode !== container) return;
    if (handle && !e.target.closest(handle)) return;
    if (!canDrag(item)) return;
    const siblings = itemsOf();
    if (siblings.length < 2) return;

    drag = {
      item,
      pointerId: e.pointerId,
      startPointer: coord(e),
      grabOffset: coord(e) - rectOf(item).start,
      startIndex: siblings.indexOf(item),
      startOrder: siblings.map(getId),
      lifted: false,
      raf: null,
      lastPointer: coord(e)
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return horizontal
      ? { start: r.left, end: r.right, mid: (r.left + r.right) / 2 }
      : { start: r.top, end: r.bottom, mid: (r.top + r.bottom) / 2 };
  }

  function lift() {
    drag.lifted = true;
    drag.item.classList.add('sortable-dragging');
    container.classList.add('sortable-active');
    document.body.classList.add('sortable-drag');
    try {
      drag.item.setPointerCapture(drag.pointerId);
    } catch (_) { /* capture is a nicety; the document listeners carry the drag */ }
  }

  function onPointerMove(e) {
    if (!drag) return;
    drag.lastPointer = coord(e);
    if (!drag.lifted) {
      if (Math.abs(drag.lastPointer - drag.startPointer) < threshold) return;
      lift();
    }
    e.preventDefault();
    if (drag.raf) return;
    drag.raf = requestAnimationFrame(() => {
      drag.raf = null;
      if (drag) step();
    });
  }

  /**
   * One frame of the drag: slide the item into the slot under the pointer
   * (compared against the *other* items' midpoints), then translate it so
   * it visually follows the pointer from wherever that slot put it.
   */
  function step() {
    const { item, lastPointer, grabOffset } = drag;
    const others = itemsOf().filter((el) => el !== item);
    let target = others.length;
    for (let i = 0; i < others.length; i++) {
      if (lastPointer < rectOf(others[i]).mid) {
        target = i;
        break;
      }
    }
    const current = itemsOf().indexOf(item);
    if (target !== current) {
      const before = others[target] || null;
      container.insertBefore(item, before);
    }

    item.style.transform = '';
    const base = rectOf(item);
    const bounds = rectOf(container);
    const wanted = lastPointer - grabOffset;
    const min = bounds.start;
    const max = bounds.end - (base.end - base.start);
    const clamped = Math.max(min, Math.min(max, wanted));
    const delta = clamped - base.start;
    item.style.transform = horizontal ? `translateX(${delta}px)` : `translateY(${delta}px)`;
  }

  function finish({ cancelled } = {}) {
    if (!drag) return;
    const d = drag;
    drag = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKeyDown, true);
    if (d.raf) cancelAnimationFrame(d.raf);
    if (!d.lifted) return;

    d.item.style.transform = '';
    d.item.classList.remove('sortable-dragging');
    container.classList.remove('sortable-active');
    document.body.classList.remove('sortable-drag');
    try {
      d.item.releasePointerCapture(d.pointerId);
    } catch (_) { /* never captured */ }
    // The lift swallowed the mousedown's click; make sure the release does
    // not open the tab the item happens to sit on now.
    suppressNextClick(d.item);

    if (cancelled) {
      restore(d.startOrder);
      return;
    }
    const order = orderOf();
    const to = itemsOf().indexOf(d.item);
    if (to === d.startIndex && order.every((id, i) => id === d.startOrder[i])) return;
    onReorder({ id: getId(d.item), from: d.startIndex, to, order });
  }

  function restore(order) {
    const byId = new Map(itemsOf().map((el) => [getId(el), el]));
    order.forEach((id) => {
      const el = byId.get(id);
      if (el) container.appendChild(el);
    });
  }

  function suppressNextClick(el) {
    const swallow = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    el.addEventListener('click', swallow, { capture: true, once: true });
    // If no click follows (pointer released outside), drop the guard.
    setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0);
  }

  function onPointerUp() {
    finish({ cancelled: false });
  }

  function onCancel() {
    finish({ cancelled: true });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && drag) {
      e.stopPropagation();
      finish({ cancelled: true });
    }
  }

  container.addEventListener('pointerdown', onPointerDown);

  return {
    /** Ids in the strip's current DOM order. */
    order: orderOf,
    /** Re-append the items so the DOM matches `order` (ids not present are ignored). */
    apply: restore,
    destroy() {
      finish({ cancelled: true });
      container.removeEventListener('pointerdown', onPointerDown);
    }
  };
}

module.exports = { makeSortable };
