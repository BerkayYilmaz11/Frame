/**
 * Notice tray model — pure (status-bar-notice-tray spec, D6).
 *
 * The list behind the status bar's `!` indicator: every degraded-state or
 * error notice main pushed this session, newest first. An identical repeat
 * (same severity, source and message) does not add a row — it bumps the
 * existing row's count, time and unread flag and moves it to the top, so an
 * uncaught-exception loop reads as one `×N` row. The list is capped (D8)
 * for the loop whose message varies on every throw.
 *
 * The indicator's tone is the worst unread severity; its number counts only
 * unread errors and warnings — info (the migration receipt) is a calm dot,
 * not a count (D1). Every function returns a new list and never mutates its
 * input. No `lucide`, no DOM, no Electron — pinned by
 * `test/noticeTrayModel.test.js`.
 */

const MAX_NOTICES = 50;

const SEVERITIES = ['error', 'warning', 'info'];
const RANK = { error: 3, warning: 2, info: 1 };

const SOURCE_LABELS = {
  'uncaught-exception': 'Main process',
  'unhandled-rejection': 'Main process',
  dependency: 'Dependencies',
  'state-file': 'State files',
  'tasks-file': 'tasks.json',
  'codex-hooks': 'Codex',
  migration: 'Layout migration'
};

function normalizeSeverity(severity) {
  return SEVERITIES.includes(severity) ? severity : 'error';
}

/**
 * Add a notice, merging it into an identical row when one exists.
 *
 * @param {Array<object>} list
 * @param {{ severity?: string, source?: string, message?: string }} input
 * @param {{ now: number, id: number }} meta - `id` is used only for a new row
 * @returns {Array<object>}
 */
function add(list, input, { now, id }) {
  const current = Array.isArray(list) ? list : [];
  const severity = normalizeSeverity(input && input.severity);
  const source = (input && input.source) || 'unknown';
  const message = String((input && input.message) || '');

  const idx = current.findIndex((n) => (
    n.severity === severity && n.source === source && n.message === message
  ));

  let row;
  let rest;
  if (idx >= 0) {
    const existing = current[idx];
    row = { ...existing, count: existing.count + 1, lastAt: now, unread: true };
    rest = current.filter((_, i) => i !== idx);
  } else {
    row = { id, severity, source, message, count: 1, firstAt: now, lastAt: now, unread: true };
    rest = current;
  }
  return [row, ...rest].slice(0, MAX_NOTICES);
}

function dismiss(list, id) {
  return (Array.isArray(list) ? list : []).filter((n) => n.id !== id);
}

function clear() {
  return [];
}

function markAllRead(list) {
  return (Array.isArray(list) ? list : []).map((n) => (n.unread ? { ...n, unread: false } : n));
}

/**
 * What the indicator shows.
 *
 * @returns {{ tone: 'none'|'info'|'warning'|'error', unread: number }}
 */
function indicator(list) {
  let tone = 'none';
  let unread = 0;
  for (const n of Array.isArray(list) ? list : []) {
    if (!n.unread) continue;
    if (n.severity !== 'info') unread += 1;
    if (tone === 'none' || RANK[n.severity] > RANK[tone]) tone = n.severity;
  }
  return { tone, unread };
}

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source || 'Frame';
}

/** Row focus for ArrowUp/ArrowDown, wrapping; -1 when there are no rows. */
function moveFocus(index, length, delta) {
  if (!length || length < 1) return -1;
  const step = delta < 0 ? -1 : 1;
  if (index < 0 || index >= length) return step > 0 ? 0 : length - 1;
  return (index + step + length) % length;
}

module.exports = {
  MAX_NOTICES, add, dismiss, clear, markAllRead, indicator, sourceLabel, moveFocus
};
