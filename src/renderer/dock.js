/**
 * Dock — the VS Code-style panel beside the center (dock-panel-readonly-views
 * spec).
 *
 * A region, not a view mode. `#dock` is the last child of
 * `#terminal-container`: below the center by default, to its right when the
 * container carries `.dock-right` (D7). Opening it never changes what the
 * center shows — terminals, a spec, the tasks board all stay where they are
 * and shrink to make room; closing it gives the room back (C1, C2).
 *
 * The state (open / position / tab / size) is `dock/dockState.js`'s — pure,
 * tested — and this module is the host: it applies a state to the DOM,
 * persists it under `dockState.STORAGE_KEY` (app-wide, not per project),
 * mounts exactly one tab's surface at a time, and refits the terminals after
 * anything that changes the center's size. During a drag the size is
 * applied per animation frame; the terminal refit and the tab's own refit
 * run once, on mouseup (C1 — no resize storm).
 *
 * `DOCK_TABS` is the hosting table: label, icon, `mount(slot)`,
 * `unmount(slot)`, optional `refit()`. The surfaces themselves are not
 * rewritten here — Prompts / Activity / Feedback keep their elements and
 * `show()/hide()` and are re-parented into their slot (D9); Decisions and
 * Structure render into theirs.
 *
 * Every entry point — status bar, View menu, palette, shortcut — reaches
 * this module through a registered command (D12); nothing calls it from
 * main.
 */

const dockState = require('./dock/dockState');
const {
  PanelBottom, PanelRight, X,
  ScrollText, Waypoints, SquareTerminal, Activity, MessageSquarePlus
} = require('lucide');

/** Inline SVG for a lucide icon's data (the shape sectionRail.js uses). */
function lucideIcon(data, size = 14) {
  const children = data.map(([tag, attrs]) => {
    const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${attrStr}/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;flex-shrink:0">${children}</svg>`;
}

/**
 * The hosting table. Each entry: `label` (tab strip), `icon` (lucide data,
 * for the status bar), `mount(slot)` when the tab becomes active,
 * `unmount(slot)` when it stops being active or the dock closes, and an
 * optional `refit()` after a resize-end or side change. Surfaces are added
 * by the tasks that move them (T03–T05).
 */
const DOCK_TABS = {
  decisions: { label: 'Decisions', icon: ScrollText, mount() {}, unmount() {} },
  structure: { label: 'Structure', icon: Waypoints, mount() {}, unmount() {} },
  prompts: { label: 'Prompts', icon: SquareTerminal, mount() {}, unmount() {} },
  activity: { label: 'Activity', icon: Activity, mount() {}, unmount() {} },
  feedback: { label: 'Feedback', icon: MessageSquarePlus, mount() {}, unmount() {} }
};

let state = dockState.defaults();
let containerEl = null; // #terminal-container
let dockEl = null;
let tabsEl = null;
let bodyEl = null;
let moveBtn = null;
let handleEl = null;
const slots = new Map(); // tab id -> .dock-slot
let mountedTab = null;   // which DOCK_TABS entry currently owns its slot
const listeners = new Set();
let initialized = false;

// ─── Persistence ───────────────────────────────────────────

function loadState() {
  try {
    return dockState.load(localStorage.getItem(dockState.STORAGE_KEY));
  } catch (_) {
    return dockState.defaults();
  }
}

function persist() {
  try {
    localStorage.setItem(dockState.STORAGE_KEY, dockState.serialize(state));
  } catch (err) {
    console.error('dock: failed to persist state:', err);
  }
}

// ─── Init ──────────────────────────────────────────────────

function init() {
  if (initialized) return;
  dockEl = document.getElementById('dock');
  containerEl = document.getElementById('terminal-container');
  if (!dockEl || !containerEl) {
    // A control that fails to bind must say so (C7): a missing dock would
    // just look like five status-bar icons that do nothing.
    console.error('dock: #dock or #terminal-container not found — the panel will not open');
    return;
  }
  initialized = true;

  tabsEl = dockEl.querySelector('.dock-tabs');
  bodyEl = dockEl.querySelector('.dock-body');
  moveBtn = dockEl.querySelector('.dock-move');
  handleEl = dockEl.querySelector('.dock-resize-handle');
  const closeBtn = dockEl.querySelector('.dock-close');

  // Tab strip + one slot per tab, in dockState's order.
  dockState.TABS.forEach((tab) => {
    const entry = DOCK_TABS[tab];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-tab';
    btn.dataset.tab = tab;
    btn.setAttribute('role', 'tab');
    btn.textContent = entry ? entry.label : tab;
    btn.addEventListener('click', () => open(tab));
    tabsEl.appendChild(btn);

    const slot = document.createElement('div');
    slot.className = 'dock-slot';
    slot.dataset.tab = tab;
    bodyEl.appendChild(slot);
    slots.set(tab, slot);
  });

  if (closeBtn) {
    closeBtn.innerHTML = lucideIcon(X, 14);
    closeBtn.addEventListener('click', close);
  }
  if (moveBtn) {
    moveBtn.addEventListener('click', () => {
      setPosition(state.position === 'right' ? 'bottom' : 'right');
    });
  }
  if (handleEl) bindResize(handleEl);

  state = loadState();
  apply({ refit: state.open });
}

// ─── Applying state to the DOM ─────────────────────────────

/** The center's extent on the dock's axis, for the size ceiling. */
function available(position = state.position) {
  if (!containerEl) return 0;
  const cs = getComputedStyle(containerEl);
  if (position === 'right') {
    return containerEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }
  return containerEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
}

function applySize() {
  const px = dockState.clampSize(state.position, state.size[state.position], available());
  if (state.position === 'right') {
    dockEl.style.width = `${px}px`;
    dockEl.style.height = '';
  } else {
    dockEl.style.height = `${px}px`;
    dockEl.style.width = '';
  }
  return px;
}

/**
 * Paint `state`: side class, size, open/closed, active tab, mounted
 * surface. `refit` runs the terminal fit afterwards — every caller that
 * changed the center's size passes it; a pure tab switch does not.
 */
function apply({ refit = false } = {}) {
  containerEl.classList.toggle('dock-right', state.position === 'right');
  containerEl.classList.toggle('dock-bottom', state.position !== 'right');
  containerEl.classList.toggle('dock-open', state.open);
  dockEl.classList.toggle('open', state.open);
  dockEl.setAttribute('aria-hidden', String(!state.open));

  if (moveBtn) {
    const toRight = state.position !== 'right';
    moveBtn.innerHTML = lucideIcon(toRight ? PanelRight : PanelBottom, 14);
    moveBtn.title = toRight ? 'Move Panel Right' : 'Move Panel to Bottom';
    moveBtn.setAttribute('aria-label', moveBtn.title);
  }

  tabsEl.querySelectorAll('.dock-tab').forEach((btn) => {
    const on = btn.dataset.tab === state.tab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
  });
  slots.forEach((slot, tab) => slot.classList.toggle('active', tab === state.tab));

  if (state.open) {
    // Re-clamp the stored size against the measured center on every apply:
    // a size saved on a taller window must not clip the terminals here.
    const px = applySize();
    if (px !== state.size[state.position]) {
      state = dockState.resize(state, px, available());
    }
    mountTab(state.tab);
  } else {
    unmountTab();
  }

  persist();
  if (refit) refitCenter();
  emit();
}

function mountTab(tab) {
  if (mountedTab === tab) return;
  unmountTab();
  const entry = DOCK_TABS[tab];
  const slot = slots.get(tab);
  if (!entry || !slot) return;
  mountedTab = tab;
  try {
    entry.mount(slot);
  } catch (err) {
    console.error(`dock: failed to mount '${tab}':`, err);
  }
}

function unmountTab() {
  if (!mountedTab) return;
  const tab = mountedTab;
  mountedTab = null;
  const entry = DOCK_TABS[tab];
  const slot = slots.get(tab);
  if (!entry || !slot) return;
  try {
    entry.unmount(slot);
  } catch (err) {
    console.error(`dock: failed to unmount '${tab}':`, err);
  }
}

/** Terminals refit through the existing fit path (D13). */
function refitCenter() {
  try {
    require('./terminal').fitTerminal();
  } catch (_) { /* terminal UI not initialized yet */ }
}

/** The active tab's own refit (Structure re-renders its graph to the new box). */
function refitTab() {
  const entry = mountedTab && DOCK_TABS[mountedTab];
  if (entry && typeof entry.refit === 'function') {
    try {
      entry.refit(slots.get(mountedTab));
    } catch (err) {
      console.error(`dock: refit of '${mountedTab}' failed:`, err);
    }
  }
}

function emit() {
  const snapshot = snapshotState();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.error('dock: onChange listener failed:', err);
    }
  });
}

function snapshotState() {
  return { open: state.open, position: state.position, tab: state.tab };
}

// ─── Drag-resize ───────────────────────────────────────────

function bindResize(handle) {
  let dragging = false;
  let startPos = 0;
  let startSize = 0;
  let pending = null;
  let rafHandle = null;

  const onMove = (e) => {
    if (!dragging) return;
    const delta = state.position === 'right'
      ? startPos - e.clientX
      : startPos - e.clientY;
    pending = dockState.clampSize(state.position, startSize + delta, available());
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      if (pending == null) return;
      if (state.position === 'right') dockEl.style.width = `${pending}px`;
      else dockEl.style.height = `${pending}px`;
    });
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.classList.remove('dock-resizing', 'dock-resizing-ns', 'dock-resizing-ew');
    handle.classList.remove('dragging');
    if (rafHandle) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    const finalPx = pending != null ? pending : state.size[state.position];
    pending = null;
    state = dockState.resize(state, finalPx, available());
    applySize();
    persist();
    // One refit for the terminals and one for the tab, on release only.
    refitCenter();
    refitTab();
    emit();
  };

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !state.open) return;
    e.preventDefault();
    dragging = true;
    startPos = state.position === 'right' ? e.clientX : e.clientY;
    startSize = state.position === 'right' ? dockEl.offsetWidth : dockEl.offsetHeight;
    pending = null;
    document.body.classList.add('dock-resizing', state.position === 'right' ? 'dock-resizing-ew' : 'dock-resizing-ns');
    handle.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── Public API ────────────────────────────────────────────

function ensureReady() {
  if (!initialized) {
    console.error('dock: not initialized — call dock.init() first');
    return false;
  }
  return true;
}

/** Open on `tab` (or the last tab). A tab switch on an open dock is not a size change. */
function open(tab) {
  if (!ensureReady()) return;
  const wasOpen = state.open;
  state = dockState.open(state, tab);
  apply({ refit: !wasOpen });
}

function close() {
  if (!ensureReady()) return;
  if (!state.open) return;
  state = dockState.close(state);
  apply({ refit: true });
}

/** ⌘J: open ↔ closed, reopening on the last tab at the last size. */
function toggle() {
  if (!ensureReady()) return;
  if (state.open) close(); else open();
}

/** Status-bar / menu semantics: on it → close; on another → switch; closed → open on it. */
function toggleTab(tab) {
  if (!ensureReady()) return;
  const wasOpen = state.open;
  state = dockState.toggleTab(state, tab);
  apply({ refit: wasOpen !== state.open });
}

function setPosition(position) {
  if (!ensureReady()) return;
  if (state.position === position) return;
  state = dockState.setPosition(state, position);
  apply({ refit: state.open });
  if (state.open) refitTab();
}

function isOpen() {
  return state.open;
}

function activeTab() {
  return state.tab;
}

function position() {
  return state.position;
}

/**
 * Re-run the active tab's mount (the project changed under an open
 * Decisions / Structure tab). Unmount then mount, so a re-parented panel's
 * show() reloads exactly as it would on a fresh open.
 */
function remountActive() {
  if (!initialized || !state.open) return;
  const tab = state.tab;
  unmountTab();
  mountTab(tab);
}

/** Follow the dock: fn({ open, position, tab }) after every change. */
function onChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = {
  init,
  open,
  close,
  toggle,
  toggleTab,
  setPosition,
  isOpen,
  activeTab,
  position,
  remountActive,
  onChange,
  DOCK_TABS,
  lucideIcon
};
