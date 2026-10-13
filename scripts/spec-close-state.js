/**
 * Spec close state — what a closed spec still owes.
 *
 * A spec is *closed* when `.frame/tasks.json` holds at least one task whose
 * `source` is `spec:<slug>:…` and every one of them is `completed`. That is
 * the same rule `derivePhase` turns into `done`, read here from disk alone so
 * a hook can ask it without Frame running.
 *
 * Closing is the moment the digest is due, and until now that moment existed
 * only as a paragraph near the end of the implement template. Of 73 specs
 * closed across four projects since the digest step shipped, four have no
 * digest — three of them ran the whole flow, wrote every outcome entry, and
 * skipped the last instruction. Nothing noticed, because nothing looked.
 * This module is the thing that looks.
 *
 * Why disk state and not "the agent edited tasks.json": agents close tasks
 * through shell scripts. Of 1602 edit-tool calls recorded in four projects,
 * none targeted `.frame/tasks.json`, so a trigger on that edit never fires.
 * The state on disk is the one signal every way of closing a task leaves.
 *
 * What a caller gets:
 *   closedSpecs(root)            every closed spec, read fresh
 *   closeState(root, now)        the same list behind an mtime-and-size cache,
 *                                plus this project's baseline
 *   CLOSE_ITEMS                  what closing owes — one item today, a list
 *                                so the next one is an entry, not a rewrite
 *   pending(root, now)           closed · after the baseline · something
 *                                missing · not run by orchestration
 *   reminder(root, session, now) the one line a hook should say, the reasons
 *                                it is staying quiet, or null
 *
 * The baseline is the first time this module ran in a project. A spec closed
 * before it is never announced: a project that adopts this has old specs
 * without digests, and announcing all of them at once would teach every agent
 * to ignore the line. A spec closed after it is announced once per session
 * until its digest exists — no expiry, because a skipped digest that ages out
 * in silence is the failure this exists to end.
 *
 * Hard contract (same as the hooks that call it): never throw, never write
 * to stdout. Every failure is "nothing to say". A wrong reminder is worse
 * than none, so anything that cannot be established — an unreadable
 * tasks.json, a git that will not answer — is a reason to stay quiet.
 *
 * Dependency-free plain node; ships to user projects' .frame/bin/.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_VERSION = 1;
const STATE_REL = path.join('.frame', 'runtime', 'spec-close', 'state.json');
const SESSIONS_REL = path.join('.frame', 'runtime', 'spec-close', 'sessions');

// spec-hint.js's STATE_TTL_MS, not a second retention constant.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// One line has room for a few names; the rest are counted, and named by the
// reminders that follow.
const MAX_NAMED = 3;

// A hook waits on this. Asked at most once per candidate per session.
const GIT_TIMEOUT_MS = 1000;

// A slug becomes a path and a git ref pattern, and it is read out of a file
// an agent wrote. Anything that is not a plain folder name is not a spec.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function toPosix(p) { return String(p).split(path.sep).join('/'); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function tasksPath(root) { return path.join(root, '.frame', 'tasks.json'); }
function specDir(root, slug) { return path.join(root, '.frame', 'specs', slug); }

// ─── close items ──────────────────────────────────────────
//
// What a closed spec owes. Each item has an id, the word a reminder uses for
// it, and a `missing()` test that reads disk. Decision cards join here.

const CLOSE_ITEMS = [
  {
    id: 'digest',
    label: 'digest',
    missing: (root, slug) => !fs.existsSync(path.join(specDir(root, slug), 'digest.md'))
  }
];

/** Ids of the close items this spec still lacks. */
function missingItems(root, slug) {
  const out = [];
  for (const item of CLOSE_ITEMS) {
    try {
      if (item.missing(root, slug)) out.push(item.id);
    } catch {
      /* an item that cannot be tested is not reported as missing */
    }
  }
  return out;
}

// ─── closed specs, read from tasks.json ───────────────────

/**
 * A timestamp as milliseconds, or null. A date with no time counts as the end
 * of that day: an agent that writes `2026-10-13` closed the task some time on
 * the 13th, and reading it as midnight would put a same-day close before a
 * baseline taken that morning.
 */
function timeOf(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T23:59:59.999Z`) : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** tasks.json → its task list, or null when it cannot be read as one. */
function readTasks(root) {
  const data = readJson(tasksPath(root));
  const list = Array.isArray(data) ? data : (data && data.tasks);
  return Array.isArray(list) ? list : null;
}

/** Task list → Map of slug → { total, completed, latest } for spec tasks. */
function specTaskCounts(tasks) {
  const bySlug = new Map();
  for (const task of tasks || []) {
    if (!task || typeof task.source !== 'string') continue;
    const m = /^spec:([^:]+):/.exec(task.source);
    if (!m || !SLUG_RE.test(m[1])) continue;
    const entry = bySlug.get(m[1]) || { total: 0, completed: 0, latest: null };
    entry.total += 1;
    if (task.status === 'completed') {
      entry.completed += 1;
      const at = timeOf(task.completedAt);
      if (at !== null && (entry.latest === null || at > entry.latest)) entry.latest = at;
    }
    bySlug.set(m[1], entry);
  }
  return bySlug;
}

/**
 * Every closed spec as `{ slug, closedAt }`, or null when tasks.json cannot
 * be read. `closedAt` is the latest `completedAt` among the spec's tasks,
 * then `status.json`'s `last_phase_at`, then null — a spec with no close time
 * cannot be placed against the baseline and is never announced.
 *
 * A spec whose folder is gone is not a spec: its tasks outlive it in
 * tasks.json, and asking for a digest in a folder that does not exist would
 * be asking forever.
 */
function closedSpecs(root) {
  const tasks = readTasks(root);
  if (!tasks) return null;
  const out = [];
  for (const [slug, counts] of specTaskCounts(tasks)) {
    if (counts.completed !== counts.total) continue;
    if (!fs.existsSync(specDir(root, slug))) continue;
    let at = counts.latest;
    if (at === null) {
      const status = readJson(path.join(specDir(root, slug), 'status.json'));
      at = status ? timeOf(status.last_phase_at) : null;
    }
    out.push({ slug, closedAt: at === null ? null : new Date(at).toISOString() });
  }
  return out;
}

// ─── baseline + cache ─────────────────────────────────────
//
// `state.json` holds two things with different lifetimes. The baseline is
// written once and kept. The closed list is a cache of the read above, valid
// while tasks.json keeps the same mtime and size — parsing a 617 KB tasks.json
// measured 11 ms, against a hook process that takes 44 ms in total, and a
// hook runs on every shell and edit call.
//
// Digest presence is deliberately *not* cached: writing digest.md does not
// touch tasks.json, and it is exactly the change that has to be seen at once.

function writeState(root, state) {
  try {
    const file = path.join(root, STATE_REL);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Two hooks can run at once; a rename never leaves a half-written file
    // for the other to read as "no baseline yet".
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  } catch {
    /* a state that cannot be kept costs a re-read, and a baseline of "now" */
  }
}

/**
 * `{ baseline, closed, unreadable, hit }` for this project, or null when it
 * has no tasks.json at all. `hit` says the closed list came from the cache;
 * a caller records an unreadable file only on a miss, so a broken tasks.json
 * is one row, not one per tool call.
 */
function closeState(root, now = Date.now()) {
  let stat;
  try {
    stat = fs.statSync(tasksPath(root));
  } catch {
    return null;
  }
  const prev = readJson(path.join(root, STATE_REL));
  const kept = prev && prev.version === STATE_VERSION && timeOf(prev.baseline) !== null;
  const baseline = kept ? prev.baseline : new Date(now).toISOString();

  if (kept && prev.tasks && prev.tasks.mtimeMs === stat.mtimeMs && prev.tasks.size === stat.size
    && Array.isArray(prev.closed)) {
    return { baseline, closed: prev.closed, unreadable: prev.unreadable === true, hit: true };
  }

  const closed = closedSpecs(root);
  const state = {
    version: STATE_VERSION,
    baseline,
    tasks: { mtimeMs: stat.mtimeMs, size: stat.size },
    closed: closed || [],
    unreadable: closed === null
  };
  writeState(root, state);
  return { baseline, closed: state.closed, unreadable: state.unreadable, hit: false };
}

// ─── orchestration ────────────────────────────────────────

function insideGitRepo(root) {
  let dir = path.resolve(root);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * Whether a spec is run by Frame's orchestration: true, false, or null when
 * git would not say.
 *
 * A worker never touches meta files and its digest lives on
 * `frame/<slug>/integration` until promotion, so a reminder here would ask
 * for a second one. The worktree folder is the cheap sign; the branches are
 * the durable one — they are what Frame rehydrates orchestration from after
 * a restart. A project that is not a git repository cannot be orchestrated,
 * so git is not asked there at all.
 *
 * Accepted cost: a spec whose `frame/<slug>/…` branches are never deleted is
 * never announced.
 */
function isOrchestrated(root, slug) {
  if (!SLUG_RE.test(String(slug))) return null;
  if (fs.existsSync(path.join(root, '.frame', 'worktrees', slug))) return true;
  if (!insideGitRepo(root)) return false;
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('git',
      ['for-each-ref', '--count=1', '--format=%(refname)', `refs/heads/frame/${slug}/`],
      { cwd: root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().length > 0;
  } catch {
    return null;
  }
}

// ─── which closed specs are owed something ────────────────

/** Closed specs with at least one missing item, newest close first. */
function openSpecs(root, state) {
  const out = [];
  for (const spec of state.closed) {
    if (!spec || !SLUG_RE.test(String(spec.slug))) continue;
    const missing = missingItems(root, spec.slug);
    if (!missing.length) continue;
    // The folder was there when the list was cached; it may have been
    // removed since without tasks.json changing.
    if (!fs.existsSync(specDir(root, spec.slug))) continue;
    out.push({ slug: spec.slug, closedAt: spec.closedAt || null, missing });
  }
  return out.sort((a, b) => (timeOf(b.closedAt) || 0) - (timeOf(a.closedAt) || 0));
}

/** Why a spec that is owed something is not announced, without asking git. */
function timeReason(spec, baseline) {
  const at = timeOf(spec.closedAt);
  if (at === null) return 'no-close-time';
  if (at <= timeOf(baseline)) return 'before-baseline';
  return null;
}

function orchestrationReason(root, slug) {
  const verdict = isOrchestrated(root, slug);
  if (verdict === null) return 'git-unavailable';
  return verdict ? 'orchestrated' : null;
}

/**
 * Closed, after the baseline, something missing, not run by orchestration —
 * each as `{ slug, closedAt, missing }`. No session, no dedup: this is the
 * state, where `reminder` is what to say about it.
 */
function pending(root, now = Date.now()) {
  try {
    const state = closeState(root, now);
    if (!state || state.unreadable) return [];
    return openSpecs(root, state)
      .filter((spec) => !timeReason(spec, state.baseline) && !orchestrationReason(root, spec.slug));
  } catch {
    return [];
  }
}

// ─── session dedup ────────────────────────────────────────
//
// One file per session: which specs were announced, which quiet reasons were
// already recorded, and what git said about a candidate. The last two exist
// for the same reason — a hook runs on every shell and edit call, and neither
// an activity row nor a 40 ms git process is worth repeating for each one.

/** A host that sends no session id still gets at most one reminder a day. */
function sessionKey(sessionId, now = Date.now()) {
  if (sessionId) return String(sessionId).replace(/[^\w-]/g, '_').slice(0, 80);
  return `day-${new Date(now).toISOString().slice(0, 10)}`;
}

function sessionFile(root, key) {
  return path.join(root, SESSIONS_REL, `${key}.json`);
}

function loadSession(root, key) {
  const st = readJson(sessionFile(root, key)) || {};
  return {
    announced: Array.isArray(st.announced) ? st.announced : [],
    noted: Array.isArray(st.noted) ? st.noted : [],
    git: st.git && typeof st.git === 'object' && !Array.isArray(st.git) ? st.git : {}
  };
}

function cleanupSessions(root, now) {
  try {
    const dir = path.join(root, SESSIONS_REL);
    for (const f of fs.readdirSync(dir)) {
      try {
        const p = path.join(dir, f);
        if (now - fs.statSync(p).mtimeMs > SESSION_TTL_MS) fs.unlinkSync(p);
      } catch { /* ignore */ }
    }
  } catch { /* no dir yet */ }
}

function saveSession(root, key, session, now) {
  try {
    const file = sessionFile(root, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(session));
    cleanupSessions(root, now);
  } catch { /* dedup is best-effort */ }
}

// ─── the reminder ─────────────────────────────────────────

/** The close script, as a path an agent can run from the project root. */
function closeScriptPath(root) {
  const local = path.join(__dirname, 'spec-close.js');
  if (fs.existsSync(local)) {
    const rel = toPosix(path.relative(root, local));
    if (rel && !rel.startsWith('..')) return rel;
  }
  return '.frame/bin/spec-close.js';
}

function labelsOf(specs) {
  const ids = [...new Set(specs.flatMap((s) => s.missing))];
  return ids.map((id) => (CLOSE_ITEMS.find((item) => item.id === id) || { label: id }).label).join(' or ');
}

function reminderLine(root, named, more) {
  const cli = closeScriptPath(root);
  const what = labelsOf(named);
  if (named.length === 1 && !more) {
    return `Spec "${named[0].slug}" has every task completed but no ${what} — run: node ${cli} ${named[0].slug}`;
  }
  const names = named.map((s) => `"${s.slug}"`).join(', ');
  const rest = more > 0 ? ` and ${more} more` : '';
  return `Specs ${names}${rest} have every task completed but no ${what} — run for each: node ${cli} <slug>`;
}

/**
 * What a hook should do about closed specs right now.
 *
 *   { line, slugs, more, reasons }  say `line`; `slugs` are now announced
 *   { quiet, reasons }              say nothing; record each of `reasons`
 *   null                            nothing is owed, or nothing new to record
 *
 * `reasons` holds only the quiet reasons this session has not recorded yet,
 * so a caller can write one activity row per entry without burying the log:
 * a spec closed before the baseline would otherwise add a row to every tool
 * call for as long as it has no digest.
 */
function reminder(root, sessionId, now = Date.now()) {
  try {
    const state = closeState(root, now);
    if (!state) return null;
    if (state.unreadable) return state.hit ? null : { quiet: 'no-index', reasons: ['no-index'] };

    const open = openSpecs(root, state);
    if (!open.length) return null;

    const key = sessionKey(sessionId, now);
    const session = loadSession(root, key);
    let dirty = false;
    const fresh = [];
    const reasons = new Set();

    for (const spec of open) {
      let reason = session.announced.includes(spec.slug) ? 'session-dedup' : timeReason(spec, state.baseline);
      if (!reason) {
        if (Object.prototype.hasOwnProperty.call(session.git, spec.slug)) {
          reason = session.git[spec.slug] || null;
        } else {
          reason = orchestrationReason(root, spec.slug);
          if (reason) {
            session.git[spec.slug] = reason;
            dirty = true;
          }
        }
      }
      if (reason) reasons.add(reason);
      else fresh.push(spec);
    }

    const named = fresh.slice(0, MAX_NAMED);
    if (named.length) {
      session.announced.push(...named.map((s) => s.slug));
      dirty = true;
    }
    const unrecorded = [...reasons].filter((r) => !session.noted.includes(r));
    if (unrecorded.length) {
      session.noted.push(...unrecorded);
      dirty = true;
    }
    if (dirty) saveSession(root, key, session, now);

    if (named.length) {
      const more = fresh.length - named.length;
      return { line: reminderLine(root, named, more), slugs: named.map((s) => s.slug), more, reasons: unrecorded };
    }
    return unrecorded.length ? { quiet: unrecorded[0], reasons: unrecorded } : null;
  } catch {
    return null;
  }
}

module.exports = {
  STATE_REL,
  SESSIONS_REL,
  SESSION_TTL_MS,
  MAX_NAMED,
  CLOSE_ITEMS,
  missingItems,
  readTasks,
  specTaskCounts,
  closedSpecs,
  closeState,
  isOrchestrated,
  pending,
  sessionKey,
  closeScriptPath,
  reminder
};
