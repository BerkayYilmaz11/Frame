/**
 * Done Window store — the renderer's one owner of `settings.doneWindow`.
 *
 * Three surfaces read the value (the Tasks board, the Specs dashboard,
 * Project Settings) and one writes it (Project Settings). Rather than each
 * invoking IPC on its own, this module loads the project's value once, keeps
 * it, re-loads when the project changes, and tells subscribers when it
 * moves (boards-done-window spec, D8). Until a load lands — or when there is
 * no project — `get()` answers the defaults, so a board never renders
 * against nothing.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');
const { DEFAULT_DONE_WINDOW, normalizeDoneWindow } = require('../shared/doneWindow');

let current = { ...DEFAULT_DONE_WINDOW };
let loadedFor = null;            // project path the current value belongs to
let listeners = [];

function notify() {
  const snapshot = { ...current };
  listeners.forEach(cb => { try { cb(snapshot); } catch (_) { /* a listener's failure is its own */ } });
}

function apply(value, projectPath) {
  current = normalizeDoneWindow(value);
  loadedFor = projectPath;
  notify();
}

async function load(projectPath) {
  if (!projectPath) { apply(DEFAULT_DONE_WINDOW, null); return; }
  try {
    const result = await ipcRenderer.invoke(IPC.GET_DONE_WINDOW, projectPath);
    // A later project switch may have overtaken this load — drop the stale answer.
    if (state.getProjectPath() !== projectPath) return;
    apply(result && !result.error ? result : DEFAULT_DONE_WINDOW, projectPath);
  } catch (_) {
    apply(DEFAULT_DONE_WINDOW, projectPath);
  }
}

function init() {
  state.onProjectChange((projectPath) => { load(projectPath); });
  load(state.getProjectPath());
}

/** The current project's `{ tasks, specs }` window in days (0 = all). */
function get() {
  return { ...current };
}

/**
 * Write one board's window. Resolves to the stored `{ tasks, specs }`;
 * rejects with main's error text so the caller can say why.
 */
async function set(board, days) {
  const projectPath = state.getProjectPath();
  if (!projectPath) throw new Error('no project open');
  const result = await ipcRenderer.invoke(IPC.SET_DONE_WINDOW, { projectPath, board, days });
  if (!result || result.error) throw new Error(result && result.error ? result.error : 'could not save');
  apply(result, projectPath);
  return get();
}

/** Subscribe to changes; returns an unsubscribe function. */
function onChange(cb) {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

module.exports = { init, get, set, onChange, _loadedFor: () => loadedFor };
