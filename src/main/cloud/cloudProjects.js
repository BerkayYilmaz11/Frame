/**
 * cloudProjects — the pure core of Frame Cloud projects.
 *
 * Reads the cloud workspace's projects and decides, for this device's known
 * folders, which of them is which cloud project. A folder is connected to a
 * project when the project's `frameProjectId` equals the folder's own
 * `projectId` — never by path, name or remote.
 *
 * Like deviceFlow.js, nothing here imports Electron or touches a file: every
 * call takes `{ api, token, fetchJson, signal }`, so `cloudProjectsService.js`
 * is a thin shell and `node --test` runs the whole thing with a fake fetch.
 */

const { callTrpc } = require('./deviceFlow');

// FrameCloud's slug rule: 3–32 characters of a-z and 0-9, hyphens only
// between two of them.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MIN = 3;
const SLUG_MAX = 32;

// Project slugs the web app's routes already use.
const RESERVED_SLUGS = new Set(['new', 'briefs', 'import', 'settings', 'members', 'projects', 'inbox', 'search']);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

const MATCH_LABELS = {
  id: 'Your repository',
  remote: 'Same remote',
  name: 'Same name',
};

function str(value) {
  return typeof value === 'string' ? value : '';
}

function slugShapeOk(slug) {
  return typeof slug === 'string' && slug.length >= SLUG_MIN && slug.length <= SLUG_MAX && SLUG_RE.test(slug);
}

// ─── Reading ──────────────────────────────────────────────────

/** One `project.list` entry, reduced to the fields Frame uses. */
function normalizeProject(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const status = p.status && typeof p.status === 'object' ? p.status : {};
  return {
    id: str(p.id),
    slug: str(p.slug),
    name: str(p.name),
    source: status.source === 'github' ? 'github' : 'scratch',
    frameProjectId: str(p.frameProjectId) || null,
    createdAt: str(p.createdAt),
  };
}

/** `project.list` → normalized projects, server order. */
async function listProjects({ api, token, fetchJson, signal }) {
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'project.list', method: 'GET' });
  return Array.isArray(data) ? data.map(normalizeProject).filter((p) => p.id) : [];
}

// ─── Matching ─────────────────────────────────────────────────

/**
 * The workspace's projects and this device's folders, seen from each side.
 *
 *   projects: normalized `project.list` entries.
 *   folders:  [{ path, name, projectId | null }], in display order.
 *
 * → {
 *     projectRows: [{ id, slug, name, source, connected, folderNames, openPath }],
 *     folderRows:  [{ path, name, connected, project: { id, slug, name } | null }],
 *   }
 *
 * `connected` on a project row is the server's link state (it carries an
 * identity), whether or not a folder here holds it. A folder is connected only
 * when a listed project carries its id — an id the list no longer names reads
 * as not connected (S8).
 */
function matchFolders(projects, folders) {
  const list = Array.isArray(projects) ? projects : [];
  const local = Array.isArray(folders) ? folders : [];

  const byIdentity = new Map();
  for (const p of list) {
    if (p.frameProjectId && !byIdentity.has(p.frameProjectId)) byIdentity.set(p.frameProjectId, p);
  }

  const folderRows = local.map((f) => {
    const project = f.projectId ? byIdentity.get(f.projectId) : undefined;
    return {
      path: f.path,
      name: f.name,
      connected: Boolean(project),
      project: project ? { id: project.id, slug: project.slug, name: project.name } : null,
    };
  });

  const projectRows = list.map((p) => {
    const here = p.frameProjectId ? local.filter((f) => f.projectId === p.frameProjectId) : [];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      source: p.source,
      connected: Boolean(p.frameProjectId),
      folderNames: here.map((f) => f.name),
      openPath: here.length ? here[0].path : null,
    };
  });

  return { projectRows, folderRows };
}

// ─── Linking calls ────────────────────────────────────────────

// Optional fields are left out rather than sent empty.
function compact(input) {
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) out[key] = value;
  }
  return out;
}

/** `project.checkSlug` → true when the slug is free in the cloud workspace. */
async function checkSlug({ api, token, fetchJson, signal, slug }) {
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'project.checkSlug', method: 'GET', input: { slug } });
  return Boolean(data && data.available);
}

function normalizeCandidate(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    id: str(c.id),
    slug: str(c.slug),
    name: str(c.name),
    match: Object.prototype.hasOwnProperty.call(MATCH_LABELS, c.match) ? c.match : null,
    frameProjectId: str(c.frameProjectId) || null,
  };
}

/** `link.candidates` → projects this folder could connect to, matches first (server order). */
async function getCandidates({ api, token, fetchJson, signal, folderName, remote, frameProjectId }) {
  const data = await callTrpc({
    api, token, fetchJson, signal,
    name: 'link.candidates',
    method: 'GET',
    input: compact({ folderName, remote, frameProjectId }),
  });
  return Array.isArray(data) ? data.map(normalizeCandidate).filter((c) => c.id) : [];
}

/** `link.claim` → `{ projectId, projectSlug, workspaceSlug }`. Throws CloudError. */
function claim({ api, token, fetchJson, signal, projectId, frameProjectId, remote, acceptRemoteMismatch, takeOver }) {
  return callTrpc({
    api, token, fetchJson, signal,
    name: 'link.claim',
    method: 'POST',
    input: compact({ projectId, frameProjectId, remote, acceptRemoteMismatch, takeOver }),
  });
}

/** `link.create` → the same answer as claim; the project is created already linked. Throws CloudError. */
function create({ api, token, fetchJson, signal, name, slug, frameProjectId, remote }) {
  return callTrpc({
    api, token, fetchJson, signal,
    name: 'link.create',
    method: 'POST',
    input: compact({ name, slug, frameProjectId, remote }),
  });
}

/**
 * `link.release`. A refusal because this folder is not the one the project
 * carries means the folder is already detached — `{ ok: true, notOwner: true }`,
 * not an error. Anything else throws.
 */
async function release({ api, token, fetchJson, signal, projectId, frameProjectId }) {
  try {
    await callTrpc({
      api, token, fetchJson, signal,
      name: 'link.release',
      method: 'POST',
      input: { projectId, frameProjectId },
    });
    return { ok: true, notOwner: false };
  } catch (err) {
    if (classifyLinkError(err) === 'mismatch') return { ok: true, notOwner: true };
    throw err;
  }
}

const CODE_KINDS = {
  REMOTE_MISMATCH: 'remoteMismatch',
  FRAME_PROJECT_MISMATCH: 'mismatch',
  FRAME_PROJECT_TAKEN: 'taken',
  SLUG_TAKEN: 'slugTaken',
  BAD_REQUEST: 'badRequest',
  PROJECT_NOT_FOUND: 'notFound',
  UNAUTHORIZED: 'unauthorized',
  DEVICE_NOT_REGISTERED: 'notRegistered',
  NO_WORKSPACE: 'noWorkspace',
};

const TRANSPORT_KINDS = {
  unauthorized: 'unauthorized',
  not_registered: 'notRegistered',
  no_workspace: 'noWorkspace',
  network: 'network',
  rate_limited: 'network',
};

/**
 * A failed link call → what Frame does about it. The server puts its code in
 * the error message; the transport kinds from deviceFlow win over it.
 */
function classifyLinkError(err) {
  if (!err) return 'other';
  if (TRANSPORT_KINDS[err.kind]) return TRANSPORT_KINDS[err.kind];
  if (CODE_KINDS[err.message]) return CODE_KINDS[err.message];
  const status = Number(err.status) || 0;
  if (status === 401) return 'unauthorized';
  if (status === 400) return 'badRequest';
  if (status === 404) return 'notFound';
  return 'other';
}

// ─── Slugs ────────────────────────────────────────────────────

// Letters NFKD does not take apart.
const TRANSLITERATE = { ı: 'i', ß: 'ss', æ: 'ae', ø: 'o', œ: 'oe', đ: 'd', ł: 'l', þ: 'th' };

/**
 * A project name → a slug suggestion, or '' when none is valid. Mirrors the
 * server's slugify closely, not exactly; checkSlug and link.create decide.
 */
function suggestSlug(name) {
  const base = String(name == null ? '' : name)
    .toLowerCase()
    .replace(/[ıßæøœđłþ]/g, (ch) => TRANSLITERATE[ch])
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const slug = base.slice(0, SLUG_MAX).replace(/-+$/, '');
  return validateSlug(slug) ? '' : slug;
}

/** null when `slug` is valid, else 'empty' | 'length' | 'format' | 'reserved'. */
function validateSlug(slug) {
  if (typeof slug !== 'string' || slug === '') return 'empty';
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return 'length';
  if (!SLUG_RE.test(slug)) return 'format';
  if (RESERVED_SLUGS.has(slug)) return 'reserved';
  return null;
}

/** The next slug to try after a collision: `app` → `app-2`, `app-2` → `app-3`, kept within 32. */
function nextSlug(slug) {
  const current = String(slug || '');
  const m = current.match(/^(.*?)-(\d+)$/);
  const base = m && m[1] ? m[1] : current;
  const n = m && m[1] ? Number(m[2]) + 1 : 2;
  const suffix = `-${n}`;
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
}

// ─── Row planning ─────────────────────────────────────────────

/**
 * An unconnected folder and its `link.candidates` → how On this device draws
 * it. The first candidate with a match makes it a 'connect' row; otherwise it
 * is a 'create' row. Only an `id` or `remote` match on a project that carries
 * no other identity starts checked — name matches, taken projects and create
 * rows never do.
 *
 *   projectId: the folder's own id, when it has one.
 */
function planFolderRow(folderRow, candidates, projectId = null) {
  const list = Array.isArray(candidates) ? candidates : [];
  const takenByOther = (c) => Boolean(c.frameProjectId) && c.frameProjectId !== projectId;
  const options = list.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    match: c.match,
    matchLabel: c.match ? MATCH_LABELS[c.match] : '',
    alreadyConnected: takenByOther(c),
  }));
  const candidate = options.find((c) => c.match) || null;
  const name = (folderRow && folderRow.name) || '';
  return {
    group: candidate ? 'connect' : 'create',
    candidate,
    matchLabel: candidate ? candidate.matchLabel : '',
    alreadyConnected: candidate ? candidate.alreadyConnected : false,
    checked: Boolean(candidate && (candidate.match === 'id' || candidate.match === 'remote') && !candidate.alreadyConnected),
    name,
    slug: suggestSlug(name),
    options,
  };
}

/** The one automatic tab switch: after a sign-in the user started, unless turned off. */
function shouldAutoShowDevices({ userStartedSignIn, dismissed, unconnectedCount } = {}) {
  return Boolean(userStartedSignIn) && !dismissed && Number(unconnectedCount) > 0;
}

// ─── Web links ────────────────────────────────────────────────

/**
 * `{webOrigin}/{workspace}/{project}`, or null when any guard fails:
 * the origin must be http(s) (only its origin is used), both slugs must have
 * the slug shape, and an https API requires an https web origin unless the
 * web runs on localhost / 127.0.0.1.
 */
function buildWebUrl({ apiUrl, webOrigin, workspaceSlug, projectSlug } = {}) {
  if (!slugShapeOk(workspaceSlug) || !slugShapeOk(projectSlug)) return null;
  let web;
  let api;
  try {
    web = new URL(webOrigin);
    api = new URL(apiUrl);
  } catch {
    return null;
  }
  if (web.protocol !== 'http:' && web.protocol !== 'https:') return null;
  if (api.protocol === 'https:' && web.protocol !== 'https:' && !LOOPBACK_HOSTS.has(web.hostname)) {
    return null;
  }
  return `${web.origin}/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(projectSlug)}`;
}

module.exports = {
  SLUG_MIN,
  SLUG_MAX,
  RESERVED_SLUGS,
  MATCH_LABELS,
  normalizeProject,
  listProjects,
  matchFolders,
  checkSlug,
  getCandidates,
  claim,
  create,
  release,
  classifyLinkError,
  suggestSlug,
  validateSlug,
  nextSlug,
  planFolderRow,
  shouldAutoShowDevices,
  buildWebUrl,
};
