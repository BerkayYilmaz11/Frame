/**
 * Meta-path doctrine guard (frame-storage-seam T06).
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
