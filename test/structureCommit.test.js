/**
 * structure-commit tests (STR-02b): the map a commit carries is built from
 * the staged snapshot — never from unstaged edits, untracked files or
 * unstaged settings — and published into the index only. Every case runs
 * against a real temporary Git repository.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const commit = require('../scripts/structure-commit');
const lifecycle = require('../scripts/structure-lifecycle');

function repo(t, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-commit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    return r;
  };
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  write(dir, files);
  return { dir, git };
}

function write(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
}

const filesOf = (structure) => Object.values(structure.modules).map((m) => m.file).sort();
const entryOf = (structure, file) => Object.values(structure.modules).find((m) => m.file === file);

/* ---------------------------- staged snapshot ---------------------------- */

test('partial staging: the commit map describes staged content only', (t) => {
  const { dir, git } = repo(t, { 'src/a.js': '// Original\n', 'src/b.js': '// B\n' });
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  write(dir, { 'src/a.js': '// Staged description\n' });
  git('add', 'src/a.js');
  write(dir, {
    'src/a.js': '// UNSTAGED_SENTINEL\n',
    'private-notes.md': '# My private salary notes\n',
    'src/new-untracked.js': '// not added\n'
  });
  // Everything outside Frame's gitignored runtime directory (the shared
  // extraction cache lives there).
  const outsideRuntime = () => {
    const out = [];
    const walk = (d) => {
      for (const name of fs.readdirSync(d).sort()) {
        const abs = path.join(d, name);
        const rel = path.relative(dir, abs);
        if (rel === '.git' || rel === path.join('.frame', 'runtime')) continue;
        const st = fs.statSync(abs);
        out.push(`${rel}:${st.size}:${st.mtimeMs}`);
        if (st.isDirectory()) walk(abs);
      }
    };
    walk(dir);
    return out.filter((line) => !line.startsWith('.frame:'));
  };
  const before = outsideRuntime();

  const built = commit.buildStaged(dir);
  assert.deepEqual(filesOf(built.structure), ['src/a.js', 'src/b.js']);
  assert.equal(entryOf(built.structure, 'src/a.js').description, 'Staged description');
  assert.ok(!built.candidate.includes('UNSTAGED_SENTINEL'));
  assert.ok(!built.candidate.includes('private'));
  assert.ok(!built.candidate.includes('new-untracked'));
  assert.deepEqual(outsideRuntime(), before, 'building writes nothing into the working tree or its map');
  assert.equal(built.mapPath, '.frame/STRUCTURE.json');
});

test('the staged map is the prior: its authored prose survives, unstaged prose does not', (t) => {
  const { dir, git } = repo(t, { 'src/a.js': '// Generated\n' });
  const staged = { version: '1.1', modules: { a: { file: 'src/a.js', description: 'Committed hand-written prose', owner: 'team' } } };
  write(dir, { '.frame/STRUCTURE.json': JSON.stringify(staged) });
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  const working = JSON.parse(JSON.stringify(staged));
  working.modules.a.description = 'Unstaged local prose';
  write(dir, { '.frame/STRUCTURE.json': JSON.stringify(working) });

  const built = commit.buildStaged(dir);
  assert.equal(built.structure.modules.a.description, 'Committed hand-written prose');
  assert.equal(built.structure.modules.a.owner, 'team');
  assert.ok(!built.candidate.includes('Unstaged local prose'));
  assert.ok(built.stagedMapId);
});

test('a repository without HEAD builds from the index alone', (t) => {
  const { dir, git } = repo(t, { 'src/first.js': '// First\n' });
  git('add', '-A');
  const built = commit.buildStaged(dir);
  assert.deepEqual(filesOf(built.structure), ['src/first.js']);
  assert.equal(built.structure.generation.inventory.coverage, 'complete');
});

test('an unmerged index makes the snapshot unavailable', (t) => {
  const { dir, git } = repo(t, { 'a.txt': 'base\n' });
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'other');
  write(dir, { 'a.txt': 'theirs\n' });
  git('commit', '-q', '-am', 'theirs');
  git('checkout', '-q', '-');
  write(dir, { 'a.txt': 'ours\n' });
  git('commit', '-q', '-am', 'ours');
  git('merge', 'other');
  assert.throws(() => commit.buildStaged(dir), (err) => err instanceof commit.CommitUnavailable && err.reason === 'unmerged');
});

test('policy comes from the staged config, or defaults when none is staged', (t) => {
  const { dir, git } = repo(t, { 'src/a.js': '// A\n', 'src/secret.js': '// S\n' });
  git('add', 'src');
  write(dir, { '.frame/config.json': JSON.stringify({ project: { structure: { exclude: ['src/secret.js'] } } }) });

  const unstaged = commit.buildStaged(dir);
  assert.equal(unstaged.policyFallback, true);
  assert.deepEqual(filesOf(unstaged.structure), ['src/a.js', 'src/secret.js'], 'unstaged settings never shape a commit');

  git('add', '.frame/config.json');
  const staged = commit.buildStaged(dir);
  assert.equal(staged.policyFallback, false);
  assert.deepEqual(filesOf(staged.structure), ['src/a.js']);
});

test('curation is read from the working copy beside the parser', (t) => {
  const { dir, git } = repo(t, { 'src/payments/charge.js': '// Charge\n', 'src/payments/refund.js': '// Refund\n' });
  git('add', '-A');
  const curationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-commit-curation-'));
  t.after(() => fs.rmSync(curationDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(curationDir, 'intent-map.json'), JSON.stringify({ billing: { modules: ['payments/charge', 'payments/refund', 'payments/untracked'] } }));
  write(dir, { 'src/payments/untracked.js': '// not in the commit\n' });

  const built = commit.buildStaged(dir, { curationDir });
  assert.deepEqual(built.structure.intentIndex.billing.map((e) => e.file), ['src/payments/charge.js', 'src/payments/refund.js']);
});

test('extraction already done for the working tree is reused for identical staged content', (t) => {
  const { dir, git } = repo(t, { '.frame/.keep': '', 'src/a.js': '// A\nfunction f() {}\nmodule.exports = { f };\n', 'src/b.py': '"""B."""\n' });
  git('add', '-A');
  assert.equal(lifecycle.reconcile(dir, { fullHash: true }).status, 'published');
  const built = commit.buildStaged(dir);
  assert.equal(built.cacheHits, 2);
});

test('symlinks and submodules in the index follow the shared policy', (t) => {
  const { dir, git } = repo(t, { 'src/a.js': '// A\n' });
  fs.symlinkSync('src/a.js', path.join(dir, 'link.js'));
  git('add', '-A');
  git('update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},deps/sub`);
  const built = commit.buildStaged(dir);
  assert.deepEqual(filesOf(built.structure), ['src/a.js']);
  assert.equal(built.structure.generation.counts.symlinks, 1);
  assert.equal(built.structure.generation.counts.specialFiles, 1);
});
