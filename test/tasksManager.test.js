/**
 * tasksManager corruption-recovery tests (T02): corrupt tasks.json must no
 * longer silently disable CRUD or destroy recoverable data.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tasksManager = require('../src/main/tasksManager');
const { FRAME_DIR, FRAME_CONFIG_FILE, FRAME_FILES } = require('../src/shared/frameConstants');

let projectDir;
let metaDir;
let tasksPath;

function writeTasksFile(tasks) {
  fs.writeFileSync(tasksPath, JSON.stringify({ version: '2.0', tasks }, null, 2), 'utf8');
}

beforeEach(() => {
  // Overlay layout: tasks.json lives in .frame/, which is where frameStore
  // puts every file Frame creates today.
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-tasks-'));
  metaDir = path.join(projectDir, FRAME_DIR);
  fs.mkdirSync(metaDir, { recursive: true });
  tasksPath = path.join(metaDir, FRAME_FILES.TASKS);
  tasksManager.init(null); // no window — IPC pushes no-op
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('loadTasks returns null for a project without tasks.json', () => {
  assert.equal(tasksManager.loadTasks(projectDir), null);
});

test('loadTasks parses a valid file', () => {
  writeTasksFile([{ id: 't1', title: 'A', status: 'pending' }]);
  const data = tasksManager.loadTasks(projectDir);
  assert.equal(data.tasks.length, 1);
  assert.ok(!data.corrupt);
});

test('corrupt tasks.json with .bak: restores and keeps CRUD alive', () => {
  writeTasksFile([{ id: 't1', title: 'A', status: 'pending' }]);
  const added = tasksManager.addTask(projectDir, { title: 'B' }); // atomic save → creates .bak
  assert.ok(added, 'addTask works on a healthy file');

  fs.writeFileSync(tasksPath, '{"version":"2.0","tasks":[{"id":"t1"'); // torn write

  const data = tasksManager.loadTasks(projectDir);
  assert.ok(Array.isArray(data.tasks), 'recovered data is usable');
  assert.ok(data.tasks.some((t) => t.id === 't1'), 'pre-corruption task survives');
  assert.ok(!data.corrupt);
  const corrupt = fs.readdirSync(metaDir).filter((f) => f.includes('.corrupt-'));
  assert.equal(corrupt.length, 1, 'corrupt copy preserved');
});

test('corrupt tasks.json without .bak: flagged empty set, mutation cannot clobber', () => {
  fs.writeFileSync(tasksPath, '{"version":"2.0","tasks":[{"id":"only"'); // corrupt, never saved by us

  const data = tasksManager.loadTasks(projectDir);
  assert.deepEqual(data.tasks, []);
  assert.equal(data.corrupt, true, 'error state is visible, not a silent null');

  // CRUD is NOT dead (old behavior): a new task lands in a fresh file...
  const added = tasksManager.addTask(projectDir, { title: 'new task' });
  assert.ok(added);
  // ...and the corrupt original is still recoverable on disk.
  const corrupt = fs.readdirSync(metaDir).filter((f) => f.includes('.corrupt-'));
  assert.equal(corrupt.length, 1);

  // the corrupt flag is never persisted
  const onDisk = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  assert.ok(!('corrupt' in onDisk));
  assert.equal(onDisk.tasks.length, 1);
});

test('an unmigrated project keeps reading and writing its root tasks.json', () => {
  // Frame's pre-overlay signature: the config.files record plus the file at
  // the project root. CRUD must stay on that file until the user migrates.
  fs.writeFileSync(
    path.join(metaDir, FRAME_CONFIG_FILE),
    JSON.stringify({ version: '1.0', files: { tasks: FRAME_FILES.TASKS } }, null, 2),
    'utf8'
  );
  const rootTasksPath = path.join(projectDir, FRAME_FILES.TASKS);
  fs.writeFileSync(
    rootTasksPath,
    JSON.stringify({ version: '2.0', tasks: [{ id: 't1', title: 'A', status: 'pending' }] }, null, 2),
    'utf8'
  );

  assert.equal(tasksManager.loadTasks(projectDir).tasks.length, 1);
  assert.ok(tasksManager.addTask(projectDir, { title: 'B' }));

  const onDisk = JSON.parse(fs.readFileSync(rootTasksPath, 'utf8'));
  assert.equal(onDisk.tasks.length, 2, 'the root file is the one that changed');
  assert.ok(!fs.existsSync(tasksPath), 'no second copy appears under .frame/');
});

test('addTask keeps a non-blank userRequest exactly as typed', () => {
  writeTasksFile([]);
  const request = '  Make the list faster.\nKeep the order.  ';
  const added = tasksManager.addTask(projectDir, {
    title: 'Speed', userRequest: request, priority: 'high', category: 'fix'
  });
  assert.equal(added.userRequest, request);
  assert.equal(added.status, 'pending');
  assert.equal(added.priority, 'high');
  assert.equal(added.category, 'fix');
  assert.equal(added.description, '');
  assert.ok(!('acceptanceCriteria' in added));

  const onDisk = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  assert.equal(onDisk.tasks[0].userRequest, request);
});

test('addTask records no userRequest when none, or a blank one, is given', () => {
  writeTasksFile([]);
  const none = tasksManager.addTask(projectDir, { title: 'A' });
  const blank = tasksManager.addTask(projectDir, { title: 'B', userRequest: ' \n ' });
  const wrongType = tasksManager.addTask(projectDir, { title: 'C', userRequest: 42 });
  for (const t of [none, blank, wrongType]) assert.ok(!('userRequest' in t), t.title);
});

test('reorderTasks with id-only entries reorders and leaves every status untouched', () => {
  const tasks = [
    { id: 'p', title: 'P', status: 'pending', updatedAt: '2026-10-01T00:00:00Z', completedAt: null },
    { id: 'i', title: 'I', status: 'in_progress', updatedAt: '2026-10-02T00:00:00Z', completedAt: null },
    { id: 'c', title: 'C', status: 'completed', updatedAt: '2026-10-03T00:00:00Z', completedAt: '2026-10-03T00:00:00Z' }
  ];
  writeTasksFile(tasks);

  assert.ok(tasksManager.reorderTasks(projectDir, [{ id: 'c' }, { id: 'p' }, { id: 'i' }]));

  const onDisk = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  assert.deepEqual(onDisk.tasks.map(t => t.id), ['c', 'p', 'i']);
  for (const before of tasks) {
    const after = onDisk.tasks.find(t => t.id === before.id);
    assert.equal(after.status, before.status, before.id);
    assert.equal(after.updatedAt, before.updatedAt, before.id);
    assert.equal(after.completedAt, before.completedAt, before.id);
  }
});
