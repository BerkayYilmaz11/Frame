/**
 * Cloud Briefs Panel
 *
 * The open folder's Frame Cloud briefs (frame-cloud-briefs-read-only spec),
 * and New brief (frame-cloud-briefs-create spec). Reached from the sidebar's
 * Context → Briefs row, which exists only while the open folder is connected
 * to a cloud project; hosted in the center by `multiTerminalUI` the way
 * Sessions is (`PANEL_REGISTRY.cloudBriefs`).
 *
 * The renderer sends a folder path and nothing else — main resolves the
 * connected project and holds the token. Creating a brief is the one write,
 * and its form lives in cloudBriefsForm.js; the drawer shows either a brief
 * or that form.
 *
 * Names are `cloudBriefs*` / `cloud-briefs`, not `briefs`: the local briefs
 * of brief-capture-and-shaping own those, and the two must meet in one tree.
 *
 * Host contract, the same as every center-hosted panel: `show()` adds
 * `.visible` and loads, `hide()` drops `.visible` — which is what the host's
 * MutationObserver watches to route back to the terminals view.
 */

const { ipcRenderer, shell } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');
const cloudProjectMark = require('./cloudProjectMark');
const { escapeHtml } = require('./htmlUtils');
const copy = require('./cloudBriefsCopy');
const cloudBriefsForm = require('./cloudBriefsForm');

let hub = null;
let panelElement = null;
let contentElement = null;
let countElement = null;
let showClosedInput = null;
let refreshButton = null;
let webButton = null;
let newButton = null;
let detailElement = null;
let detailContentElement = null;
let detailRefreshButton = null;
let visible = false;

// The board's last answer and the folder it belongs to. A refresh of the same
// folder keeps the board on screen and spins the button; another folder
// starts from the loading state.
let board = null; // { path, result }
let showClosed = false;
// A sentence above the columns after a create whose links did not all attach.
// It stays until dismissed, a change of folder or hide().
let notice = null;
// Every load takes a number; an answer whose number is no longer the latest
// (another project, a toggle, a second refresh) is dropped.
let loadSeq = 0;

// What the drawer shows: null (closed), 'detail' (a brief) or 'new' (the
// New brief form).
let drawerMode = null;
// The brief open in the drawer: { number, tab, result } — result is null
// while it loads. Its loads are numbered the same way as the board's.
let detail = null;
let detailSeq = 0;

const TABS = [
  { key: 'description', label: 'Description' },
  { key: 'parts', label: 'Parts' },
  { key: 'comments', label: 'Comments' },
  { key: 'history', label: 'History' },
];

function init(cloudHub) {
  hub = cloudHub;
  panelElement = document.getElementById('cloud-briefs-panel');
  contentElement = document.getElementById('cloud-briefs-content');
  if (!panelElement || !contentElement) {
    console.error('cloudBriefsPanel: #cloud-briefs-panel not found — Briefs will not open');
    return;
  }

  countElement = document.getElementById('cloud-briefs-count');
  showClosedInput = document.getElementById('cloud-briefs-show-closed');
  refreshButton = document.getElementById('cloud-briefs-refresh');
  webButton = document.getElementById('cloud-briefs-open-web');
  newButton = document.getElementById('cloud-briefs-new');
  detailElement = document.getElementById('cloud-briefs-detail');
  detailContentElement = detailElement && detailElement.querySelector('.cloud-briefs-detail-content');

  if (showClosedInput) {
    showClosedInput.addEventListener('change', () => {
      showClosed = showClosedInput.checked;
      load();
    });
  }
  if (refreshButton) refreshButton.addEventListener('click', refresh);
  if (webButton) webButton.addEventListener('click', () => openOnWeb());
  if (newButton) newButton.addEventListener('click', openNewBrief);
  contentElement.addEventListener('click', onContentClick);
  if (detailElement) {
    const back = detailElement.querySelector('.specs-dashboard-detail-back');
    if (back) back.addEventListener('click', leaveDrawer);
    // The drawer covers the panel header, so it carries its own Refresh.
    detailRefreshButton = document.getElementById('cloud-briefs-detail-refresh');
    if (detailRefreshButton) detailRefreshButton.addEventListener('click', refresh);
  }
  if (detailContentElement) detailContentElement.addEventListener('click', onDetailClick);
  // Esc closes the drawer, and only the drawer: the board itself has no Esc.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && visible && drawerMode) {
      e.preventDefault();
      leaveDrawer();
    }
  });

  // The Briefs row follows the connection: sign-in, sign-out, a folder
  // connected or disconnected, a project switch.
  hub.onProjects(onCloudChange);
  hub.onSession(onCloudChange);
  state.onProjectChange(onCloudChange);
  // Coming back to Frame from elsewhere (the web board, say) re-reads what
  // is on screen. In-app navigation needs nothing: the host's show() loads.
  window.addEventListener('focus', onWindowFocus);
}

// What the open board was loaded against: the folder, its cloud project and
// the project list it came from. The hub pushes on every projects change —
// candidate lookups included — so the board reloads only when this moves.
let loadedKey = null;
// When the panel last asked for its board. Focus and project-list pushes
// inside FOCUS_THROTTLE_MS of it do not ask again.
let lastLoadAt = 0;
const FOCUS_THROTTLE_MS = 30 * 1000;

function onWindowFocus() {
  if (!visible) return;
  if (!isAvailable()) {
    hide();
    return;
  }
  if (Date.now() - lastLoadAt < FOCUS_THROTTLE_MS) return;
  refresh();
}

function onCloudChange() {
  try {
    require('./projectListUI').updateWorkspaceNav();
  } catch (err) {
    console.error('cloudBriefsPanel: could not refresh the nav', err);
  }
  if (!visible) return;
  // The folder stopped being connected — a disconnect, a sign-out, a switch
  // to an unconnected project: leave. Dropping .visible is what routes the
  // host back to the terminals view.
  if (!isAvailable()) {
    hide();
    return;
  }
  const key = currentKey();
  if (key === loadedKey) return;
  const [path, projectId] = key.split('\n');
  const [loadedPath, loadedProjectId] = (loadedKey || '').split('\n');
  const sameProject = loadedKey !== null && path === loadedPath && projectId === loadedProjectId;
  // Only the list time moved, and the board is fresh: this is the project
  // list's own focus refresh landing right after ours — skip the repeat.
  if (sameProject && Date.now() - lastLoadAt < FOCUS_THROTTLE_MS) {
    loadedKey = key;
    return;
  }
  // Another folder: its board, not the last one's brief, form or notice.
  if (path !== loadedPath) {
    closeDrawer();
    notice = null;
  }
  load();
  if (detail) loadDetail();
}

/** `${path}\n${cloud project id}\n${list time}` for the open folder. */
function currentKey() {
  const { path, folder, projects } = cloudProjectMark.openFolder();
  const projectId = folder && folder.project ? folder.project.id : '';
  return `${path || ''}\n${projectId}\n${(projects && projects.lastUpdated) || ''}`;
}

/** True while the open folder is connected to a cloud project — the same test as the Connected mark. */
function isAvailable() {
  if (!hub) return false;
  const { folder } = cloudProjectMark.openFolder();
  return Boolean(folder && folder.connected && folder.project);
}

/** Show the panel and load the board — the host calls this on mount. Show closed starts off each time. */
function show() {
  if (!panelElement) return;
  panelElement.classList.add('visible');
  visible = true;
  showClosed = false;
  if (showClosedInput) showClosedInput.checked = false;
  load();
}

function hide() {
  if (!panelElement) return;
  panelElement.classList.remove('visible');
  visible = false;
  loadSeq += 1; // an answer still in flight lands nowhere
  loadedKey = null;
  notice = null;
  closeDrawer();
}

/** Refresh re-reads the board, and the open brief with it. The New brief form is left as it is. */
function refresh() {
  load();
  if (detail) loadDetail();
}

// ─── Loading ──────────────────────────────────────────────────

async function load() {
  if (!contentElement) return;
  const path = state.getProjectPath();
  const seq = ++loadSeq;
  loadedKey = currentKey();
  lastLoadAt = Date.now();
  if (!path) {
    board = null;
    renderMessage('No project is open.');
    return;
  }
  const sameFolder = board && board.path === path;
  if (!sameFolder) {
    board = null;
    renderLoading();
  }
  setRefreshing(true);
  let result;
  try {
    result = await ipcRenderer.invoke(IPC.CLOUD_BRIEFS_LIST, path, { includeClosed: showClosed });
  } catch (err) {
    console.error('cloudBriefsPanel: could not load briefs', err);
    result = { ok: false, reason: 'other' };
  }
  if (seq !== loadSeq) return;
  setRefreshing(false);
  if (result && result.ok) {
    board = { path, result };
    renderBoard();
    return;
  }
  board = null;
  const reason = result && result.reason;
  // Signed out: the session push hides the row and the panel; draw nothing new.
  if (reason === 'unauthorized') {
    renderMessage('');
    return;
  }
  renderError(reason);
}

function setRefreshing(on) {
  if (!refreshButton) return;
  refreshButton.classList.toggle('spinning', on);
  refreshButton.disabled = on;
}

function openOnWeb(number) {
  const path = state.getProjectPath();
  if (!path) return;
  const args = number === undefined ? [path] : [path, number];
  ipcRenderer.invoke(IPC.CLOUD_BRIEFS_OPEN_ON_WEB, ...args).catch((err) => {
    console.error('cloudBriefsPanel: could not open Frame Cloud on the web', err);
  });
}

function onContentClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl || !contentElement.contains(actionEl)) return;
  const action = actionEl.dataset.action;
  if (action === 'retry') load();
  else if (action === 'open-web') openOnWeb();
  else if (action === 'new-brief') openNewBrief();
  else if (action === 'dismiss-notice') {
    notice = null;
    const el = contentElement.querySelector('.cloud-briefs-notice');
    if (el) el.remove();
  }
  else if (action === 'open-brief') {
    const number = Number(actionEl.dataset.number);
    if (Number.isInteger(number) && number > 0) openDetail(number);
  }
}

// ─── Rendering: the board ─────────────────────────────────────

function setHeader({ count, canOpenWeb }) {
  if (countElement) {
    countElement.textContent = count === null ? '' : `${count} brief${count === 1 ? '' : 's'}`;
  }
  if (webButton) webButton.hidden = !canOpenWeb;
}

function renderBoard() {
  const { briefs, milestones, canOpenWeb } = board.result;
  const groups = copy.groupByColumn(briefs);
  const openCount = groups.backlog.length + groups.active.length + groups.done.length;
  setHeader({ count: showClosed ? briefs.length : openCount, canOpenWeb });
  const milestoneNames = new Map((milestones || []).map((m) => [m.id, m.name]));

  const open = openCount > 0
    ? `<div class="cloud-briefs-columns">${copy.COLUMNS.map((column) => `
        <section class="cloud-briefs-column" aria-label="${escapeHtml(column.title)}">
          <h3 class="cloud-briefs-column-title">
            <span>${escapeHtml(column.title)}</span>
            <span class="cloud-briefs-column-count">${groups[column.status].length}</span>
          </h3>
          ${column.hint ? `<p class="cloud-briefs-column-hint">${escapeHtml(column.hint)}</p>` : ''}
          ${renderCards(groups[column.status], milestoneNames)}
        </section>`).join('')}
      </div>`
    : renderEmpty(canOpenWeb);

  const closed = showClosed
    ? `<section class="cloud-briefs-closed" aria-label="Closed">
        <h3 class="cloud-briefs-closed-title">Closed</h3>
        ${groups.closed.length > 0
          ? renderCards(groups.closed, milestoneNames)
          : '<p class="cloud-briefs-muted">No closed briefs.</p>'}
      </section>`
    : '';

  contentElement.innerHTML = renderNotice() + open + closed;
}

function renderNotice() {
  if (!notice) return '';
  return `<div class="cloud-briefs-notice" role="status">
      <p>${escapeHtml(notice)}</p>
      <button type="button" class="cloud-briefs-icon-btn" data-action="dismiss-notice" aria-label="Dismiss" title="Dismiss" tabindex="-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>`;
}

function renderCards(briefs, milestoneNames) {
  if (briefs.length === 0) return '';
  return `<ul class="cloud-briefs-cards">${briefs.map((brief) => `
    <li>${renderCard(brief, brief.milestoneId ? milestoneNames.get(brief.milestoneId) : '')}</li>`).join('')}
  </ul>`;
}

function renderCard(brief, milestoneName) {
  const kind = copy.KIND_COPY[brief.kind] || copy.KIND_COPY.proposal;
  const priority = brief.kind === 'work' && brief.priority ? copy.priorityLabel(brief.priority) : '';
  const ending = copy.endingLine(brief);
  const meta = priority || milestoneName
    ? `<span class="cloud-briefs-card-meta">
        ${priority ? `<span class="cloud-briefs-priority"><span class="cloud-briefs-priority-dot ${escapeHtml(brief.priority)}" aria-hidden="true"></span>${escapeHtml(priority)}</span>` : ''}
        ${milestoneName ? `<span class="cloud-briefs-milestone">${escapeHtml(milestoneName)}</span>` : ''}
      </span>`
    : '';
  return `<button type="button" class="cloud-briefs-card" data-action="open-brief" data-number="${brief.number}" tabindex="-1">
      <span class="cloud-briefs-card-head">
        <span class="cloud-briefs-number">#${brief.number}</span>
        <span class="cloud-briefs-kind ${escapeHtml(brief.kind)}">${escapeHtml(kind.badge)}</span>
      </span>
      <span class="cloud-briefs-card-title">${escapeHtml(brief.title)}</span>
      ${meta}
      ${ending ? `<span class="cloud-briefs-ending">${escapeHtml(ending)}</span>` : ''}
    </button>`;
}

function renderEmpty(canOpenWeb) {
  return `<div class="cloud-briefs-state cloud-briefs-empty">
      <h3>No briefs yet</h3>
      <p>Nothing in this project is proposed or decided yet.</p>
      <div class="cloud-briefs-empty-actions">
        <button type="button" class="cloud-briefs-primary-btn" data-action="new-brief" tabindex="-1">New brief</button>
        ${canOpenWeb ? '<button type="button" class="cloud-briefs-web-btn" data-action="open-web" tabindex="-1">Open on web</button>' : ''}
      </div>
    </div>`;
}

// ─── Rendering: states ────────────────────────────────────────

function renderLoading() {
  setHeader({ count: null, canOpenWeb: false });
  contentElement.innerHTML = '<div class="cloud-briefs-state cloud-briefs-loading">Loading briefs…</div>';
}

function renderMessage(text) {
  setHeader({ count: null, canOpenWeb: false });
  contentElement.innerHTML = text ? `<div class="cloud-briefs-state"><p>${escapeHtml(text)}</p></div>` : '';
}

function renderError(reason) {
  setHeader({ count: null, canOpenWeb: false });
  contentElement.innerHTML = `<div class="cloud-briefs-state cloud-briefs-error">
      <p>${escapeHtml(copy.reasonMessage(reason))}</p>
      <button type="button" class="cloud-briefs-web-btn" data-action="retry" tabindex="-1">Retry</button>
    </div>`;
}

function isVisible() {
  return visible;
}


// ─── Detail drawer ────────────────────────────────────────────

/** Slide the drawer in, in `mode`. The drawer's Refresh belongs to a brief, not to the form. */
function showDrawer(mode) {
  drawerMode = mode;
  detailContentElement.scrollTop = 0;
  if (detailRefreshButton) detailRefreshButton.hidden = mode !== 'detail';
  detailElement.classList.add('has-selection');
  detailElement.setAttribute('aria-hidden', 'false');
}

function openDetail(number) {
  if (!detailElement || !detailContentElement) return;
  cloudBriefsForm.close();
  detail = { number, tab: 'description', result: null };
  detailContentElement.innerHTML = '<div class="cloud-briefs-detail-body"><div class="cloud-briefs-state cloud-briefs-loading">Loading brief…</div></div>';
  showDrawer('detail');
  loadDetail();
}

/** The New brief form in the drawer, empty each time it opens. */
function openNewBrief() {
  if (!detailElement || !detailContentElement || !visible) return;
  if (drawerMode === 'new' && cloudBriefsForm.isPending()) return;
  detailSeq += 1; // a brief still loading lands nowhere
  detail = null;
  showDrawer('new');
  cloudBriefsForm.open(detailContentElement, { onCreated: onBriefCreated });
}

/** A brief was created: back to the board, which reloads to show it. A link that failed leaves a notice. */
function onBriefCreated({ number, attachmentError }) {
  closeDrawer();
  notice = attachmentError ? copy.attachmentNotice(number, attachmentError) : null;
  load();
}

/** Back and Esc: close the drawer, unless a create is still running. */
function leaveDrawer() {
  if (drawerMode === 'new' && cloudBriefsForm.isPending()) return;
  closeDrawer();
}

/** Close the drawer in either mode. An unsent form is discarded. */
function closeDrawer() {
  detailSeq += 1;
  detail = null;
  if (drawerMode === 'new') cloudBriefsForm.close();
  drawerMode = null;
  if (!detailElement) return;
  if (detailRefreshButton) detailRefreshButton.hidden = false;
  detailElement.classList.remove('has-selection');
  detailElement.setAttribute('aria-hidden', 'true');
}

async function loadDetail() {
  if (!detail) return;
  const path = state.getProjectPath();
  const number = detail.number;
  const seq = ++detailSeq;
  let result;
  try {
    result = path
      ? await ipcRenderer.invoke(IPC.CLOUD_BRIEF_GET, path, number)
      : { ok: false, reason: 'notConnected' };
  } catch (err) {
    console.error('cloudBriefsPanel: could not load the brief', err);
    result = { ok: false, reason: 'other' };
  }
  if (seq !== detailSeq || !detail || detail.number !== number) return;
  if (result && result.ok) {
    detail.result = result;
    renderDetail();
    return;
  }
  detail.result = null;
  const reason = result && result.reason;
  if (reason === 'unauthorized') return; // the session push takes the view away
  const message = reason === 'notFound'
    ? 'This brief is no longer on Frame Cloud. It may have been removed.'
    : copy.reasonMessage(reason);
  detailContentElement.innerHTML = `<div class="cloud-briefs-detail-body">
      <div class="cloud-briefs-state cloud-briefs-error">
        <p>${escapeHtml(message)}</p>
        <button type="button" class="cloud-briefs-web-btn" data-action="retry-detail" tabindex="-1">Retry</button>
      </div>
    </div>`;
}

function onDetailClick(event) {
  if (drawerMode !== 'detail') return; // the form wires its own events
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl || !detailContentElement.contains(actionEl)) return;
  const action = actionEl.dataset.action;
  if (action === 'tab') {
    if (!detail || !detail.result) return;
    detail.tab = actionEl.dataset.tab;
    renderDetail();
  } else if (action === 'retry-detail') {
    loadDetail();
  } else if (action === 'open-brief-web') {
    if (detail) openOnWeb(detail.number);
  } else if (action === 'link') {
    event.preventDefault();
    const url = actionEl.dataset.url || '';
    if (isWebUrl(url)) shell.openExternal(url);
  }
}

/** Only http(s) links leave Frame, and only through the system browser. */
function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function renderDetail() {
  const { brief, events, meId, canOpenWeb } = detail.result;
  const kind = copy.KIND_COPY[brief.kind] || copy.KIND_COPY.proposal;
  const ending = copy.endingLine(brief);
  const tab = TABS.some((t) => t.key === detail.tab) ? detail.tab : 'description';

  detailContentElement.innerHTML = `<div class="cloud-briefs-detail-body">
      <header class="cloud-briefs-detail-header">
        <div class="cloud-briefs-detail-heading">
          <span class="cloud-briefs-card-head">
            <span class="cloud-briefs-number">#${brief.number}</span>
            <span class="cloud-briefs-kind ${escapeHtml(brief.kind)}">${escapeHtml(kind.badge)}</span>
            <span class="cloud-briefs-status ${escapeHtml(brief.status)}">${escapeHtml(copy.statusLabel(brief.status))}</span>
          </span>
          <h2 class="cloud-briefs-detail-title">${escapeHtml(brief.title)}</h2>
          ${ending ? `<p class="cloud-briefs-ending">${escapeHtml(ending)}</p>` : ''}
        </div>
        ${canOpenWeb ? '<button type="button" class="cloud-briefs-web-btn" data-action="open-brief-web" tabindex="-1">Open on web</button>' : ''}
      </header>
      ${renderMeta(brief, events, meId)}
      <div class="cloud-briefs-tabs" role="tablist">
        ${TABS.map((t) => `<button type="button" role="tab" class="cloud-briefs-tab${t.key === tab ? ' active' : ''}" aria-selected="${t.key === tab}" data-action="tab" data-tab="${t.key}" tabindex="-1">${escapeHtml(t.label)}${tabCount(t.key, brief, events)}</button>`).join('')}
      </div>
      <div class="cloud-briefs-tab-body" role="tabpanel">${renderTab(tab, brief, events, meId)}</div>
    </div>`;
}

function tabCount(key, brief, events) {
  const n = key === 'parts' ? brief.parts.length
    : key === 'comments' ? brief.comments.length
      : key === 'history' ? events.length
        : 0;
  return n > 0 ? ` <span class="cloud-briefs-tab-count">${n}</span>` : '';
}

function renderMeta(brief, events, meId) {
  const milestones = board && board.result ? board.result.milestones || [] : [];
  const milestone = brief.milestoneId ? milestones.find((m) => m.id === brief.milestoneId) : null;
  const created = events.find((e) => e.event === 'created');
  const createdDate = copy.formatDate(brief.createdAt);
  const creator = created ? copy.actorLabel(created.actorId, meId) : '';
  const rows = [];
  if (brief.kind === 'work' && brief.priority) {
    rows.push(['Priority', `<span class="cloud-briefs-priority"><span class="cloud-briefs-priority-dot ${escapeHtml(brief.priority)}" aria-hidden="true"></span>${escapeHtml(copy.priorityLabel(brief.priority))}</span>`]);
  }
  rows.push(['Milestone', milestone && milestone.name
    ? escapeHtml(milestone.name)
    : '<span class="cloud-briefs-muted">None</span>']);
  if (brief.targetBranch) rows.push(['Target branch', `<code>${escapeHtml(brief.targetBranch)}</code>`]);
  if (createdDate) rows.push(['Created', escapeHtml(creator ? `${createdDate} by ${creator}` : createdDate)]);
  return `<dl class="cloud-briefs-meta">${rows.map(([label, value]) => `
      <div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join('')}
    </dl>`;
}

function renderTab(tab, brief, events, meId) {
  if (tab === 'parts') {
    if (brief.parts.length === 0) return '<p class="cloud-briefs-muted">Parts appear once the brief is shaped.</p>';
    return `<ol class="cloud-briefs-parts">${brief.parts.map((part) => `
        <li>
          <span class="cloud-briefs-part-head">
            <span class="cloud-briefs-part-title">${escapeHtml(part.title)}</span>
            <span class="cloud-briefs-chip">${escapeHtml(part.shape)}</span>
            <span class="cloud-briefs-chip">${escapeHtml(part.type)}</span>
          </span>
          ${part.why ? `<span class="cloud-briefs-muted">${escapeHtml(part.why)}</span>` : ''}
        </li>`).join('')}
      </ol>`;
  }
  if (tab === 'comments') {
    if (brief.comments.length === 0) return '<p class="cloud-briefs-muted">No comments yet.</p>';
    return `<ul class="cloud-briefs-comments">${brief.comments.map((c) => `
        <li>
          <span class="cloud-briefs-byline">${escapeHtml(copy.actorLabel(c.authorId, meId))} · ${escapeHtml(copy.formatDate(c.createdAt))}</span>
          <p class="cloud-briefs-text">${escapeHtml(c.text)}</p>
        </li>`).join('')}
      </ul>`;
  }
  if (tab === 'history') {
    if (events.length === 0) return '<p class="cloud-briefs-muted">No history yet.</p>';
    return `<ol class="cloud-briefs-history">${events.map((e) => {
      const line = copy.eventSentence(e, meId);
      return `<li><span>${escapeHtml(line.sentence)}</span> <span class="cloud-briefs-muted">${escapeHtml(line.date)}</span></li>`;
    }).join('')}
      </ol>`;
  }
  // Description: the body as plain text (never markdown — this is network
  // content), then the attachments as links.
  const body = brief.body
    ? `<p class="cloud-briefs-text">${escapeHtml(brief.body)}</p>`
    : '<p class="cloud-briefs-muted">No description.</p>';
  const attachments = brief.attachments.length > 0
    ? `<section class="cloud-briefs-attachments" aria-label="Attachments">
        <h3>AI conversations &amp; links</h3>
        <ul>${brief.attachments.map((a) => `
          <li>${isWebUrl(a.url)
            ? `<a href="#" data-action="link" data-url="${escapeHtml(a.url)}" title="${escapeHtml(a.url)}">${escapeHtml(a.title || a.url)}</a>`
            : `<span title="${escapeHtml(a.url)}">${escapeHtml(a.title || a.url)}</span>`}</li>`).join('')}
        </ul>
      </section>`
    : '';
  return body + attachments;
}

module.exports = {
  init,
  show,
  hide,
  isVisible,
  isAvailable,
};
