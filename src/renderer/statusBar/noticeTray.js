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
 * This is the DOM host. What the list holds and what the indicator shows
 * come from `noticeTrayModel` (pure, tested); this file keeps the state,
 * paints and wires events. `push()` works before `init()` — a notice that
 * arrives before the bar is built is kept and painted once it is.
 */

const { CircleAlert } = require('lucide');
const dock = require('../dock');
const tooltip = require('../tooltip');
const model = require('./noticeTrayModel');

let buttonEl = null;
let countEl = null;

let list = [];
let nextId = 1;

const TONE_CLASSES = ['tone-error', 'tone-warning', 'tone-info'];

/**
 * @param {object} opts
 * @param {HTMLElement} opts.slotEl - `.status-bar-right`, the positioning context
 */
function init(opts) {
  if (buttonEl) return;

  buttonEl = document.createElement('button');
  buttonEl.type = 'button';
  buttonEl.className = 'sb-notices';
  buttonEl.setAttribute('aria-haspopup', 'dialog');
  buttonEl.setAttribute('aria-expanded', 'false');
  buttonEl.innerHTML = `${dock.lucideIcon(CircleAlert, 16)}<span class="sb-notices-count"></span><span class="sb-notices-dot" aria-hidden="true"></span>`;
  countEl = buttonEl.querySelector('.sb-notices-count');
  opts.slotEl.appendChild(buttonEl);

  // The tooltip is fixed text; the state lives in the aria-label and in the
  // count beside the glyph.
  tooltip.attach(buttonEl, 'Notices');

  _paintIndicator();
}

/**
 * Record a notice. Safe before init().
 *
 * @param {{ severity?: 'error'|'warning'|'info', source?: string, message: string }} notice
 */
function push(notice) {
  list = model.add(list, notice, { now: Date.now(), id: nextId });
  nextId += 1;
  _paintIndicator();
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

module.exports = { init, push };
