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

// ─── Creating ─────────────────────────────────────────────────

test('buildCreateInput shapes work with a trimmed title, desk source and medium priority', () => {
  const r = core.buildCreateInput({ kind: 'work', title: '  Ship it  ', body: '  Why  ' });
  assert.deepEqual(r, { ok: true, input: { kind: 'work', title: 'Ship it', source: 'desk', body: 'Why', priority: 'medium' } });
  assert.equal(core.buildCreateInput({ kind: 'work', title: 'x', priority: 'high' }).input.priority, 'high');
});

test('buildCreateInput sends no priority for a proposal, even when given one', () => {
  const r = core.buildCreateInput({ kind: 'proposal', title: 'Idea', priority: 'high' });
  assert.deepEqual(r.input, { kind: 'proposal', title: 'Idea', source: 'desk' });
});

test('buildCreateInput leaves out an empty or whitespace body', () => {
  assert.equal('body' in core.buildCreateInput({ kind: 'work', title: 'x', body: '   ' }).input, false);
  assert.equal('body' in core.buildCreateInput({ kind: 'work', title: 'x' }).input, false);
});

test('buildCreateInput keeps HTML in the body as-is', () => {
  const body = '<script>alert(1)</script>';
  assert.equal(core.buildCreateInput({ kind: 'work', title: 'x', body }).input.body, body);
});

test('buildCreateInput refuses bad fields with the field named', () => {
  const cases = [
    [{ kind: 'epic', title: 'x' }, 'kind'],
    [{ kind: 'work', title: '   ' }, 'title'],
    [{ kind: 'work' }, 'title'],
    [{ kind: 'work', title: 'x'.repeat(201) }, 'title'],
    [{ kind: 'work', title: 'x', body: 'y'.repeat(10001) }, 'body'],
    [{ kind: 'work', title: 'x', priority: 'urgent' }, 'priority'],
  ];
  for (const [request, field] of cases) {
    assert.deepEqual(core.buildCreateInput(request), { ok: false, reason: 'badRequest', field }, field);
  }
  assert.equal(core.buildCreateInput(null).ok, false);
  assert.equal(core.buildCreateInput({ kind: 'work', title: 'x'.repeat(200) }).ok, true);
  assert.equal(core.buildCreateInput({ kind: 'work', title: 'x', body: 'y'.repeat(10000) }).ok, true);
});

test('normalizeLinks keeps http(s) links in order with trimmed titles', () => {
  const r = core.normalizeLinks([
    { title: ' Chat ', url: 'https://claude.ai/chat/1' },
    { title: 'Doc', url: 'http://example.com/a', extra: true },
  ]);
  assert.deepEqual(r, { ok: true, links: [{ title: 'Chat', url: 'https://claude.ai/chat/1' }, { title: 'Doc', url: 'http://example.com/a' }] });
  assert.deepEqual(core.normalizeLinks(undefined), { ok: true, links: [] });
});

test('normalizeLinks refuses the whole list over one bad link', () => {
  const bad = [
    [{ title: 'x', url: 'javascript:alert(1)' }],
    [{ title: 'x', url: 'ftp://example.com' }],
    [{ title: 'x', url: 'not a url' }],
    [{ title: '   ', url: 'https://example.com' }],
    [{ title: 'x'.repeat(201), url: 'https://example.com' }],
    'https://example.com',
  ];
  for (const links of bad) {
    assert.deepEqual(core.normalizeLinks(links), { ok: false, reason: 'badRequest', field: 'links' });
  }
});

test('createBrief POSTs brief.create with the input and normalizes the answer', async () => {
  const { fetchJson, calls } = fakeFetch({ '/trpc/brief.create': ok(BRIEF) });
  const input = { projectSlug: 'my-app', kind: 'work', title: 'Ship it', source: 'desk', priority: 'medium' };
  const brief = await core.createBrief({ ...ctx(fetchJson), input });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].token, 't0k');
  assert.deepEqual(calls[0].body, input);
  assert.equal(brief.number, 3);
  assert.equal(brief.id, 'b1');
});

test('addAttachment POSTs brief.addAttachment with id, title and url', async () => {
  const { fetchJson, calls } = fakeFetch({ '/trpc/brief.addAttachment': ok({ id: 'a1', title: 'Chat', url: 'https://x.test' }) });
  const a = await core.addAttachment({ ...ctx(fetchJson), id: 'b1', title: 'Chat', url: 'https://x.test' });
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { id: 'b1', title: 'Chat', url: 'https://x.test' });
  assert.deepEqual(a, { id: 'a1', title: 'Chat', url: 'https://x.test' });
});

/** A `call()` stand-in: runs each fn against a fake fetch, failing where told. */
function fakeCall({ createFails, failAttachmentAt } = {}) {
  const sent = [];
  let attachments = 0;
  const fetchJson = async (url, opts) => {
    const name = url.slice(`${API}/trpc/`.length);
    sent.push({ name, body: opts.body });
    if (name === 'brief.create') {
      return createFails ? { status: 404, body: { error: { message: 'PROJECT_NOT_FOUND', data: { code: 'NOT_FOUND' } } } } : ok(BRIEF);
    }
    attachments += 1;
    if (attachments === failAttachmentAt) return { status: 400, body: { error: { message: 'bad', data: { code: 'BAD_REQUEST' } } } };
    return ok({ id: `a${attachments}`, title: opts.body.title, url: opts.body.url });
  };
  const call = async (fn) => {
    try {
      return { ok: true, value: await fn(ctx(fetchJson)) };
    } catch (err) {
      return { ok: false, reason: classifyLinkError(err) };
    }
  };
  return { call, sent };
}

const INPUT = { projectSlug: 'my-app', kind: 'work', title: 'Ship it', source: 'desk', priority: 'medium' };
const LINKS = [
  { title: 'One', url: 'https://one.test' },
  { title: 'Two', url: 'https://two.test' },
  { title: 'Three', url: 'https://three.test' },
];

test('createWithLinks creates, then attaches every link in order', async () => {
  const { call, sent } = fakeCall();
  const r = await core.createWithLinks(call, { input: INPUT, links: LINKS });
  assert.deepEqual(r, { ok: true, number: 3, attachmentError: null });
  assert.deepEqual(sent.map((s) => s.name), ['brief.create', 'brief.addAttachment', 'brief.addAttachment', 'brief.addAttachment']);
  assert.deepEqual(sent.slice(1).map((s) => s.body), LINKS.map((l) => ({ id: 'b1', ...l })));
});

test('createWithLinks sends no link after a failed create', async () => {
  const { call, sent } = fakeCall({ createFails: true });
  const r = await core.createWithLinks(call, { input: INPUT, links: LINKS });
  assert.deepEqual(r, { ok: false, reason: 'notFound' });
  assert.deepEqual(sent.map((s) => s.name), ['brief.create']);
});

test('createWithLinks stops at the first failed link and keeps the number', async () => {
  const { call, sent } = fakeCall({ failAttachmentAt: 2 });
  const r = await core.createWithLinks(call, { input: INPUT, links: LINKS });
  assert.deepEqual(r, { ok: true, number: 3, attachmentError: 'badRequest' });
  assert.equal(sent.length, 3);
});

test('createWithLinks without links is one request and never returns the id', async () => {
  const { call, sent } = fakeCall();
  const r = await core.createWithLinks(call, { input: INPUT });
  assert.deepEqual(r, { ok: true, number: 3, attachmentError: null });
  assert.equal(sent.length, 1);
});

// ─── Discussions ──────────────────────────────────────────────

test('recordDiscussion POSTs brief.recordDiscussion with id, summary, url and provider', async () => {
  const { fetchJson, calls } = fakeFetch({ '/trpc/brief.recordDiscussion': ok({ ...BRIEF, kind: 'proposal' }) });
  const brief = await core.recordDiscussion({
    ...ctx(fetchJson), id: 'b1', summary: 'Chose Postgres', url: 'https://claude.ai/artifact/x', provider: 'Claude Code',
  });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].token, 't0k');
  assert.deepEqual(calls[0].body, { id: 'b1', summary: 'Chose Postgres', url: 'https://claude.ai/artifact/x', provider: 'Claude Code' });
  assert.equal(brief.kind, 'proposal');
});

test('recordDiscussion leaves out an absent url and provider', async () => {
  const { fetchJson, calls } = fakeFetch({ '/trpc/brief.recordDiscussion': ok(BRIEF) });
  await core.recordDiscussion({ ...ctx(fetchJson), id: 'b1', summary: 'Second round' });
  assert.deepEqual(calls[0].body, { id: 'b1', summary: 'Second round' });
});

test('recordDiscussion surfaces a server refusal as a CloudError', async () => {
  const { fetchJson } = fakeFetch({
    '/trpc/brief.recordDiscussion': { status: 400, body: { error: { message: 'ALREADY_CLOSED', data: { code: 'BAD_REQUEST' } } } },
  });
  await assert.rejects(core.recordDiscussion({ ...ctx(fetchJson), id: 'b1', summary: 'x' }), (err) => err.name === 'CloudError' && err.message === 'ALREADY_CLOSED');
});

test('LIMITS carries the server\'s provider limit', () => {
  assert.equal(core.LIMITS.provider, 40);
});

test('addDiscussionCounts counts records on open proposals only, and survives a failed events call', async () => {
  const briefs = [
    { id: 'p1', number: 1, kind: 'proposal', status: 'backlog' },
    { id: 'p2', number: 2, kind: 'proposal', status: 'backlog' },
    { id: 'p3', number: 3, kind: 'proposal', status: 'closed' },
    { id: 'w4', number: 4, kind: 'work', status: 'active' },
  ];
  const asked = [];
  const events = {
    p1: [
      { id: 'e1', event: 'created' },
      { id: 'e2', event: 'discussion-recorded', data: { summary: 'a' } },
      { id: 'e3', event: 'discussion-recorded', data: { summary: 'b' } },
    ],
  };
  const call = async (fn) => {
    const fetchJson = async (url) => {
      const id = JSON.parse(decodeURIComponent(url.split('?input=')[1])).id;
      asked.push(id);
      if (!events[id]) return { status: 500, body: {} };
      return ok(events[id]);
    };
    try {
      return { ok: true, value: await fn(ctx(fetchJson)) };
    } catch (err) {
      return { ok: false, reason: classifyLinkError(err) };
    }
  };
  const counted = await core.addDiscussionCounts(call, briefs);
  assert.deepEqual(counted.map((b) => b.discussionCount), [2, null, null, null]);
  assert.deepEqual(asked.sort(), ['p1', 'p2']);
  assert.equal(briefs[0].discussionCount, undefined);
});
