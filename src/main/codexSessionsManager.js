/**
 * Codex Sessions Manager Module
 *
 * Lists Codex CLI session history for a project, the Codex counterpart of
 * claudeSessionsManager. Codex keeps one rollout file per session under
 * ~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl — by date, not
 * by project — so every rollout's first record (`session_meta`, which carries
 * the session's `cwd`) decides whether it belongs to the project.
 *
 * Returns the same session shape and `{ sessions, reason }` envelope as the
 * Claude manager, so the Sessions panel renders both lists one way.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const readline = require('readline');
const { IPC } = require('../shared/ipcChannels');

/**
 * Where Codex keeps its data. `CODEX_HOME` is how Codex itself allows
 * relocating it; honouring it keeps Frame correct for users who set it and
 * lets the tests point this module at a fixture tree. Read per call.
 */
function sessionsDir() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(codexHome, 'sessions');
}

/** Longest first-prompt excerpt kept for a session title. */
const PROMPT_EXCERPT = 200;

/**
 * Per-file scan cache, as in claudeSessionsManager: rollouts are append-only,
 * so a later scan reads only what was appended. Rollouts of other projects
 * are remembered too — their cwd never changes — so they are skipped without
 * being opened again. Keyed by absolute file path.
 * { offset, size, mtimeMs, session }
 */
const scanCache = new Map();

/**
 * The user's own words in a `response_item` message.
 *
 * Codex records injected context as user messages too: the
 * <environment_context> block, <user_instructions>, and the
 * "# AGENTS.md instructions for …" preamble. None of those are a title.
 */
function userPromptText(payload) {
  const parts = Array.isArray(payload.content) ? payload.content : [];
  const textPart = parts.find(part => part && part.type === 'input_text' && typeof part.text === 'string');
  if (!textPart) return null;

  const text = textPart.text.trim();
  if (!text) return null;
  if (text.startsWith('<')) return null;
  if (text.startsWith('# AGENTS.md instructions')) return null;
  return text.slice(0, PROMPT_EXCERPT);
}

/**
 * A subagent's thread (spawned by another Codex session) is part of its
 * parent's work, not a session the user started or would resume.
 */
function isSubagentMeta(payload) {
  if (payload.thread_source === 'subagent') return true;
  return !!(payload.source && typeof payload.source === 'object' && payload.source.subagent);
}

/** Fold one rollout record into the session being built. */
function applyRecord(session, record) {
  if (record.type === 'session_meta' && record.payload) {
    const meta = record.payload;
    session.sessionId = meta.id || meta.session_id || session.sessionId;
    session.cwd = typeof meta.cwd === 'string' ? meta.cwd : null;
    session.created = meta.timestamp || record.timestamp || session.created;
    session.gitBranch = (meta.git && meta.git.branch) || null;
    session.isSubagent = isSubagentMeta(meta);
    session.hasMeta = true;
    return;
  }

  if (record.timestamp) session.lastActivity = record.timestamp;

  if (record.type !== 'response_item' || !record.payload) return;
  const payload = record.payload;
  if (payload.type !== 'message') return;

  if (payload.role === 'assistant') {
    session.messageCount++;
  } else if (payload.role === 'user') {
    const text = userPromptText(payload);
    if (!text) return; // injected context, not a turn
    session.messageCount++;
    if (!session.firstPrompt) session.firstPrompt = text;
  }
}

function emptySession(file) {
  // rollout-2026-09-20T15-27-49-<uuid>.jsonl — the id is the trailing UUID;
  // session_meta overrides it when present.
  const match = path.basename(file, '.jsonl').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return {
    sessionId: match ? match[1] : null,
    cwd: null,
    firstPrompt: null,
    messageCount: 0,
    created: null,
    lastActivity: null,
    gitBranch: null,
    isSubagent: false,
    hasMeta: false
  };
}

/**
 * Stream the bytes of a rollout from `start` and fold them into `session`.
 * With `metaOnly`, stop after the first record: enough to learn the cwd of a
 * rollout that may belong to another project.
 */
async function foldRecords(file, start, session, metaOnly) {
  const stream = fs.createReadStream(file, { start, encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch (_) {
        continue; // a half-written trailing line while a session is live
      }
      applyRecord(session, record);
      if (metaOnly) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}

function belongsTo(cwd, projectPath) {
  if (!cwd) return false;
  const root = path.resolve(projectPath);
  const dir = path.resolve(cwd);
  // The project itself or anything inside it — Frame's own worktrees under
  // .frame/worktrees/ included.
  return dir === root || dir.startsWith(root + path.sep);
}

/**
 * Read one rollout into a session record for `projectPath`, or null when it
 * belongs to another project. Reuses whatever a previous scan folded in.
 */
async function scanRollout(file, stat, projectPath) {
  const cached = scanCache.get(file);

  // A rollout's cwd never changes: one known to be elsewhere stays elsewhere.
  if (cached && cached.session.hasMeta && !belongsTo(cached.session.cwd, projectPath)) {
    return null;
  }

  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs && cached.offset === stat.size) {
    return belongsTo(cached.session.cwd, projectPath) ? { ...cached.session } : null;
  }

  let session;
  let start;
  if (cached && stat.size >= cached.offset && cached.session.hasMeta) {
    session = { ...cached.session };
    start = cached.offset;
  } else {
    // First look (or a rewritten file): read the meta line alone first.
    session = emptySession(file);
    await foldRecords(file, 0, session, true);
    if (session.hasMeta && !belongsTo(session.cwd, projectPath)) {
      scanCache.set(file, { offset: 0, size: stat.size, mtimeMs: stat.mtimeMs, session: { ...session } });
      return null;
    }
    session = emptySession(file);
    start = 0;
  }

  await foldRecords(file, start, session, false);
  scanCache.set(file, {
    offset: stat.size,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    session: { ...session }
  });

  return belongsTo(session.cwd, projectPath) ? session : null;
}

/** Every rollout file under sessions/YYYY/MM/DD/. */
async function listRollouts(root) {
  const out = [];
  async function walk(dir, depth) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < 3) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
        out.push(full);
      }
    }
  }
  await walk(root, 0);
  return out;
}

/**
 * Get Codex sessions for a given project path.
 * Returns { sessions, reason } — reason distinguishes "zero sessions" from
 * "there is nothing to read here", so the panel can say why it's empty.
 */
async function getSessionsForProject(projectPath) {
  if (!projectPath) return { sessions: [], reason: 'no-project' };
  const root = sessionsDir();
  if (!fs.existsSync(root)) return { sessions: [], reason: 'no-codex-dir' };

  let files;
  try {
    files = await listRollouts(root);
  } catch (err) {
    console.error('Error reading Codex sessions directory:', err);
    return { sessions: [], reason: 'read-error' };
  }

  const sessions = [];
  let failures = 0;

  for (const file of files) {
    try {
      const stat = await fsp.stat(file);
      const session = await scanRollout(file, stat, projectPath);
      if (!session || !session.sessionId) continue;
      if (session.isSubagent) continue;
      // No user turn and no reply: a session opened and abandoned. Listing it
      // offers a resume that resumes nothing.
      if (session.messageCount === 0) continue;
      sessions.push({
        sessionId: session.sessionId,
        summary: null,
        firstPrompt: session.firstPrompt,
        messageCount: session.messageCount,
        created: session.created || stat.birthtime.toISOString(),
        modified: session.lastActivity || stat.mtime.toISOString(),
        gitBranch: session.gitBranch,
        isSidechain: false,
        // Where the session ran — a folder inside the project (a worktree)
        // resumes there, not at the project root.
        cwd: session.cwd,
        projectPath
      });
    } catch (err) {
      failures++;
      console.error('Error reading Codex rollout:', file, err.message);
    }
  }

  if (sessions.length === 0) {
    return { sessions: [], reason: failures > 0 ? 'read-error' : 'no-project-sessions' };
  }

  sessions.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return { sessions, reason: null };
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.handle(IPC.LOAD_CODEX_SESSIONS, async (event, projectPath) => {
    return getSessionsForProject(projectPath);
  });
}

module.exports = {
  setupIPC,
  getSessionsForProject,
  // exported for tests
  _resetCache: () => scanCache.clear()
};
