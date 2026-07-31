/**
 * embeddedMigration tests — against real temp git repositories, because every
 * hard case in this spec is a filesystem or a git fact: a symlink Frame
 * planted, a root file the user is mid-edit on, a `.frame/` counterpart that
 * already exists and differs.
 *
 * The properties under test are the ones a user cannot recover from if we get
 * them wrong: nothing Frame did not create is planned, a dirty tree defers the
 * whole run, and the backup is a byte copy that a second run adds to rather
 * than overwrites.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const migration = require('../src/main/embeddedMigration');
const { FRAME_DIR } = require('../src/shared/frameConstants');

let root;

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** The manifest a pre-overlay init wrote into `.frame/config.json`. */
const LEGACY_FILES_BLOCK = {
  agents: 'AGENTS.md',
  claudeSymlink: 'CLAUDE.md',
  structure: 'STRUCTURE.json',
  notes: 'PROJECT_NOTES.md',
  tasks: 'tasks.json',
  quickstart: 'QUICKSTART.md'
};

/**
 * A project as pre-overlay Frame left it: meta files at the root, a `.frame/`
 * that already exists (config, specs), and a CLAUDE.md → AGENTS.md symlink.
 * Every legacy project is both layouts at once — that is the normal case, not
 * an edge one.
 */
function makeLegacyProject(name, opts = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  if (opts.git !== false) {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@example.com');
    git(dir, 'config', 'user.name', 'Frame Test');
  }

  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), opts.agents ?? '# Project\n\nFrame instructions.\n');
  fs.writeFileSync(path.join(dir, 'STRUCTURE.json'), '{"modules":[]}\n');
  fs.writeFileSync(path.join(dir, 'PROJECT_NOTES.md'), '# Notes\n');
  fs.writeFileSync(path.join(dir, 'tasks.json'), '{"tasks":[]}\n');
  fs.writeFileSync(path.join(dir, 'QUICKSTART.md'), '# Quickstart\n');
  if (opts.symlinks !== false) {
    fs.symlinkSync('AGENTS.md', path.join(dir, 'CLAUDE.md'));
  }

  fs.mkdirSync(path.join(dir, FRAME_DIR, 'specs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, FRAME_DIR, 'config.json'),
    JSON.stringify({ version: '1.0', settings: {}, files: opts.files ?? LEGACY_FILES_BLOCK }, null, 2)
  );

  if (opts.git !== false && opts.commit !== false) {
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'initial');
  }
  return dir;
}

function dispositionOf(result, rel) {
  const entry = result.artifacts.find((a) => a.rel === rel);
  return entry ? entry.disposition : null;
}

function backupPath(dir, rel) {
  return path.join(dir, FRAME_DIR, migration.BACKUP_DIR, rel);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-migration-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// ─── detection ────────────────────────────────────────────────

test('a project already on the overlay layout plans nothing', () => {
  const dir = path.join(root, 'modern');
  fs.mkdirSync(path.join(dir, FRAME_DIR, 'specs'), { recursive: true });
  fs.writeFileSync(path.join(dir, FRAME_DIR, 'config.json'), '{"version":"1.0"}');
  fs.writeFileSync(path.join(dir, FRAME_DIR, 'tasks.json'), '{"tasks":[]}');

  const result = migration.plan(dir);
  assert.equal(result.legacy, false);
  assert.deepEqual(result.artifacts, []);
});

test('a path that no longer exists plans nothing instead of throwing', () => {
  const result = migration.plan(path.join(root, 'gone'));
  assert.equal(result.legacy, false);
});

// ─── D5: the manifest is the authority ────────────────────────

test('the artifact list comes from config.json.files', () => {
  const dir = makeLegacyProject('manifest');
  const result = migration.plan(dir);

  assert.equal(result.legacy, true);
  assert.equal(result.manifest, 'config');
  assert.deepEqual(
    result.artifacts.map((a) => a.rel).sort(),
    ['AGENTS.md', 'PROJECT_NOTES.md', 'QUICKSTART.md', 'STRUCTURE.json', 'tasks.json']
  );
  assert.equal(dispositionOf(result, 'tasks.json'), 'move');
  assert.equal(
    result.artifacts.find((a) => a.rel === 'tasks.json').target,
    `${FRAME_DIR}/tasks.json`
  );
});

test('a missing or malformed files block falls back to the well-known names', () => {
  const absent = makeLegacyProject('no-manifest', { files: undefined });
  fs.writeFileSync(
    path.join(absent, FRAME_DIR, 'config.json'),
    JSON.stringify({ version: '1.0', settings: {} }, null, 2)
  );
  const fallback = migration.plan(absent);
  assert.equal(fallback.manifest, 'fallback');
  assert.equal(fallback.artifacts.length, 5);

  const malformed = makeLegacyProject('bad-manifest', { files: 'AGENTS.md, tasks.json' });
  assert.equal(migration.plan(malformed).manifest, 'fallback');
});

test('a root file this project\'s manifest does not claim is reported, not planned', () => {
  // Frame created tasks.json and STRUCTURE.json here; PROJECT_NOTES.md and the
  // rest arrived some other way, so they are not ours to move.
  const dir = makeLegacyProject('partial-manifest', {
    files: { tasks: 'tasks.json', structure: 'STRUCTURE.json' }
  });
  const result = migration.plan(dir);

  assert.deepEqual(result.artifacts.map((a) => a.rel).sort(), ['STRUCTURE.json', 'tasks.json']);
  assert.deepEqual(result.unrecognized.sort(), ['AGENTS.md', 'PROJECT_NOTES.md', 'QUICKSTART.md']);
});

test('only a Frame-planted symlink is planned for removal', () => {
  const dir = makeLegacyProject('symlinks');
  fs.symlinkSync('README.md', path.join(dir, 'GEMINI.md')); // someone else's link

  const result = migration.plan(dir);
  assert.deepEqual(result.symlinks, ['CLAUDE.md']);
});

// ─── D4: a dirty tree defers ──────────────────────────────────

test('an uncommitted edit to a legacy file defers the whole run', () => {
  const dir = makeLegacyProject('dirty');
  fs.writeFileSync(path.join(dir, 'PROJECT_NOTES.md'), '# Notes\n\nHalf a thought I was mid-way through.\n');

  const result = migration.plan(dir);
  assert.deepEqual(result.dirty, ['PROJECT_NOTES.md']);
});

test('a staged edit counts as dirty too', () => {
  const dir = makeLegacyProject('staged');
  fs.writeFileSync(path.join(dir, 'tasks.json'), '{"tasks":[{"id":1}]}\n');
  git(dir, 'add', 'tasks.json');

  assert.deepEqual(migration.plan(dir).dirty, ['tasks.json']);
});

test('a tracked-but-clean project is not deferred', () => {
  assert.deepEqual(migration.plan(makeLegacyProject('clean')).dirty, []);
});

test('an untracked root file is not dirty — there is no diff to be confused by', () => {
  const dir = makeLegacyProject('untracked', { commit: false });
  assert.deepEqual(migration.plan(dir).dirty, []);
});

test('a non-git project is never deferred', () => {
  const dir = makeLegacyProject('no-git', { git: false });
  const result = migration.plan(dir);
  assert.equal(result.legacy, true);
  assert.deepEqual(result.dirty, []);
  assert.deepEqual(result.tracked, []);
});

// ─── D8: what the receipt's git sentence keys off ─────────────

test('tracked artifacts are reported, and only the tracked ones', () => {
  const dir = makeLegacyProject('tracked-some', { commit: false });
  git(dir, 'add', 'tasks.json', 'AGENTS.md');
  git(dir, 'commit', '-qm', 'track two');

  const result = migration.plan(dir);
  assert.deepEqual(result.tracked.sort(), ['AGENTS.md', 'tasks.json']);
});

// ─── D3: dual layout ──────────────────────────────────────────

test('an identical .frame/ counterpart makes the root copy a plain delete', () => {
  const dir = makeLegacyProject('identical');
  fs.copyFileSync(path.join(dir, 'tasks.json'), path.join(dir, FRAME_DIR, 'tasks.json'));

  assert.equal(dispositionOf(migration.plan(dir), 'tasks.json'), 'delete-identical');
});

test('a differing .frame/ counterpart sends the root copy to the backup', () => {
  const dir = makeLegacyProject('conflict');
  fs.writeFileSync(path.join(dir, FRAME_DIR, 'tasks.json'), '{"tasks":[{"id":"newer"}]}\n');

  assert.equal(dispositionOf(migration.plan(dir), 'tasks.json'), 'backup-conflict');
});

// ─── D6: what can be handed back ──────────────────────────────

test('a consumed instruction file is planned for restoration', () => {
  const dir = makeLegacyProject('consumed', {
    agents:
      '# Frame\n\nGenerated.\n\n---\n\n## Existing Instructions (from CLAUDE.md)\n\nMy own rules.\n'
  });
  const result = migration.plan(dir);

  assert.deepEqual(result.restore.map((r) => r.rel), ['CLAUDE.md']);
  assert.match(result.restore[0].from, /^AGENTS\.md#Existing Instructions/);
});

test('nothing is planned for restoration when init consumed nothing', () => {
  assert.deepEqual(migration.plan(makeLegacyProject('never-consumed')).restore, []);
});

test('extraction returns the block verbatim and stops at the next one', () => {
  const merged = [
    '# Frame template',
    '',
    '---',
    '',
    '## Existing Instructions (from CLAUDE.md)',
    '',
    'Rule one.',
    '',
    '---',
    '',
    'Still my file — a rule after a horizontal rule.',
    '',
    '---',
    '',
    '## Existing Instructions (from GEMINI.md)',
    '',
    'Gemini rules.',
    ''
  ].join('\n');

  const claude = migration.extractExisting(merged, 'CLAUDE.md');
  assert.match(claude, /Rule one\./);
  // The user's own `---` must not truncate their file.
  assert.match(claude, /a rule after a horizontal rule/);
  assert.ok(!claude.includes('Gemini rules'), 'the next block bled into this one');
  assert.equal(migration.extractExisting(merged, 'GEMINI.md'), 'Gemini rules.\n');
  assert.equal(migration.extractExisting(merged, 'AGENTS.md'), null);
});

// ─── D9: the backup ───────────────────────────────────────────

test('the backup is a byte copy under .frame/migration-backup/', () => {
  const dir = makeLegacyProject('backup');
  const written = migration.writeBackup(dir, ['tasks.json', 'PROJECT_NOTES.md']);

  assert.deepEqual(written, ['tasks.json', 'PROJECT_NOTES.md']);
  assert.ok(
    fs.readFileSync(backupPath(dir, 'tasks.json')).equals(fs.readFileSync(path.join(dir, 'tasks.json'))),
    'the backup is not byte-identical'
  );
});

test('a second run adds only what is missing and never overwrites', () => {
  const dir = makeLegacyProject('backup-twice');
  migration.writeBackup(dir, ['tasks.json']);
  // The interrupted run's copy is the one that must survive: the live file may
  // have moved on since.
  fs.writeFileSync(backupPath(dir, 'tasks.json'), '{"tasks":["the first run\'s copy"]}\n');
  fs.writeFileSync(path.join(dir, 'tasks.json'), '{"tasks":["changed since"]}\n');

  const written = migration.writeBackup(dir, ['tasks.json', 'QUICKSTART.md']);

  assert.deepEqual(written, ['QUICKSTART.md'], 'an existing backup entry was rewritten');
  assert.match(fs.readFileSync(backupPath(dir, 'tasks.json'), 'utf8'), /the first run's copy/);
});

test('a file that is not there is skipped, not failed', () => {
  const dir = makeLegacyProject('backup-absent');
  assert.deepEqual(migration.writeBackup(dir, ['GEMINI.md']), []);
});

test('a dangling symlink is skipped — there is nothing to preserve', () => {
  const dir = makeLegacyProject('backup-dangling', { symlinks: false });
  fs.symlinkSync('AGENTS.md', path.join(dir, 'GEMINI.md'));
  fs.unlinkSync(path.join(dir, 'AGENTS.md'));

  assert.deepEqual(migration.writeBackup(dir, ['GEMINI.md']), []);
  assert.ok(!fs.existsSync(backupPath(dir, 'GEMINI.md')));
});

test('plan writes nothing at all', () => {
  const dir = makeLegacyProject('read-only', { commit: false });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'baseline');

  migration.plan(dir);

  assert.equal(git(dir, 'status', '--porcelain', '-uall').trim(), '', 'plan() touched the working tree');
  assert.ok(!fs.existsSync(path.join(dir, FRAME_DIR, migration.BACKUP_DIR)), 'plan() created the backup dir');
});
