/**
 * cloudStartService — the Electron shell around starting a shaped Frame
 * Cloud work brief.
 *
 * Holds no checks or ordering (that is cloudStart.js). It resolves the
 * folder's connected project, reads the brief and the folder's git state for
 * the Start Work dialog (`CLOUD_BRIEF_START_PREPARE`), and wires the real
 * effects into the core's handler for the start itself (`CLOUD_BRIEF_START`):
 * git through gitBranchesManager, spec folders through fsSafe under
 * frameStore's spec path, and task rows through tasksManager in one round.
 * It also keeps `<userData>/cloud-starts.json`, the parts this machine began
 * and on which branch. The token and every write stay in main.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { IPC } = require('../../shared/ipcChannels');
const { isValidBranchName } = require('../../shared/gitRefNames');
const fsSafe = require('../fsSafe');
const frameStore = require('../frameStore');
const logger = require('../logger');
const tasksManager = require('../tasksManager');
const git = require('../gitBranchesManager');
const cloudProjectsService = require('./cloudProjectsService');
const { getBrief } = require('./cloudBriefs');
const core = require('./cloudStart');

const BEGUN_FILE = 'cloud-starts.json';

let mainWindow = null;
let begunStore = null; // loaded on first use

// ─── Begun parts ──────────────────────────────────────────────

function begunPath() {
  return path.join(app.getPath('userData'), BEGUN_FILE);
}

/** The parts this machine began (`<userData>/cloud-starts.json`), read once. */
function begun() {
  if (!begunStore) {
    const { data, error } = fsSafe.readJsonWithRecovery(begunPath());
    if (error) logger.warn('cloudStart', `could not read ${begunPath()}`);
    begunStore = core.normalizeBegun(data || core.emptyBegun());
  }
  return begunStore;
}

/** Record a part as begun on `branch`. A failed save is logged: the part is begun either way. */
function recordBegun(entry) {
  begunStore = core.addBegun(begun(), entry);
  try {
    fsSafe.writeFileAtomic(begunPath(), JSON.stringify(begunStore, null, 2));
  } catch (err) {
    logger.warn('cloudStart', `could not save ${BEGUN_FILE}: ${err.message}`);
  }
}

/** The listed briefs with each part's `begunBranch`, for the folder's cloud project. */
function withBegunBranches(briefs, projectId) {
  return core.withBegunBranches(briefs, begun(), projectId);
}

/** The spec folder names in `.frame/specs/`. */
function specSlugs(folderPath) {
  try {
    return fs.readdirSync(frameStore.specsRoot(folderPath), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Every task id in `tasks.json`. */
function taskIds(folderPath) {
  const data = tasksManager.loadTasks(folderPath);
  return data && Array.isArray(data.tasks) ? data.tasks.map((t) => t && t.id).filter(Boolean) : [];
}

/** How many changes `git status --porcelain` lists. Throws when git cannot tell. */
async function changeCount(folderPath) {
  const status = await git.isWorkingTreeClean(folderPath);
  if (status.error) throw new Error(status.error);
  return status.changes.length;
}

/** Write a spec folder. It is created, never overwritten: a folder the new branch already holds fails the write. */
function writeSpec(folderPath, slug, files) {
  const dir = frameStore.resolveSpecDir(folderPath, slug);
  if (fs.existsSync(dir)) throw new Error(`.frame/specs/${slug} already exists on this branch`);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fsSafe.writeFileAtomic(path.join(dir, name), content);
  }
}

/** Append the task rows in one load/save round, then push the list so the Tasks panel shows them. */
function writeTasks(folderPath, rows) {
  const data = tasksManager.loadTasks(folderPath);
  if (!data || !Array.isArray(data.tasks)) throw new Error('.frame/tasks.json could not be read');
  const taken = new Set(data.tasks.map((t) => t && t.id));
  const clash = rows.find((row) => taken.has(row.id));
  if (clash) throw new Error(`${clash.id} already exists in .frame/tasks.json on this branch`);
  data.tasks.push(...rows);
  data.metadata = data.metadata || {};
  data.metadata.totalCreated = (data.metadata.totalCreated || 0) + rows.length;
  if (!tasksManager.saveTasks(folderPath, data)) throw new Error('.frame/tasks.json could not be written');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.TASKS_DATA, { projectPath: folderPath, tasks: data });
  }
}

/** A gitBranchesManager answer (`{ error }`) as a throw, which is what the core's effects do on failure. */
function orThrow(result) {
  if (result && result.error) throw new Error(result.error);
}

/**
 * What the Start Work dialog shows. → prepareView's shape, or
 * `{ ok: false, reason }` for a folder not connected or a failed read.
 */
async function prepare(folderPath, number) {
  const project = cloudProjectsService.connectedProject(folderPath);
  if (!project) return { ok: false, reason: 'notConnected' };
  if (!Number.isInteger(number) || number < 1) return { ok: false, reason: 'other' };
  const read = await cloudProjectsService.call((ctx) => getBrief({ ...ctx, projectSlug: project.slug, number }));
  if (!read.ok) return { ok: false, reason: read.reason };
  const brief = read.value;
  try {
    const [currentBranch, count, local, remote] = await Promise.all([
      git.currentBranch(folderPath),
      changeCount(folderPath),
      brief.targetBranch ? git.localBranchExists(brief.targetBranch, folderPath) : false,
      brief.targetBranch ? git.remoteBranchExists(brief.targetBranch, folderPath) : false,
    ]);
    return core.prepareView({
      brief,
      currentBranch,
      changeCount: count,
      base: core.pickBase(brief.targetBranch, { local, remote }),
    });
  } catch (err) {
    logger.warn('cloudStart', `could not read the folder: ${err.message}`);
    return { ok: false, reason: 'other' };
  }
}

/** Start the brief: every check again (the renderer is not trusted), then the order. → handleStartRequest's shapes. */
async function start(folderPath, request) {
  const project = cloudProjectsService.connectedProject(folderPath);
  if (!project) return { ok: false, reason: 'notConnected' };
  const r = request && typeof request === 'object' ? request : {};
  if (!Number.isInteger(r.number) || r.number < 1) return { ok: false, reason: 'other' };
  try {
    return await core.handleStartRequest({
      number: r.number,
      beginPartId: typeof r.beginPartId === 'string' ? r.beginPartId : null,
      branch: typeof r.branch === 'string' ? r.branch : '',
      stash: r.stash === true,
    }, {
      call: cloudProjectsService.call,
      projectSlug: project.slug,
      specSlugs: () => specSlugs(folderPath),
      taskIds: () => taskIds(folderPath),
      currentBranch: () => git.currentBranch(folderPath),
      changeCount: () => changeCount(folderPath),
      isValidBranchName,
      localBranchExists: (name) => git.localBranchExists(name, folderPath),
      remoteBranchExists: (name) => git.remoteBranchExists(name, folderPath),
      stash: async (message) => orThrow(await git.stashAll(folderPath, message)),
      createBranch: async (name, base, { track }) => orThrow(await git.createBranch(folderPath, name, true, base, { track })),
      writeSpec: (slug, files) => writeSpec(folderPath, slug, files),
      writeTasks: (rows) => writeTasks(folderPath, rows),
      now: () => new Date().toISOString(),
    });
  } catch (err) {
    logger.warn('cloudStart', `start failed: ${err.message}`);
    return { ok: false, reason: 'other' };
  }
}

function init(window) {
  mainWindow = window;
}

function setupIPC(ipcMain) {
  ipcMain.handle(IPC.CLOUD_BRIEF_START_PREPARE, (event, folderPath, number) => prepare(folderPath, number));
  ipcMain.handle(IPC.CLOUD_BRIEF_START, (event, folderPath, request) => start(folderPath, request));
}

module.exports = {
  init,
  setupIPC,
  prepare,
  start,
  recordBegun,
  withBegunBranches,
};
