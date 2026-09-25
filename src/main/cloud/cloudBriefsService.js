/**
 * cloudBriefsService — the Electron shell around reading and creating Frame
 * Cloud briefs.
 *
 * Holds no request or normalizing logic (that is cloudBriefs.js). The
 * renderer names a folder by path and nothing else: the connected project's
 * slug is resolved here from cloudProjectsService's own state, so a renderer
 * can never ask for another project's briefs, and a folder that is not
 * connected is refused before any request goes out.
 *
 * Every request goes through cloudProjectsService's `call()`, so a 401 signs
 * out quietly and a forgotten device is registered again and retried once.
 * The writes are `create` (a new brief and its links) and `decide` (a
 * proposal moved to work); discussions are recorded by
 * cloudDiscussionsService. No other brief or milestone mutation is called
 * from here.
 */

const { IPC } = require('../../shared/ipcChannels');
const cloudSession = require('./cloudSession');
const cloudProjectsService = require('./cloudProjectsService');
const core = require('./cloudBriefs');
const cloudStartService = require('./cloudStartService');

const NOT_CONNECTED = { ok: false, reason: 'notConnected' };

/** The signed-in user's id, for "You"; '' when unknown. */
function meId() {
  const user = cloudSession.getPublicState().user;
  return user && typeof user.id === 'string' ? user.id : '';
}

function webUrl(project, number) {
  const auth = cloudSession.getAuth();
  if (!auth || !project) return null;
  return core.buildBriefWebUrl({
    apiUrl: auth.serverUrl,
    webOrigin: auth.webOrigin,
    workspaceSlug: auth.cloudWorkspace && auth.cloudWorkspace.slug,
    projectSlug: project.slug,
    number,
  });
}

/** The folder's briefs and milestones. → `{ ok, project, briefs, milestones, meId, canOpenWeb }` or `{ ok: false, reason }`. */
async function list(folderPath, { includeClosed } = {}) {
  const project = cloudProjectsService.connectedProject(folderPath);
  if (!project) return NOT_CONNECTED;
  const call = cloudProjectsService.call;
  const [briefs, milestones] = await Promise.all([
    call((ctx) => core.listBriefs({ ...ctx, projectSlug: project.slug, includeClosed: includeClosed === true })),
    call((ctx) => core.listMilestones({ ...ctx, projectSlug: project.slug })),
  ]);
  if (!briefs.ok) return { ok: false, reason: briefs.reason };
  if (!milestones.ok) return { ok: false, reason: milestones.reason };
  // Open proposals' discussion counts and new comments, one `brief.events` each (frame-cloud-brief-discussions T11, T13).
  const discussed = await core.addDiscussionCounts(call, briefs.value, meId());
  // Open shaped work's parts by shape, one `brief.getByNumber` each (frame-cloud-brief-shape T11).
  const counted = await core.addPartCounts(call, discussed, project.slug);
  // Each part's branch when this machine began it (frame-cloud-brief-start T12).
  const begun = cloudStartService.withBegunBranches(counted, project.id);
  return {
    ok: true,
    project: { name: project.name, slug: project.slug },
    briefs: begun,
    milestones: milestones.value,
    meId: meId(),
    canOpenWeb: Boolean(webUrl(project)),
  };
}

/** One brief by number, with its history. → `{ ok, brief, events, meId, canOpenWeb }` or `{ ok: false, reason }`. */
async function get(folderPath, number) {
  const project = cloudProjectsService.connectedProject(folderPath);
  if (!project) return NOT_CONNECTED;
  if (!Number.isInteger(number) || number < 1) return { ok: false, reason: 'other' };
  const call = cloudProjectsService.call;
  const brief = await call((ctx) => core.getBrief({ ...ctx, projectSlug: project.slug, number }));
  if (!brief.ok) return { ok: false, reason: brief.reason };
  const events = await call((ctx) => core.briefEvents({ ...ctx, id: brief.value.id }));
  if (!events.ok) return { ok: false, reason: events.reason };
  return {
    ok: true,
    // Each part's branch when this machine began it (frame-cloud-brief-start T15).
    brief: cloudStartService.withBegunBranches([brief.value], project.id)[0],
    events: events.value,
    meId: meId(),
    canOpenWeb: Boolean(webUrl(project, number)),
  };
}

/**
 * Create a brief in the folder's project, then attach its links. The request
 * is checked here again (the renderer is not trusted) and a bad field or link
 * refuses it before anything is sent. The brief id never leaves main.
 * → `{ ok, number, attachmentError }` or `{ ok: false, reason, field? }`.
 */
async function create(folderPath, request) {
  const project = cloudProjectsService.connectedProject(folderPath);
  if (!project) return NOT_CONNECTED;
  const built = core.buildCreateInput(request);
  if (!built.ok) return built;
  const links = core.normalizeLinks(request && request.links);
  if (!links.ok) return links;
  const input = { projectSlug: project.slug, ...built.input };
  const result = await core.createWithLinks(cloudProjectsService.call, { input, links: links.links });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, number: result.number, attachmentError: result.attachmentError };
}

/**
 * Move an open proposal to work with a priority. The brief is resolved here by
 * number; its id never leaves main. → `{ ok: true }` or `{ ok: false, reason }`.
 */
async function decide(folderPath, number, priority) {
  const project = cloudProjectsService.connectedProject(folderPath);
  if (!project) return NOT_CONNECTED;
  if (!Number.isInteger(number) || number < 1) return { ok: false, reason: 'other' };
  const call = cloudProjectsService.call;
  const brief = await call((ctx) => core.getBrief({ ...ctx, projectSlug: project.slug, number }));
  if (!brief.ok) return { ok: false, reason: brief.reason };
  return core.decideThrough(call, { id: brief.value.id, priority });
}

/** The project on the web, or one brief when a number is given. The URL is built and opened here. */
function openOnWeb(folderPath, number) {
  const project = cloudProjectsService.connectedProject(folderPath);
  if (!project) return false;
  const url = webUrl(project, number === undefined ? undefined : number);
  if (!url) return false;
  cloudSession.openUrl(url);
  return true;
}

function setupIPC(ipcMain) {
  ipcMain.handle(IPC.CLOUD_BRIEFS_LIST, (event, folderPath, options) => list(folderPath, options || {}));
  ipcMain.handle(IPC.CLOUD_BRIEF_GET, (event, folderPath, number) => get(folderPath, number));
  ipcMain.handle(IPC.CLOUD_BRIEFS_OPEN_ON_WEB, (event, folderPath, number) => openOnWeb(folderPath, number));
  ipcMain.handle(IPC.CLOUD_BRIEF_CREATE, (event, folderPath, request) => create(folderPath, request));
  ipcMain.handle(IPC.CLOUD_BRIEF_DECIDE, (event, folderPath, number, priority) => decide(folderPath, number, priority));
}

module.exports = {
  setupIPC,
  list,
  get,
  create,
  decide,
  openOnWeb,
};
