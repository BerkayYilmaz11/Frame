/**
 * Notice tray — the `!` indicator at the right end of the status bar and
 * the popover behind it (status-bar-notice-tray spec).
 *
 * Replaces healthNotice's top-of-window banner, which sat on the app header
 * with a translucent background and kept only the latest message. Every
 * notice main pushes this session lands here instead: the indicator takes
 * the worst unread severity's colour (red error, amber warning, a calm blue
 * dot for info) and counts unread errors and warnings; it never opens by
 * itself (D3).
 *
 * The popover opens upward from the bar's right end in the branch picker's
 * surface: newest first, the full message wrapped rather than ellipsised,
 * "Clear all" in its header. Opening marks everything read, and a notice
 * that arrives while it is open is added already read — the user is looking.
 * Messages carry error text and paths, so every one is set with
 * `textContent`, never `innerHTML`.
 *
 * This is the DOM host. What the list holds and what the indicator shows
 * come from `noticeTrayModel` (pure, tested); this file keeps the state,
 * paints and wires events. `push()` works before `init()` — a notice that
 * arrives before the bar is built is kept and painted once it is.
 */

const { CircleAlert, CircleX, TriangleAlert, Info } = require('lucide');
const dock = require('../dock');
const tooltip = require('../tooltip');
const model = require('./noticeTrayModel');

let buttonEl = null;
let countEl = null;
let rootEl = null;
let listEl = null;
let clearEl = null;
let onOpenCb = null;

let list = [];
let nextId = 1;
let opened = false;

const TONE_CLASSES = ['tone-error', 'tone-warning', 'tone-info'];

const SEVERITY_ICON = {
  error: dock.lucideIcon(CircleX, 14),
  warning: dock.lucideIcon(TriangleAlert, 14),
  info: dock.lucideIcon(Info, 14)
};

/**
 * @param {object} opts
 * @param {HTMLElement} opts.slotEl - `.status-bar-right`, the positioning context
 * @param {() => void} [opts.onOpen] - runs as the popover opens (closes the bar's other popovers)
 */
function init(opts) {
  if (buttonEl) return;
  onOpenCb = opts.onOpen || null;

  buttonEl = document.createElement('button');
  buttonEl.type = 'button';
  buttonEl.className = 'sb-notices';
  buttonEl.setAttribute('aria-haspopup', 'dialog');
  buttonEl.setAttribute('aria-expanded', 'false');
  buttonEl.innerHTML = `${dock.lucideIcon(CircleAlert, 16)}<span class="sb-notices-count"></span><span class="sb-notices-dot" aria-hidden="true"></span>`;
  countEl = buttonEl.querySelector('.sb-notices-count');

  rootEl = document.createElement('div');
  rootEl.className = 'sb-notice-tray';
  rootEl.hidden = true;
  rootEl.tabIndex = -1;
  rootEl.setAttribute('role', 'dialog');
  rootEl.setAttribute('aria-label', 'Notices');
  rootEl.innerHTML = `
    <div class="sb-nt-head">
      <span class="sb-nt-title">Notices</span>
      <button type="button" class="sb-nt-clear">Clear all</button>
    </div>
    <div class="sb-nt-list"></div>
  `;
  listEl = rootEl.querySelector('.sb-nt-list');
  clearEl = rootEl.querySelector('.sb-nt-clear');

  opts.slotEl.append(rootEl, buttonEl);

  // The tooltip is fixed text; the state lives in the aria-label and in the
  // count beside the glyph.
  tooltip.attach(buttonEl, 'Notices');
  buttonEl.addEventListener('click', toggle);
  clearEl.addEventListener('click', () => {
    list = model.clear();
    _paint();
  });

  _paint();
}

/**
 * Record a notice. Safe before init().
 *
 * @param {{ severity?: 'error'|'warning'|'info', source?: string, message: string }} notice
 */
function push(notice) {
  list = model.add(list, notice, { now: Date.now(), id: nextId });
  nextId += 1;
  if (opened) list = model.markAllRead(list);
  _paint();
}

function isOpen() {
  return opened;
}

function toggle() {
  if (opened) close(); else open();
}

function open() {
  if (!rootEl || opened) return;
  if (onOpenCb) onOpenCb();
  opened = true;
  list = model.markAllRead(list);
  _paint();
  rootEl.hidden = false;
  buttonEl.setAttribute('aria-expanded', 'true');
  rootEl.focus();
}

function close() {
  if (!rootEl || !opened) return;
  opened = false;
  rootEl.hidden = true;
  buttonEl.setAttribute('aria-expanded', 'false');
}

function _paint() {
  _paintIndicator();
  if (opened) _renderList();
}

function _paintIndicator() {
  if (!buttonEl) return;
  const { tone, unread } = model.indicator(list);

  buttonEl.classList.remove(...TONE_CLASSES);
  if (tone !== 'none') buttonEl.classList.add(`tone-${tone}`);
  countEl.textContent = unread > 0 ? String(unread) : '';

  buttonEl.setAttribute('aria-label', _describe(tone, unread));
}

function _describe(tone, unread) {
  if (list.length === 0) return 'Notices: none';
  if (unread > 0) {
    const errors = list.filter((n) => n.unread && n.severity === 'error').length;
    const warnings = unread - errors;
    const parts = [];
    if (errors) parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
    if (warnings) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
    return `Notices: ${parts.join(', ')} unread`;
  }
  if (tone === 'info') return 'Notices: new information';
  return `Notices: ${list.length} read`;
}

function _renderList() {
  listEl.textContent = '';
  clearEl.hidden = list.length === 0;

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sb-nt-empty';
    empty.textContent = 'No notices this session.';
    listEl.appendChild(empty);
    return;
  }

  for (const notice of list) {
    listEl.appendChild(_buildRow(notice));
  }
}

function _buildRow(notice) {
  const row = document.createElement('div');
  row.className = `sb-nt-row ${notice.severity}`;
  row.dataset.id = String(notice.id);

  const icon = document.createElement('span');
  icon.className = 'sb-nt-icon';
  icon.innerHTML = SEVERITY_ICON[notice.severity] || SEVERITY_ICON.error;

  const body = document.createElement('div');
  body.className = 'sb-nt-body';

  const meta = document.createElement('div');
  meta.className = 'sb-nt-meta';
  const source = document.createElement('span');
  source.className = 'sb-nt-source';
  source.textContent = model.sourceLabel(notice.source);
  const time = document.createElement('span');
  time.className = 'sb-nt-time';
  time.textContent = new Date(notice.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  meta.append(source, time);
  if (notice.count > 1) {
    const count = document.createElement('span');
    count.className = 'sb-nt-repeat';
    count.textContent = `×${notice.count}`;
    meta.appendChild(count);
  }

  const message = document.createElement('div');
  message.className = 'sb-nt-message';
  message.textContent = notice.message;

  body.append(meta, message);
  row.append(icon, body);
  return row;
}

module.exports = { init, push, open, close, toggle, isOpen };
