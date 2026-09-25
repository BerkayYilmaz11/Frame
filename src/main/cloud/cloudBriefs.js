/**
 * cloudBriefs — the pure core of reading and creating Frame Cloud briefs.
 *
 * Reads a cloud project's briefs, one brief with its parts, attachments and
 * comments, its history, and the project's milestones. The one write is
 * creating a brief (`brief.create`, then `brief.addAttachment` per link);
 * recording a discussion on a proposal (`brief.recordDiscussion`); and moving
 * a proposal to work (`brief.decide`); shaping an open work brief into its
 * parts (`brief.shape`); and marking a shaped brief started with each part's
 * local spec slug or task id (`brief.start`); every other brief or milestone
 * mutation stays on the web.
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

/**
 * The server's limits (FrameCloud `BRIEF_TITLE_MAX`, `BRIEF_TEXT_MAX`,
 * `BRIEF_ATTACHMENT_TITLE_MAX`, `BRIEF_PROVIDER_MAX`).
 */
const LIMITS = Object.freeze({ title: 200, body: 10000, attachmentTitle: 200, provider: 40 });

/** Where Frame's New brief form sits among FrameCloud's brief sources: a person at a form. */
const CREATE_SOURCE = 'desk';

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
    shapedAt: strOrNull(b.shapedAt),
    startedAt: strOrNull(b.startedAt),
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
    definition: str(p.definition),
    recordRef: strOrNull(p.recordRef),
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

// ─── Creating ─────────────────────────────────────────────────

function badRequest(field) {
  return { ok: false, reason: 'badRequest', field };
}

/**
 * The renderer's request → the `brief.create` input, minus `projectSlug`.
 * Trims, sends priority only for work (medium unless given), leaves out an
 * empty body. → `{ ok: true, input }` or `{ ok: false, reason: 'badRequest', field }`.
 */
function buildCreateInput(request) {
  const r = obj(request);
  if (!KINDS.has(r.kind)) return badRequest('kind');
  const title = str(r.title).trim();
  if (!title || title.length > LIMITS.title) return badRequest('title');
  const body = str(r.body).trim();
  if (body.length > LIMITS.body) return badRequest('body');
  const input = { kind: r.kind, title, source: CREATE_SOURCE };
  if (body) input.body = body;
  if (r.kind === 'work') {
    if (r.priority === undefined || r.priority === null || r.priority === '') input.priority = 'medium';
    else if (PRIORITIES.has(r.priority)) input.priority = r.priority;
    else return badRequest('priority');
  }
  return { ok: true, input };
}

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The request's links → `[{ title, url }]`, in order. Only `http(s)` URLs and
 * trimmed titles of 1–200 characters; one bad link refuses them all.
 */
function normalizeLinks(links) {
  if (links === undefined || links === null) return { ok: true, links: [] };
  if (!Array.isArray(links)) return badRequest('links');
  const out = [];
  for (const raw of links) {
    const l = obj(raw);
    const title = str(l.title).trim();
    const url = str(l.url).trim();
    if (!title || title.length > LIMITS.attachmentTitle || !isHttpUrl(url)) return badRequest('links');
    out.push({ title, url });
  }
  return { ok: true, links: out };
}

/** `brief.create` → the new brief, normalized. `input` is buildCreateInput's plus `projectSlug`. */
async function createBrief({ api, token, fetchJson, signal, input }) {
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'brief.create', method: 'POST', input });
  return normalizeBrief(data);
}

/** `brief.addAttachment` → the attachment, normalized. */
async function addAttachment({ api, token, fetchJson, signal, id, title, url }) {
  const data = await callTrpc({
    api, token, fetchJson, signal,
    name: 'brief.addAttachment',
    method: 'POST',
    input: { id, title, url },
  });
  return normalizeAttachment(data);
}

/**
 * Create a brief, then attach its links one by one. `call` is
 * cloudProjectsService's wrapper (`fn → { ok, value } | { ok: false, reason }`).
 * A failed create sends no link; the first failed link stops the rest.
 * → `{ ok: true, number, attachmentError: reason | null }` or `{ ok: false, reason }`.
 */
async function createWithLinks(call, { input, links = [] }) {
  const created = await call((ctx) => createBrief({ ...ctx, input }));
  if (!created.ok) return { ok: false, reason: created.reason };
  const { id, number } = created.value;
  if (!id || !number) return { ok: false, reason: 'other' };
  for (const link of links) {
    const attached = await call((ctx) => addAttachment({ ...ctx, id, title: link.title, url: link.url }));
    if (!attached.ok) return { ok: true, number, attachmentError: attached.reason };
  }
  return { ok: true, number, attachmentError: null };
}

// ─── Discussions ──────────────────────────────────────────────

/**
 * `brief.recordDiscussion` → the brief, normalized. Appends one
 * `discussion-recorded` event to an open proposal and writes no column; `url`
 * and `provider` are left out when absent. Throws CloudError
 * (`NOT_A_PROPOSAL`, `ALREADY_CLOSED`, `BRIEF_NOT_FOUND`).
 */
async function recordDiscussion({ api, token, fetchJson, signal, id, summary, url, provider }) {
  const input = { id, summary };
  if (url) input.url = url;
  if (provider) input.provider = provider;
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'brief.recordDiscussion', method: 'POST', input });
  return normalizeBrief(data);
}

// ─── Deciding ─────────────────────────────────────────────────

/** The server's refusals of `brief.decide` → the reason Frame reports. */
const DECIDE_REFUSALS = {
  NOT_A_PROPOSAL: 'notAProposal',
  ALREADY_WORK: 'alreadyWork',
  ALREADY_CLOSED: 'alreadyClosed',
  BRIEF_NOT_FOUND: 'notFound',
};

/** `brief.decide` → the brief, now work, normalized. Throws CloudError on a refusal. */
async function decideBrief({ api, token, fetchJson, signal, id, priority }) {
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'brief.decide', method: 'POST', input: { id, priority } });
  return normalizeBrief(data);
}

/**
 * Move a proposal to work with a priority through `call`. The refusals come
 * back as values, since `call` folds them all into one reason.
 * → `{ ok: true }` or `{ ok: false, reason }`.
 */
async function decideThrough(call, { id, priority }) {
  if (!PRIORITIES.has(priority)) return { ok: false, reason: 'badRequest' };
  const result = await call(async (ctx) => {
    try {
      await decideBrief({ ...ctx, id, priority });
      return { refused: null };
    } catch (err) {
      const refused = err && DECIDE_REFUSALS[err.message];
      if (refused) return { refused };
      throw err;
    }
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  if (result.value.refused) return { ok: false, reason: result.value.refused };
  return { ok: true };
}

// ─── Shaping ──────────────────────────────────────────────────

/**
 * `brief.shape` → the brief with its new parts, normalized. Writes every part
 * and `shapedAt` in one transaction on an open, unshaped work brief; `parts`
 * is `[{ title, shape, type, definition }]`, in order. Throws CloudError
 * (`NOT_WORK`, `ALREADY_CLOSED`, `ALREADY_SHAPED`, `BRIEF_NOT_FOUND`).
 */
async function shapeBrief({ api, token, fetchJson, signal, id, parts }) {
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'brief.shape', method: 'POST', input: { id, parts } });
  return normalizeBriefDetail(data);
}

// ─── Starting ─────────────────────────────────────────────────

/** The server's refusals of `brief.start` → the reason Frame reports. */
const START_REFUSALS = {
  NOT_WORK: 'notWork',
  ALREADY_CLOSED: 'alreadyClosed',
  NOT_SHAPED: 'notShaped',
  ALREADY_STARTED: 'alreadyStarted',
  PARTS_MISMATCH: 'partsMismatch',
  RECORD_REF_TAKEN: 'recordRefTaken',
  BRIEF_NOT_FOUND: 'notFound',
};

/**
 * `brief.start` → the brief detail, now started, normalized. Sets
 * `startedAt` once and links every part to its `recordRef`; `parts` is
 * `[{ partId, recordRef }]` and must name every part. Throws CloudError on a
 * refusal (see START_REFUSALS).
 */
async function startBrief({ api, token, fetchJson, signal, id, parts }) {
  const data = await callTrpc({ api, token, fetchJson, signal, name: 'brief.start', method: 'POST', input: { id, parts } });
  return normalizeBriefDetail(data);
}

/**
 * Start a brief through `call`. The refusals come back as values, since
 * `call` folds them all into one reason.
 * → `{ ok: true, detail }` or `{ ok: false, reason }`.
 */
async function startThrough(call, { id, parts }) {
  const result = await call(async (ctx) => {
    try {
      return { refused: null, detail: await startBrief({ ...ctx, id, parts }) };
    } catch (err) {
      const refused = err && START_REFUSALS[err.message];
      if (refused) return { refused };
      throw err;
    }
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  if (result.value.refused) return { ok: false, reason: result.value.refused };
  return { ok: true, detail: result.value.detail };
}

/**
 * From a brief's events (oldest first): how many discussions were recorded,
 * and how many comments someone other than `meId` added after the latest
 * record — none count as new while nothing was recorded.
 */
function discussionFacts(events, meId) {
  let discussionCount = 0;
  let newCommentCount = 0;
  for (const e of events) {
    if (e.event === 'discussion-recorded') {
      discussionCount += 1;
      newCommentCount = 0;
    } else if (e.event === 'comment-added' && discussionCount > 0 && e.actorId !== meId) {
      newCommentCount += 1;
    }
  }
  return { discussionCount, newCommentCount };
}

/**
 * The briefs with `discussionCount` and `newCommentCount` on each open
 * proposal, from its `brief.events` (the list does not carry them). `call` is
 * cloudProjectsService's wrapper; a proposal whose events fail to load gets
 * `null`s, never a failed board. Work and ended briefs get `null`s without a
 * request.
 */
async function addDiscussionCounts(call, briefs, meId = '') {
  const unknown = { discussionCount: null, newCommentCount: null };
  return Promise.all(briefs.map(async (brief) => {
    if (brief.kind !== 'proposal' || brief.status === 'closed') return { ...brief, ...unknown };
    const events = await call((ctx) => briefEvents({ ...ctx, id: brief.id }));
    return { ...brief, ...(events.ok ? discussionFacts(events.value, meId) : unknown) };
  }));
}

// ─── Part counts ──────────────────────────────────────────────

/** A brief's parts counted by shape: `{ spec, task }`. */
function partSummary(parts) {
  const out = { spec: 0, task: 0 };
  for (const p of arr(parts)) {
    if (p && (p.shape === 'spec' || p.shape === 'task')) out[p.shape] += 1;
  }
  return out;
}

/**
 * The briefs with `partCounts` (`{ spec, task }`) on each open shaped work
 * brief, from its `brief.getByNumber` (the list does not carry parts). `call`
 * is cloudProjectsService's wrapper; a brief whose detail fails to load gets
 * `null`, never a failed board. Every other brief gets `null` without a
 * request.
 */
async function addPartCounts(call, briefs, projectSlug) {
  return Promise.all(briefs.map(async (brief) => {
    if (brief.kind !== 'work' || brief.status === 'closed' || !brief.shapedAt) return { ...brief, partCounts: null };
    const detail = await call((ctx) => getBrief({ ...ctx, projectSlug, number: brief.number }));
    return { ...brief, partCounts: detail.ok ? partSummary(detail.value.parts) : null };
  }));
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
  LIMITS,
  normalizeBrief,
  normalizeBriefDetail,
  normalizeEvent,
  normalizeMilestone,
  listBriefs,
  listMilestones,
  getBrief,
  briefEvents,
  buildCreateInput,
  isHttpUrl,
  normalizeLinks,
  createBrief,
  addAttachment,
  createWithLinks,
  recordDiscussion,
  discussionFacts,
  addDiscussionCounts,
  partSummary,
  addPartCounts,
  decideBrief,
  decideThrough,
  shapeBrief,
  START_REFUSALS,
  startBrief,
  startThrough,
  buildBriefWebUrl,
};
