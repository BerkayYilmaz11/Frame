/**
 * Codex sessions tests.
 *
 * Codex files its rollouts by date, not by project, so the session list is
 * only as good as the cwd filter: these tests pin that a rollout appears for
 * the project it ran in (or a folder inside it) and for no other, that the
 * title is the user's first real prompt rather than Codex's injected context,
 * and that subagent threads and abandoned sessions stay out of the list.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sessions = require('../src/main/codexSessionsManager');

const PROJECT = '/Users/someone/my.project';

let codexHome;
let prevCodexHome;

beforeEach(() => {
  codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-codex-'));
  prevCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  sessions._resetCache();
});

afterEach(() => {
  if (prevCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = prevCodexHome;
  fs.rmSync(codexHome, { recursive: true, force: true });
});

let counter = 0;
function uuid() {
  counter++;
  return `01a0bec9-75cc-7ea0-9877-${String(counter).padStart(12, '0')}`;
}

function meta(id, cwd, extra = {}) {
  return {
    timestamp: '2026-09-20T15:27:49.000Z',
    type: 'session_meta',
    payload: {
      id,
      session_id: id,
      timestamp: '2026-09-20T15:27:49.000Z',
      cwd,
      source: 'cli',
      thread_source: 'user',
      git: { branch: 'main' },
      ...extra
    }
  };
}

function userMsg(text, timestamp = '2026-09-20T15:30:00.000Z') {
  return {
    timestamp,
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
  };
}

function assistantMsg(text, timestamp = '2026-09-20T15:31:00.000Z') {
  return {
    timestamp,
    type: 'response_item',
    payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }
  };
}

function writeRollout(id, records, day = '2026/09/20') {
  const dir = path.join(codexHome, 'sessions', ...day.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-2026-09-20T15-27-49-${id}.jsonl`);
  fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return file;
}

test('lists only the project\'s sessions, newest activity first', async () => {
  const older = uuid();
  const newer = uuid();
  const elsewhere = uuid();
  writeRollout(older, [meta(older, PROJECT), userMsg('older work'), assistantMsg('ok', '2026-09-20T16:00:00.000Z')]);
  writeRollout(newer, [meta(newer, PROJECT), userMsg('newer work'), assistantMsg('ok', '2026-09-21T09:00:00.000Z')], '2026/09/21');
  writeRollout(elsewhere, [meta(elsewhere, '/Users/someone/other'), userMsg('not here')]);

  const result = await sessions.getSessionsForProject(PROJECT);

  assert.equal(result.reason, null);
  assert.deepEqual(result.sessions.map(s => s.sessionId), [newer, older]);
  assert.equal(result.sessions[0].firstPrompt, 'newer work');
  assert.equal(result.sessions[0].gitBranch, 'main');
  assert.equal(result.sessions[0].messageCount, 2);
  assert.equal(result.sessions[0].modified, '2026-09-21T09:00:00.000Z');
});

test('a session started in a folder inside the project counts; a sibling prefix does not', async () => {
  const inside = uuid();
  const sibling = uuid();
  writeRollout(inside, [meta(inside, path.join(PROJECT, '.frame', 'worktrees', 'x')), userMsg('in a worktree')]);
  writeRollout(sibling, [meta(sibling, PROJECT + '-backup'), userMsg('next door')]);

  const result = await sessions.getSessionsForProject(PROJECT);

  assert.deepEqual(result.sessions.map(s => s.sessionId), [inside]);
});

test('injected context is never mistaken for the first prompt', async () => {
  const id = uuid();
  writeRollout(id, [
    meta(id, PROJECT),
    userMsg('<environment_context>\n  <cwd>/x</cwd>\n</environment_context>'),
    userMsg('# AGENTS.md instructions for /x\n\n…'),
    userMsg('  the real question  '),
    assistantMsg('answer')
  ]);

  const [session] = (await sessions.getSessionsForProject(PROJECT)).sessions;

  assert.equal(session.firstPrompt, 'the real question');
  assert.equal(session.messageCount, 2, 'injected context is not a turn');
});

test('subagent threads and sessions with no conversation are not listed', async () => {
  const sub = uuid();
  const empty = uuid();
  const real = uuid();
  writeRollout(sub, [
    meta(sub, PROJECT, { thread_source: 'subagent', source: { subagent: { thread_spawn: { depth: 1 } } } }),
    userMsg('delegated work')
  ]);
  writeRollout(empty, [meta(empty, PROJECT), userMsg('<environment_context></environment_context>')]);
  writeRollout(real, [meta(real, PROJECT), userMsg('mine')]);

  const result = await sessions.getSessionsForProject(PROJECT);

  assert.deepEqual(result.sessions.map(s => s.sessionId), [real]);
});

test('appended records are picked up on a re-read', async () => {
  const id = uuid();
  const file = writeRollout(id, [meta(id, PROJECT), userMsg('first')]);
  assert.equal((await sessions.getSessionsForProject(PROJECT)).sessions[0].messageCount, 1);

  fs.appendFileSync(file, JSON.stringify(assistantMsg('reply', '2026-09-22T10:00:00.000Z')) + '\n');
  const [session] = (await sessions.getSessionsForProject(PROJECT)).sessions;

  assert.equal(session.messageCount, 2);
  assert.equal(session.modified, '2026-09-22T10:00:00.000Z');
});

test('the cache never leaks one project\'s sessions into another', async () => {
  const a = uuid();
  writeRollout(a, [meta(a, PROJECT), userMsg('project a')]);

  assert.equal((await sessions.getSessionsForProject(PROJECT)).sessions.length, 1);
  assert.equal((await sessions.getSessionsForProject('/Users/someone/other')).sessions.length, 0);
  assert.equal((await sessions.getSessionsForProject(PROJECT)).sessions.length, 1);
});

test('a rollout without session_meta is skipped, not listed', async () => {
  const id = uuid();
  writeRollout(id, [userMsg('no meta line')]);

  for (let i = 0; i < 2; i++) { // second pass exercises the cache
    assert.deepEqual((await sessions.getSessionsForProject(PROJECT)).sessions, []);
  }
});

test('a truncated trailing line does not lose the rest of the session', async () => {
  const id = uuid();
  const file = writeRollout(id, [meta(id, PROJECT), userMsg('kept')]);
  fs.appendFileSync(file, '{"type":"response_item","payl');

  const [session] = (await sessions.getSessionsForProject(PROJECT)).sessions;
  assert.equal(session.firstPrompt, 'kept');
});

test('empty-state reasons stay distinguishable', async () => {
  assert.equal((await sessions.getSessionsForProject(null)).reason, 'no-project');
  assert.equal((await sessions.getSessionsForProject(PROJECT)).reason, 'no-codex-dir');

  fs.mkdirSync(path.join(codexHome, 'sessions'), { recursive: true });
  assert.equal((await sessions.getSessionsForProject(PROJECT)).reason, 'no-project-sessions');
});
