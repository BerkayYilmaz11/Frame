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

let hub = null;
let projectsEl = null;
let deviceEl = null;
let lastState = null;

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
  if (projectsEl) renderProjectsTab(state);
  if (deviceEl && activeTab === 'device') renderDeviceTab(state);
}

function onShow(tab) {
  if (tab === 'device' && lastState && deviceEl) renderDeviceTab(lastState);
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

function renderDeviceTab(state) {
  deviceEl.replaceChildren();
}

module.exports = { init, render, onShow };
