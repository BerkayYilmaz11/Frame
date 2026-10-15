/**
 * Tasks screen list model — what the grid lists for a given scope, filter,
 * sort, done window and spec-tasks reveal.
 *
 * Pure by design (tasks-list-view spec, D11), like `specs/filterModel.js`:
 * a function over the task list, so the scope × section × spec reveal ×
 * window rules are testable and `tasksDashboard.js` only renders what comes
 * back.
 *
 * Rules:
 * - a spec task is one whose `source` starts with `spec:`; its slug is the
 *   second `:` field. Spec tasks are listed only while revealed, and then in
 *   the status sections like any other task, under the same scope, window
 *   and sort rules (D4 as amended by T09).
 * - an unknown status counts as `pending`.
 * - `matches` (the category/priority filter) narrows the pool before
 *   anything is counted.
 * - sections per scope: `active` → in_progress, pending; `done` →
 *   completed; `all` → all three. Completed tasks — spec tasks included —
 *   older than `windowDays` are dropped and reported as `olderCount`,
 *   unless `windowDays` is 0 or `showOlder`. Active is never windowed. Age
 *   is read from `completedAt || updatedAt`.
 * - `sortMode` (`default` | `category` | `priority`) sorts inside each
 *   section, stable on file order.
 * - `counts` answer "what will I see if I click": spec tasks enter `all`,
 *   `active` and `done` only while revealed, and `done` follows the window.
 *   `doneTotal` is the unwindowed done count; `specTasks` is how many spec
 *   tasks the current scope would list if revealed.
 */

const { partitionDone } = require('../../shared/doneWindow');

const SCOPES = Object.freeze(['all', 'active', 'done']);

const SECTIONS = Object.freeze([
  { id: 'in_progress', label: 'In progress' },
  { id: 'pending',     label: 'Pending' },
  { id: 'completed',   label: 'Completed' }
]);

const SECTIONS_BY_SCOPE = Object.freeze({
  all: ['in_progress', 'pending', 'completed'],
  active: ['in_progress', 'pending'],
  done: ['completed']
});

const STATUSES = SECTIONS.map(s => s.id);
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

/** The spec slug of a `spec:<slug>:T##` task, or null for any other task. */
function specSlugOf(task) {
  const source = task && typeof task.source === 'string' ? task.source : '';
  if (!source.startsWith('spec:')) return null;
  return source.split(':')[1] || null;
}

const isSpecTask = (task) => !!(task && typeof task.source === 'string' && task.source.startsWith('spec:'));

const statusOf = (task) => (STATUSES.includes(task.status) ? task.status : 'pending');

function comparatorFor(sortMode, indexOf) {
  if (sortMode === 'priority') {
    return (a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      return pa !== pb ? pa - pb : indexOf.get(a) - indexOf.get(b);
    };
  }
  if (sortMode === 'category') {
    return (a, b) => {
      const cmp = (a.category || '').localeCompare(b.category || '');
      return cmp !== 0 ? cmp : indexOf.get(a) - indexOf.get(b);
    };
  }
  return null;
}

function buildListModel({
  tasks = [],
  scope = 'active',
  showSpecTasks = false,
  matches = () => true,
  sortMode = 'default',
  windowDays = 0,
  showOlder = false,
  now = Date.now()
} = {}) {
  const effectiveScope = SCOPES.includes(scope) ? scope : 'active';
  const pool = tasks.filter(t => t && matches(t));
  const indexOf = new Map(pool.map((t, i) => [t, i]));

  // The window is off when set to "all" or once revealed.
  const windowed = windowDays > 0 && !showOlder;
  const completed = pool.filter(t => statusOf(t) === 'completed');
  const { older } = windowed
    ? partitionDone(completed, { days: windowDays, now, dateOf: t => t.completedAt || t.updatedAt })
    : { older: [] };
  const hidden = new Set(older);

  const inScope = (task) => {
    const status = statusOf(task);
    if (status === 'completed') return effectiveScope !== 'active' && !hidden.has(task);
    return effectiveScope !== 'done';
  };

  const counts = { all: 0, active: 0, done: 0, doneTotal: 0, specTasks: 0 };
  for (const task of pool) {
    const spec = isSpecTask(task);
    const done = statusOf(task) === 'completed';
    if (spec && inScope(task)) counts.specTasks++;
    if (spec && !showSpecTasks) continue;
    if (done) {
      counts.doneTotal++;
      if (!hidden.has(task)) { counts.done++; counts.all++; }
    } else {
      counts.active++;
      counts.all++;
    }
  }

  const compare = comparatorFor(sortMode, indexOf);
  const listable = (task) => showSpecTasks || !isSpecTask(task);
  const sections = SECTIONS_BY_SCOPE[effectiveScope].map((id) => {
    const list = pool.filter(t => listable(t) && statusOf(t) === id && inScope(t));
    if (compare) list.sort(compare);
    return { id, tasks: list };
  });

  const olderCount = effectiveScope === 'active'
    ? 0
    : older.filter(t => showSpecTasks || !isSpecTask(t)).length;

  return { scope: effectiveScope, sections, olderCount, counts };
}

module.exports = { SCOPES, SECTIONS, specSlugOf, isSpecTask, buildListModel };
