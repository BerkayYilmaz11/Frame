/**
 * cloudProjects tests — the pure core of Frame Cloud projects.
 * Runs with Node's built-in runner: `npm test` (node --test test/).
 * No Electron, no network: fetch is a fake.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const core = require('../src/main/cloud/cloudProjects');

const API = 'http://cloud.test';

// ─── Fakes ────────────────────────────────────────────────────

/**
 * Scripted fetch: `routes[path]` is an array of answers consumed in order
 * (the last one repeats). An answer is `{ status, body }`, an Error to throw,
 * or a function `(call) => answer`. A GET's `?input=` is decoded into `input`.
 */
function fakeFetch(routes) {
  const calls = [];
  const fetchJson = async (url, opts = {}) => {
    const [path, query = ''] = url.slice(API.length).split('?');
    const input = query.startsWith('input=')
      ? JSON.parse(decodeURIComponent(query.slice('input='.length)))
      : opts.body;
    calls.push({ url, path, query, input, ...opts });
    const queue = routes[path];
    if (!queue) throw new Error(`unexpected request ${path}`);
    let answer = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof answer === 'function') answer = answer(calls[calls.length - 1]);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetchJson, calls };
}

const ok = (data) => ({ status: 200, body: { result: { data } } });

function project(id, overrides = {}) {
  return {
    id,
    slug: `${id}-slug`,
    name: `Project ${id}`,
    status: { source: 'scratch', link: 'unlinked', frame: null, github: null },
    frameProjectId: null,
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Reading ──────────────────────────────────────────────────

test('listProjects is a GET with the bearer token and normalizes each entry', async () => {
  const { fetchJson, calls } = fakeFetch({
    '/trpc/project.list': [ok([
      project('p1', { status: { source: 'github' }, frameProjectId: 'f1' }),
      project('p2'),
      { slug: 'no-id' },
    ])],
  });
  const list = await core.listProjects({ api: API, token: 'tk', fetchJson });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].token, 'tk');
  assert.equal(calls[0].query, '');
  assert.deepEqual(list.map((p) => [p.id, p.source, p.frameProjectId]), [
    ['p1', 'github', 'f1'],
    ['p2', 'scratch', null],
  ]);
});

test('listProjects answers [] for a body that is not a list', async () => {
  const { fetchJson } = fakeFetch({ '/trpc/project.list': [ok({ nope: true })] });
  assert.deepEqual(await core.listProjects({ api: API, token: 'tk', fetchJson }), []);
});

// ─── Matching ─────────────────────────────────────────────────

const norm = (list) => list.map(core.normalizeProject);

test('matchFolders: a cloud-only project is listed with no folder (S1)', () => {
  const { projectRows, folderRows } = core.matchFolders(norm([project('p1')]), []);
  assert.deepEqual(folderRows, []);
  assert.deepEqual(projectRows, [{
    id: 'p1', slug: 'p1-slug', name: 'Project p1', source: 'scratch',
    connected: false, folderNames: [], openPath: null,
  }]);
});

test('matchFolders: a folder whose id a project carries is connected on both sides (S5)', () => {
  const { projectRows, folderRows } = core.matchFolders(
    norm([project('p1', { frameProjectId: 'f1' }), project('p2')]),
    [{ path: '/code/app', name: 'app', projectId: 'f1' }]
  );
  assert.deepEqual(folderRows, [{
    path: '/code/app', name: 'app', connected: true,
    project: { id: 'p1', slug: 'p1-slug', name: 'Project p1' },
  }]);
  assert.equal(projectRows[0].connected, true);
  assert.deepEqual(projectRows[0].folderNames, ['app']);
  assert.equal(projectRows[0].openPath, '/code/app');
  assert.equal(projectRows[1].connected, false);
});

test('matchFolders: never matches by name or path', () => {
  const { projectRows, folderRows } = core.matchFolders(
    norm([project('p1', { name: 'app', slug: 'app' })]),
    [{ path: '/code/app', name: 'app', projectId: 'f9' }]
  );
  assert.equal(folderRows[0].connected, false);
  assert.equal(folderRows[0].project, null);
  assert.deepEqual(projectRows[0].folderNames, []);
});

test('matchFolders: two folders sharing an id both read connected', () => {
  const { projectRows, folderRows } = core.matchFolders(
    norm([project('p1', { frameProjectId: 'f1' })]),
    [
      { path: '/a/app', name: 'app', projectId: 'f1' },
      { path: '/b/app-clone', name: 'app-clone', projectId: 'f1' },
    ]
  );
  assert.deepEqual(folderRows.map((f) => f.connected), [true, true]);
  assert.deepEqual(projectRows[0].folderNames, ['app', 'app-clone']);
  assert.equal(projectRows[0].openPath, '/a/app');
});

test('matchFolders: an id no longer listed falls back to not connected (S8)', () => {
  const { folderRows } = core.matchFolders(
    norm([project('p2', { frameProjectId: 'f2' })]),
    [{ path: '/code/app', name: 'app', projectId: 'f1' }]
  );
  assert.equal(folderRows[0].connected, false);
  assert.equal(folderRows[0].project, null);
});

test('matchFolders: a folder with no id is not connected, even to an unlinked project', () => {
  const { projectRows, folderRows } = core.matchFolders(
    norm([project('p1')]),
    [{ path: '/code/app', name: 'app', projectId: null }]
  );
  assert.equal(folderRows[0].connected, false);
  assert.deepEqual(projectRows[0].folderNames, []);
});

test('matchFolders: a connected project with no folder here still reads connected', () => {
  const { projectRows } = core.matchFolders(norm([project('p1', { frameProjectId: 'f1' })]), [
    { path: '/code/other', name: 'other', projectId: 'f2' },
  ]);
  assert.equal(projectRows[0].connected, true);
  assert.deepEqual(projectRows[0].folderNames, []);
  assert.equal(projectRows[0].openPath, null);
});

// ─── Web links ────────────────────────────────────────────────

const WEB = { apiUrl: 'https://api.frame.test', webOrigin: 'https://app.frame.test', workspaceSlug: 'lab', projectSlug: 'my-app' };

test('buildWebUrl joins origin, workspace and project', () => {
  assert.equal(core.buildWebUrl(WEB), 'https://app.frame.test/lab/my-app');
});

test('buildWebUrl uses only the origin of what it is given', () => {
  assert.equal(
    core.buildWebUrl({ ...WEB, webOrigin: 'https://user:pw@app.frame.test/device?code=X#y' }),
    'https://app.frame.test/lab/my-app'
  );
});

test('buildWebUrl refuses a slug that is not a slug', () => {
  for (const bad of ['', 'ab', 'a'.repeat(33), 'My-App', 'a--b', '-ab', 'ab-', '../x', 'a/b', 'a b', null, 42]) {
    assert.equal(core.buildWebUrl({ ...WEB, projectSlug: bad }), null, `project ${bad}`);
    assert.equal(core.buildWebUrl({ ...WEB, workspaceSlug: bad }), null, `workspace ${bad}`);
  }
});

test('buildWebUrl refuses a non-http origin', () => {
  for (const origin of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://app.frame.test', 'not a url', '', undefined]) {
    assert.equal(core.buildWebUrl({ ...WEB, webOrigin: origin }), null, String(origin));
  }
});

test('buildWebUrl refuses an http origin for an https API', () => {
  assert.equal(core.buildWebUrl({ ...WEB, webOrigin: 'http://app.frame.test' }), null);
});

test('buildWebUrl lets localhost and 127.0.0.1 serve the web over http', () => {
  assert.equal(core.buildWebUrl({ ...WEB, webOrigin: 'http://localhost:5173' }), 'http://localhost:5173/lab/my-app');
  assert.equal(core.buildWebUrl({ ...WEB, webOrigin: 'http://127.0.0.1:5173' }), 'http://127.0.0.1:5173/lab/my-app');
});

test('buildWebUrl allows http everywhere for an http API', () => {
  assert.equal(
    core.buildWebUrl({ ...WEB, apiUrl: 'http://localhost:3777', webOrigin: 'http://web.lan:5173' }),
    'http://web.lan:5173/lab/my-app'
  );
});

test('buildWebUrl answers null without an origin or an API address', () => {
  assert.equal(core.buildWebUrl({ ...WEB, webOrigin: null }), null);
  assert.equal(core.buildWebUrl({ ...WEB, apiUrl: '' }), null);
  assert.equal(core.buildWebUrl(), null);
});
