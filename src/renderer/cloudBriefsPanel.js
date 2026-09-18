/**
 * Cloud Briefs Panel
 *
 * The open folder's Frame Cloud briefs, read-only (frame-cloud-briefs-read-only
 * spec). Reached from the sidebar's Context → Briefs row, which exists only
 * while the open folder is connected to a cloud project; hosted in the center
 * by `multiTerminalUI` the way Sessions is (`PANEL_REGISTRY.cloudBriefs`).
 *
 * The renderer sends a folder path and nothing else — main resolves the
 * connected project and holds the token. Nothing here writes to the cloud.
 *
 * Names are `cloudBriefs*` / `cloud-briefs`, not `briefs`: the local briefs
 * of brief-capture-and-shaping own those, and the two must meet in one tree.
 *
 * Host contract, the same as every center-hosted panel: `show()` adds
 * `.visible` and loads, `hide()` drops `.visible` — which is what the host's
 * MutationObserver watches to route back to the terminals view.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');
const cloudProjectMark = require('./cloudProjectMark');
const { escapeHtml } = require('./htmlUtils');
const copy = require('./cloudBriefsCopy');

let hub = null;
let panelElement = null;
let contentElement = null;
let countElement = null;
let showClosedInput = null;
let refreshButton = null;
let webButton = null;
let visible = false;

// The board's last answer and the folder it belongs to. A refresh of the same
// folder keeps the board on screen and spins the button; another folder
// starts from the loading state.
let board = null; // { path, result }
let showClosed = false;
// Every load takes a number; an answer whose number is no longer the latest
// (another project, a toggle, a second refresh) is dropped.
let loadSeq = 0;

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

  if (showClosedInput) {
    showClosedInput.addEventListener('change', () => {
      showClosed = showClosedInput.checked;
      load();
    });
  }
  if (refreshButton) refreshButton.addEventListener('click', () => load());
  if (webButton) webButton.addEventListener('click', () => openOnWeb());
  contentElement.addEventListener('click', onContentClick);

  // The Briefs row follows the connection: sign-in, sign-out, a folder
  // connected or disconnected, a project switch.
  hub.onProjects(onCloudChange);
  hub.onSession(onCloudChange);
  state.onProjectChange(onCloudChange);
}

function onCloudChange() {
  try {
    require('./projectListUI').updateWorkspaceNav();
  } catch (err) {
    console.error('cloudBriefsPanel: could not refresh the nav', err);
  }
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
}

// ─── Loading ──────────────────────────────────────────────────

async function load() {
  if (!contentElement) return;
  const path = state.getProjectPath();
  const seq = ++loadSeq;
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

  contentElement.innerHTML = open + closed;
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
  return `<button type="button" class="cloud-briefs-card" data-number="${brief.number}" tabindex="-1">
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
      <p>Nothing in this project is proposed or decided on Frame Cloud yet. Briefs are written on the web and show up here.</p>
      ${canOpenWeb ? '<button type="button" class="cloud-briefs-web-btn" data-action="open-web" tabindex="-1">Open on web</button>' : ''}
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

module.exports = {
  init,
  show,
  hide,
  isVisible,
  isAvailable,
};
