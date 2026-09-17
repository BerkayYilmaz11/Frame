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

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

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
  normalizeProject,
  listProjects,
  matchFolders,
  buildWebUrl,
};
