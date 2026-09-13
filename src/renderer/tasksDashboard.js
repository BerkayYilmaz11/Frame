/**
 * Tasks Dashboard Module
 *
 * Full-page Kanban board with three columns (Pending / In Progress /
 * Completed). Cards are draggable within and across columns; drops persist
 * via REORDER_TASKS, which rewrites tasks.json so array order matches column
 * order and each task's status reflects its column.
 *
 * Cards are intentionally minimal here — no Play / Complete / Pause buttons.
 * Clicking a card slides a full-page detail drawer in from the right over
 * the board (same motion as the specs dashboard) with the full task body
 * (description, original userRequest, acceptance criteria, notes, context).
 * The right aside only hosts the New Task form now; with no open form it
 * leaves the layout so the three columns get the full width.
 *
 * The task in the drawer is also pinned as a chip in the top bar (via the
 * inline host's drawerOpened/drawerClosed hooks). One chip, replaced on
 * every open; it outlives the drawer and the view, so switching to Home or
 * Terminals and back never loses the task — clicking the chip re-opens it.
 *
 * State is sourced from the same TASKS_DATA stream used by the side panel,
 * so the dashboard, the side panel, and the on-disk tasks.json all stay in
 * sync — no separate fetch.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');
const doneWindow = require('./doneWindow');
const { partitionDone } = require('../shared/doneWindow');

const STATUS_COLUMNS = ['pending', 'in_progress', 'completed'];
const STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed'
};

let isVisible = false;
let tasks = [];
let selectedTaskId = null;
let dashboardEl = null;
let columnEls = {};
let countEls = {};
let headerEls = {};
// Completed tasks older than the project's done window hide behind a
// "Show N older" footer (boards-done-window spec). The reveal is session
// state on the open project: it survives TASKS_DATA re-renders and resets
// when the project changes.
let showOlderDone = false;
let loadedProjectPath = null;
let detailEl = null;         // right aside — hosts the New Task form
let drawerEl = null;         // full-page task detail drawer
let detailContentEl = null;  // detail body inside the drawer
let detailFormEl = null;
let dragSource = null;

/**
 * Dashboard-only filter state. Empty set on a dimension means "no filter on
 * this dimension"; multi-select within a dimension is OR; across dimensions
 * is AND. Never persisted to tasks.json — this is purely a viewing layer.
 */
const filters = { categories: new Set(), priorities: new Set() };
let filterBtnEl = null;
let filterPopoverEl = null;
let filterBadgeEl = null;

/**
 * Sort state. mode is 'default' | 'category' | 'priority' (default = file
 * order, the original behavior). applyToFile is the toggle: when true,
 * picking a sort also rewrites tasks.json via REORDER_TASKS so the new order
 * persists.
 */
const sort = { mode: 'default', applyToFile: false };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
let sortBtnEl = null;
let sortPopoverEl = null;
let sortLabelEl = null;

function init() {
  dashboardEl = document.getElementById('tasks-dashboard');
  if (!dashboardEl) return;

  detailEl = document.getElementById('tasks-dashboard-detail');
  drawerEl = document.getElementById('tasks-dashboard-task-drawer');
  detailContentEl = drawerEl.querySelector('.tasks-dashboard-detail-content');
  detailFormEl = document.getElementById('tasks-dashboard-form');

  for (const status of STATUS_COLUMNS) {
    columnEls[status] = dashboardEl.querySelector(`[data-drop-status="${status}"]`);
    countEls[status] = dashboardEl.querySelector(`[data-count-for="${status}"]`);
    headerEls[status] = dashboardEl.querySelector(`[data-column="${status}"] .tasks-dashboard-column-header`);
  }

  setupDropTargets();

  // The done window is a project setting; when it moves, the Completed
  // column re-partitions from the data it already holds.
  doneWindow.onChange(() => { if (isVisible) render(); });

  document.getElementById('tasks-dashboard-close').addEventListener('click', hide);

  // The header New Task button opens the form inside the right aside rather
  // than the modal — the modal is reserved for the tasks side panel.
  document.getElementById('tasks-dashboard-add').addEventListener('click', showForm);

  drawerEl.querySelector('.tasks-dashboard-task-drawer-close').addEventListener('click', () => clearSelection());
  drawerEl.querySelector('.tasks-dashboard-task-drawer-back').addEventListener('click', () => clearSelection());

  // Delete button on the selected card — routes through the shared confirm
  // modal before any DELETE_TASK is dispatched.
  const deleteBtn = drawerEl.querySelector('.tasks-dashboard-detail-delete');
  if (deleteBtn) deleteBtn.addEventListener('click', requestDeleteSelected);

  setupForm();
  setupFilter();
  setupSort();

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isVisible) return;
    // Don't intercept Esc while the side-panel modal is on top — that flow
    // owns its own dismissal.
    const modal = document.getElementById('task-modal');
    if (modal && modal.classList.contains('visible')) return;

    if (isFilterPopoverOpen()) {
      closeFilterPopover();
    } else if (isSortPopoverOpen()) {
      closeSortPopover();
    } else if (isFormOpen()) {
      hideForm();
    } else if (selectedTaskId) {
      clearSelection();
    } else {
      hide();
    }
  });

  ipcRenderer.on(IPC.TASKS_DATA, (event, { tasks: data }) => {
    tasks = flatten(data);
    if (isVisible) render();
  });

  ipcRenderer.on(IPC.TOGGLE_TASKS_DASHBOARD, () => toggle());

  // Activity dots track the live agent state of lanes working on tasks
  require('./agentDispatch').onTaskLaneActivity(() => {
    if (isVisible) render();
  });
}

function flatten(data) {
  if (!data || !data.tasks) return [];
  if (Array.isArray(data.tasks)) return data.tasks.slice();
  // Defensive: legacy nested shape (loader normally migrates this).
  return [
    ...(data.tasks.pending || []).map(t => ({ ...t, status: 'pending' })),
    ...(data.tasks.inProgress || []).map(t => ({ ...t, status: 'in_progress' })),
    ...(data.tasks.completed || []).map(t => ({ ...t, status: 'completed' }))
  ];
}

// ─── Inline hosting (center-specs-tasks-views spec) ────────
// Same contract as specsDashboard: with an inline host registered, the board
// renders inside the center content area and all legacy entry points route
// through the host — the full-window overlay path goes dormant.

let inlineHost = null;     // { open(), close(), drawerOpened?({id,title}), drawerClosed?() } — set by multiTerminalUI
let inlineMounted = false;
let overlayParent = null;

function setInlineHost(host) {
  inlineHost = host;
}

function mountInline(container) {
  if (!dashboardEl || !container) return;
  if (!overlayParent) overlayParent = dashboardEl.parentNode;
  dashboardEl.classList.add('visible', 'inline');
  container.appendChild(dashboardEl);
  inlineMounted = true;
  _load();
}

function notifyDetached() {
  if (!inlineMounted) return;
  inlineMounted = false;
  isVisible = false;
  resetAside();
  closeFilterPopover();
  closeSortPopover();
  dashboardEl.classList.remove('visible', 'inline');
  if (overlayParent && dashboardEl.parentNode !== overlayParent) {
    overlayParent.appendChild(dashboardEl);
  }
}

function _load() {
  const projectPath = state.getProjectPath();
  // No project = nothing to show. Surface the same info modal the side panel
  // uses so the user gets one consistent message no matter where they enter.
  if (!projectPath) {
    require('./taskInfoModal').open({
      title: 'No project selected',
      message: 'Select a project from the sidebar to open the task board.'
    });
    return;
  }
  if (projectPath !== loadedProjectPath) {
    showOlderDone = false;
    loadedProjectPath = projectPath;
  }
  isVisible = true;
  ipcRenderer.send(IPC.LOAD_TASKS, projectPath);
  render();
}

function show() {
  if (!dashboardEl) return;
  if (inlineHost) {
    inlineHost.open();
    return;
  }
  dashboardEl.classList.add('visible');
  _load();
}

function hide() {
  if (!dashboardEl) return;
  if (inlineMounted && inlineHost) {
    inlineHost.close(); // view switch triggers notifyDetached()
    return;
  }
  isVisible = false;
  dashboardEl.classList.remove('visible');
  resetAside();
  closeFilterPopover();
  closeSortPopover();
}

function toggle() {
  if (inlineHost) {
    inlineMounted ? inlineHost.close() : inlineHost.open();
    return;
  }
  if (isVisible) hide(); else show();
}

function render() {
  for (const status of STATUS_COLUMNS) {
    const col = columnEls[status];
    if (!col) continue;
    col.innerHTML = '';
  }

  const buckets = { pending: [], in_progress: [], completed: [] };
  for (const task of tasks) {
    const status = STATUS_COLUMNS.includes(task.status) ? task.status : 'pending';
    buckets[status].push(task);
  }

  // Apply sort within each column. Default mode preserves the array order
  // (= file order), which is what the rest of the codebase relies on.
  if (sort.mode !== 'default') {
    for (const status of STATUS_COLUMNS) {
      buckets[status].sort(compareTasks);
    }
  }

  // Completed is windowed: cards older than the project's done window get
  // .done-older and stay in the DOM (see below) but are CSS-hidden until
  // the column carries .show-older. Pending and In Progress are never
  // windowed — an old pending task is still pending.
  const { recent, older } = partitionDone(buckets.completed, {
    days: doneWindow.get().tasks,
    dateOf: t => t.completedAt || t.updatedAt
  });
  const olderSet = new Set(older);
  const olderHidden = older.length > 0 && !showOlderDone;

  for (const status of STATUS_COLUMNS) {
    const col = columnEls[status];
    const count = countEls[status];
    const header = headerEls[status];
    const isCompleted = status === 'completed';
    // What the eye can find in this column: the windowed set for Completed
    // (all of it once revealed), everything for the other two.
    const shown = isCompleted && olderHidden ? recent : buckets[status];
    // All cards are rendered in DOM (filtered ones get .filtered-out and are
    // CSS-hidden) so drag-and-drop reorder still sees the full ordering and
    // doesn't accidentally drop hidden tasks to the end of tasks.json.
    const visibleCount = shown.filter(filterMatches).length;
    if (count) {
      count.textContent = isFilterActive()
        ? `${visibleCount}/${shown.length}`
        : String(shown.length);
    }
    if (header) {
      if (isCompleted && olderHidden) {
        header.title = `${shown.length} shown · ${older.length} older hidden`;
      } else {
        header.removeAttribute('title');
      }
    }
    if (!col) continue;
    if (isCompleted) col.classList.toggle('show-older', showOlderDone);

    if (buckets[status].length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tasks-dashboard-column-empty';
      empty.textContent = 'Drop tasks here';
      col.appendChild(empty);
      continue;
    }

    for (const task of buckets[status]) {
      const cardEl = renderCard(task);
      if (!filterMatches(task)) cardEl.classList.add('filtered-out');
      if (isCompleted && olderSet.has(task)) cardEl.classList.add('done-older');
      col.appendChild(cardEl);
    }

    if (visibleCount === 0 && isFilterActive()) {
      const empty = document.createElement('div');
      empty.className = 'tasks-dashboard-column-empty';
      empty.textContent = 'No matches in this column';
      col.appendChild(empty);
    }

    if (isCompleted && older.length > 0) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'tasks-dashboard-column-more';
      more.tabIndex = -1;
      more.textContent = showOlderDone ? 'Hide older' : `Show ${older.length} older`;
      more.addEventListener('click', () => {
        showOlderDone = !showOlderDone;
        render();
      });
      col.appendChild(more);
    }
  }

  // A push can delete the selected task out from under us; syncAside drops
  // the selection rather than leaving a stranded panel.
  if (selectedTaskId && !tasks.some(t => t.id === selectedTaskId)) selectedTaskId = null;
  syncAside();
}

function renderCard(task) {
  const card = document.createElement('div');
  card.className = `tasks-dashboard-card priority-${task.priority || 'medium'}`;
  card.dataset.taskId = task.id;
  card.draggable = true;
  if (task.id === selectedTaskId) card.classList.add('selected');

  const title = document.createElement('div');
  title.className = 'tasks-dashboard-card-title';
  title.textContent = task.title || 'Untitled';
  // Live agent working on this task → pulsing activity dot before the title
  const liveDot = require('./agentDispatch').taskStatusDotHtml(task.id);
  if (liveDot) title.insertAdjacentHTML('afterbegin', liveDot);
  card.appendChild(title);

  if (task.description) {
    const desc = document.createElement('div');
    desc.className = 'tasks-dashboard-card-desc';
    desc.textContent = task.description;
    card.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'tasks-dashboard-card-meta';

  const priority = document.createElement('span');
  priority.className = `tasks-dashboard-card-priority priority-${task.priority || 'medium'}`;
  priority.textContent = (task.priority || 'medium').toUpperCase();
  meta.appendChild(priority);

  if (task.category) {
    const cat = document.createElement('span');
    cat.className = 'tasks-dashboard-card-category';
    cat.textContent = task.category;
    meta.appendChild(cat);
  }

  const date = document.createElement('span');
  date.className = 'tasks-dashboard-card-date';
  date.textContent = formatDate(task.updatedAt || task.createdAt);
  meta.appendChild(date);

  card.appendChild(meta);

  card.addEventListener('click', () => selectTask(task.id));
  card.addEventListener('dragstart', (e) => onDragStart(e, task));
  card.addEventListener('dragend', onDragEnd);

  return card;
}

function setupDropTargets() {
  for (const status of STATUS_COLUMNS) {
    const col = columnEls[status];
    if (!col) continue;

    col.addEventListener('dragover', (e) => {
      if (!dragSource) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const after = getCardAfterY(col, e.clientY);
      const dragging = document.querySelector('.tasks-dashboard-card.dragging');
      if (!dragging) return;
      if (after == null) {
        col.appendChild(dragging);
      } else {
        col.insertBefore(dragging, after);
      }
    });

    col.addEventListener('dragenter', (e) => {
      if (!dragSource) return;
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', (e) => {
      // dragleave fires for child enters; only clear when leaving the column itself
      if (e.target === col) col.classList.remove('drag-over');
    });

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!dragSource) return;
      commitOrder();
    });
  }
}

function onDragStart(e, task) {
  dragSource = task.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', task.id);
  // give the browser a tick before adding the dragging class so the drag image
  // captures the un-styled card (avoids a transparent ghost on some platforms)
  requestAnimationFrame(() => {
    const el = document.querySelector(`.tasks-dashboard-card[data-task-id="${task.id}"]`);
    if (el) el.classList.add('dragging');
  });
}

function onDragEnd() {
  dragSource = null;
  document.querySelectorAll('.tasks-dashboard-card.dragging').forEach(el => {
    el.classList.remove('dragging');
  });
  document.querySelectorAll('.tasks-dashboard-cards.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
}

/**
 * Find the card the dragged item should be inserted *before*, based on
 * vertical midpoint. Returns null when the drop should land at the end.
 */
function getCardAfterY(container, y) {
  // Hidden cards — filtered out, or older-than-window while not revealed —
  // have no box to drop around.
  const olderHidden = !container.classList.contains('show-older');
  const cards = Array.from(
    container.querySelectorAll('.tasks-dashboard-card:not(.dragging):not(.filtered-out)')
  ).filter(card => !(olderHidden && card.classList.contains('done-older')));
  for (const card of cards) {
    const box = card.getBoundingClientRect();
    if (y < box.top + box.height / 2) return card;
  }
  return null;
}

/**
 * Read the current DOM order across all three columns and send the new order
 * (with each task's column → status) to the main process. The main process
 * rewrites tasks.json and pushes a fresh TASKS_DATA, which re-renders the UI.
 */
function commitOrder() {
  const projectPath = state.getProjectPath();
  if (!projectPath) return;

  const order = [];
  for (const status of STATUS_COLUMNS) {
    const col = columnEls[status];
    if (!col) continue;
    col.querySelectorAll('.tasks-dashboard-card').forEach(card => {
      order.push({ id: card.dataset.taskId, status });
    });
  }

  ipcRenderer.send(IPC.REORDER_TASKS, { projectPath, order });
}

/* ---------- Right aside (form) + detail drawer ---------- */

/**
 * Single owner of the aside's and the drawer's visibility. The aside exists
 * only while the New Task form is open — otherwise it leaves the layout so
 * the three columns take the full width (tasks-detail-on-demand spec). The
 * drawer slides in over the board while a task is selected and no form is
 * open; it stays in the DOM parked off-screen so open/close animate. Every
 * path that changes selection or form state ends here, so the panels can
 * only be wrong in one place.
 */
function syncAside() {
  if (!detailEl) return;
  const formOpen = isFormOpen();
  const task = (!formOpen && selectedTaskId)
    ? tasks.find(t => t.id === selectedTaskId)
    : null;

  detailEl.classList.toggle('open', formOpen);

  if (drawerEl) {
    const opening = !!task && !drawerEl.classList.contains('has-selection');
    drawerEl.classList.toggle('has-selection', !!task);
    drawerEl.setAttribute('aria-hidden', task ? 'false' : 'true');
    if (opening && detailContentEl) detailContentEl.scrollTop = 0;
  }
  // Content stays rendered while the drawer slides out so the close
  // animation doesn't show an empty panel.
  if (task) renderDetail(task);
}

/**
 * Open a task in the drawer. `instant` is the top-bar chip path: the board
 * has just been mounted underneath, so the drawer must already cover it in
 * the same frame — no slide, no flash of the columns. Returns false when
 * the task no longer exists.
 */
function selectTask(taskId, { instant = false } = {}) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return false;
  selectedTaskId = taskId;
  if (instant && drawerEl) {
    drawerEl.classList.add('instant');
    // Two frames so the class removal itself can never start a transition
    requestAnimationFrame(() => requestAnimationFrame(() => drawerEl.classList.remove('instant')));
  }
  // Selecting a card always exits form mode — the aside has one job at a time.
  if (isFormOpen()) detailFormEl.style.display = 'none';
  document.querySelectorAll('.tasks-dashboard-card.selected').forEach(el => {
    el.classList.remove('selected');
  });
  const card = document.querySelector(`.tasks-dashboard-card[data-task-id="${taskId}"]`);
  if (card) card.classList.add('selected');
  syncAside();
  return true;
}

/**
 * Close the drawer. `notify: false` is for the host-driven teardown
 * (notifyDetached → resetAside) — the host is already mid-render there,
 * and calling back into it would re-enter that render.
 */
function clearSelection({ notify = true } = {}) {
  const hadSelection = !!selectedTaskId;
  selectedTaskId = null;
  document.querySelectorAll('.tasks-dashboard-card.selected').forEach(el => {
    el.classList.remove('selected');
  });
  syncAside();
  if (hadSelection && notify && inlineHost && inlineHost.drawerClosed) inlineHost.drawerClosed();
}

/** Leaving the board: no selection, no half-typed form waiting on return. */
function resetAside() {
  selectedTaskId = null;
  document.querySelectorAll('.tasks-dashboard-card.selected').forEach(el => {
    el.classList.remove('selected');
  });
  if (detailFormEl) detailFormEl.style.display = 'none';
  syncAside();
}

/* ---------- Inline form (right aside) ---------- */

function isFormOpen() {
  return !!(detailFormEl && detailFormEl.style.display !== 'none');
}

function setupForm() {
  if (!detailFormEl) return;

  detailFormEl.querySelector('.tasks-dashboard-form-close')
    .addEventListener('click', () => hideForm());
  detailFormEl.querySelector('.tasks-dashboard-form-cancel')
    .addEventListener('click', () => hideForm());

  detailFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm();
  });
}

function showForm() {
  if (!detailFormEl) return;
  // Form takes over the aside; a selected task stays selected underneath and
  // comes back when the form closes.
  detailFormEl.style.display = '';
  syncAside();
  detailFormEl.reset();
  // Default the priority/category since reset puts the first option
  detailFormEl.querySelector('#tasks-dashboard-form-priority').value = 'medium';
  detailFormEl.querySelector('#tasks-dashboard-form-category').value = 'feature';
  requestAnimationFrame(() => {
    detailFormEl.querySelector('#tasks-dashboard-form-title')?.focus();
  });
}

function hideForm() {
  if (!detailFormEl) return;
  detailFormEl.style.display = 'none';
  // Falls back to the detail view if a card is selected, otherwise the aside
  // collapses.
  syncAside();
}

function requestDeleteSelected() {
  if (!selectedTaskId) return;
  const projectPath = state.getProjectPath();
  if (!projectPath) return;
  const task = tasks.find(t => t.id === selectedTaskId);
  const confirmModal = require('./taskConfirmModal');
  const idToDelete = selectedTaskId;
  confirmModal.open({
    title: task ? task.title : null,
    onConfirm: () => {
      ipcRenderer.send(IPC.DELETE_TASK, { projectPath, taskId: idToDelete });
      // Clear local selection right away — the next TASKS_DATA push will
      // refresh the columns and the aside collapses.
      if (selectedTaskId === idToDelete) clearSelection();
    }
  });
}

function submitForm() {
  const projectPath = state.getProjectPath();
  if (!projectPath || !detailFormEl) return;

  const title = detailFormEl.querySelector('#tasks-dashboard-form-title').value.trim();
  if (!title) return;

  const task = {
    title,
    description: detailFormEl.querySelector('#tasks-dashboard-form-description').value.trim(),
    priority: detailFormEl.querySelector('#tasks-dashboard-form-priority').value,
    category: detailFormEl.querySelector('#tasks-dashboard-form-category').value
  };

  ipcRenderer.send(IPC.ADD_TASK, { projectPath, task });
  hideForm();
}

function renderDetail(task) {
  if (!detailContentEl || !task) return;

  detailContentEl.style.display = '';

  const pill = detailContentEl.querySelector('.tasks-dashboard-detail-status-pill');
  pill.textContent = STATUS_LABELS[task.status] || task.status;
  pill.className = `tasks-dashboard-detail-status-pill status-${(task.status || 'pending').replace('_', '-')}`;

  detailContentEl.querySelector('.tasks-dashboard-detail-title').textContent = task.title || 'Untitled';

  const meta = detailContentEl.querySelector('.tasks-dashboard-detail-meta');
  meta.innerHTML = '';
  appendMetaPill(meta, `Priority: ${task.priority || 'medium'}`, `priority-${task.priority || 'medium'}`);
  if (task.category) appendMetaPill(meta, task.category, 'category');

  setSection(
    detailContentEl.querySelector('.tasks-dashboard-detail-description'),
    null,
    task.description || 'No description provided.'
  );

  setSection(
    detailContentEl.querySelector('.tasks-dashboard-detail-userrequest-text'),
    detailContentEl.querySelector('.tasks-dashboard-detail-userrequest'),
    task.userRequest
  );
  setSection(
    detailContentEl.querySelector('.tasks-dashboard-detail-criteria-text'),
    detailContentEl.querySelector('.tasks-dashboard-detail-criteria'),
    task.acceptanceCriteria
  );
  setSection(
    detailContentEl.querySelector('.tasks-dashboard-detail-notes-text'),
    detailContentEl.querySelector('.tasks-dashboard-detail-notes'),
    task.notes
  );
  setSection(
    detailContentEl.querySelector('.tasks-dashboard-detail-context-text'),
    detailContentEl.querySelector('.tasks-dashboard-detail-context'),
    task.context
  );

  detailContentEl.querySelector('.tasks-dashboard-detail-id').textContent = `#${task.id}`;
  const dates = [];
  if (task.createdAt) dates.push(`Created ${formatDate(task.createdAt)}`);
  if (task.updatedAt && task.updatedAt !== task.createdAt) dates.push(`Updated ${formatDate(task.updatedAt)}`);
  if (task.completedAt) dates.push(`Completed ${formatDate(task.completedAt)}`);
  detailContentEl.querySelector('.tasks-dashboard-detail-dates').textContent = dates.join(' · ');

  // The top bar pins whichever task the drawer shows (one chip, replaced on
  // every open) so leaving this screen never loses the task — the chip is
  // the way back. Fires on every push too, so a rename updates the chip.
  if (inlineHost && inlineHost.drawerOpened) {
    inlineHost.drawerOpened({ id: task.id, title: task.title || 'Untitled' });
  }
}

function appendMetaPill(container, text, cls) {
  const span = document.createElement('span');
  span.className = `tasks-dashboard-detail-meta-pill ${cls || ''}`.trim();
  span.textContent = text;
  container.appendChild(span);
}

function setSection(textEl, sectionEl, value) {
  if (!textEl) return;
  if (value == null || value === '') {
    textEl.textContent = '';
    if (sectionEl) sectionEl.style.display = 'none';
    return;
  }
  textEl.textContent = value;
  if (sectionEl) sectionEl.style.display = '';
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------- Filter (dashboard-only) ---------- */

function isFilterActive() {
  return filters.categories.size > 0 || filters.priorities.size > 0;
}

function filterMatches(task) {
  if (filters.categories.size > 0 && !filters.categories.has(task.category)) return false;
  if (filters.priorities.size > 0 && !filters.priorities.has(task.priority)) return false;
  return true;
}

function setupFilter() {
  filterBtnEl = document.getElementById('tasks-dashboard-filter-btn');
  filterPopoverEl = document.getElementById('tasks-dashboard-filter-popover');
  filterBadgeEl = document.getElementById('tasks-dashboard-filter-badge');
  if (!filterBtnEl || !filterPopoverEl) return;

  filterBtnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFilterPopover();
  });

  filterPopoverEl.addEventListener('click', (e) => e.stopPropagation());

  filterPopoverEl.querySelectorAll('input[type="checkbox"][data-filter-dim]').forEach(input => {
    input.addEventListener('change', () => {
      const dim = input.dataset.filterDim;
      const value = input.value;
      const set = filters[dim];
      if (!set) return;
      if (input.checked) set.add(value); else set.delete(value);
      updateFilterUI();
      render();
    });
  });

  const clearBtn = document.getElementById('tasks-dashboard-filter-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearFilters);

  // Outside-click closes the popover (only while it's open and dashboard
  // is visible).
  document.addEventListener('click', (e) => {
    if (!isFilterPopoverOpen()) return;
    if (filterPopoverEl.contains(e.target)) return;
    if (filterBtnEl.contains(e.target)) return;
    closeFilterPopover();
  });
}

function isFilterPopoverOpen() {
  return filterPopoverEl && !filterPopoverEl.hasAttribute('hidden');
}

function toggleFilterPopover() {
  // Only one popover open at a time
  if (isSortPopoverOpen()) closeSortPopover();
  if (isFilterPopoverOpen()) closeFilterPopover(); else openFilterPopover();
}

function openFilterPopover() {
  if (!filterPopoverEl || !filterBtnEl) return;
  filterPopoverEl.removeAttribute('hidden');
  filterBtnEl.classList.add('active');
}

function closeFilterPopover() {
  if (!filterPopoverEl || !filterBtnEl) return;
  filterPopoverEl.setAttribute('hidden', '');
  filterBtnEl.classList.remove('active');
}

function clearFilters() {
  filters.categories.clear();
  filters.priorities.clear();
  if (filterPopoverEl) {
    filterPopoverEl.querySelectorAll('input[type="checkbox"][data-filter-dim]').forEach(input => {
      input.checked = false;
    });
  }
  updateFilterUI();
  render();
}

function updateFilterUI() {
  if (!filterBtnEl) return;
  const count = filters.categories.size + filters.priorities.size;
  if (count > 0) {
    filterBtnEl.classList.add('has-filters');
    if (filterBadgeEl) {
      filterBadgeEl.textContent = String(count);
      filterBadgeEl.removeAttribute('hidden');
    }
  } else {
    filterBtnEl.classList.remove('has-filters');
    if (filterBadgeEl) filterBadgeEl.setAttribute('hidden', '');
  }
}

/* ---------- Sort ---------- */

function compareTasks(a, b) {
  if (sort.mode === 'priority') {
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    // Stable tiebreaker — preserve file order for tasks with same priority
    return tasks.indexOf(a) - tasks.indexOf(b);
  }
  if (sort.mode === 'category') {
    const cmp = (a.category || '').localeCompare(b.category || '');
    if (cmp !== 0) return cmp;
    return tasks.indexOf(a) - tasks.indexOf(b);
  }
  return 0;
}

function setupSort() {
  sortBtnEl = document.getElementById('tasks-dashboard-sort-btn');
  sortPopoverEl = document.getElementById('tasks-dashboard-sort-popover');
  sortLabelEl = document.getElementById('tasks-dashboard-sort-label');
  if (!sortBtnEl || !sortPopoverEl) return;

  sortBtnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSortPopover();
  });
  sortPopoverEl.addEventListener('click', (e) => e.stopPropagation());

  sortPopoverEl.querySelectorAll('input[name="tasks-dashboard-sort"]').forEach(input => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      sort.mode = input.dataset.sortMode || 'default';
      updateSortUI();
      render();
      // If the user already opted into "Apply to tasks.json", commit the new
      // order to disk immediately when they pick a different sort mode.
      if (sort.applyToFile) commitSortToFile();
    });
  });

  const applyToggle = document.getElementById('tasks-dashboard-sort-apply');
  if (applyToggle) {
    applyToggle.addEventListener('change', () => {
      sort.applyToFile = applyToggle.checked;
      updateSortUI();
      // Flipping the toggle on with an active sort persists the current view.
      if (sort.applyToFile && sort.mode !== 'default') commitSortToFile();
    });
  }

  const resetBtn = document.getElementById('tasks-dashboard-sort-reset');
  if (resetBtn) resetBtn.addEventListener('click', resetSort);

  document.addEventListener('click', (e) => {
    if (!isSortPopoverOpen()) return;
    if (sortPopoverEl.contains(e.target)) return;
    if (sortBtnEl.contains(e.target)) return;
    closeSortPopover();
  });
}

function isSortPopoverOpen() {
  return sortPopoverEl && !sortPopoverEl.hasAttribute('hidden');
}

function toggleSortPopover() {
  // Only one popover open at a time
  if (isFilterPopoverOpen()) closeFilterPopover();
  if (isSortPopoverOpen()) closeSortPopover(); else openSortPopover();
}

function openSortPopover() {
  if (!sortPopoverEl || !sortBtnEl) return;
  sortPopoverEl.removeAttribute('hidden');
  sortBtnEl.classList.add('active');
}

function closeSortPopover() {
  if (!sortPopoverEl || !sortBtnEl) return;
  sortPopoverEl.setAttribute('hidden', '');
  sortBtnEl.classList.remove('active');
}

function resetSort() {
  sort.mode = 'default';
  // Note: we deliberately don't flip `applyToFile` off — that's a user
  // preference about persistence, not a sort selection. Leaving it as-is
  // means a future sort pick will still respect the user's last choice.
  if (sortPopoverEl) {
    const def = sortPopoverEl.querySelector('input[data-sort-mode="default"]');
    if (def) def.checked = true;
  }
  updateSortUI();
  render();
}

function updateSortUI() {
  if (!sortBtnEl) return;
  const active = sort.mode !== 'default';
  sortBtnEl.classList.toggle('has-sort', active);
  if (sortLabelEl) {
    if (active) {
      sortLabelEl.textContent = sort.mode === 'priority' ? 'Priority' : 'Type';
      sortLabelEl.removeAttribute('hidden');
    } else {
      sortLabelEl.setAttribute('hidden', '');
    }
  }
  const applySub = document.getElementById('tasks-dashboard-sort-apply-sub');
  if (applySub) {
    applySub.textContent = sort.applyToFile
      ? 'On — saved to tasks.json'
      : 'Off — dashboard only';
  }
}

/**
 * Commit the current sorted view to tasks.json. Per-column sorted order is
 * concatenated in column order (pending → in_progress → completed) so the
 * resulting array is coherent. Backend's reorderTasks rewrites the file.
 */
function commitSortToFile() {
  const projectPath = state.getProjectPath();
  if (!projectPath) return;

  const buckets = { pending: [], in_progress: [], completed: [] };
  for (const task of tasks) {
    const status = STATUS_COLUMNS.includes(task.status) ? task.status : 'pending';
    buckets[status].push(task);
  }
  for (const status of STATUS_COLUMNS) {
    buckets[status].sort(compareTasks);
  }

  const order = [];
  for (const status of STATUS_COLUMNS) {
    for (const task of buckets[status]) {
      order.push({ id: task.id, status });
    }
  }

  ipcRenderer.send(IPC.REORDER_TASKS, { projectPath, order });
}

module.exports = {
  init,
  show,
  hide,
  toggle,
  isVisible: () => isVisible,
  setInlineHost,
  mountInline,
  notifyDetached,
  isInlineMounted: () => inlineMounted,
  // Drawer control for the top bar's task chip (multiTerminalUI): open a
  // task in the drawer while mounted, read what it shows, close it.
  openTask: (id, opts) => !!(inlineMounted && id && selectTask(id, opts)),
  getSelectedTaskId: () => selectedTaskId,
  closeDrawer: () => clearSelection({ notify: false })
};
