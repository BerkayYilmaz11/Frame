/**
 * Dock state — pure (dock-panel-readonly-views spec, D2).
 *
 * The dock is a region beside the center content: open or closed, docked at
 * the bottom or on the right, showing one tab, at one size per side, with
 * its tabs in the order the user dragged them into. This module owns that
 * state and nothing else — no DOM, no localStorage, no
 * Electron — so the transitions that are easy to get wrong twice (toggle on
 * the open tab closes, toggle on another switches; sizes clamp to what the
 * center can spare) are pinned by `test/dockState.test.js`.
 *
 * The host (`dock.js`) applies a state to the DOM and persists
 * `serialize()`'s string under `STORAGE_KEY`, app-wide, not per project.
 */

const { moveId, normalizeOrder } = require('../dnd/reorder');

const STORAGE_KEY = 'frame-dock';

/**
 * Tab ids in their canonical order: the status-bar icons' order, and the
 * strip's order until the user drags a tab elsewhere. The strip follows
 * `state.order` (a permutation of this list, persisted with the rest of the
 * dock's state); the status bar deliberately does not — its icons are
 * muscle memory, the strip is the user's arrangement.
 */
const TABS = ['decisions', 'prompts', 'activity'];

/**
 * One shortcut per tab, the single place the renderer reads them from:
 * the command registry (index.js registerCommands), the status-bar
 * tooltips and the strip's tooltips all take theirs from here. The View
 * menu in src/main/menu.js carries hand-copied accelerators for the same
 * commands — keep it in step. All three share the ⇧⌘ layer with the other
 * view toggles (D = Tasks, S = Specs, G = GitHub, X = Sessions), so a tab
 * reads as one more view: Y for Decisions (the project's "why"), L for
 * Prompts (the log, its shortcut since before the dock), A for Activity.
 */
const TAB_SHORTCUTS = {
  decisions: 'CmdOrCtrl+Shift+Y',
  prompts: 'CmdOrCtrl+Shift+L',
  activity: 'CmdOrCtrl+Shift+A'
};

/**
 * Tabs that exist but are not offered to the user yet. `structure` still
 * has its host entry in dock.js and its module (structureMap.js); it is
 * out of TABS so the strip, the status bar, `isTab` and `load` all treat it
 * as unknown. To bring it back: move the id into TABS, restore its
 * status-bar icon (statusBar.js DOCK_ICONS), View menu item (main/menu.js)
 * and `dock.structure` command (index.js registerCommands).
 *
 * Feedback is not a dock tab at all any more: it opens as a modal from the
 * foot of the sidebar rail (feedbackPanel.js), so it is neither here nor in
 * TABS.
 */
const HIDDEN_TABS = ['structure'];

const POSITIONS = ['bottom', 'right'];

/**
 * Sizes per side (D5). `max` is a share of the center's extent on that axis,
 * so the dock can never swallow the terminals entirely. Right gets more
 * room than the old side panels had (360–440px) because Decisions prose and
 * the structure map both want width.
 */
const LIMITS = {
  bottom: { default: 320, min: 140, maxShare: 0.8 },
  right: { default: 480, min: 360, maxShare: 0.8 }
};

function defaults() {
  return {
    open: false,
    position: 'bottom',
    tab: TABS[0],
    order: TABS.slice(),
    size: { bottom: LIMITS.bottom.default, right: LIMITS.right.default }
  };
}

function isTab(tab) {
  return TABS.includes(tab);
}

function isPosition(position) {
  return POSITIONS.includes(position);
}

/**
 * Clamp a size for one side. Without `available` (the center's extent on
 * that axis) only the floor applies — the host measures the ceiling when it
 * applies the state, and a stored value is re-clamped then.
 */
function clampSize(position, px, available) {
  const limits = LIMITS[position];
  let size = Number(px);
  if (!Number.isFinite(size)) size = limits.default;
  size = Math.round(size);
  if (Number.isFinite(available) && available > 0) {
    size = Math.min(size, Math.floor(available * limits.maxShare));
  }
  return Math.max(limits.min, size);
}

/**
 * A valid state from anything: a JSON string, a parsed object, garbage,
 * nothing. Unknown tab → the first tab; unknown position → bottom; sizes
 * clamped to their floors; an order missing tabs or naming unknown ones →
 * normalized against TABS; a non-object → defaults.
 */
function load(raw) {
  const base = defaults();
  let input = raw;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch (_) {
      return base;
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;

  const size = input.size && typeof input.size === 'object' ? input.size : {};
  return {
    open: input.open === true,
    position: isPosition(input.position) ? input.position : base.position,
    tab: isTab(input.tab) ? input.tab : base.tab,
    order: normalizeOrder(input.order, TABS),
    size: {
      bottom: clampSize('bottom', size.bottom),
      right: clampSize('right', size.right)
    }
  };
}

function copy(state) {
  return {
    open: state.open,
    position: state.position,
    tab: state.tab,
    order: normalizeOrder(state.order, TABS),
    size: { bottom: state.size.bottom, right: state.size.right }
  };
}

/** Open on `tab` (or the current tab when omitted). */
function open(state, tab) {
  const next = copy(state);
  next.open = true;
  if (tab !== undefined) {
    if (!isTab(tab)) return copy(state);
    next.tab = tab;
  }
  return next;
}

function close(state) {
  const next = copy(state);
  next.open = false;
  return next;
}

/**
 * The status-bar icon / menu item semantics: open on that tab → closed;
 * open on another tab → switched to it; closed → open on it.
 */
function toggleTab(state, tab) {
  if (!isTab(tab)) return copy(state);
  if (state.open && state.tab === tab) return close(state);
  return open(state, tab);
}

/** Toggle open/closed, keeping the tab. */
function toggle(state) {
  return state.open ? close(state) : open(state);
}

function setPosition(state, position) {
  if (!isPosition(position)) return copy(state);
  const next = copy(state);
  next.position = position;
  return next;
}

/**
 * Resize the current side to `px`, clamped to `[min, maxShare × available]`.
 * `available` is the center's extent on the dock's axis (height when docked
 * at the bottom, width when on the right).
 */
function resize(state, px, available) {
  const next = copy(state);
  next.size[state.position] = clampSize(state.position, px, available);
  return next;
}

/**
 * Move tab `id` to index `to` in the strip (a drag's release). An unknown
 * id or an out-of-range index leaves the order as it was; the open tab is
 * untouched — reordering never changes what the dock shows.
 */
function reorder(state, id, to) {
  const next = copy(state);
  if (!isTab(id)) return next;
  next.order = moveId(next.order, id, to);
  return next;
}

/** Replace the strip's order outright (normalized, so it is always a full permutation). */
function setOrder(state, order) {
  const next = copy(state);
  next.order = normalizeOrder(order, TABS);
  return next;
}

/** The string written to localStorage. */
function serialize(state) {
  return JSON.stringify({
    open: state.open,
    position: state.position,
    tab: state.tab,
    order: normalizeOrder(state.order, TABS),
    size: { bottom: state.size.bottom, right: state.size.right }
  });
}

module.exports = {
  STORAGE_KEY,
  TABS,
  TAB_SHORTCUTS,
  HIDDEN_TABS,
  POSITIONS,
  LIMITS,
  defaults,
  load,
  open,
  close,
  toggle,
  toggleTab,
  setPosition,
  resize,
  reorder,
  setOrder,
  clampSize,
  serialize
};
