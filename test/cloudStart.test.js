/**
 * cloudStart — slug and branch suggestion, the definition parsers, ref
 * allocation and the file and row builders of Start Work.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const start = require('../src/main/cloud/cloudStart');

const NOW = '2026-09-25T10:00:00.000Z';

// ─── Names ────────────────────────────────────────────────────

test('slugify follows spec.new: lowercase, [a-z0-9-], runs collapsed and trimmed', () => {
  assert.equal(start.slugify('Login flow'), 'login-flow');
  assert.equal(start.slugify('  Fix: the   "404" page!  '), 'fix-the-404-page');
  assert.equal(start.slugify('--a__b--'), 'a-b');
});

test('slugify folds accented and Turkish letters instead of dropping them', () => {
  assert.equal(start.slugify('Giriş akışı'), 'giris-akisi');
  assert.equal(start.slugify('Straße Œuvre Café'), 'strasse-oeuvre-cafe');
});

test('slugify cuts at 48 characters and trims the cut again', () => {
  const slug = start.slugify(`${'a'.repeat(47)} b c`);
  assert.equal(slug, 'a'.repeat(47));
  assert.equal(start.slugify('word '.repeat(20)).length <= 48, true);
  assert.equal(start.slugify('word '.repeat(20)).endsWith('-'), false);
});

test('slugify falls back when nothing is left', () => {
  assert.equal(start.slugify('!!!'), '');
  assert.equal(start.slugify('日本語', 'brief-3-part-1'), 'brief-3-part-1');
  assert.equal(start.slugify(undefined, 'x'), 'x');
});

test('suggestBranchName prefixes every type and slugifies the title', () => {
  assert.equal(start.suggestBranchName('feature', 'Login flow'), 'feat/login-flow');
  assert.equal(start.suggestBranchName('fix', 'Login flow'), 'fix/login-flow');
  assert.equal(start.suggestBranchName('refactor', 'Login flow'), 'refactor/login-flow');
  assert.equal(start.suggestBranchName('docs', 'Login flow'), 'docs/login-flow');
  assert.equal(start.suggestBranchName('test', 'Login flow'), 'test/login-flow');
  assert.equal(start.suggestBranchName('chore', 'Login flow'), 'feat/login-flow');
  assert.equal(start.suggestBranchName('fix', '!!!', 'brief-3'), 'fix/brief-3');
});

// ─── Definitions ──────────────────────────────────────────────

const SPEC_DEF = '## Problem\nIt breaks.\n\n## Goal\nIt works.\n\n## Open Questions\n- Which one?';

test('parseSpecDefinition keeps the definition as written', () => {
  assert.deepEqual(start.parseSpecDefinition(`\n${SPEC_DEF}\n`), { ok: true, body: SPEC_DEF });
});

test('parseSpecDefinition needs Problem and Goal, each with content', () => {
  assert.deepEqual(start.parseSpecDefinition(''), { ok: false, reason: 'empty' });
  assert.deepEqual(start.parseSpecDefinition('## Goal\nIt works.'), { ok: false, reason: 'noProblem' });
  assert.deepEqual(start.parseSpecDefinition('## Problem\nIt breaks.'), { ok: false, reason: 'noGoal' });
  assert.deepEqual(start.parseSpecDefinition('## Problem\n\n## Goal\nIt works.'), { ok: false, reason: 'noProblem' });
  assert.deepEqual(start.parseSpecDefinition('## Problem\nx\n### Goal\ny'), { ok: false, reason: 'noGoal' });
});

test('parseTaskDefinition takes all three fields', () => {
  const r = start.parseTaskDefinition('## Description\nFix it.\n\n## Acceptance Criteria\n- It works.\n\n## Notes\nSmall.');
  assert.deepEqual(r, { ok: true, fields: { description: 'Fix it.', acceptanceCriteria: '- It works.', notes: 'Small.' } });
});

test('parseTaskDefinition leaves out absent optional fields', () => {
  assert.deepEqual(start.parseTaskDefinition('## Description\nFix it.'), { ok: true, fields: { description: 'Fix it.' } });
});

test('parseTaskDefinition refuses no Description, an empty one, and text before the first heading', () => {
  assert.deepEqual(start.parseTaskDefinition('  '), { ok: false, reason: 'empty' });
  assert.deepEqual(start.parseTaskDefinition('## Notes\nx'), { ok: false, reason: 'noDescription' });
  assert.deepEqual(start.parseTaskDefinition('## Description\n\n## Notes\nx'), { ok: false, reason: 'noDescription' });
  assert.deepEqual(start.parseTaskDefinition('Fix it.\n## Description\nx'), { ok: false, reason: 'textBeforeHeading' });
});

test('parseTaskDefinition keeps an unknown heading in notes, under its heading', () => {
  const r = start.parseTaskDefinition('## Description\nFix it.\n## Risks\nNone.\n## Notes\nSmall.');
  assert.equal(r.fields.notes, 'Small.\n\n## Risks\n\nNone.');
  const alone = start.parseTaskDefinition('## Description\nFix it.\n## Risks\nNone.');
  assert.equal(alone.fields.notes, '## Risks\n\nNone.');
});

test('parseTaskDefinition does not split on a heading inside a code fence', () => {
  const r = start.parseTaskDefinition('## Description\nRun:\n```md\n## Notes\n```\ndone');
  assert.deepEqual(r, { ok: true, fields: { description: 'Run:\n```md\n## Notes\n```\ndone' } });
});

// ─── Refs ─────────────────────────────────────────────────────

const part = (id, title, shape) => ({ id, title, shape, type: 'feature' });

test('allocateRefs names specs by slug and tasks by task-<slug>, in part order', () => {
  const refs = start.allocateRefs([part('p1', 'Login flow', 'spec'), part('p2', 'Fix typo', 'task')], {}, 3);
  assert.deepEqual(refs, [
    { partId: 'p1', shape: 'spec', ref: 'login-flow' },
    { partId: 'p2', shape: 'task', ref: 'task-fix-typo' },
  ]);
});

test('allocateRefs adds -2 and -3 against the folder', () => {
  const refs = start.allocateRefs(
    [part('p1', 'Login flow', 'spec'), part('p2', 'Fix typo', 'task')],
    { specSlugs: ['login-flow', 'login-flow-2'], taskIds: ['task-fix-typo'] },
    3,
  );
  assert.deepEqual(refs.map((r) => r.ref), ['login-flow-3', 'task-fix-typo-2']);
});

test('allocateRefs counts refs picked earlier in the same start, per shape', () => {
  const refs = start.allocateRefs([
    part('p1', 'Login', 'spec'), part('p2', 'Login', 'spec'), part('p3', 'Login', 'task'), part('p4', 'Login', 'task'),
  ], {}, 3);
  assert.deepEqual(refs.map((r) => r.ref), ['login', 'login-2', 'task-login', 'task-login-2']);
});

test('allocateRefs falls back to brief-<N>-part-<P> and keeps a suffixed spec slug within 48', () => {
  const refs = start.allocateRefs([part('p1', '!!!', 'spec'), part('p2', '???', 'task')], {}, 7);
  assert.deepEqual(refs.map((r) => r.ref), ['brief-7-part-1', 'task-brief-7-part-2']);
  const long = 'a'.repeat(48);
  const [r] = start.allocateRefs([part('p1', long, 'spec')], { specSlugs: [long] }, 1);
  assert.equal(r.ref, `${'a'.repeat(46)}-2`);
});

// ─── Files ────────────────────────────────────────────────────

test('specFiles writes the title over the definition, and spec.new\'s status.json in phase specified', () => {
  const files = start.specFiles({ slug: 'login-flow', title: 'Login flow', definition: `${SPEC_DEF}\n\n`, now: NOW });
  assert.equal(files['spec.md'], `# Login flow\n\n${SPEC_DEF}\n`);
  assert.deepEqual(JSON.parse(files['status.json']), {
    slug: 'login-flow',
    title: 'Login flow',
    phase: 'specified',
    generated_task_ids: [],
    created_at: NOW,
    updated_at: NOW,
    last_phase_at: NOW,
  });
  assert.equal('ai_tool' in JSON.parse(files['status.json']), false);
});

test('taskTitle keeps 60 characters, cutting at the last space or hard', () => {
  assert.equal(start.taskTitle('Short title'), 'Short title');
  const sixty = 'x'.repeat(60);
  assert.equal(start.taskTitle(sixty), sixty);
  assert.equal(start.taskTitle(`${'word '.repeat(13)}end`), 'word word word word word word word word word word word word');
  assert.equal(start.taskTitle('y'.repeat(70)), 'y'.repeat(60));
});

test('taskRow is a pending row with the fields, the brief\'s priority and the part\'s type', () => {
  const row = start.taskRow({
    part: { id: 'p2', title: 'Fix typo', shape: 'task', type: 'fix' },
    fields: { description: 'Fix it.', acceptanceCriteria: '- Works', notes: 'Small.' },
    id: 'task-fix-typo',
    brief: { number: 3, priority: 'high' },
    now: NOW,
  });
  assert.deepEqual(row, {
    id: 'task-fix-typo',
    title: 'Fix typo',
    description: 'Fix it.',
    acceptanceCriteria: '- Works',
    notes: 'Small.',
    status: 'pending',
    priority: 'high',
    category: 'fix',
    context: 'Frame Cloud brief #3',
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
  });
});

test('taskRow defaults to medium and leaves out absent optional fields', () => {
  const row = start.taskRow({
    part: { title: 'x'.repeat(80), type: 'docs' },
    fields: { description: 'd' },
    id: 'task-x',
    brief: { number: 1, priority: null },
    now: NOW,
  });
  assert.equal(row.priority, 'medium');
  assert.equal(row.title.length, 60);
  assert.equal('acceptanceCriteria' in row, false);
  assert.equal('notes' in row, false);
});

test('startable is open, shaped, unstarted work only', () => {
  const SHAPED = '2026-09-20T10:00:00.000Z';
  const base = { kind: 'work', status: 'backlog', shapedAt: SHAPED, startedAt: null };
  assert.equal(start.startable(base), true);
  assert.equal(start.startable({ ...base, shapedAt: null }), false);
  assert.equal(start.startable({ ...base, startedAt: NOW, status: 'active' }), false);
  assert.equal(start.startable({ ...base, status: 'closed' }), false);
  assert.equal(start.startable({ ...base, kind: 'proposal' }), false);
  assert.equal(start.startable(null), false);
});
