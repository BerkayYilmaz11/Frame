/**
 * cloudBriefs tests — the pure core of reading Frame Cloud briefs.
 * Runs with Node's built-in runner: `npm test` (node --test test/).
 * No Electron, no network: fetch is a fake.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const core = require('../src/main/cloud/cloudBriefs');
const { classifyLinkError } = require('../src/main/cloud/cloudProjects');

const API = 'http://cloud.test';

// ─── Fakes ────────────────────────────────────────────────────

/** Scripted fetch, one answer per path. A GET's `?input=` is decoded into `input`. */
function fakeFetch(routes) {
  const calls = [];
  const fetchJson = async (url, opts = {}) => {
    const [path, query = ''] = url.slice(API.length).split('?');
    const input = query.startsWith('input=')
      ? JSON.parse(decodeURIComponent(query.slice('input='.length)))
      : undefined;
    calls.push({ url, path, input, ...opts });
    if (!routes[path]) throw new Error(`unexpected request ${path}`);
    return routes[path];
  };
  return { fetchJson, calls };
}

const ok = (data) => ({ status: 200, body: { result: { data } } });
const ctx = (fetchJson) => ({ api: API, token: 't0k', fetchJson });

const BRIEF = {
  id: 'b1', number: 3, projectId: 'p1', kind: 'work', title: 'Ship it', body: 'Line one\nLine two',
  source: 'desk', priority: 'high', milestoneId: 'm1', targetBranch: 'main', assigneeId: null,
  status: 'backlog', decidedAt: '2026-09-10T10:00:00.000Z', closedAt: null, closeReason: null,
  droppedAt: null, dropReason: null, recordedDecisionAt: null,
  createdAt: '2026-09-09T10:00:00.000Z', updatedAt: '2026-09-10T10:00:00.000Z', version: 2,
};

// ─── Calls ────────────────────────────────────────────────────

test('listBriefs sends a GET with the project slug and a bearer token', async () => {
  const { fetchJson, calls } = fakeFetch({ '/trpc/brief.list': ok([BRIEF]) });
  const briefs = await core.listBriefs({ ...ctx(fetchJson), projectSlug: 'my-app' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].token, 't0k');
  assert.deepEqual(calls[0].input, { projectSlug: 'my-app' });
  assert.equal(briefs.length, 1);
  assert.equal(briefs[0].number, 3);
  assert.equal(briefs[0].priority, 'high');
});

test('listBriefs asks for closed briefs only when told to', async () => {
  const { fetchJson, calls } = fakeFetch({ '/trpc/brief.list': ok([]) });
  await core.listBriefs({ ...ctx(fetchJson), projectSlug: 'my-app', includeClosed: true });
  assert.deepEqual(calls[0].input, { projectSlug: 'my-app', includeClosed: true });
});

test('listBriefs drops rows without an id or a number and survives a non-array', async () => {
  const { fetchJson } = fakeFetch({ '/trpc/brief.list': ok([BRIEF, { id: 'x' }, { number: 4 }, null]) });
  assert.equal((await core.listBriefs({ ...ctx(fetchJson), projectSlug: 'a-b' })).length, 1);
  const empty = fakeFetch({ '/trpc/brief.list': ok({ nope: true }) });
  assert.deepEqual(await core.listBriefs({ ...ctx(empty.fetchJson), projectSlug: 'a-b' }), []);
});

test('listMilestones sends the project slug and keeps id, name and status', async () => {
  const { fetchJson, calls } = fakeFetch({
    '/trpc/milestone.list': ok([{ id: 'm1', name: 'Beta', status: 'started', goal: 'x' }, { name: 'no id' }]),
  });
  const milestones = await core.listMilestones({ ...ctx(fetchJson), projectSlug: 'my-app' });
  assert.deepEqual(calls[0].input, { projectSlug: 'my-app' });
  assert.deepEqual(milestones, [{ id: 'm1', name: 'Beta', status: 'started' }]);
});

test('getBrief asks by project slug and number, and orders parts by position', async () => {
  const { fetchJson, calls } = fakeFetch({
    '/trpc/brief.getByNumber': ok({
      ...BRIEF,
      parts: [
        { id: 'p2', position: 1, title: 'Second', shape: 'task', type: 'fix', why: null },
        { id: 'p1', position: 0, title: 'First', shape: 'spec', type: 'feature', why: 'Because' },
      ],
      attachments: [{ id: 'a1', kind: 'url', title: 'Chat', url: 'https://claude.ai/chat/1' }],
      comments: [{ id: 'c1', authorId: 'u1', text: 'Looks right', createdAt: '2026-09-11T10:00:00.000Z' }],
    }),
  });
  const detail = await core.getBrief({ ...ctx(fetchJson), projectSlug: 'my-app', number: 3 });
  assert.deepEqual(calls[0].input, { projectSlug: 'my-app', number: 3 });
  assert.deepEqual(detail.parts.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(detail.attachments, [{ id: 'a1', title: 'Chat', url: 'https://claude.ai/chat/1' }]);
  assert.equal(detail.comments[0].authorId, 'u1');
  assert.equal(detail.body, 'Line one\nLine two');
});

test('getBrief on a detail with no lists gives empty lists', async () => {
  const { fetchJson } = fakeFetch({ '/trpc/brief.getByNumber': ok(BRIEF) });
  const detail = await core.getBrief({ ...ctx(fetchJson), projectSlug: 'my-app', number: 3 });
  assert.deepEqual([detail.parts, detail.attachments, detail.comments], [[], [], []]);
});

test('a missing brief surfaces as notFound', async () => {
  const { fetchJson } = fakeFetch({
    '/trpc/brief.getByNumber': { status: 404, body: { error: { message: 'BRIEF_NOT_FOUND', data: { code: 'NOT_FOUND' } } } },
  });
  await assert.rejects(
    core.getBrief({ ...ctx(fetchJson), projectSlug: 'my-app', number: 9 }),
    (err) => classifyLinkError(err) === 'notFound'
  );
});

test('briefEvents asks by brief id and keeps each event\'s data', async () => {
  const { fetchJson, calls } = fakeFetch({
    '/trpc/brief.events': ok([
      { id: 'e1', briefId: 'b1', at: '2026-09-09T10:00:00.000Z', actorId: 'u1', event: 'created', data: { kind: 'work' } },
      { id: 'e2', at: '2026-09-10T10:00:00.000Z', actorId: 'u2', event: 'commented', data: null },
      { id: 'e3', actorId: 'u2' },
    ]),
  });
  const events = await core.briefEvents({ ...ctx(fetchJson), id: 'b1' });
  assert.deepEqual(calls[0].input, { id: 'b1' });
  assert.deepEqual(events.map((e) => e.id), ['e1', 'e2']);
  assert.deepEqual(events[0].data, { kind: 'work' });
  assert.deepEqual(events[1].data, {});
});

// ─── Normalizing ──────────────────────────────────────────────

test('normalizeBrief folds unknown enum values to safe defaults', () => {
  const b = core.normalizeBrief({ ...BRIEF, kind: 'epic', priority: 'urgent', status: 'archived' });
  assert.equal(b.kind, 'proposal');
  assert.equal(b.priority, null);
  assert.equal(b.status, 'backlog');
});

test('normalizeBrief turns empty or missing strings into null where the field is optional', () => {
  const b = core.normalizeBrief({ id: 'b', number: 1, body: '', milestoneId: undefined, closeReason: 7 });
  assert.equal(b.body, null);
  assert.equal(b.milestoneId, null);
  assert.equal(b.closeReason, null);
  assert.equal(b.title, '');
});

test('normalizeBrief never carries fields Frame does not draw', () => {
  const b = core.normalizeBrief({ ...BRIEF, assigneeId: 'u9', version: 4, secret: 'x' });
  assert.equal('assigneeId' in b, false);
  assert.equal('version' in b, false);
  assert.equal('secret' in b, false);
});

test('normalizeBriefDetail folds unknown part shapes and types', () => {
  const d = core.normalizeBriefDetail({ ...BRIEF, parts: [{ id: 'p', position: 0, shape: 'epic', type: 'chore' }] });
  assert.equal(d.parts[0].shape, 'task');
  assert.equal(d.parts[0].type, 'feature');
});

// ─── Web links ────────────────────────────────────────────────

const WEB = { apiUrl: 'https://api.frame.test', webOrigin: 'https://app.frame.test', workspaceSlug: 'lab', projectSlug: 'my-app' };

test('buildBriefWebUrl points at the full brief page', () => {
  assert.equal(core.buildBriefWebUrl({ ...WEB, number: 12 }), 'https://app.frame.test/lab/my-app/briefs/12');
});

test('buildBriefWebUrl without a number is the project page', () => {
  assert.equal(core.buildBriefWebUrl(WEB), 'https://app.frame.test/lab/my-app');
});

test('buildBriefWebUrl refuses a number that is not a positive integer', () => {
  for (const bad of [0, -1, 1.5, '3', NaN]) {
    assert.equal(core.buildBriefWebUrl({ ...WEB, number: bad }), null, String(bad));
  }
});

test('buildBriefWebUrl keeps the project URL guards', () => {
  assert.equal(core.buildBriefWebUrl({ ...WEB, number: 1, webOrigin: 'javascript:alert(1)' }), null);
  assert.equal(core.buildBriefWebUrl({ ...WEB, number: 1, projectSlug: '../x' }), null);
});
