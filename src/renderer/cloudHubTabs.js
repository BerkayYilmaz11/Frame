/**
 * Frame Cloud tabs — Cloud projects and On this device.
 *
 * Drawn from CLOUD_PROJECTS_STATE only: main has already matched folders to
 * projects and planned each unconnected folder, so this module draws and
 * forwards clicks. Every server string goes through
 * textContent. No label says a project is connected "elsewhere" or belongs
 * to a device — "On this device" only names where the listed folders are.
 */

const os = require('os');
const path = require('path');
const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const tooltip = require('./tooltip');

const SLUG_CHECK_DELAY_MS = 300;

const SLUG_ERRORS = {
  empty: 'Enter a slug.',
  length: 'Use 3–32 characters.',
  format: 'Use lowercase letters, numbers and single hyphens.',
  reserved: 'That slug is reserved.'
};

const LINK_ERRORS = {
  taken: 'This folder is already connected — the list was refreshed.',
  notFound: 'That project no longer exists — the list was refreshed.',
  network: "Frame Cloud couldn't be reached.",
  noConfig: "This folder has no .frame/config.json, so it can't be connected.",
  noWorkspace: 'Create a workspace on the web first.',
  badRequest: 'Check the name and slug.',
  other: "Couldn't connect this folder. Try again."
};

const QUESTIONS = {
  remoteMismatch: {
    text: 'This project points at another repository. Connect anyway?',
    yes: 'Connect anyway',
    no: 'Leave'
  },
  mismatch: {
    text: 'This project is already connected to a Frame folder with a different identity — that happens with local sharing mode, or when .frame/ was recreated. Connect this folder instead? The other folder will read Not connected.',
    yes: 'Connect this folder',
    no: 'Leave'
  }
};

let hub = null;
let projectsEl = null;
let deviceEl = null;
let lastState = null;

// On this device keeps only what the push cannot know: what the user typed,
// picked or ticked, and the answer still pending on a row. Keyed by path.
const rowUi = new Map();
let candidatesRequested = false;
let pendingFocus = null; // { folderPath } | { projectId }
let selectedPath = null; // the folder On this device shows on the right
let scrollSelected = false;

function init(cloudHub) {
  hub = cloudHub;
  projectsEl = document.getElementById('cloud-tab-projects');
  deviceEl = document.getElementById('cloud-tab-device');
  if (!projectsEl || !deviceEl) {
    console.error('Frame Cloud: tab panels not found — the Frame Cloud lists will not render');
  }
}

function render(state, activeTab) {
  lastState = state;
  if (state.status === 'signedOut') {
    rowUi.clear();
    candidatesRequested = false;
  }
  // Both tabs read the candidates: Cloud projects tells a project with a
  // folder here apart from one without. Look as soon as the list is ready.
  if (!candidatesRequested && state.status === 'ready') requestCandidates();
  if (projectsEl) renderProjectsTab(state);
  if (activeTab !== 'device') return;
  if (deviceEl) renderDeviceTab(state);
}

function onShow(tab, opts = {}) {
  if (tab !== 'device') {
    if (opts.force) requestCandidates();
    return;
  }
  if (opts.folderPath) {
    pendingFocus = { folderPath: opts.folderPath };
    if (opts.confirmDisconnect) ui(opts.folderPath).question = 'disconnect';
  }
  else if (opts.projectId) pendingFocus = { projectId: opts.projectId };
  if (opts.force || !candidatesRequested) requestCandidates();
  if (lastState && deviceEl) renderDeviceTab(lastState);
}

// link.candidates runs once the list is ready and on every Refresh; answers
// arrive as pushes.
function requestCandidates() {
  if (!lastState || lastState.status !== 'ready') return;
  candidatesRequested = true;
  ipcRenderer.invoke(IPC.CLOUD_FOLDER_CANDIDATES).catch((err) => {
    console.error('Frame Cloud: could not look for matching projects', err);
  });
}

// ─── DOM helpers ──────────────────────────────────────────

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(label, onClick, { primary = false, quiet = false, danger = false, disabled = false, className = '' } = {}) {
  const variant = primary ? ' settings-about-btn-primary' : quiet ? ' cloud-btn-quiet' : danger ? ' cloud-btn-danger' : '';
  const btn = el('button', `settings-about-btn cloud-row-btn${variant}${className ? ` ${className}` : ''}`, label);
  btn.type = 'button';
  btn.disabled = disabled;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

function message(text, { retry = false, className = '' } = {}) {
  const box = el('div', `cloud-empty${className ? ` ${className}` : ''}`);
  box.appendChild(el('p', 'settings-about-status', text));
  if (retry) box.appendChild(button('Retry', () => hub.refreshProjects()));
  return box;
}

function staleNote(state) {
  const when = state.lastUpdated ? hub.formatRelative(new Date(state.lastUpdated)) : '';
  const text = when
    ? `Frame Cloud couldn't be reached — showing the list from ${when}.`
    : "Frame Cloud couldn't be reached — showing the last known list.";
  return message(text, { retry: true, className: 'cloud-stale' });
}

function workspaceName(state) {
  const ws = state.cloudWorkspace || {};
  return ws.name || ws.slug || 'this workspace';
}

// ─── Cloud projects ───────────────────────────────────────

function renderProjectsTab(state) {
  // A redraw removes the hovered info mark before its mouseleave can fire.
  if (tooltip.current && projectsEl.contains(tooltip.current)) tooltip.hide();
  projectsEl.replaceChildren();
  if (state.status === 'signedOut') return;

  const list = Array.isArray(state.projects) ? state.projects : [];
  if (state.status === 'loading' && !list.length) {
    projectsEl.appendChild(message('Loading projects…'));
    return;
  }
  if (state.status === 'error') {
    projectsEl.appendChild(message("Frame Cloud couldn't be reached.", { retry: true }));
    return;
  }
  if (state.status === 'stale') projectsEl.appendChild(staleNote(state));
  if (!list.length) {
    projectsEl.appendChild(message(`No projects in ${workspaceName(state)} yet.`));
    return;
  }

  const table = el('div', 'cloud-rows');
  const head = el('div', 'cloud-row cloud-row-head');
  for (const label of ['Project', 'Status', 'On this device', '']) {
    head.appendChild(el('div', 'cloud-cell', label));
  }
  table.appendChild(head);
  for (const project of list) table.appendChild(projectRow(project, state));
  projectsEl.appendChild(table);
}

/**
 * What a project row is, seen from this device:
 *   open     — connected, with a folder here
 *   elsewhere — connected, no folder here carries its id
 *   ready    — not connected, a folder here suggests it (On this device's match)
 *   absent   — not connected, nothing here suggests it
 */
function projectCase(project, state) {
  const names = Array.isArray(project.folderNames) ? project.folderNames : [];
  if (project.connected) return { kind: names.length ? 'open' : 'elsewhere', names };
  const folders = Array.isArray(state.folders) ? state.folders : [];
  const matches = folders.filter((f) =>
    !f.connected && f.plan && f.plan.candidate && f.plan.candidate.id === project.id
  );
  if (matches.length) return { kind: 'ready', names: matches.map((f) => f.name), folders: matches };
  const checking = folders.some((f) => !f.connected && f.candidatesLoading);
  return { kind: 'absent', names: [], checking };
}

const NOT_HERE_NOTE =
  "No folder for this project was found on this computer. To work on it here, " +
  'add it with "Add a project…" in the project switcher (open its folder or ' +
  'clone it), then connect it from On this device.';

const INFO_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/>' +
  '<path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

const STATUS_CHIPS = {
  open: { label: 'Connected', className: 'cloud-chip-connected' },
  elsewhere: { label: 'Connected', className: 'cloud-chip-connected' },
  ready: { label: 'Ready to connect', className: 'cloud-chip-ready' },
  absent: { label: 'Not connected', className: '' }
};

function projectRow(project, state) {
  const c = projectCase(project, state);
  const row = el('div', 'cloud-row');
  row.dataset.projectId = project.id;

  const nameCell = el('div', 'cloud-cell cloud-cell-name');
  nameCell.appendChild(el('span', 'cloud-name', project.name || project.slug));
  row.appendChild(nameCell);

  const chip = STATUS_CHIPS[c.kind];
  const statusCell = el('div', 'cloud-cell');
  statusCell.appendChild(el('span', `cloud-chip ${chip.className}`, chip.label));
  row.appendChild(statusCell);

  let hereCell;
  if (c.names.length) {
    hereCell = el('div', 'cloud-cell cloud-cell-folder', c.names.length === 1 ? c.names[0] : `${c.names.length} folders`);
    if (c.names.length > 1) hereCell.title = c.names.join(', ');
  } else if (c.checking) {
    hereCell = el('div', 'cloud-cell cloud-cell-folder cloud-cell-muted', 'Checking…');
  } else {
    hereCell = el('div', 'cloud-cell cloud-cell-folder cloud-cell-muted cloud-not-here');
    hereCell.appendChild(el('span', 'cloud-not-here-text', 'Not on this device'));
    const info = el('span', 'cloud-info');
    info.tabIndex = 0;
    info.innerHTML = INFO_ICON;
    tooltip.attach(info, NOT_HERE_NOTE, { placement: 'top', variant: 'note' });
    hereCell.appendChild(info);
  }
  row.appendChild(hereCell);

  const actions = el('div', 'cloud-cell cloud-cell-actions');
  const openWeb = () => {
    ipcRenderer.invoke(IPC.CLOUD_OPEN_ON_WEB, project.id).catch((err) => {
      console.error('Frame Cloud: could not open the project on the web', err);
    });
  };
  // Nothing here to open or connect on an absent row: the info mark says how
  // to bring the project to this computer, and the web stays one click away.
  if (project.canOpenWeb) actions.appendChild(button('Open in browser', openWeb));
  if (c.kind === 'open' && project.openPath) {
    actions.appendChild(button('Open', () => openFolder(project.openPath), { primary: true }));
  } else if (c.kind === 'ready') {
    appendConnect(row, actions, project, c.folders, state.status === 'stale');
    return row;
  }
  row.appendChild(actions);
  return row;
}

/**
 * Connect on a Ready to connect row runs the link right here, on the one
 * folder that suggests this project. Its questions and errors show under the
 * row. More than one such folder is a choice, so that goes to On this device.
 */
function appendConnect(row, actions, project, folders, stale) {
  if (folders.length > 1) {
    actions.appendChild(button('Connect…', () => hub.setTab('device', { projectId: project.id }), { primary: true }));
    row.appendChild(actions);
    return;
  }
  const folder = folders[0];
  const u = ui(folder.path);
  actions.appendChild(button('Connect', () => {
    u.mode = 'connect';
    u.targetId = project.id;
    connectRowNow(folder.path, {});
  }, { primary: true, disabled: stale || u.busy || Boolean(u.question) }));
  row.appendChild(actions);
  appendStatus(row, folder, stale);
}

function openFolder(folderPath) {
  // Required late: the project list pulls in the terminal stack.
  require('./projectListUI').selectProject(folderPath);
  hub.close();
}

// ─── On this device ───────────────────────────────────────
//
// A list of this device's Frame folders on the left and the selected one on
// the right: what it is, what connecting it would do, and the one action that
// does it. One folder at a time — no ticking, no bulk run.

const MATCH_REASONS = {
  id: "This folder's Frame identity is already this project's.",
  remote: "The folder's git remote is this project's repository.",
  name: 'The names match. Check that it is the same project before connecting.'
};

function ui(path) {
  if (!rowUi.has(path)) rowUi.set(path, { path });
  return rowUi.get(path);
}

/** What a folder does now: the plan, with whatever the user changed on top. */
function effective(folder) {
  const plan = folder.plan;
  const u = ui(folder.path);
  const options = plan.options || [];
  const mode = u.mode || plan.group;
  const target = options.find((o) => o.id === u.targetId) || plan.candidate || null;
  return {
    mode: mode === 'connect' && target ? 'connect' : 'create',
    target,
    options,
    name: u.name !== undefined ? u.name : plan.name,
    slug: u.slug !== undefined ? u.slug : plan.slug,
  };
}

/** Which list a folder sits in. By the plan, so a choice made in the detail never moves it. */
function folderKind(folder) {
  if (folder.connected) return 'connected';
  if (!folder.plan) return 'pending';
  return folder.plan.group === 'connect' ? 'suggested' : 'new';
}

const KIND_ORDER = ['suggested', 'new', 'pending', 'connected'];

function kindTitle(kind, folders) {
  if (kind === 'suggested') return 'Suggested';
  if (kind === 'new') return 'Not in Frame Cloud';
  if (kind === 'connected') return 'Connected';
  return folders.some((f) => f.candidatesLoading) ? 'Looking for a match' : 'Not connected';
}

function shortPath(p) {
  const home = os.homedir();
  return home && (p === home || p.startsWith(home + path.sep)) ? `~${p.slice(home.length)}` : p;
}

function renderDeviceTab(state) {
  const focus = captureFocus();
  deviceEl.replaceChildren();
  if (state.status === 'signedOut') return;

  const folders = Array.isArray(state.folders) ? state.folders : [];
  for (const p of rowUi.keys()) {
    if (!folders.some((f) => f.path === p)) rowUi.delete(p);
  }

  if (state.status === 'loading' && !state.lastUpdated) {
    deviceEl.appendChild(message('Loading projects…'));
    return;
  }
  if (state.status === 'error') {
    deviceEl.appendChild(message("Frame Cloud couldn't be reached.", { retry: true }));
    return;
  }
  const stale = state.status !== 'ready';
  if (state.status === 'stale') deviceEl.appendChild(staleNote(state));

  const n = Number(state.uninitialisedCount) || 0;
  if (!folders.length) {
    deviceEl.appendChild(message('No Frame projects on this device yet.'));
    if (n > 0) deviceEl.appendChild(uninitialisedNote(n));
    return;
  }

  const groups = { suggested: [], new: [], pending: [], connected: [] };
  for (const folder of folders) groups[folderKind(folder)].push(folder);
  const ordered = KIND_ORDER.flatMap((k) => groups[k]);

  applyPendingFocus(folders);
  if (!ordered.some((f) => f.path === selectedPath)) selectedPath = ordered[0].path;
  const selected = ordered.find((f) => f.path === selectedPath);

  const split = el('div', 'cloud-split');
  const side = el('nav', 'cloud-side');
  side.setAttribute('aria-label', 'Folders on this device');
  for (const kind of KIND_ORDER) {
    const list = groups[kind];
    if (!list.length) continue;
    side.appendChild(el('div', 'cloud-side-label', `${kindTitle(kind, folders)} · ${list.length}`));
    for (const folder of list) side.appendChild(sideItem(folder, kind));
  }
  if (n > 0) side.appendChild(uninitialisedNote(n));
  split.appendChild(side);

  const detail = el('div', 'cloud-detail');
  drawDetail(detail, selected, stale, state);
  split.appendChild(detail);
  deviceEl.appendChild(split);

  if (scrollSelected) {
    scrollSelected = false;
    const item = side.querySelector('.cloud-side-item.selected');
    if (item) requestAnimationFrame(() => item.scrollIntoView({ block: 'nearest' }));
  }
  restoreFocus(focus);
}

function uninitialisedNote(n) {
  return el(
    'p',
    'settings-about-status cloud-uninitialised',
    n === 1
      ? "1 more folder isn't a Frame project yet. Initialize Frame there to connect it."
      : `${n} more folders aren't Frame projects yet. Initialize Frame there to connect them.`
  );
}

function sideItem(folder, kind) {
  const item = el('button', `cloud-side-item${folder.path === selectedPath ? ' selected' : ''}`);
  item.type = 'button';
  item.dataset.folderPath = folder.path;
  item.setAttribute('aria-current', folder.path === selectedPath ? 'true' : 'false');
  item.appendChild(el('span', `cloud-state cloud-state-${kind}`));
  const text = el('span', 'cloud-side-text');
  text.appendChild(el('span', 'cloud-side-name', folder.name));
  text.appendChild(el('span', 'cloud-side-path', shortPath(folder.path)));
  item.appendChild(text);
  item.addEventListener('click', () => {
    if (selectedPath === folder.path) return;
    selectedPath = folder.path;
    rerender();
  });
  return item;
}

function drawDetail(detail, folder, stale, state) {
  const head = el('div', 'cloud-detail-head');
  head.appendChild(el('h4', 'cloud-detail-title', folder.name));
  head.appendChild(el('div', 'cloud-detail-path', folder.path));
  detail.appendChild(head);

  if (folder.connected) return drawConnected(detail, folder, stale);
  if (!folder.plan) {
    const note = folder.candidatesLoading
      ? 'Looking for a matching project in Frame Cloud…'
      : stale
        ? 'Matching projects show once Frame Cloud can be reached.'
        : 'Refresh to look for a matching project.';
    detail.appendChild(el('p', 'cloud-detail-lead', note));
    return;
  }
  const e = effective(folder);
  if (e.mode === 'connect') drawConnect(detail, folder, e, stale);
  else drawCreate(detail, folder, e, stale, state);
}

function facts(rows) {
  const dl = el('dl', 'cloud-facts');
  for (const [label, value] of rows) {
    dl.appendChild(el('dt', '', label));
    const dd = el('dd');
    if (typeof value === 'string') dd.textContent = value;
    else dd.appendChild(value);
    dl.appendChild(dd);
  }
  return dl;
}

function drawConnect(detail, folder, e, stale) {
  const u = ui(folder.path);
  const target = e.target;

  const project = el('span', 'cloud-fact-inline');
  project.appendChild(el('span', '', target.name || target.slug));
  project.appendChild(el('span', 'cloud-slug', target.slug));
  const rows = [['Connect to', project]];
  if (target.match) {
    const why = el('span', 'cloud-fact-inline');
    why.appendChild(el('span', 'cloud-chip cloud-chip-ready', target.matchLabel));
    why.appendChild(el('span', 'cloud-fact-note', MATCH_REASONS[target.match] || ''));
    rows.push(['Why', why]);
  }
  if (target.alreadyConnected) {
    const taken = el('span', 'cloud-fact-inline');
    taken.appendChild(el('span', 'cloud-chip cloud-chip-warn', 'Already connected'));
    taken.appendChild(el('span', 'cloud-fact-note', 'Another folder with a different identity holds it. Connecting this one takes it over.'));
    rows.push(['Note', taken]);
  }
  detail.appendChild(facts(rows));

  const alt = el('div', 'cloud-alt');
  const others = e.options.filter((o) => o.id !== target.id);
  if (others.length) {
    alt.appendChild(button(u.pickerOpen ? 'Close' : 'Pick a different project…', () => {
      u.pickerOpen = !u.pickerOpen;
      rerender();
    }, { quiet: true, disabled: u.busy }));
  }
  alt.appendChild(button('Create a new project instead', () => chooseCreate(folder), { quiet: true, disabled: u.busy }));
  detail.appendChild(alt);
  if (u.pickerOpen) detail.appendChild(picker(folder, e));

  appendStatus(detail, folder, stale);
  const foot = el('div', 'cloud-detail-foot');
  foot.appendChild(button(`Connect to ${target.name || target.slug}`, () => connectRowNow(folder.path, {}), {
    primary: true,
    disabled: stale || u.busy || Boolean(QUESTIONS[u.question])
  }));
  detail.appendChild(foot);
}

function drawCreate(detail, folder, e, stale, state) {
  const u = ui(folder.path);
  const ws = state.cloudWorkspace || {};
  // The availability line shows without waiting for a keystroke.
  if (u.slugState === undefined && !u.slugTimer && !stale) checkSlugSoon(folder.path, e.slug);

  const panel = el('div', 'cloud-panel');
  panel.appendChild(el('h5', 'cloud-panel-title', 'Add to Frame Cloud'));
  panel.appendChild(el(
    'p',
    'cloud-detail-lead',
    `No project in ${workspaceName(state)} matches this folder. Create one and this folder becomes its first connection. Nothing is uploaded; the files stay on this device.`
  ));
  panel.appendChild(field(folder, 'name', 'Name', e.name, u.busy));
  const slugField = field(folder, 'slug', 'URL', e.slug, u.busy, ws.slug ? `…/${ws.slug}/` : '');
  panel.appendChild(slugField);
  const slugNote = slugStatus(u);
  if (slugNote) panel.appendChild(slugNote);
  detail.appendChild(panel);

  if (e.options.length) {
    const alt = el('div', 'cloud-alt');
    alt.appendChild(el('span', 'cloud-fact-note', 'Already made it on the web?'));
    alt.appendChild(button(u.pickerOpen ? 'Close' : 'Connect to an existing project…', () => {
      u.pickerOpen = !u.pickerOpen;
      rerender();
    }, { quiet: true, disabled: u.busy }));
    detail.appendChild(alt);
    if (u.pickerOpen) detail.appendChild(picker(folder, e));
  }

  appendStatus(detail, folder, stale);
  const blocked = !String(e.name || '').trim() || (u.slugState && (u.slugState.state === 'taken' || u.slugState.state === 'invalid'));
  const foot = el('div', 'cloud-detail-foot');
  foot.appendChild(button('Create and connect', () => connectRowNow(folder.path, {}), {
    primary: true,
    disabled: stale || u.busy || Boolean(blocked) || Boolean(QUESTIONS[u.question])
  }));
  detail.appendChild(foot);
}

function drawConnected(detail, folder, stale) {
  const u = ui(folder.path);
  const project = folder.project || {};

  const status = el('span', 'cloud-fact-inline');
  status.appendChild(el('span', 'cloud-state cloud-state-connected'));
  status.appendChild(el('span', '', 'Connected'));
  const cloud = el('span', 'cloud-fact-inline');
  cloud.appendChild(el('span', '', project.name || project.slug || ''));
  cloud.appendChild(el('span', 'cloud-slug', project.slug || ''));
  if (lastState && lastState.canOpenWeb && project.id) {
    cloud.appendChild(button('Open in browser', () => {
      ipcRenderer.invoke(IPC.CLOUD_OPEN_ON_WEB, project.id).catch((err) => {
        console.error('Frame Cloud: could not open the project on the web', err);
      });
    }, { quiet: true }));
  }
  detail.appendChild(facts([['Status', status], ['Cloud project', cloud]]));

  if (u.question === 'disconnect') {
    const q = el('div', 'cloud-question');
    q.appendChild(el('span', '', `Disconnect ${folder.name} from ${project.name || project.slug || 'this project'}? The cloud project and this folder both stay; they stop being linked.`));
    q.appendChild(button('Keep', () => {
      u.question = null;
      rerender();
    }, { disabled: u.busy }));
    q.appendChild(button('Disconnect', () => disconnect(folder), { danger: true, disabled: stale || u.busy }));
    detail.appendChild(q);
  }
  if (u.busy) detail.appendChild(el('p', 'settings-about-status', 'Disconnecting…'));
  if (u.message) detail.appendChild(el('p', 'settings-about-status cloud-row-error', u.message));

  const foot = el('div', 'cloud-detail-foot');
  if (u.question !== 'disconnect') {
    foot.appendChild(button('Disconnect…', () => {
      u.question = 'disconnect';
      u.message = null;
      rerender();
    }, { quiet: true, className: 'cloud-btn-danger-text', disabled: stale || u.busy }));
  }
  foot.appendChild(button('Open in Frame', () => openFolder(folder.path), { primary: true }));
  detail.appendChild(foot);
}

function chooseCreate(folder) {
  const u = ui(folder.path);
  u.mode = 'create';
  u.pickerOpen = false;
  u.question = null;
  u.message = null;
  rerender();
}

function picker(folder, e) {
  const u = ui(folder.path);
  const list = el('div', 'cloud-picker');
  for (const option of e.options) {
    const current = e.mode === 'connect' && e.target && e.target.id === option.id;
    const item = el('button', `cloud-picker-item${current ? ' active' : ''}`);
    item.type = 'button';
    item.appendChild(el('span', 'cloud-name', option.name || option.slug));
    item.appendChild(el('span', 'cloud-slug', option.slug));
    if (option.matchLabel) item.appendChild(el('span', 'cloud-chip', option.matchLabel));
    if (option.alreadyConnected) item.appendChild(el('span', 'cloud-chip cloud-chip-warn', 'Already connected'));
    item.addEventListener('click', () => {
      u.mode = 'connect';
      u.targetId = option.id;
      u.pickerOpen = false;
      u.question = null;
      u.message = null;
      u.acceptRemoteMismatch = false;
      u.takeOver = false;
      rerender();
    });
    list.appendChild(item);
  }
  return list;
}

function field(folder, key, label, value, disabled, prefix = '') {
  const wrap = el('label', 'cloud-field');
  wrap.appendChild(el('span', 'cloud-field-label', label));
  const box = el('span', `cloud-input-box${key === 'slug' ? ' cloud-input-mono' : ''}`);
  if (prefix) box.appendChild(el('span', 'cloud-input-prefix', prefix));
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cloud-input';
  input.value = value || '';
  input.disabled = Boolean(disabled);
  input.spellcheck = false;
  input.dataset.focusKey = JSON.stringify([folder.path, key]);
  input.addEventListener('input', () => {
    const u = ui(folder.path);
    u[key] = input.value;
    if (key === 'slug') checkSlugSoon(folder.path, input.value);
    if (key === 'name') {
      const nameError = input.value.trim() ? null : 'Enter a name.';
      if (nameError !== (u.nameError || null)) {
        u.nameError = nameError;
        rerender();
      }
    }
  });
  box.appendChild(input);
  wrap.appendChild(box);
  return wrap;
}

function slugStatus(u) {
  const box = el('div', 'cloud-slug-status');
  if (u.nameError) box.appendChild(el('span', 'cloud-row-error', u.nameError));
  const s = u.slugState;
  if (s) {
    if (s.state === 'checking') box.appendChild(el('span', 'settings-about-status', 'Checking…'));
    else if (s.state === 'ok') box.appendChild(el('span', 'cloud-ok', '✓ Available'));
    else if (s.state === 'invalid') box.appendChild(el('span', 'cloud-row-error', SLUG_ERRORS[s.error] || SLUG_ERRORS.format));
    else if (s.state === 'taken') {
      box.appendChild(el('span', 'cloud-row-error', 'That URL is taken.'));
      if (s.suggestion) {
        box.appendChild(button(`Use ${s.suggestion}`, () => {
          u.slug = s.suggestion;
          rerender();
          checkSlugSoon(u.path, s.suggestion);
        }, { quiet: true }));
      }
    }
  }
  return box.childNodes.length ? box : null;
}

// Main validates the slug first and only asks the server about a valid one.
let slugSeq = 0;
function checkSlugSoon(folderPath, slug) {
  const u = ui(folderPath);
  clearTimeout(u.slugTimer);
  const seq = ++slugSeq;
  u.slugSeq = seq;
  u.slugTimer = setTimeout(async () => {
    u.slugState = { state: 'checking' };
    rerender();
    let res = null;
    try {
      res = await ipcRenderer.invoke(IPC.CLOUD_CHECK_SLUG, slug);
    } catch (err) {
      console.error('Frame Cloud: slug check failed', err);
    }
    if (u.slugSeq !== seq) return;
    if (!res) u.slugState = null;
    else if (res.ok) u.slugState = res.available ? { state: 'ok' } : { state: 'taken', suggestion: res.suggestion };
    else if (res.reason === 'badRequest') u.slugState = { state: 'invalid', error: res.slugError };
    else u.slugState = null;
    rerender();
  }, SLUG_CHECK_DELAY_MS);
}

/** Progress, a question that needs an answer, or the last error — above the folder's button. */
function appendStatus(target, folder, stale) {
  const u = ui(folder.path);
  if (u.busy) {
    target.appendChild(el('p', 'settings-about-status cloud-row-status', 'Connecting…'));
    return;
  }
  const q = QUESTIONS[u.question];
  if (q) {
    const box = el('div', 'cloud-question');
    box.appendChild(el('span', '', q.text));
    box.appendChild(button(q.no, () => {
      u.question = null;
      rerender();
    }));
    box.appendChild(button(q.yes, () => connectRowNow(folder.path, {
      acceptRemoteMismatch: u.question === 'remoteMismatch',
      takeOver: u.question === 'mismatch'
    }), { primary: true, disabled: stale }));
    target.appendChild(box);
  }
  if (u.message) target.appendChild(el('p', 'settings-about-status cloud-row-error', u.message));
}

// ─── Linking ──────────────────────────────────────────────

/**
 * Claim or create one row. `flags` carries a question the user just
 * confirmed on this row; an earlier confirmation for the same target is kept
 * so answering a second question does not undo the first.
 */
async function connectRowNow(path, flags) {
  const folder = lastState && (lastState.folders || []).find((f) => f.path === path);
  if (!folder || folder.connected || !folder.plan) return;
  const u = ui(path);
  if (u.busy) return;
  const e = effective(folder);
  u.busy = true;
  u.message = null;
  u.question = null;
  if (flags.acceptRemoteMismatch) u.acceptRemoteMismatch = true;
  if (flags.takeOver) u.takeOver = true;
  rerender();

  let res = null;
  try {
    if (e.mode === 'connect') {
      res = await ipcRenderer.invoke(IPC.CLOUD_LINK_CLAIM, {
        path,
        projectId: e.target.id,
        acceptRemoteMismatch: Boolean(u.acceptRemoteMismatch),
        takeOver: Boolean(u.takeOver)
      });
    } else {
      res = await ipcRenderer.invoke(IPC.CLOUD_LINK_CREATE, { path, name: e.name, slug: e.slug });
    }
  } catch (err) {
    console.error('Frame Cloud: link failed', err);
  }

  u.busy = false;
  if (res && res.ok) rowUi.delete(path);
  else applyRefusal(u, res || { ok: false, reason: 'other' });
  rerender();
}

function applyRefusal(u, res) {
  switch (res.reason) {
    case 'remoteMismatch':
      u.question = 'remoteMismatch';
      return;
    case 'mismatch':
      u.question = 'mismatch';
      return;
    case 'slugTaken':
      u.slugState = { state: 'taken', suggestion: res.suggestion };
      return;
    case 'badRequest':
      if (res.field === 'slug') u.slugState = { state: 'invalid', error: res.slugError };
      else if (res.field === 'name') u.nameError = 'Enter a name.';
      else u.message = LINK_ERRORS.badRequest;
      return;
    case 'unauthorized':
      return; // the modal is back on the sign-in pane
    default:
      u.message = LINK_ERRORS[res.reason] || LINK_ERRORS.other;
  }
}

async function disconnect(folder) {
  const u = ui(folder.path);
  if (u.busy) return;
  u.busy = true;
  u.message = null;
  rerender();
  let res = null;
  try {
    res = await ipcRenderer.invoke(IPC.CLOUD_LINK_RELEASE, { path: folder.path });
  } catch (err) {
    console.error('Frame Cloud: disconnect failed', err);
  }
  u.busy = false;
  if (res && res.ok) {
    rowUi.delete(folder.path);
  } else if (!res || res.reason !== 'unauthorized') {
    u.message = res && res.reason === 'network'
      ? LINK_ERRORS.network
      : "Couldn't disconnect this folder. Try again.";
  }
  rerender();
}

// ─── Render plumbing ──────────────────────────────────────

function rerender() {
  if (!lastState) return;
  if (projectsEl) renderProjectsTab(lastState);
  if (deviceEl && hub && hub.activeTab() === 'device') renderDeviceTab(lastState);
}

// Selects the folder a caller asked for (a path, or the folder whose
// suggestion is a project) and scrolls the list to it.
function applyPendingFocus(folders) {
  if (!pendingFocus) return;
  let target = null;
  if (pendingFocus.folderPath) {
    target = folders.find((f) => f.path === pendingFocus.folderPath);
  } else if (pendingFocus.projectId) {
    const id = pendingFocus.projectId;
    target = folders.find((f) => !f.connected && f.plan && f.plan.candidate && f.plan.candidate.id === id)
      || folders.find((f) => !f.connected && f.plan && (f.plan.options || []).some((o) => o.id === id));
    if (!target && folders.some((f) => f.candidatesLoading)) return; // wait for the answers
    if (target) {
      const u = ui(target.path);
      if (!(target.plan.candidate && target.plan.candidate.id === id)) {
        u.mode = 'connect';
        u.targetId = id;
      }
    }
  }
  pendingFocus = null;
  if (!target) return;
  selectedPath = target.path;
  scrollSelected = true;
}

// A push while the user types must not steal the caret.
function captureFocus() {
  const active = document.activeElement;
  if (!active || !deviceEl.contains(active) || !active.dataset.focusKey) return null;
  return { key: active.dataset.focusKey, start: active.selectionStart, end: active.selectionEnd };
}

function restoreFocus(focus) {
  if (!focus) return;
  const input = Array.from(deviceEl.querySelectorAll('[data-focus-key]'))
    .find((node) => node.dataset.focusKey === focus.key);
  if (!input) return;
  input.focus();
  try {
    input.setSelectionRange(focus.start, focus.end);
  } catch (e) {
    /* not a text input */
  }
}

module.exports = { init, render, onShow };
