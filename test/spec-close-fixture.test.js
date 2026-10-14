/**
 * Spec close step — fixture and runner tests.
 * Runs with Node's built-in runner: `npm test` (node --test test/).
 *
 * The test run (scripts/eval/spec-close/) spends real model time, so
 * everything about it that can be checked without an agent is checked here:
 * each fixture kind is built and driven by piping hook payloads through the
 * fixture's own `.frame/bin/`, using the hook commands exactly as its
 * `.claude/settings.json` registers them. If a fixture cannot produce the
 * reminder with no agent in the loop, a session run on it measures nothing.
 *
 * The runner's own arithmetic — reading a transcript, building the launch
 * line, the table — is pure and tested directly. No session is started.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { makeFixture, KINDS, SLUG, PROMPTS } = require('../scripts/eval/spec-close/make-fixture');
const runner = require('../scripts/eval/spec-close/run');
const { SPEC_HINT_HOOKS } = require('../src/shared/frameTemplates');

const POSIX = process.platform !== 'win32';
const skip = !POSIX && 'the registered hook commands are sh';

const REMINDER = `Spec "${SLUG}" has every task completed but no digest — run: node .frame/bin/spec-close.js ${SLUG}`;
const GOOD_DIGEST = [
  '---', 'keywords: greeting, greet, helper', '---',
  'Added a greet(name) helper and its tests.', '',
  'Chain: spec.md → plan.md → tasks.md → outcome.md', ''
].join('\n');

function withFixture(kind, fn) {
  const fixture = makeFixture({ kind });
  try {
    return fn(fixture);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
}

/** The fixture's environment for anything run inside it: its own activity home, nobody else's root. */
function envOf(fixture) {
  const env = { ...process.env, FRAME_ACTIVITY_HOME: fixture.activityHome };
  delete env.FRAME_PROJECT_ROOT;
  delete env.FRAME_SPEC_HINT_MODE;
  return env;
}

/**
 * Run one registered hook the way Claude Code would: the command string from
 * the fixture's own settings, through `sh -c`, in the project, payload on
 * stdin. Returns the additionalContext, or null for no output.
 */
function hook(fixture, event, script, payload) {
  const settings = JSON.parse(fs.readFileSync(path.join(fixture.root, '.claude', 'settings.json'), 'utf8'));
  const command = settings.hooks[event].flatMap((entry) => entry.hooks).map((h) => h.command)
    .find((c) => c.includes(`.frame/bin/${script}`));
  assert.ok(command, `${event} registers ${script}`);
  const stdout = execFileSync('sh', ['-c', command], {
    cwd: fixture.root, input: JSON.stringify({ cwd: fixture.root, ...payload }), encoding: 'utf8', env: envOf(fixture)
  });
  return stdout.trim() ? JSON.parse(stdout).hookSpecificOutput.additionalContext : null;
}

const bash = (fixture, session, command) =>
  hook(fixture, 'PreToolUse', 'docs-hint.js pre-edit', { session_id: session, tool_name: 'Bash', tool_input: { command } });
const prompt = (fixture, session, text) =>
  hook(fixture, 'UserPromptSubmit', 'spec-hint.js prompt', { session_id: session, prompt: text });

const git = (fixture, ...args) => execFileSync('git', args, { cwd: fixture.root, encoding: 'utf8' }).trim();

function closeCheck(fixture) {
  return JSON.parse(execFileSync('node', [path.join(fixture.root, '.frame', 'bin', 'spec-close.js'), SLUG, '--json'], {
    cwd: fixture.root, encoding: 'utf8', env: { ...envOf(fixture), FRAME_ACTIVITY_HOME: path.join(fixture.base, 'measurement') }
  }));
}

const writeDigest = (fixture) =>
  fs.writeFileSync(path.join(fixture.root, '.frame', 'specs', SLUG, 'digest.md'), GOOD_DIGEST);

// ─── what every fixture is ────────────────────────────────

for (const kind of KINDS) {
  test(`${kind}: a clean project on the spec's branch, with what Frame installs`, { skip }, () => {
    withFixture(kind, (fixture) => {
      assert.equal(fixture.prompt, PROMPTS[kind]);
      assert.equal(git(fixture, 'status', '--porcelain'), '', 'pre-flight must have nothing to ask');
      assert.equal(git(fixture, 'branch', '--show-current'), `feat/${SLUG}`);
      assert.equal(git(fixture, 'remote'), '', 'no remote to push to');

      const settings = JSON.parse(fs.readFileSync(path.join(fixture.root, '.claude', 'settings.json'), 'utf8'));
      assert.deepEqual(settings, { hooks: SPEC_HINT_HOOKS }, 'the hooks are Frame\'s, not a copy of them');
      for (const file of ['spec-close.js', 'spec-close-state.js', 'docs-hint.js', 'spec-hint.js', 'spec-command-hint.js']) {
        assert.ok(fs.existsSync(path.join(fixture.root, '.frame', 'bin', file)), `.frame/bin/${file}`);
      }
      assert.ok(fs.existsSync(path.join(fixture.root, '.frame', 'runtime', 'commands', 'claude-code', 'spec.implement.md')));
      assert.equal(git(fixture, 'ls-files', '.frame/bin', '.frame/runtime'), '', 'machine-local folders stay out of the commit');

      const status = JSON.parse(fs.readFileSync(path.join(fixture.root, '.frame', 'specs', SLUG, 'status.json'), 'utf8'));
      assert.equal(status.implement_mode, 'autonomous');
      assert.ok(!fs.existsSync(path.join(fixture.root, '.frame', 'specs', SLUG, 'digest.md')), 'no fixture starts with a digest');
      assert.ok(!fixture.activityHome.startsWith(fixture.root), 'the activity home is beside the repository, not in it');
    });
  });
}

test('an unknown kind is refused', () => {
  assert.throws(() => makeFixture({ kind: 'surprise' }), /unknown kind/);
});

// ─── natural ──────────────────────────────────────────────

test('natural: nothing is said until both tasks close, then the next tool call says it', { skip }, () => {
  withFixture('natural', (fixture) => {
    assert.equal(closeCheck(fixture).verdict, 'not-due');

    // The session's first hook run is where reminders start for this project.
    assert.equal(prompt(fixture, 's', fixture.prompt), null);
    assert.equal(bash(fixture, 's', 'npm test'), null);

    // The command the user typed is staged by Frame's own hook, and the flow
    // it stages carries the digest step with the script where this project has it.
    hook(fixture, 'UserPromptSubmit', 'spec-command-hint.js prompt', { session_id: 's', prompt: fixture.prompt });
    const staged = fs.readFileSync(path.join(fixture.root, '.frame', 'runtime', 'prompts', `${SLUG}__spec.implement.md`), 'utf8');
    assert.match(staged, new RegExp(`2\\. You run \`node \\.frame/bin/spec-close\\.js ${SLUG}\``));

    // What the session does: both tasks completed, some time after the baseline.
    const file = path.join(fixture.root, '.frame', 'tasks.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const at = new Date(Date.now() + 5000).toISOString();
    for (const task of data.tasks) Object.assign(task, { status: 'completed', completedAt: at, updatedAt: at });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));

    assert.equal(bash(fixture, 's', 'git add -A'), REMINDER);
    assert.equal(closeCheck(fixture).verdict, 'missing');

    writeDigest(fixture);
    assert.equal(bash(fixture, 'another', 'git status'), null, 'absent once the digest is written');
    assert.equal(closeCheck(fixture).verdict, 'ok');
    assert.deepEqual(runner.closeRows(fixture.activityHome).reminders, 1);
  });
});

// ─── induced, prompt path ─────────────────────────────────

test('induced-prompt: the unrelated prompt carries the reminder, once', { skip }, () => {
  withFixture('induced-prompt', (fixture) => {
    assert.equal(closeCheck(fixture).verdict, 'missing');
    assert.ok(!/digest|spec|close/i.test(fixture.prompt), 'the prompt gives nothing away');

    assert.equal(prompt(fixture, 's', fixture.prompt), REMINDER);
    assert.equal(hook(fixture, 'UserPromptSubmit', 'spec-command-hint.js prompt', { session_id: 's', prompt: fixture.prompt }), null,
      'the other prompt hook has nothing to add');
    assert.equal(bash(fixture, 's', 'cat src/greet.js'), null, 'not repeated on the tool call that follows');

    writeDigest(fixture);
    assert.equal(prompt(fixture, 'another', fixture.prompt), null, 'absent once the digest is written');
    assert.equal(closeCheck(fixture).verdict, 'ok');

    const rows = runner.closeRows(fixture.activityHome);
    assert.equal(rows.reminders, 1);
    assert.deepEqual(rows.quiet, ['session-dedup']);
  });
});

// ─── induced, same-turn path ──────────────────────────────

test('induced-turn: the call that closes the task is silent; the next one carries the reminder', { skip }, () => {
  withFixture('induced-turn', (fixture) => {
    assert.equal(closeCheck(fixture).verdict, 'not-due');
    assert.equal(prompt(fixture, 's', fixture.prompt), null, 'nothing is closed when the prompt arrives');

    // PreToolUse runs before the command: the task is still open.
    assert.equal(bash(fixture, 's', 'node tools/close-task.js'), null);
    assert.equal(execFileSync('node', ['tools/close-task.js'], { cwd: fixture.root, encoding: 'utf8' }).trim(), 'T02 completed');

    assert.equal(bash(fixture, 's', 'git status --short'), REMINDER);
    assert.equal(prompt(fixture, 's', 'thanks'), null, 'not repeated at the next prompt');

    writeDigest(fixture);
    assert.equal(bash(fixture, 'another', 'git status --short'), null, 'absent once the digest is written');
    assert.equal(closeCheck(fixture).verdict, 'ok');
    assert.equal(runner.closeRows(fixture.activityHome).reminders, 1);
  });
});

test('rows are read whatever path the hook resolved the project by', { skip }, () => {
  // The pilot's first table read zero reminders off three sessions that had
  // each received one: the CLI hands hooks the resolved path (/private/var/…
  // on macOS, where the temp directory is a symlink), and the rows were filed
  // under that path's key while the runner looked under its own.
  withFixture('induced-prompt', (fixture) => {
    const elsewhere = { ...fixture, root: `${fixture.root}-as-the-hook-saw-it` };
    fs.symlinkSync(fixture.root, elsewhere.root);
    try {
      assert.equal(prompt(elsewhere, 's', fixture.prompt), REMINDER);
      const rows = runner.closeRows(fixture.activityHome);
      assert.equal(rows.reminders, 1);
    } finally {
      fs.rmSync(elsewhere.root, { force: true });
    }
  });
});

// ─── the runner, without a session ────────────────────────

test('--n is required: there is no default spend', () => {
  assert.throws(() => runner.parseArgs([]), /--n <count> is required/);
  assert.throws(() => runner.parseArgs(['--n', '0']), /--n/);
  assert.throws(() => runner.parseArgs(['--n', '1', '--kinds', 'natural,nope']), /unknown kind "nope"/);
  assert.throws(() => runner.parseArgs(['--n', '1', '--fast']), /unknown option --fast/);
  const opts = runner.parseArgs(['--n', '10', '--kinds', 'induced-turn', '--concurrency', '5', '--keep']);
  assert.deepEqual([opts.n, opts.kinds, opts.concurrency, opts.keep, opts.dryRun], [10, ['induced-turn'], 5, true, false]);
});

test('a session is launched as Frame launches an autonomous run, capped and cut off', () => {
  const args = runner.agentArgs({ prompt: 'hello', settingsPath: '/tmp/p.json', budget: 2, model: null });
  const after = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(after('-p'), 'hello');
  assert.equal(after('--max-budget-usd'), '2');
  assert.equal(after('--settings'), '/tmp/p.json');
  assert.equal(after('--permission-mode'), 'auto');
  assert.equal(after('--setting-sources'), 'project', 'the fixture\'s hooks, not the hooks of whoever runs this');
  assert.equal(after('--mcp-config'), '{"mcpServers":{}}');
  assert.ok(args.includes('--strict-mcp-config') && args.includes('--no-session-persistence'));
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.includes('--bare'), '--bare would skip the hooks under test');
  for (const rule of runner.DISALLOWED) assert.ok(args.includes(rule));
  assert.ok(!args.includes('--model'));
  assert.equal(runner.agentArgs({ prompt: 'x', settingsPath: 'p', budget: 1, model: 'some-model' }).slice(-2).join(' '), '--model some-model');
});

test('a session inherits nothing that ties it to the session it was started from', () => {
  const env = runner.sessionEnv({
    PATH: '/usr/bin', HOME: '/home/u',
    FRAME_PROJECT_ROOT: '/somewhere/else', FRAME_NODE: '/Applications/Frame.app/x', FRAME_SPEC_HINT_MODE: 'signal',
    CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'parent', CLAUDE_EFFORT: 'high', CLAUDE_CONFIG_DIR: '/home/u/.claude'
  }, { activityHome: '/fx/activity' });
  assert.deepEqual(Object.keys(env).sort(), ['CLAUDE_CONFIG_DIR', 'FRAME_ACTIVITY_HOME', 'FRAME_NODE', 'HOME', 'PATH']);
  assert.equal(env.FRAME_ACTIVITY_HOME, '/fx/activity');
  assert.equal(env.FRAME_NODE, process.execPath, 'set, so the implement flow leaves opening its report to Frame');
});

test('a transcript is read for cost, turns, tool calls and the two things a session can do about a digest', () => {
  const lines = [
    { type: 'system', subtype: 'init', model: 'some-model', session_id: 's' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'Bash', input: { command: 'node tools/close-task.js' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'T02 completed' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/p/.frame/specs/x/digest.md', content: '…' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node .frame/bin/spec-close.js x' } }] } },
    { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.4321, num_turns: 4, duration_ms: 61000 }
  ];
  const text = `${lines.map((l) => JSON.stringify(l)).join('\n')}\nnot json at all\n`;
  assert.deepEqual(runner.parseTranscript(text), {
    model: 'some-model', costUsd: 0.4321, turns: 4, durationMs: 61000, toolCalls: 3, tools: { Bash: 2, Write: 1 },
    resultSubtype: 'success', isError: false, ranCloseScript: 1, wroteDigest: 1
  });
  assert.equal(runner.parseTranscript('').toolCalls, 0);
  assert.equal(runner.parseTranscript('{"type":"result","subtype":"error_max_budget_usd","is_error":true}').resultSubtype, 'error_max_budget_usd');
});

test('the table counts a malformed digest as present but not ok', () => {
  const row = (kind, verdict, over = {}) => runner.summarize({
    id: `${kind}-01`, kind, verdict, defects: verdict === 'malformed' ? 1 : 0,
    transcript: { toolCalls: 4, turns: 3, costUsd: 0.5, durationMs: 1000, model: 'm', resultSubtype: 'success' },
    rows: { reminders: 1, quiet: [], checks: ['missing', 'ok'] }, timedOut: false, exitCode: 0, ...over
  });
  const results = [
    row('induced-prompt', 'ok'),
    row('induced-prompt', 'malformed'),
    row('induced-prompt', 'missing', { rows: { reminders: 1, quiet: [], checks: [] } }),
    row('induced-turn', 'ok', { timedOut: true })
  ];
  assert.equal(results[0].pass, true);
  assert.equal(results[1].pass, false);
  assert.equal(results[3].result, 'timeout');
  assert.equal(runner.table(results), [
    '| kind | sessions | digest ok | digest present | reminder fired | ran the close script | median tool calls | cost |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| induced-prompt | 3 | 1 | 2 | 3 | 2 | 4 | $1.50 |',
    '| induced-turn | 1 | 1 | 1 | 1 | 1 | 4 | $0.50 |'
  ].join('\n'));
});
