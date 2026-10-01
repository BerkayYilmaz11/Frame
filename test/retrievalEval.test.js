/**
 * STR-03 retrieval benchmark: the frozen corpus and the metric/gate math.
 * The numbers themselves come from running scripts/eval/run-retrieval.js;
 * these tests make sure what it reports means what the README says.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const bench = require('../scripts/eval/run-retrieval');

const REPO_ROOT = path.join(__dirname, '..');

/* ------------------------------- corpus ------------------------------- */

test('each split matches its frozen hash', () => {
  const corpus = bench.loadCases();
  for (const split of Object.values(corpus.splits)) assert.equal(bench.digest(split.cases), split.sha256);
});

test('an edited split is refused', () => {
  const fs = require('fs');
  const os = require('os');
  const corpus = JSON.parse(fs.readFileSync(bench.CASES_FILE, 'utf8'));
  corpus.splits.heldOut.cases[0].expect = ['tuned.js'];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-cases-')), 'cases.json');
  fs.writeFileSync(file, JSON.stringify(corpus));
  assert.throws(() => bench.loadCases(file), /heldOut does not match its frozen hash/);
});

test('the corpus has the planned size and coverage, with families disjoint across splits', () => {
  const { splits } = bench.loadCases();
  const dev = splits.development.cases;
  const held = splits.heldOut.cases;
  const all = [...dev, ...held];
  const count = (tag) => all.filter((c) => c.tags.includes(tag)).length;
  assert.ok(dev.length >= 60 && held.length >= 120 && all.length >= 180, `${dev.length}/${held.length}`);
  assert.ok(count('turkish') >= 30);
  assert.ok(count('negative') >= 30);
  assert.ok(count('singleton') >= 20);
  for (const tag of ['symbol', 'basename', 'path', 'curated', 'synonym', 'ambiguous', 'noise', 'removed', 'renamed', 'stale-map']) {
    assert.ok(count(tag) > 0, `a ${tag} case exists`);
  }
  const devFamilies = new Set(dev.map((c) => c.family).filter((f) => f !== 'negative'));
  assert.deepEqual(held.filter((c) => devFamilies.has(c.family)).map((c) => c.id), []);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, 'ids are unique');
  for (const c of all) {
    assert.equal(c.tags.includes('negative'), c.expect.length === 0, `${c.id}: negatives and only negatives expect nothing`);
  }
});

test('every expected file exists at the pinned commit', (t) => {
  const corpus = bench.loadCases();
  const r = spawnSync('git', ['ls-tree', '-r', '--name-only', corpus.pinnedCommit], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return t.skip('pinned commit not available (shallow clone)');
  const files = new Set(r.stdout.split('\n'));
  for (const c of [...corpus.splits.development.cases, ...corpus.splits.heldOut.cases]) {
    for (const f of c.expect) assert.ok(files.has(f), `${c.id}: ${f}`);
    if (c.mutate && c.mutate.remove) assert.ok(files.has(c.mutate.remove));
    if (c.mutate && c.mutate.rename) assert.ok(files.has(c.mutate.rename[0]));
  }
});

/* ------------------------------- parsing ------------------------------ */

test('CLI output parses from the JSON envelope and from the human listing; missing files never count', () => {
  const env = { schema: 'frame.lookup/1', candidates: [{ path: 'a.js' }, { path: 'gone.js', missing: true }, { path: 'b.js' }] };
  assert.deepEqual(bench.parseCli(JSON.stringify(env)), ['a.js', 'b.js']);
  const human = [
    'Map: fresh · working tree', '', 'Feature: github',
    '  src/main/githubManager.js                  — GitHub Manager Module',
    '  src/renderer/gone.js                       — Gone  ⚠ file missing on disk — run: npm run structure',
    '  IPC: LOAD_GITHUB_ISSUES', ''
  ].join('\n');
  assert.deepEqual(bench.parseCli(human), ['src/main/githubManager.js']);
  assert.deepEqual(bench.parseCli('No modules found for "x"\n'), []);
});

test('hook output parses hinted files; silence and garbage are no hint', () => {
  const context = 'Frame\'s module map already answers "github":\nFeature: github\n  src/a.js — A\n  src/b.js\n  … +3 more\n  IPC: X, Y\nFull query: …';
  const out = bench.parseHook(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } }));
  assert.deepEqual(out.files, ['src/a.js', 'src/b.js']);
  assert.equal(out.context, context);
  assert.deepEqual(bench.parseHook(''), { files: [], context: '' });
  assert.equal(bench.parseHook('{not json').invalid, true);
});

/* ------------------------------- metrics ------------------------------ */

const c = (id, expect, tags = []) => ({ id, expect, tags: expect.length ? tags : ['negative', ...tags] });
const hook = (files, ms = 10, context = files.join('\n')) => ({ files, ms, context });

test('summaries compute recall, precision, false hints, abstention and quantiles as documented', () => {
  const results = [
    { case: c('1', ['a.js'], ['basename']), cli: ['a.js', 'x.js'], cliMs: 10, hooks: { claude: hook(['a.js'], 10) } },
    { case: c('2', ['b.js'], ['symbol']), cli: ['x.js', 'y.js', 'z.js', 'w.js', 'b.js'], cliMs: 20, hooks: { claude: hook(['x.js'], 20) } },
    { case: c('3', ['c.js'], ['turkish', 'basename']), cli: [], cliMs: 30, hooks: { claude: hook([], 30) } },
    { case: c('4', []), cli: ['n.js'], cliMs: 40, hooks: { claude: hook(['n.js'], 40) } },
    { case: c('5', []), cli: [], cliMs: 50, hooks: { claude: hook([], 50) } }
  ];
  const s = bench.summarize(results);
  assert.equal(s.answerable, 3);
  assert.equal(s.negatives, 2);
  assert.equal(s.recallAt5, 2 / 3);
  assert.equal(s.exactRecall, 1, 'the Turkish-mixed case is not an exact case');
  assert.equal(s.exactCases, 2);
  assert.equal(s.precisionAt1, 1 / 3, 'top result right in 1 of the 3 cases that returned anything');
  assert.equal(s.cliNegativeReturns, 1 / 2);
  assert.equal(s.cliP50Ms, 30);
  assert.equal(s.cliP95Ms, 50);
  const h = s.hooks.claude;
  assert.equal(h.emitted, 3);
  assert.equal(h.emittedPrecision, 1 / 3);
  assert.equal(h.falseHintRate, 1 / 2);
  assert.equal(h.hintRecall, 1 / 3);
  assert.equal(h.abstention, 1 / 3);
  assert.equal(s.strata.basename.n, 2);
  assert.equal(s.strata.negative.falseHints, 1);
});

test('gates pass only when every limit holds, recall never drops below legacy, and scale latency counts', () => {
  const good = {
    exactRecall: 1, recallAt5: 0.93, precisionAt1: 0.95, cliP95Ms: 90,
    hooks: { claude: { emittedPrecision: 0.99, falseHintRate: 0, p95Ms: 40, maxChars: 900 }, codex: { emittedPrecision: null, falseHintRate: 0, p95Ms: 41, maxChars: 0 } }
  };
  assert.equal(bench.evaluateGates(good, { recallAt5: 0.6 }, [{ files: 10000, hookP95Ms: 45 }]).pass, true, 'a hook that never emitted has no precision to fail');

  const failed = (patch, baseline = null, scale = null) => bench.evaluateGates({ ...good, ...patch }, baseline, scale).gates.filter((g) => !g.pass).map((g) => g.name);
  assert.deepEqual(failed({ exactRecall: 0.99 }), ['exact-recall']);
  assert.deepEqual(failed({}, { recallAt5: 0.95 }), ['recall@5-vs-legacy']);
  assert.deepEqual(failed({ precisionAt1: 0.89 }), ['precision@1']);
  assert.deepEqual(failed({ hooks: { claude: { ...good.hooks.claude, falseHintRate: 0.03 } } }), ['false-hints:claude']);
  assert.deepEqual(failed({ hooks: { claude: { ...good.hooks.claude, maxChars: 1801 } } }), ['payload:claude']);
  assert.deepEqual(failed({}, null, [{ files: 10000, hookP95Ms: 51 }]), ['hook-p95:10000-files']);
  assert.deepEqual(failed({ cliP95Ms: 151 }), ['cli-p95']);
});

test('quantiles use the nearest-rank definition', () => {
  assert.equal(bench.quantile([], 0.5), null);
  assert.equal(bench.quantile([5], 0.95), 5);
  assert.equal(bench.quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  assert.equal(bench.quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
});
