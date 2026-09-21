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
 * connected project and holds the token. Creating a brief is one write, and
 * its form lives in cloudBriefsForm.js; the drawer shows either a brief or
 * that form. Discuss (frame-cloud-brief-discussions spec) opens a lane on an
 * open proposal; its agent records through main, never through this panel.
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
const agentDispatch = require('./agentDispatch');
const aiToolSelector = require('./aiToolSelector');
const notify = require('./notify');

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
// The brief number whose Discuss is starting, so a second click waits.
let discussing = null;
// A brief to open once the panel mounts (a Discuss lane's chip was clicked).
let pendingOpen = null;

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

  // A Discuss lane's activity moves the dots and the header button; a record
  // that landed reloads the brief it belongs to.
  agentDispatch.onBriefLaneActivity(renderLaneSlots);
  ipcRenderer.on(IPC.CLOUD_BRIEF_DISCUSSION_RECORDED, (event, payload) => onDiscussionRecorded(payload));
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
  if (pendingOpen !== null) {
    const number = pendingOpen;
    pendingOpen = null;
    openDetail(number);
  }
}

/**
 * Open the Briefs panel on one brief — the route a Discuss lane's chip
 * takes. The host mounts the panel (show() then opens the drawer); when it
 * is already on screen, the drawer opens directly.
 */
function openBrief(number) {
  if (!Number.isInteger(number) || number < 1) return;
  if (!isAvailable()) {
    notify.error(copy.reasonMessage('notConnected'));
    return;
  }
  const ui = require('./terminal').getMultiTerminalUI();
  if (visible) {
    if (ui) ui.showPanel('cloudBriefs');
    openDetail(number);
    return;
  }
  pendingOpen = number;
  if (ui) ui.showPanel('cloudBriefs');
  if (pendingOpen !== null && !visible) pendingOpen = null; // the host did not mount it
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
  else if (action === 'discuss-card') {
    const brief = boardBrief(Number(actionEl.dataset.number));
    if (brief) discuss(brief);
  }
  else if (action === 'move-to-work-card') {
    const brief = boardBrief(Number(actionEl.dataset.number));
    if (brief) openMoveToWork(brief);
  }
  else if (action === 'open-comments') {
    const number = Number(actionEl.dataset.number);
    if (Number.isInteger(number) && number > 0) openDetail(number, 'comments');
  }
  else if (action === 'go-to-lane') {
    agentDispatch.enterBriefLane(Number(actionEl.dataset.number));
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
  const records = copy.discussionCountLabel(brief.discussionCount);
  // The card is a container, not a button: its controls (Discuss, the live
  // lane) sit beside the open-brief button rather than inside it.
  return `<div class="cloud-briefs-card">
      <button type="button" class="cloud-briefs-card-open" data-action="open-brief" data-number="${brief.number}" tabindex="-1">
        <span class="cloud-briefs-card-head">
          <span class="cloud-briefs-number">#${brief.number}</span>
          <span class="cloud-briefs-kind ${escapeHtml(brief.kind)}">${escapeHtml(kind.badge)}</span>
        </span>
        <span class="cloud-briefs-card-title">${escapeHtml(brief.title)}</span>
        ${meta}
        ${records ? `<span class="cloud-briefs-card-records">${escapeHtml(records)}</span>` : ''}
        ${ending ? `<span class="cloud-briefs-ending">${escapeHtml(ending)}</span>` : ''}
      </button>
      <div class="cloud-briefs-card-actions" data-card-actions="${brief.number}">${renderCardActions(brief)}</div>
    </div>`;
}

/**
 * A card's controls, by the proposal's stage:
 *   discuss    → primary Discuss (nothing recorded yet)
 *   discussing → "Discussing in <lane>", which enters it
 *   decide     → primary Move to Work, secondary Discuss — and, when someone
 *                commented after the latest record, "N new comments" first,
 *                which opens the Comments tab
 *   none       → nothing (work, or ended)
 */
function renderCardActions(brief) {
  const lane = agentDispatch.getBriefLaneInfo(brief.number);
  const stage = copy.proposalStage({ brief, laneOpen: Boolean(lane), discussionCount: brief.discussionCount });
  const n = brief.number;
  if (stage === 'discussing') {
    return `<button type="button" class="cloud-briefs-lane-link" data-action="go-to-lane" data-number="${n}" title="${escapeHtml(copy.GO_TO_DISCUSSION_LABEL)}" tabindex="-1">${agentDispatch.briefStatusDotHtml(n)}<span>${escapeHtml(copy.discussingIn(lane.name))}</span></button>`;
  }
  if (stage === 'discuss') return discussButton(n, 'primary', 'discuss-card');
  if (stage !== 'decide') return '';
  const fresh = copy.newCommentsLabel(brief.newCommentCount);
  return `${fresh ? `<button type="button" class="cloud-briefs-new-comments" data-action="open-comments" data-number="${n}" tabindex="-1">${escapeHtml(fresh)}</button>` : ''}
    ${moveToWorkButton(n, 'move-to-work-card')}
    ${discussButton(n, 'secondary', 'discuss-card')}`;
}

/** Discuss as the stage's primary or secondary button; "Discuss…" while it starts. */
function discussButton(number, weight, action, label = copy.DISCUSS_LABEL, hint = copy.DISCUSS_HINT) {
  const pending = discussing === number;
  const cls = weight === 'primary' ? 'cloud-briefs-primary-btn' : 'cloud-briefs-web-btn';
  return `<button type="button" class="${cls} cloud-briefs-discuss-btn" data-action="${action}" data-number="${number}" title="${escapeHtml(hint)}" tabindex="-1"${pending ? ' disabled' : ''}>${escapeHtml(pending ? `${label}…` : label)}</button>`;
}

function moveToWorkButton(number, action) {
  return `<button type="button" class="cloud-briefs-primary-btn" data-action="${action}" data-number="${number}" tabindex="-1">${escapeHtml(copy.MOVE_TO_WORK_LABEL)}</button>`;
}

/** The board's brief with this number, or null. */
function boardBrief(number) {
  const briefs = board && board.result ? board.result.briefs : [];
  return briefs.find((b) => b.number === number) || null;
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

function openDetail(number, tab = 'description') {
  if (!detailElement || !detailContentElement) return;
  cloudBriefsForm.close();
  detail = { number, tab, result: null };
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
  } else if (action === 'discuss') {
    if (detail && detail.result) discuss(detail.result.brief);
  } else if (action === 'move-to-work') {
    if (detail && detail.result) openMoveToWork(detail.result.brief);
  } else if (action === 'go-to-discussion') {
    if (detail) agentDispatch.enterBriefLane(detail.number);
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
        <div class="cloud-briefs-detail-actions">
          <span class="cloud-briefs-discuss-slot">${renderDiscussAction(brief, events)}</span>
          ${canOpenWeb ? '<button type="button" class="cloud-briefs-web-btn" data-action="open-brief-web" tabindex="-1">Open on web</button>' : ''}
        </div>
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
    const fresh = copy.newCommentIds(brief.comments, events, meId);
    return `<div class="cloud-briefs-rediscuss-slot">${renderRediscuss(brief, events, meId)}</div>
      <ul class="cloud-briefs-comments">${brief.comments.map((c) => `
        <li${fresh.has(c.id) ? ' class="new"' : ''}>
          <span class="cloud-briefs-byline">${escapeHtml(copy.actorLabel(c.authorId, meId))} · ${escapeHtml(copy.formatDate(c.createdAt))}${fresh.has(c.id) ? ' <span class="cloud-briefs-new-tag">New</span>' : ''}</span>
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
  // content), the discussions held on it, then the attachments as links.
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
  return body + renderDiscussions(events, meId) + attachments;
}

/** The discussion records, newest first; absent rather than empty when none was recorded, as on the web. */
function renderDiscussions(events, meId) {
  const records = copy.discussionRecords(events, meId);
  if (records.length === 0) return '';
  return `<section class="cloud-briefs-discussions" aria-label="${escapeHtml(copy.DISCUSSIONS_TITLE)}">
      <h3>${escapeHtml(copy.DISCUSSIONS_TITLE)}</h3>
      <ul>${records.map((r) => `
        <li>
          <span class="cloud-briefs-byline">
            ${escapeHtml(r.date ? `${r.date} · ${r.actor}` : r.actor)}
            ${r.provider ? `<span class="cloud-briefs-chip">${escapeHtml(r.provider)}</span>` : ''}
          </span>
          <p class="cloud-briefs-text">${escapeHtml(r.summary)}</p>
          ${r.url ? `<a href="#" data-action="link" data-url="${escapeHtml(r.url)}" title="${escapeHtml(r.url)}">${escapeHtml(copy.WRITE_UP_LABEL)}</a>` : ''}
        </li>`).join('')}
      </ul>
    </section>`;
}

// ─── Discuss ──────────────────────────────────────────────────

/**
 * The detail header's controls, by the same stages as the card: Go to
 * discussion while the lane is open (whatever the brief has become since),
 * Discuss before any record, Move to Work + Discuss after one, nothing for
 * work or an ended brief.
 */
function renderDiscussAction(brief, events) {
  const lane = agentDispatch.getBriefLaneInfo(brief.number);
  const discussionCount = copy.discussionRecords(events).length;
  const stage = copy.proposalStage({ brief, laneOpen: Boolean(lane), discussionCount });
  if (stage === 'discussing') {
    return `<button type="button" class="cloud-briefs-web-btn cloud-briefs-discuss-btn" data-action="go-to-discussion" tabindex="-1">${agentDispatch.briefStatusDotHtml(brief.number)}${escapeHtml(copy.GO_TO_DISCUSSION_LABEL)}</button>`;
  }
  if (stage === 'discuss') return discussButton(brief.number, 'primary', 'discuss');
  if (stage === 'decide') return `${moveToWorkButton(brief.number, 'move-to-work')}${discussButton(brief.number, 'secondary', 'discuss')}`;
  return '';
}

/**
 * Above the comments, when someone commented after the latest record and no
 * lane is open: how many are new, and Re-discuss — a Discuss whose prompt
 * opens on them.
 */
function renderRediscuss(brief, events, meId) {
  const lane = agentDispatch.getBriefLaneInfo(brief.number);
  const stage = copy.proposalStage({ brief, laneOpen: Boolean(lane), discussionCount: copy.discussionRecords(events).length });
  const count = copy.newCommentIds(brief.comments, events, meId).size;
  if (stage !== 'decide' || count === 0) return '';
  return `<div class="cloud-briefs-rediscuss">
      <span>${escapeHtml(copy.newCommentsLabel(count))} since the last discussion.</span>
      ${discussButton(brief.number, 'primary', 'discuss', copy.REDISCUSS_LABEL, copy.REDISCUSS_HINT)}
    </div>`;
}

// ─── Move to Work ─────────────────────────────────────────────

let decideDialog = null; // { el, number, pending }

/** A confirm with a priority (Medium by default), as the web's Transform to Work. */
function openMoveToWork(brief) {
  if (decideDialog) return;
  const el = document.createElement('div');
  el.className = 'cloud-briefs-dialog-backdrop';
  const id = `cloud-briefs-decide-${brief.number}`;
  el.innerHTML = `<div class="cloud-briefs-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <h3 id="${id}-title">${escapeHtml(`${copy.MOVE_TO_WORK_LABEL} · #${brief.number}`)}</h3>
      <p class="cloud-briefs-muted">${escapeHtml(copy.MOVE_TO_WORK_DESCRIPTION)}</p>
      <div class="cloud-briefs-field">
        <label class="cloud-briefs-label" for="${id}-priority">Priority</label>
        <select id="${id}-priority" class="cloud-briefs-input cloud-briefs-select" data-ref="priority">
          ${['high', 'medium', 'low'].map((p) => `<option value="${p}"${p === 'medium' ? ' selected' : ''}>${escapeHtml(copy.priorityLabel(p))}</option>`).join('')}
        </select>
      </div>
      <p class="cloud-briefs-form-error" data-ref="error" hidden></p>
      <div class="cloud-briefs-form-actions">
        <button type="button" class="cloud-briefs-web-btn" data-ref="cancel">Cancel</button>
        <button type="button" class="cloud-briefs-primary-btn" data-ref="confirm">${escapeHtml(copy.MOVE_TO_WORK_LABEL)}</button>
      </div>
    </div>`;
  decideDialog = { el, number: brief.number, pending: false };
  const ref = (name) => el.querySelector(`[data-ref="${name}"]`);
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target === ref('cancel')) closeMoveToWork();
    else if (e.target === ref('confirm')) confirmMoveToWork(ref('priority').value);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeMoveToWork();
    }
  });
  document.body.appendChild(el);
  ref('priority').focus();
}

function closeMoveToWork() {
  if (!decideDialog || decideDialog.pending) return;
  decideDialog.el.remove();
  decideDialog = null;
}

async function confirmMoveToWork(priority) {
  const dialog = decideDialog;
  if (!dialog || dialog.pending) return;
  const path = state.getProjectPath();
  const confirmBtn = dialog.el.querySelector('[data-ref="confirm"]');
  const errorEl = dialog.el.querySelector('[data-ref="error"]');
  dialog.pending = true;
  confirmBtn.disabled = true;
  confirmBtn.textContent = `${copy.MOVE_TO_WORK_LABEL}…`;
  errorEl.hidden = true;
  let result;
  try {
    result = path
      ? await ipcRenderer.invoke(IPC.CLOUD_BRIEF_DECIDE, path, dialog.number, priority)
      : { ok: false, reason: 'notConnected' };
  } catch (err) {
    console.error('cloudBriefsPanel: could not move the proposal to work', err);
    result = { ok: false, reason: 'other' };
  }
  dialog.pending = false;
  if (result && result.ok) {
    closeMoveToWork();
    load();
    if (detail && detail.number === dialog.number) loadDetail();
    return;
  }
  confirmBtn.disabled = false;
  confirmBtn.textContent = copy.MOVE_TO_WORK_LABEL;
  errorEl.textContent = copy.decideErrorMessage(result && result.reason);
  errorEl.hidden = false;
}

/**
 * Open a lane with the current AI tool and hand it main's discuss prompt.
 * One lane per brief: an open one is entered instead.
 */
async function discuss(brief) {
  const number = brief.number;
  if (discussing !== null) return;
  if (agentDispatch.enterBriefLane(number)) return;
  const path = state.getProjectPath();
  const tool = aiToolSelector.getCurrentTool();
  const toolId = tool ? tool.id : null;
  if (!path) return;
  discussing = number;
  renderLaneSlots(number);
  try {
    let result;
    try {
      result = await ipcRenderer.invoke(IPC.CLOUD_BRIEF_DISCUSS, path, number, toolId);
    } catch (err) {
      console.error('cloudBriefsPanel: could not start the discussion', err);
      result = { ok: false, reason: 'other' };
    }
    if (!result || !result.ok) {
      if (!result || result.reason !== 'unauthorized') notify.error(copy.discussErrorMessage(result && result.reason));
      return;
    }
    // Another click may have opened the lane while main answered.
    if (agentDispatch.enterBriefLane(number)) return;
    await agentDispatch.dispatch({
      createNew: true,
      toolId,
      prompt: result.prompt,
      assignment: { kind: 'brief', label: `brief #${number}: ${brief.title}`, ref: number },
    });
  } finally {
    discussing = null;
    renderLaneSlots(number);
  }
}

/** Redraw the cards' lane controls and the detail's Discuss / Go to discussion. `number` null means any brief. */
function renderLaneSlots(number) {
  if (!visible) return;
  for (const el of contentElement.querySelectorAll('[data-card-actions]')) {
    const brief = boardBrief(Number(el.dataset.cardActions));
    if (brief && (number == null || brief.number === number)) el.innerHTML = renderCardActions(brief);
  }
  if (drawerMode !== 'detail' || !detail || !detail.result) return;
  if (number != null && detail.number !== number) return;
  const slot = detailContentElement.querySelector('.cloud-briefs-discuss-slot');
  if (slot) slot.innerHTML = renderDiscussAction(detail.result.brief, detail.result.events);
  const rediscuss = detailContentElement.querySelector('.cloud-briefs-rediscuss-slot');
  if (rediscuss) rediscuss.innerHTML = renderRediscuss(detail.result.brief, detail.result.events, detail.result.meId);
}

/** A record landed: reload the board (its counts) and the brief when it is the one on screen. */
function onDiscussionRecorded(payload) {
  const { folderPath, number } = payload || {};
  if (!visible || folderPath !== state.getProjectPath()) return;
  load();
  if (drawerMode === 'detail' && detail && detail.number === number) loadDetail();
}

module.exports = {
  init,
  show,
  hide,
  isVisible,
  isAvailable,
  openBrief,
};
