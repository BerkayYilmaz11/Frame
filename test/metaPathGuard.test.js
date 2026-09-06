/**
 * Meta-path doctrine guard and mirror drift test (frame-storage-seam T06/T07).
 *
 * `frameStore` is the one module that knows where a project's meta files live.
 * `non-invasive-overlay` excepted `specManager.js` from that rule "for specs",
 * and the exception spread: three modules ended up answering "where do specs
 * live" on their own. This test replaces the convention with a check.
 *
 * The rule is path construction, not the word: `activityLog.js:132` filters
 * `'specs'` as an event key and the renderer compares `viewMode === 'specs'`,
 * both legitimate. A line is a violation only when it calls `path.join` (or
 * `path.posix.join`) *and* carries the `'specs'` literal.
 *
 * Two paths under `src/` are exempt, for different reasons:
 *
 *   src/main/frameStore.js  — the owner. This is where the literal belongs.
 *   src/templates/bin/      — ships into a user project's `.frame/bin/`, where
 *                             `node_modules` and Frame's own tree are both
 *                             unreachable (`brief-context.js:20`), so these
 *                             files cannot require frameStore at all. Their
 *                             copy of the literal is pinned by the drift test
 *                             below instead — the same answer `scripts/` gets.
 *
 * Known limit, accepted: matching per line means a join whose segment comes
 * from a variable declared elsewhere goes unseen. The guard closes the
 * copy-paste path that produced the three original duplicates; it is not a
 * defence against a deliberately obfuscated join.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const frameStore = require('../src/main/frameStore');

const REPO_ROOT = path.join(__dirname, '..');
const SRC_DIR = 'src';

// The owner of the literal, and the tree that cannot reach it.
const OWNER = path.join('src', 'main', 'frameStore.js');
const SHIPPED_TREE = path.join('src', 'templates', 'bin');

const JOIN_CALL = /\bpath\.(?:posix\.)?join\s*\(/;
const SPECS_LITERAL = /(['"`])specs\1|['"`][^'"`]*\/specs(?:\/|['"`])/;

/** Every `.js` file under `dir`, as repo-relative paths. */
function jsFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesUnder(rel));
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

/** Lines in `relFile` that build a path with a `specs` segment, as `file:line`. */
function specPathLines(relFile) {
  const lines = fs.readFileSync(path.join(REPO_ROOT, relFile), 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (JOIN_CALL.test(line) && SPECS_LITERAL.test(line)) hits.push(`${relFile}:${i + 1}`);
  });
  return hits;
}

test('no module but frameStore builds a .frame/specs path', () => {
  const offenders = jsFilesUnder(SRC_DIR)
    .filter((rel) => rel !== OWNER && !rel.startsWith(SHIPPED_TREE + path.sep))
    .flatMap(specPathLines);

  assert.deepEqual(
    offenders,
    [],
    `spec paths must come from frameStore.specsRoot / resolveSpecDir:\n  ${offenders.join('\n  ')}`
  );
});

test('the guard is live — it still finds the joins in the exempt shipped tree', () => {
  // Without this, a matcher that quietly stopped matching anything would
  // report a clean tree forever. The exempt copies are the fixture: they are
  // real spec-path joins that are meant to be there.
  const shipped = jsFilesUnder(SHIPPED_TREE).flatMap(specPathLines);
  assert.ok(shipped.length > 0, 'the scanner matched nothing at all — it is broken, not the tree clean');
});

// ─── Mirror drift ─────────────────────────────────────────────
//
// These three ship into a user project's `.frame/bin/` and each carries its
// own copy of the `.frame/specs` literal, because none of them can require
// frameStore from there. Coupling is impossible, so the answer is a test: the
// segments they join must be the ones frameStore resolves to.

const MIRRORS = [
  path.join('scripts', 'spec-index.js'),
  path.join('scripts', 'spec-command-hint.js'),
  path.join('src', 'templates', 'bin', 'implement-launch.js')
];

/** The segments frameStore puts between a project and its specs: ['.frame', 'specs']. */
function expectedSegments() {
  const projectPath = path.join(path.sep, 'p');
  return path.relative(projectPath, frameStore.specsRoot(projectPath)).split(path.sep);
}

/**
 * The arguments of the `path.join(` call starting at `from`, as a flat list.
 * String literals become their value; anything else stays as written, so an
 * identifier can be resolved (or not) by the caller.
 */
function joinArguments(line, from) {
  const open = line.indexOf('(', from);
  let depth = 0;
  let end = open;
  for (let i = open; i < line.length; i += 1) {
    if (line[i] === '(') depth += 1;
    else if (line[i] === ')') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  return line
    .slice(open + 1, end)
    .split(',')
    .map((arg) => arg.trim())
    .filter(Boolean)
    .map((arg) => (/^(['"`]).*\1$/.test(arg) ? arg.slice(1, -1) : arg));
}

/** Every spec-path join in `relFile`, with its segments resolved where we can. */
function specPathJoins(relFile) {
  const source = fs.readFileSync(path.join(REPO_ROOT, relFile), 'utf8');
  // A shipped script declares its own FRAME_DIR; resolve it so the comparison
  // sees the same '.frame' the literal-carrying scripts write inline.
  const frameDirConst = source.match(/const FRAME_DIR = ['"`]([^'"`]+)['"`]/);
  const joins = [];
  source.split('\n').forEach((line, i) => {
    const match = JOIN_CALL.exec(line);
    if (!match || !SPECS_LITERAL.test(line)) return;
    const segments = joinArguments(line, match.index).map(
      (arg) => (arg === 'FRAME_DIR' && frameDirConst ? frameDirConst[1] : arg)
    );
    joins.push({ where: `${relFile}:${i + 1}`, segments });
  });
  return joins;
}

test('the .frame/bin mirrors join the same segments frameStore resolves to', () => {
  const expected = expectedSegments();

  for (const relFile of MIRRORS) {
    const joins = specPathJoins(relFile);
    // A mirror that stopped building a spec path would otherwise make this
    // test vacuous rather than red.
    assert.ok(joins.length > 0, `${relFile} builds no spec path any more — the mirror moved`);

    for (const { where, segments } of joins) {
      const at = segments.findIndex(
        (_, i) => expected.every((seg, k) => segments[i + k] === seg)
      );
      assert.ok(
        at !== -1,
        `${where} joins [${segments.join(', ')}], which does not carry ` +
        `[${expected.join(', ')}] — the shipped literal has drifted from frameStore.specsRoot()`
      );
    }
  }
});
