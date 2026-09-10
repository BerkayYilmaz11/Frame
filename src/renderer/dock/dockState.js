/**
 * Dock state — pure (dock-panel-readonly-views spec, D2).
 *
 * The dock is a region beside the center content: open or closed, docked at
 * the bottom or on the right, showing one tab, at one size per side. This
 * module owns that state and nothing else — no DOM, no localStorage, no
 * Electron — so the transitions that are easy to get wrong twice (toggle on
 * the open tab closes, toggle on another switches; sizes clamp to what the
 * center can spare) are pinned by `test/dockState.test.js`.
 *
 * The host (`dock.js`) applies a state to the DOM and persists
 * `serialize()`'s string under `STORAGE_KEY`, app-wide, not per project.
 */

const STORAGE_KEY = 'frame-dock';

/** Ordered tab ids — the strip's order, and the status-bar icons' order. */
const TABS = ['decisions', 'structure', 'prompts', 'activity', 'feedback'];

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
 * clamped to their floors; a non-object → defaults.
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

/** The string written to localStorage. */
function serialize(state) {
  return JSON.stringify({
    open: state.open,
    position: state.position,
    tab: state.tab,
    size: { bottom: state.size.bottom, right: state.size.right }
  });
}

module.exports = {
  STORAGE_KEY,
  TABS,
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
  clampSize,
  serialize
};
