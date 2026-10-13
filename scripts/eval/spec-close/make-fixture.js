#!/usr/bin/env node
/**
 * Spec close step — fixture builder.
 *
 * Builds one throwaway Frame project for the close-step test run: a git
 * repository under the system temp directory holding a two-task dummy spec,
 * the scripts and hooks a real Frame project has, and nothing else. An
 * internal measurement instrument, not a product surface.
 *
 *   node scripts/eval/spec-close/make-fixture.js <kind> [--dir <path>]
 *
 * Three kinds, one per way a spec can end up closed without a digest:
 *
 *   natural         both tasks pending. The session implements the spec end
 *                   to end; the template's own digest step is what is under
 *                   test, with the reminder behind it.
 *   induced-prompt  both tasks completed an hour ago, outcome written, no
 *                   digest. The session is asked something unrelated; the
 *                   reminder arrives with the prompt.
 *   induced-turn    the last task still open, a script in the project closes
 *                   it. The session is asked to run that script and then one
 *                   more command; the reminder arrives on the second call.
 *
 * The two induced kinds never show the session the implement template, so
 * whatever it learns about the digest it learns from the reminder and from
 * `spec-close.js` — which is the claim being tested.
 *
 * Everything Frame-shaped comes from Frame's own code rather than a copy of
 * it: `.frame/bin/` from structureBootstrap.copyParserScripts, the command
 * templates from commandStaging.stageCommandFiles, the hooks from
 * SPEC_HINT_HOOKS. A fixture that drifted from what Frame installs would
 * measure the fixture.
 *
 * Isolation: no remote, its own activity home beside the repository, a clean
 * tree on `feat/<slug>` so the template's pre-flight has nothing to ask — an
 * unanswered pre-flight is a hard stop, and a headless session cannot answer.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const structureBootstrap = require(path.join(REPO, 'src', 'main', 'structureBootstrap'));
const commandStaging = require(path.join(REPO, 'src', 'main', 'commandStaging'));
const { SPEC_HINT_HOOKS } = require(path.join(REPO, 'src', 'shared', 'frameTemplates'));
const closeState = require(path.join(REPO, 'scripts', 'spec-close-state'));

const KINDS = ['natural', 'induced-prompt', 'induced-turn'];
const SLUG = 'greeting-helper';
const TITLE = 'Greeting Helper';

// Reminders "started" here in the induced kinds, so a spec closed today is
// after the baseline. The natural kind gets no state file: its baseline is
// the session's first hook run, as in a project that has just adopted Frame.
const BACKDATED_BASELINE = '2026-01-01T00:00:00.000Z';

// Frame's managed ignore block, as it writes it into a project's .frame/.
const FRAME_GITIGNORE = [
  '# managed by Frame — machine-local; edit outside this block',
  'runtime/', 'worktrees/', 'orchestration/', 'migration-backup/', 'bin/',
  'implement-permissions.json', '*.bak', '*.tmp', '*.corrupt-*', 'index/',
  'specs/*/implement-report.html', 'specs/*/plan-report.html', 'specs/*/report-data.json',
  '# end managed by Frame', ''
].join('\n');

const TASKS = [
  { n: 1, title: 'Add `src/greet.js` exporting `greet(name)`, which returns `Hello, <name>!` and `Hello, stranger!` when the name is empty or missing' },
  { n: 2, title: 'Add `test/greet.test.js` covering `greet` for a name, an empty string and no argument' }
];

const SPEC_MD = `---
keywords: greeting, greet, helper
---

# ${TITLE}

## Problem

The project greets people in two places with two different strings.

## Goal

One \`greet(name)\` helper in \`src/greet.js\`, with tests.

## Constraints

- No dependencies.
- An empty or missing name greets a stranger rather than printing \`undefined\`.

## Success Criteria

- When \`greet('Ada')\` is called, then it returns \`Hello, Ada!\`.
- When \`greet('')\` or \`greet()\` is called, then it returns \`Hello, stranger!\`.
- When \`npm test\` runs, then it passes.
`;

const PLAN_MD = `# Plan — ${TITLE}

## Architecture

A single pure function. Rejected: a class with a configurable salutation —
nothing asks for a second salutation.

## Files

- \`src/greet.js\` — **New.** The helper.
- \`test/greet.test.js\` — **New.** Its tests.

## Footprint

- src/greet.js
- test/greet.test.js

## Dependencies

None.

## Sequencing

1. Add \`src/greet.js\`.
2. Add \`test/greet.test.js\`.
`;

const TASKS_MD = `# Tasks — ${TITLE}\n\n${TASKS.map((t) => `- T0${t.n} · ${t.title}`).join('\n')}\n`;

const GREET_JS = `'use strict';

/** A greeting for \`name\`, or for a stranger when there is none. */
function greet(name) {
  return \`Hello, \${name ? name : 'stranger'}!\`;
}

module.exports = { greet };
`;

const GREET_TEST_JS = `const { test } = require('node:test');
const assert = require('node:assert/strict');
const { greet } = require('../src/greet');

test('greets by name', () => assert.equal(greet('Ada'), 'Hello, Ada!'));
test('greets a stranger when the name is empty', () => assert.equal(greet(''), 'Hello, stranger!'));
test('greets a stranger when there is no name', () => assert.equal(greet(), 'Hello, stranger!'));
`;

const SMOKE_TEST_JS = `const { test } = require('node:test');
const assert = require('node:assert/strict');

// Here so \`npm test\` has something to run before the spec adds its own.
test('the project loads', () => assert.equal(typeof require('../src/index'), 'object'));
`;

const OUTCOME_MD = `## T01 — Add \`src/greet.js\`

Added \`greet(name)\` to a new \`src/greet.js\`: one template string, with a falsy name greeted as
\`stranger\` so an empty string and a missing argument take the same path. Chose a plain function over
the configurable class \`plan.md\` rejected. Files: \`src/greet.js\`.

_Captured: 2026-10-13 · 1 file change_

---
## T02 — Add \`test/greet.test.js\`

Added three cases to a new \`test/greet.test.js\` — a name, an empty string, no argument — run by the
existing \`npm test\`. No deviation from \`plan.md\`. Files: \`test/greet.test.js\`.

_Captured: 2026-10-13 · 1 file change_

---
`;

/** tools/close-task.js — closes the last task the way an agent's own script does: through the shell. */
const closeTaskScript = () => `// Marks ${SLUG}'s last task completed in .frame/tasks.json.
const fs = require('fs');
const file = '.frame/tasks.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const task = data.tasks.find((t) => t.source === 'spec:${SLUG}:T02');
const now = new Date().toISOString();
task.status = 'completed';
task.completedAt = now;
task.updatedAt = now;
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('T02 completed');
`;

// What each kind's session is asked. Neither induced prompt mentions the
// digest, the spec or the close script.
const PROMPTS = {
  natural: `/spec.implement ${SLUG}`,
  'induced-prompt': 'What does src/greet.js export? Answer in one sentence.',
  'induced-turn': 'Run `node tools/close-task.js`, then run `git status --short`, and tell me what each printed.'
};

function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function taskStates(kind, now) {
  const closedAt = new Date(now - 60 * 60 * 1000).toISOString();
  if (kind === 'natural') return ['pending', 'pending'].map((status) => ({ status, completedAt: null }));
  if (kind === 'induced-prompt') return [1, 2].map(() => ({ status: 'completed', completedAt: closedAt }));
  return [{ status: 'completed', completedAt: closedAt }, { status: 'in_progress', completedAt: null }];
}

/**
 * Build one fixture. Returns what a runner needs: where it is, what to ask,
 * and where its hooks will record.
 *
 *   { kind, slug, base, root, activityHome, prompt }
 *
 * `base` holds the repository (`root`) and the activity home side by side, so
 * removing `base` removes every trace of the fixture.
 */
function makeFixture({ kind, dir = null, now = Date.now() } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`unknown kind "${kind}" — one of: ${KINDS.join(', ')}`);
  const base = dir ? path.resolve(dir) : fs.mkdtempSync(path.join(os.tmpdir(), `frame-spec-close-${kind}-`));
  const root = path.join(base, 'project');
  const activityHome = path.join(base, 'activity');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(activityHome, { recursive: true });
  const created = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const worked = kind !== 'natural'; // the code and the outcome are already there

  // ── the project ──
  write(root, 'package.json', `${JSON.stringify({
    name: 'greeting-fixture', version: '0.0.0', private: true, scripts: { test: 'node --test test/' }
  }, null, 2)}\n`);
  write(root, 'src/index.js', '\'use strict\';\n\nmodule.exports = {};\n');
  write(root, 'test/smoke.test.js', SMOKE_TEST_JS);
  if (worked) {
    write(root, 'src/greet.js', GREET_JS);
    write(root, 'test/greet.test.js', GREET_TEST_JS);
  }
  if (kind === 'induced-turn') write(root, 'tools/close-task.js', closeTaskScript());

  // ── .frame/ ──
  write(root, '.frame/.gitignore', FRAME_GITIGNORE);
  write(root, '.frame/config.json', `${JSON.stringify({
    version: '1.0', name: 'greeting-fixture', project: { commands: { test: 'npm test' } }
  }, null, 2)}\n`);
  const states = taskStates(kind, now);
  write(root, '.frame/tasks.json', JSON.stringify({
    project: 'greeting-fixture',
    version: '2.0',
    lastUpdated: created,
    tasks: TASKS.map((t, i) => ({
      id: `task-spec-${SLUG}-T0${t.n}`,
      title: t.title,
      description: '',
      source: `spec:${SLUG}:T0${t.n}`,
      status: states[i].status,
      priority: 'medium',
      category: 'feature',
      context: `From spec: ${SLUG}`,
      createdAt: created,
      updatedAt: states[i].completedAt || created,
      completedAt: states[i].completedAt
    })),
    metadata: { totalCreated: TASKS.length, totalCompleted: states.filter((s) => s.status === 'completed').length }
  }, null, 2));

  const specDir = `.frame/specs/${SLUG}`;
  write(root, `${specDir}/spec.md`, SPEC_MD);
  write(root, `${specDir}/plan.md`, PLAN_MD);
  write(root, `${specDir}/tasks.md`, TASKS_MD);
  if (worked) write(root, `${specDir}/outcome.md`, OUTCOME_MD);
  write(root, `${specDir}/status.json`, `${JSON.stringify({
    slug: SLUG,
    title: TITLE,
    phase: { natural: 'tasks_generated', 'induced-prompt': 'done', 'induced-turn': 'implementing' }[kind],
    generated_task_ids: TASKS.map((t) => `task-spec-${SLUG}-T0${t.n}`),
    ai_tool: 'claude-code',
    created_at: created,
    updated_at: created,
    last_phase_at: created,
    implement_mode: 'autonomous'
  }, null, 2)}\n`);

  // ── what Frame installs, from Frame's own code ──
  structureBootstrap.copyParserScripts(root);
  commandStaging.stageCommandFiles(root);
  write(root, '.claude/settings.json', `${JSON.stringify({ hooks: SPEC_HINT_HOOKS }, null, 2)}\n`);

  if (kind !== 'natural') {
    write(root, closeState.STATE_REL, JSON.stringify({
      version: closeState.STATE_VERSION, baseline: BACKDATED_BASELINE, tasks: { mtimeMs: 0, size: 0 }, closed: []
    }));
  }

  // ── a clean tree on the spec's own branch ──
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('checkout', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=Frame Fixture', '-c', 'user.email=fixture@frame.invalid', 'commit', '-q', '-m', `fixture: ${kind}`);
  git('checkout', '-q', '-b', `feat/${SLUG}`);
  // The session commits under an identity of its own, never the user's.
  git('config', 'user.name', 'Fixture Agent');
  git('config', 'user.email', 'agent@frame.invalid');

  return { kind, slug: SLUG, base, root, activityHome, prompt: PROMPTS[kind] };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const kind = args.find((a) => !a.startsWith('--'));
  const dirAt = args.indexOf('--dir');
  try {
    const fixture = makeFixture({ kind, dir: dirAt >= 0 ? args[dirAt + 1] : null });
    process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\nUsage: make-fixture.js <${KINDS.join('|')}> [--dir <path>]\n`);
    process.exit(1);
  }
}

module.exports = { makeFixture, KINDS, SLUG, PROMPTS, BACKDATED_BASELINE };
