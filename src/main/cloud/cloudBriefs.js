/**
 * cloudBriefs — the pure core of reading Frame Cloud briefs.
 *
 * Reads a cloud project's briefs, one brief with its parts, attachments and
 * comments, its history, and the project's milestones. Read-only: Frame calls
 * no brief mutation, although the server would accept one from a desktop.
 *
 * Like cloudProjects.js, nothing here imports Electron or touches a file:
 * every call takes `{ api, token, fetchJson, signal }`, so
 * `cloudBriefsService.js` is a thin shell and `node --test` runs the whole
 * thing with a fake fetch. Each answer is reduced to the fields the Briefs
 * view draws, with unknown values folded to safe defaults, so the renderer
 * never meets a shape it did not expect.
 */

const { callTrpc } = require('./deviceFlow');
const { buildWebUrl } = require('./cloudProjects');

const KINDS = new Set(['proposal', 'work']);
const PRIORITIES = new Set(['high', 'medium', 'low']);
const STATUSES = new Set(['backlog', 'active', 'done', 'closed']);
const PART_SHAPES = new Set(['spec', 'task']);
const PART_TYPES = new Set(['feature', 'fix', 'refactor', 'docs', 'test']);
const MILESTONE_STATUSES = new Set(['planned', 'started', 'closed']);

function str(value) {
  return typeof value === 'string' ? value : '';
}

/** A string, or null when absent or empty. */
function strOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function oneOf(set, value, fallback) {
  return set.has(value) ? value : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// ─── Normalizing ──────────────────────────────────────────────

/** One `brief.list` entry, reduced to the fields Frame draws. */
function normalizeBrief(raw) {
  const b = obj(raw);
  const number = Number.isInteger(b.number) && b.number > 0 ? b.number : 0;
  return {
    id: str(b.id),
    number,
    kind: oneOf(KINDS, b.kind, 'proposal'),
    title: str(b.title),
    body: strOrNull(b.body),
    priority: PRIORITIES.has(b.priority) ? b.priority : null,
    milestoneId: strOrNull(b.milestoneId),
    targetBranch: str(b.targetBranch),
    status: oneOf(STATUSES, b.status, 'backlog'),
    closedAt: strOrNull(b.closedAt),
    closeReason: strOrNull(b.closeReason),
    droppedAt: strOrNull(b.droppedAt),
    dropReason: strOrNull(b.dropReason),
    recordedDecisionAt: strOrNull(b.recordedDecisionAt),
    createdAt: str(b.createdAt),
    updatedAt: str(b.updatedAt),
  };
}

function normalizePart(raw) {
  const p = obj(raw);
  return {
    id: str(p.id),
    position: Number.isInteger(p.position) ? p.position : 0,
    title: str(p.title),
    shape: oneOf(PART_SHAPES, p.shape, 'task'),
    type: oneOf(PART_TYPES, p.type, 'feature'),
    why: strOrNull(p.why),
  };
}

function normalizeAttachment(raw) {
  const a = obj(raw);
  return { id: str(a.id), title: str(a.title), url: str(a.url) };
}

function normalizeComment(raw) {
  const c = obj(raw);
  return { id: str(c.id), authorId: str(c.authorId), text: str(c.text), createdAt: str(c.createdAt) };
}

/** `brief.getByNumber` → the brief with its parts (by position), attachments and comments. */
function normalizeBriefDetail(raw) {
  const d = obj(raw);
  return {
    ...normalizeBrief(d),
    parts: arr(d.parts).map(normalizePart).filter((p) => p.id).sort((a, b) => a.position - b.position),
    attachments: arr(d.attachments).map(normalizeAttachment).filter((a) => a.id),
    comments: arr(d.comments).map(normalizeComment).filter((c) => c.id),
  };
}

function normalizeEvent(raw) {
  const e = obj(raw);
  return { id: str(e.id), at: str(e.at), actorId: str(e.actorId), event: str(e.event), data: obj(e.data) };
}

function normalizeMilestone(raw) {
  const m = obj(raw);
  return { id: str(m.id), name: str(m.name), status: oneOf(MILESTONE_STATUSES, m.status, 'planned') };
}

// ─── Reading calls ────────────────────────────────────────────

/** `brief.list` → the project's briefs, server (`number`) order. Ended ones only with `includeClosed`. */
async function listBriefs({ api, token, fetchJson, signal, projectSlug, includeClosed }) {
  const input = { projectSlug };
  if (includeClosed) input.includeClosed = true;
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'brief.list', method: 'GET', input });
  return arr(data).map(normalizeBrief).filter((b) => b.id && b.number);
}

/** `milestone.list` → `[{ id, name, status }]`. */
async function listMilestones({ api, token, fetchJson, signal, projectSlug }) {
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'milestone.list', method: 'GET', input: { projectSlug } });
  return arr(data).map(normalizeMilestone).filter((m) => m.id);
}

/** `brief.getByNumber` → the detail. Throws CloudError (`BRIEF_NOT_FOUND` → notFound). */
async function getBrief({ api, token, fetchJson, signal, projectSlug, number }) {
  const data = await callTrpc({
    api, token, fetchJson, signal,
    name: 'brief.getByNumber',
    method: 'GET',
    input: { projectSlug, number },
  });
  return normalizeBriefDetail(data);
}

/** `brief.events` → the brief's history, oldest first. */
async function briefEvents({ api, token, fetchJson, signal, id }) {
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'brief.events', method: 'GET', input: { id } });
  return arr(data).map(normalizeEvent).filter((e) => e.id && e.event);
}

// ─── Web links ────────────────────────────────────────────────

/**
 * `{project url}/briefs/{number}` (the web's full brief page), or the project
 * URL when no number is given; null under buildWebUrl's guards.
 */
function buildBriefWebUrl({ apiUrl, webOrigin, workspaceSlug, projectSlug, number } = {}) {
  const base = buildWebUrl({ apiUrl, webOrigin, workspaceSlug, projectSlug });
  if (!base) return null;
  if (number === undefined || number === null) return base;
  return Number.isInteger(number) && number > 0 ? `${base}/briefs/${number}` : null;
}

module.exports = {
  normalizeBrief,
  normalizeBriefDetail,
  normalizeEvent,
  normalizeMilestone,
  listBriefs,
  listMilestones,
  getBrief,
  briefEvents,
  buildBriefWebUrl,
};
