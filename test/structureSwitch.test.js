/**
 * structure-switch tests: STRUCTURE.json maintenance is opt-in per project
 * (`.frame/config.json` settings.structureMap). Without it nothing writes the
 * map — the parser, the lifecycle worker, init's bootstrap and the
 * module-hint hook all stand down. The suite itself runs with
 * FRAME_STRUCTURE=on, so each test here takes it out of the environment.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const { structureEnabled } = require('../scripts/structure-switch');

const offEnv = () => {
  const env = { ...process.env };
  delete env.FRAME_STRUCTURE;
  return env;
};

const writeConfig = (root, settings) => {
  fs.mkdirSync(path.join(root, '.frame'), { recursive: true });
  fs.writeFileSync(path.join(root, '.frame', 'config.json'), JSON.stringify({ settings }));
};

let project;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-switch-'));
  fs.mkdirSync(path.join(project, 'src'), { recursive: true });
  fs.writeFileSync(path.join(project, 'src', 'widget.js'), '// Widget\nmodule.exports = {};\n');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('the map is off unless the project opts in', () => {
  assert.equal(structureEnabled(project, {}), false, 'no config');
  writeConfig(project, { autoUpdateStructure: true });
  assert.equal(structureEnabled(project, {}), false, 'the legacy init field does not opt in');
  writeConfig(project, { structureMap: true });
  assert.equal(structureEnabled(project, {}), true);
  fs.writeFileSync(path.join(project, '.frame', 'config.json'), '{ not json');
  assert.equal(structureEnabled(project, {}), false, 'unreadable config');
  assert.equal(structureEnabled(project, { FRAME_STRUCTURE: 'on' }), true, 'env override');
});

test('Frame\'s own repo opts in', () => {
  assert.equal(structureEnabled(REPO_ROOT, {}), true);
});

test('off: update-structure writes no map and reports skipped', () => {
  for (const mode of ['--full', '--staged']) {
    const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'update-structure.js'), mode, '--json'], {
      env: { ...offEnv(), FRAME_PROJECT_ROOT: project }, encoding: 'utf8'
    });
    assert.equal(r.status, 0, r.stderr);
    const envelope = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(envelope.state, 'skipped');
    assert.equal(envelope.reason, 'paused');
    assert.ok(!fs.existsSync(path.join(project, '.frame', 'STRUCTURE.json')), `${mode} wrote a map`);
  }
});

test('opted in: update-structure writes the map', () => {
  writeConfig(project, { structureMap: true });
  const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'update-structure.js'), '--full', '--json'], {
    env: { ...offEnv(), FRAME_PROJECT_ROOT: project }, encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(project, '.frame', 'STRUCTURE.json')));
});

test('off: the lifecycle worker exits without touching the project', () => {
  const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'structure-lifecycle.js'), '--once'], {
    env: { ...offEnv(), FRAME_PROJECT_ROOT: project }, encoding: 'utf8'
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /off for this project/);
  assert.ok(!fs.existsSync(path.join(project, '.frame')));
});

test('off: the module-hint hook stays silent', () => {
  const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'module-hint.js'), 'search'], {
    input: JSON.stringify({ session_id: 's', cwd: project, tool_name: 'Grep', tool_input: { pattern: 'widget' } }),
    env: { ...offEnv(), FRAME_PROJECT_ROOT: project }, encoding: 'utf8'
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});

test('off: init ships only the shared tools, installs no hook and runs no scan', async () => {
  const saved = process.env.FRAME_STRUCTURE;
  delete process.env.FRAME_STRUCTURE;
  try {
    const { bootstrapStructure } = require('../src/main/structureBootstrap');
    const summary = await bootstrapStructure(project, true);
    assert.equal(summary.hook, null);
    assert.equal(summary.initialScan.status, 'skipped-disabled');
    assert.ok(!fs.existsSync(path.join(project, '.frame', 'bin', 'update-structure.js')), 'no structure tools');
    assert.ok(fs.existsSync(path.join(project, '.frame', 'bin', 'check-freshness.js')), 'the shared tools still ship');
    assert.ok(!fs.existsSync(path.join(project, '.frame', 'STRUCTURE.json')));
  } finally {
    if (saved !== undefined) process.env.FRAME_STRUCTURE = saved;
  }
});

test('off: the app attaches no lifecycle worker', () => {
  const saved = process.env.FRAME_STRUCTURE;
  delete process.env.FRAME_STRUCTURE;
  try {
    // A staged worker script, so only the opt-in check can say no.
    fs.mkdirSync(path.join(project, '.frame', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(project, '.frame', 'bin', 'structure-lifecycle.js'), '');
    const lifecycle = require('../src/main/structureLifecycle');
    let spawned = 0;
    lifecycle.configure({ enabled: true, spawn: () => { spawned++; throw new Error('must not spawn'); } });
    assert.equal(lifecycle.attach(project), null);
    assert.equal(spawned, 0);
  } finally {
    if (saved !== undefined) process.env.FRAME_STRUCTURE = saved;
  }
});

test('check-freshness copied without the structure helpers runs its other checks', () => {
  // A lean .frame/bin: the script and the activity helpers it always had, no
  // structure-read or structure-switch.
  const bin = path.join(project, '.frame', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const file of ['check-freshness.js', 'activity-log.js', 'redact.js']) {
    fs.copyFileSync(path.join(REPO_ROOT, 'scripts', file), path.join(bin, file));
  }
  fs.writeFileSync(path.join(project, '.frame', 'STRUCTURE.json'), JSON.stringify({ modules: { 'a/b': { file: 'src/missing.js' } } }));
  const r = spawnSync('node', [path.join(bin, 'check-freshness.js')], { env: offEnv(), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!/structure|phantom/i.test(r.stdout + r.stderr), r.stdout + r.stderr);
});
