/**
 * cloudStart — the pure core of starting a shaped Frame Cloud work brief.
 *
 * Start Work turns every part of an open, shaped, unstarted work brief into a
 * Frame spec or task on a fresh work branch, after telling the cloud which
 * spec slug or task id each part became (`brief.start`). Shape already wrote
 * each definition in Frame's own formats (cloudShape's SPEC_HEADINGS and
 * TASK_HEADINGS), so no agent writes the files: this module parses them,
 * picks each part's ref against what the folder already holds, and builds
 * the `spec.md`, `status.json` and `tasks.json` row main writes.
 *
 * Nothing here imports Electron, touches a file or runs git:
 * `cloudStartService.js` is the shell, and `node --test` covers every branch.
 */

const { TRANSLITERATE } = require('./cloudProjects');

/** spec.new's slug limit (specManager's SLUG_MAX_LEN). */
const SLUG_MAX = 48;

/** Frame's task title limit (`tasks.json` schema). */
const TASK_TITLE_MAX = 60;

/** A part's type → its branch prefix. */
const BRANCH_PREFIXES = { feature: 'feat/', fix: 'fix/', refactor: 'refactor/', docs: 'docs/', test: 'test/' };

function str(value) {
  return typeof value === 'string' ? value : '';
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

// ─── Names ────────────────────────────────────────────────────

/**
 * A title → spec.new's slug: lowercase, `[a-z0-9-]` only, runs of `-`
 * collapsed and trimmed, at most 48 characters. Letters are folded first as
 * cloudProjects.suggestSlug does, so "Giriş akışı" keeps its letters
 * (`giris-akisi`). → `fallback` when nothing is left.
 */
function slugify(title, fallback = '') {
  const slug = str(title)
    .toLowerCase()
    .replace(/[ıßæøœđłþ]/g, (ch) => TRANSLITERATE[ch])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug || fallback;
}

/** The branch Start Work suggests: the type's prefix, then the title's slug (`fallback` when the title has none). */
function suggestBranchName(type, title, fallback = 'work') {
  return `${BRANCH_PREFIXES[type] || BRANCH_PREFIXES.feature}${slugify(title, fallback)}`;
}

// ─── Definitions ──────────────────────────────────────────────

/**
 * A definition split on its `## ` headings, outside code fences.
 * → `{ preamble, sections: [{ heading, body }] }`, bodies trimmed.
 */
function splitSections(text) {
  const sections = [];
  const preamble = [];
  let current = null;
  let fence = null;
  for (const line of str(text).replace(/\r\n?/g, '\n').split('\n')) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
    }
    const heading = !fence && !fenceMatch && /^##(?!#)\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      current = { heading: heading[1], lines: [] };
      sections.push(current);
    } else {
      (current ? current.lines : preamble).push(line);
    }
  }
  return {
    preamble: preamble.join('\n').trim(),
    sections: sections.map((s) => ({ heading: s.heading, body: s.lines.join('\n').trim() })),
  };
}

function sameHeading(a, b) {
  return a.trim().toLowerCase() === b.toLowerCase();
}

/** The body under `name` (every section of that name, joined); '' when absent. */
function sectionBody(sections, name) {
  return sections.filter((s) => sameHeading(s.heading, name)).map((s) => s.body).filter(Boolean).join('\n\n');
}

/**
 * A spec part's definition, checked: it needs `## Problem` and `## Goal`,
 * each with content — the two sections Shape always fills. The text itself
 * becomes the spec's body as written.
 * → `{ ok: true, body }` or `{ ok: false, reason: 'empty' | 'noProblem' | 'noGoal' }`.
 */
function parseSpecDefinition(text) {
  const body = str(text).trim();
  if (!body) return { ok: false, reason: 'empty' };
  const { sections } = splitSections(body);
  if (!sectionBody(sections, 'Problem')) return { ok: false, reason: 'noProblem' };
  if (!sectionBody(sections, 'Goal')) return { ok: false, reason: 'noGoal' };
  return { ok: true, body };
}

/**
 * A task part's definition → the task's fields. `## Description` is required;
 * `## Acceptance Criteria` and `## Notes` are optional; a section under any
 * other heading is added to `notes` under its heading, so nothing is lost.
 * Text before the first heading has nowhere to go and is refused.
 * → `{ ok: true, fields: { description, acceptanceCriteria?, notes? } }` or
 * `{ ok: false, reason: 'empty' | 'textBeforeHeading' | 'noDescription' }`.
 */
function parseTaskDefinition(text) {
  if (!str(text).trim()) return { ok: false, reason: 'empty' };
  const { preamble, sections } = splitSections(text);
  if (preamble) return { ok: false, reason: 'textBeforeHeading' };
  const description = sectionBody(sections, 'Description');
  if (!description) return { ok: false, reason: 'noDescription' };
  const known = ['Description', 'Acceptance Criteria', 'Notes'];
  const extra = sections
    .filter((s) => s.body && !known.some((k) => sameHeading(s.heading, k)))
    .map((s) => `## ${s.heading}\n\n${s.body}`);
  const fields = { description };
  const acceptanceCriteria = sectionBody(sections, 'Acceptance Criteria');
  if (acceptanceCriteria) fields.acceptanceCriteria = acceptanceCriteria;
  const notes = [sectionBody(sections, 'Notes'), ...extra].filter(Boolean).join('\n\n');
  if (notes) fields.notes = notes;
  return { ok: true, fields };
}

// ─── Refs ─────────────────────────────────────────────────────

/** `base`, else `base-2`, `base-3`… — the first not in `taken`. A spec slug stays within 48 characters. */
function freeName(base, taken, max = Infinity) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const name = `${base.slice(0, max - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Each part's `recordRef`, in part order: a spec part's slug is checked
 * against the folder names in `.frame/specs/`, a task part's id
 * (`task-<slug>`) against every id in `tasks.json`, and refs picked earlier
 * in the same start count as taken. A title with no slug falls back to
 * `brief-<N>-part-<P>` (P counting from 1).
 * → `[{ partId, shape, ref }]`.
 */
function allocateRefs(parts, { specSlugs = [], taskIds = [] } = {}, number = 0) {
  const taken = { spec: new Set(specSlugs), task: new Set(taskIds) };
  return arr(parts).map((part, index) => {
    const slug = slugify(part.title, `brief-${number}-part-${index + 1}`);
    const ref = part.shape === 'spec'
      ? freeName(slug, taken.spec, SLUG_MAX)
      : freeName(`task-${slug}`, taken.task);
    taken[part.shape === 'spec' ? 'spec' : 'task'].add(ref);
    return { partId: part.id, shape: part.shape === 'spec' ? 'spec' : 'task', ref };
  });
}

// ─── Files ────────────────────────────────────────────────────

/**
 * A spec part's folder: `spec.md` is the part's title as a heading over the
 * definition as written, and `status.json` is spec.new's required shape in
 * phase `specified`. `now` is an ISO timestamp.
 * → `{ 'spec.md': text, 'status.json': text }`.
 */
function specFiles({ slug, title, definition, now }) {
  const status = {
    slug,
    title,
    phase: 'specified',
    generated_task_ids: [],
    created_at: now,
    updated_at: now,
    last_phase_at: now,
  };
  return {
    'spec.md': `# ${title}\n\n${str(definition).trim()}\n`,
    'status.json': `${JSON.stringify(status, null, 2)}\n`,
  };
}

/** A title within 60 characters: cut at the last space inside the limit, or hard at 60. */
function taskTitle(title) {
  const t = str(title).trim();
  if (t.length <= TASK_TITLE_MAX) return t;
  const cut = t.slice(0, TASK_TITLE_MAX + 1).lastIndexOf(' ');
  return (cut > 0 ? t.slice(0, cut) : t.slice(0, TASK_TITLE_MAX)).trimEnd();
}

/**
 * A task part's `tasks.json` row, pending. `fields` is parseTaskDefinition's;
 * the priority is the brief's (medium when it has none), the category the
 * part's type.
 */
function taskRow({ part, fields, id, brief, now }) {
  const row = { id, title: taskTitle(part.title), description: fields.description };
  if (fields.acceptanceCriteria) row.acceptanceCriteria = fields.acceptanceCriteria;
  if (fields.notes) row.notes = fields.notes;
  return {
    ...row,
    status: 'pending',
    priority: brief.priority || 'medium',
    category: part.type,
    context: `Frame Cloud brief #${brief.number}`,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

/** Open, shaped, unstarted work: the only brief Start Work offers itself on. */
function startable(brief) {
  const b = brief || {};
  return b.kind === 'work' && b.status !== 'closed' && Boolean(b.shapedAt) && !b.startedAt;
}

module.exports = {
  SLUG_MAX,
  TASK_TITLE_MAX,
  BRANCH_PREFIXES,
  slugify,
  suggestBranchName,
  parseSpecDefinition,
  parseTaskDefinition,
  allocateRefs,
  specFiles,
  taskTitle,
  taskRow,
  startable,
};
