/**
 * Frame Cloud tabs — Cloud projects and On this device.
 *
 * Drawn from CLOUD_PROJECTS_STATE only: main has already matched folders to
 * projects, planned each unconnected row and decided what starts checked, so
 * this module draws and forwards clicks. Every server string goes through
 * textContent. No label says a project is connected "elsewhere" or belongs
 * to a device — "On this device" only names where the listed folders are.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

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
let bulkRunning = false;

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
  if (projectsEl) renderProjectsTab(state);
  if (activeTab !== 'device') return;
  // The tab was shown before the list was ready: look now.
  if (!candidatesRequested && state.status === 'ready') requestCandidates();
  if (deviceEl) renderDeviceTab(state);
}

function onShow(tab, opts = {}) {
  if (tab !== 'device') return;
  if (opts.folderPath) pendingFocus = { folderPath: opts.folderPath };
  else if (opts.projectId) pendingFocus = { projectId: opts.projectId };
  if (opts.force || !candidatesRequested) requestCandidates();
  if (lastState && deviceEl) renderDeviceTab(lastState);
}

// link.candidates runs when the tab is first shown and on every Refresh;
// answers arrive as pushes.
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

function button(label, onClick, { primary = false, disabled = false, className = '' } = {}) {
  const btn = el('button', `settings-about-btn cloud-row-btn${primary ? ' settings-about-btn-primary' : ''}${className ? ` ${className}` : ''}`, label);
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
  for (const label of ['Project', 'Source', 'Status', 'On this device', '']) {
    head.appendChild(el('div', 'cloud-cell', label));
  }
  table.appendChild(head);
  for (const project of list) table.appendChild(projectRow(project));
  projectsEl.appendChild(table);
}

function projectRow(project) {
  const row = el('div', 'cloud-row');
  row.dataset.projectId = project.id;

  const nameCell = el('div', 'cloud-cell cloud-cell-name');
  nameCell.appendChild(el('span', 'cloud-name', project.name || project.slug));
  nameCell.appendChild(el('span', 'cloud-slug', project.slug));
  row.appendChild(nameCell);

  const sourceCell = el('div', 'cloud-cell');
  sourceCell.appendChild(el('span', `cloud-source cloud-source-${project.source}`, project.source === 'github' ? 'GitHub' : 'Scratch'));
  row.appendChild(sourceCell);

  const statusCell = el('div', 'cloud-cell');
  statusCell.appendChild(el(
    'span',
    `cloud-chip ${project.connected ? 'cloud-chip-connected' : ''}`,
    project.connected ? 'Connected' : 'Not connected'
  ));
  row.appendChild(statusCell);

  const names = Array.isArray(project.folderNames) ? project.folderNames : [];
  const here = names.length === 0 ? '—' : names.length === 1 ? names[0] : `${names.length} folders`;
  const hereCell = el('div', 'cloud-cell cloud-cell-folder', here);
  if (names.length > 1) hereCell.title = names.join(', ');
  row.appendChild(hereCell);

  const actions = el('div', 'cloud-cell cloud-cell-actions');
  if (project.connected && project.openPath) {
    actions.appendChild(button('Open', () => openFolder(project.openPath), { primary: true }));
  }
  if (!project.connected) {
    actions.appendChild(button('Connect a folder…', () => hub.setTab('device', { projectId: project.id, force: true })));
  }
  if (project.canOpenWeb && !project.openPath) {
    actions.appendChild(button('Open on the web', () => {
      ipcRenderer.invoke(IPC.CLOUD_OPEN_ON_WEB, project.id).catch((err) => {
        console.error('Frame Cloud: could not open the project on the web', err);
      });
    }));
  }
  row.appendChild(actions);
  return row;
}

function openFolder(folderPath) {
  // Required late: the project list pulls in the terminal stack.
  require('./projectListUI').selectProject(folderPath);
  hub.close();
}

// ─── On this device ───────────────────────────────────────

function ui(path) {
  if (!rowUi.has(path)) rowUi.set(path, { path });
  return rowUi.get(path);
}

/** What a row does now: the plan, with whatever the user changed on top. */
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
    checked: u.checked !== undefined ? u.checked : plan.checked,
    name: u.name !== undefined ? u.name : plan.name,
    slug: u.slug !== undefined ? u.slug : plan.slug,
  };
}

function renderDeviceTab(state) {
  const focus = captureFocus();
  deviceEl.replaceChildren();
  if (state.status === 'signedOut') return;

  const folders = Array.isArray(state.folders) ? state.folders : [];
  for (const path of rowUi.keys()) {
    if (!folders.some((f) => f.path === path)) rowUi.delete(path);
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

  const groups = { connect: [], create: [], pending: [], connected: [] };
  for (const folder of folders) {
    if (folder.connected) groups.connected.push(folder);
    else if (!folder.plan) groups.pending.push(folder);
    else groups[effective(folder).mode].push(folder);
  }

  if (!folders.length) {
    deviceEl.appendChild(message('No Frame projects on this device yet.'));
  }

  const selected = [...groups.connect, ...groups.create].filter((f) => effective(f).checked);
  if (groups.connect.length || groups.create.length) {
    const bar = el('div', 'cloud-bulk');
    bar.appendChild(el('span', 'settings-about-status', 'Only ticked folders are connected. Nothing else is changed.'));
    bar.appendChild(button(
      `Connect selected (${selected.length})`,
      () => connectSelected(),
      { primary: true, disabled: stale || bulkRunning || !selected.length }
    ));
    deviceEl.appendChild(bar);
  }

  appendGroup('Can be connected', groups.connect, (f) => connectRow(f, stale));
  appendGroup('Not in Frame Cloud', groups.create, (f) => createRow(f, stale));
  appendGroup(
    folders.some((f) => f.candidatesLoading) ? 'Looking for matching projects…' : 'Not connected',
    groups.pending,
    (f) => pendingRow(f, stale)
  );
  appendGroup('Connected', groups.connected, (f) => connectedRow(f, stale));

  const n = Number(state.uninitialisedCount) || 0;
  if (n > 0) {
    deviceEl.appendChild(el(
      'p',
      'settings-about-status cloud-uninitialised',
      n === 1
        ? "1 folder isn't a Frame project yet — initialise it to connect."
        : `${n} folders aren't Frame projects yet — initialise them to connect.`
    ));
  }

  applyPendingFocus(folders);
  restoreFocus(focus);
}

function appendGroup(title, folders, drawRow) {
  if (!folders.length) return;
  const group = el('div', 'cloud-group');
  group.appendChild(el('h5', 'cloud-group-title', `${title} (${folders.length})`));
  for (const folder of folders) group.appendChild(drawRow(folder));
  deviceEl.appendChild(group);
}

function deviceRowShell(folder, { checkbox, checked, disabled } = {}) {
  const row = el('div', 'cloud-device-row');
  row.dataset.folderPath = folder.path;
  const main = el('div', 'cloud-device-main');
  if (checkbox) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cloud-check';
    box.checked = Boolean(checked);
    box.disabled = Boolean(disabled);
    box.setAttribute('aria-label', `Connect ${folder.name}`);
    box.addEventListener('change', () => {
      ui(folder.path).checked = box.checked;
      rerender();
    });
    main.appendChild(box);
  }
  const who = el('div', 'cloud-device-folder');
  who.appendChild(el('span', 'cloud-name', folder.name));
  who.appendChild(el('span', 'cloud-slug', folder.path));
  main.appendChild(who);
  row.appendChild(main);
  return row;
}

function connectRow(folder, stale) {
  const u = ui(folder.path);
  const e = effective(folder);
  const row = deviceRowShell(folder, { checkbox: true, checked: e.checked, disabled: stale || u.busy });
  const main = row.firstChild;

  const target = el('div', 'cloud-device-target');
  target.appendChild(el('span', 'cloud-arrow', '→'));
  target.appendChild(el('span', 'cloud-name', e.target.name || e.target.slug));
  target.appendChild(el('span', 'cloud-slug', e.target.slug));
  if (e.target.matchLabel) target.appendChild(el('span', 'cloud-chip', e.target.matchLabel));
  if (e.target.alreadyConnected) target.appendChild(el('span', 'cloud-chip cloud-chip-warn', 'Already connected'));
  main.appendChild(target);

  const actions = el('div', 'cloud-cell-actions');
  actions.appendChild(button(u.pickerOpen ? 'Close' : 'Change…', () => {
    u.pickerOpen = !u.pickerOpen;
    rerender();
  }, { disabled: u.busy }));
  main.appendChild(actions);

  if (u.pickerOpen) row.appendChild(picker(folder, e, { allowCreate: true }));
  appendRowStatus(row, folder, stale);
  return row;
}

function createRow(folder, stale) {
  const u = ui(folder.path);
  const e = effective(folder);
  const row = deviceRowShell(folder, { checkbox: true, checked: e.checked, disabled: stale || u.busy });
  const main = row.firstChild;

  const form = el('div', 'cloud-create');
  form.appendChild(field(folder, 'name', 'Name', e.name, u.busy));
  form.appendChild(field(folder, 'slug', 'Slug', e.slug, u.busy));
  main.appendChild(form);

  const actions = el('div', 'cloud-cell-actions');
  if (e.options.length) {
    actions.appendChild(button(u.pickerOpen ? 'Close' : 'Choose an existing project…', () => {
      u.pickerOpen = !u.pickerOpen;
      rerender();
    }, { disabled: u.busy }));
  }
  main.appendChild(actions);

  const slugNote = slugStatus(u);
  if (slugNote) row.appendChild(slugNote);
  if (u.pickerOpen) row.appendChild(picker(folder, e, { allowCreate: false }));
  appendRowStatus(row, folder, stale);
  return row;
}

function pendingRow(folder, stale) {
  const row = deviceRowShell(folder);
  const note = folder.candidatesLoading
    ? 'Looking for a matching project…'
    : stale
      ? 'Matching projects show once Frame Cloud can be reached.'
      : 'Refresh to look for a matching project.';
  row.firstChild.appendChild(el('span', 'settings-about-status', note));
  return row;
}

function connectedRow(folder, stale) {
  const u = ui(folder.path);
  const row = deviceRowShell(folder);
  const main = row.firstChild;
  const project = folder.project || {};
  const target = el('div', 'cloud-device-target');
  target.appendChild(el('span', 'cloud-arrow', '→'));
  target.appendChild(el('span', 'cloud-name', project.name || project.slug || ''));
  target.appendChild(el('span', 'cloud-slug', project.slug || ''));
  main.appendChild(target);

  const actions = el('div', 'cloud-cell-actions');
  if (u.question !== 'disconnect') {
    actions.appendChild(button('Disconnect', () => {
      u.question = 'disconnect';
      u.message = null;
      rerender();
    }, { disabled: stale || u.busy }));
  }
  main.appendChild(actions);

  if (u.question === 'disconnect') {
    const q = el('div', 'cloud-question');
    q.appendChild(el('span', '', `Disconnect from ${project.name || project.slug || 'this project'}? The cloud project stays.`));
    q.appendChild(button('Disconnect', () => disconnect(folder), { primary: true, disabled: stale || u.busy }));
    q.appendChild(button('Cancel', () => {
      u.question = null;
      rerender();
    }, { disabled: u.busy }));
    row.appendChild(q);
  }
  if (u.busy) row.appendChild(el('p', 'settings-about-status cloud-row-status', 'Disconnecting…'));
  if (u.message) row.appendChild(el('p', 'settings-about-status cloud-row-error', u.message));
  return row;
}

function picker(folder, e, { allowCreate }) {
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
      u.checked = true;
      u.pickerOpen = false;
      u.question = null;
      u.message = null;
      u.acceptRemoteMismatch = false;
      u.takeOver = false;
      rerender();
    });
    list.appendChild(item);
  }
  if (allowCreate) {
    const item = el('button', 'cloud-picker-item cloud-picker-create', 'Create a new project instead');
    item.type = 'button';
    item.addEventListener('click', () => {
      u.mode = 'create';
      u.checked = true;
      u.pickerOpen = false;
      u.question = null;
      u.message = null;
      rerender();
      checkSlugSoon(folder.path, effective(folder).slug);
    });
    list.appendChild(item);
  }
  return list;
}

function field(folder, key, label, value, disabled) {
  const wrap = el('label', 'cloud-field');
  wrap.appendChild(el('span', 'cloud-field-label', label));
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `cloud-input${key === 'slug' ? ' cloud-input-mono' : ''}`;
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
  wrap.appendChild(input);
  return wrap;
}

function slugStatus(u) {
  const box = el('div', 'cloud-slug-status');
  if (u.nameError) box.appendChild(el('span', 'cloud-row-error', u.nameError));
  const s = u.slugState;
  if (s) {
    if (s.state === 'checking') box.appendChild(el('span', 'settings-about-status', 'Checking…'));
    else if (s.state === 'ok') box.appendChild(el('span', 'cloud-ok', 'Available'));
    else if (s.state === 'invalid') box.appendChild(el('span', 'cloud-row-error', SLUG_ERRORS[s.error] || SLUG_ERRORS.format));
    else if (s.state === 'taken') {
      box.appendChild(el('span', 'cloud-row-error', 'That slug is taken.'));
      if (s.suggestion) {
        box.appendChild(button(`Use ${s.suggestion}`, () => {
          u.slug = s.suggestion;
          rerender();
          checkSlugSoon(u.path, s.suggestion);
        }));
      }
    }
  }
  return box.childNodes.length ? box : null;
}

// Main validates the slug first and only asks the server about a valid one.
let slugSeq = 0;
function checkSlugSoon(path, slug) {
  const u = ui(path);
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

function appendRowStatus(row, folder, stale) {
  const u = ui(folder.path);
  if (u.busy) {
    row.appendChild(el('p', 'settings-about-status cloud-row-status', 'Connecting…'));
    return;
  }
  const q = QUESTIONS[u.question];
  if (q) {
    const box = el('div', 'cloud-question');
    box.appendChild(el('span', '', q.text));
    box.appendChild(button(q.yes, () => connectRowNow(folder.path, {
      acceptRemoteMismatch: u.question === 'remoteMismatch',
      takeOver: u.question === 'mismatch'
    }), { primary: true, disabled: stale }));
    box.appendChild(button(q.no, () => {
      u.question = null;
      rerender();
    }));
    row.appendChild(box);
  }
  if (u.message) row.appendChild(el('p', 'settings-about-status cloud-row-error', u.message));
}

// ─── Linking ──────────────────────────────────────────────

async function connectSelected() {
  if (bulkRunning || !lastState) return;
  const rows = (lastState.folders || [])
    .filter((f) => !f.connected && f.plan && effective(f).checked)
    .map((f) => f.path);
  if (!rows.length) return;
  bulkRunning = true;
  rerender();
  try {
    // One after another; a refusal stays on its row and the run goes on.
    // Questions are never answered here — only the row's own buttons do.
    for (const path of rows) await connectRowNow(path, {});
  } finally {
    bulkRunning = false;
    rerender();
  }
}

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
  if (lastState && deviceEl && hub && hub.activeTab() === 'device') renderDeviceTab(lastState);
}

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
  }
  pendingFocus = null;
  if (!target) return;
  const row = Array.from(deviceEl.querySelectorAll('.cloud-device-row'))
    .find((r) => r.dataset.folderPath === target.path);
  if (!row) return;
  row.classList.add('cloud-row-focus');
  requestAnimationFrame(() => row.scrollIntoView({ block: 'center' }));
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
