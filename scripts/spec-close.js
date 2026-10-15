#!/usr/bin/env node
/**
 * Spec close step — check one spec.
 *
 * The step an agent runs when a spec's last task completes: it says what
 * closing still owes, and checks what is already there.
 *
 *   node scripts/spec-close.js <slug>             # task count, then one line per close item
 *   node scripts/spec-close.js <slug> --json      # the same, as one object
 *   node scripts/spec-close.js <slug> --strict    # exit 1 when anything is missing or malformed
 *
 * Why a script and not a paragraph: the digest's first sentence is what every
 * hint carries, capped at 280 characters, and nothing checked it. Of 50
 * digests measured, 12 overflow and reach the next agent cut mid-thought. The
 * instruction "keep the first sentence short" was already in the template.
 *
 * What it deliberately does not do:
 *   - write the digest. Frame makes no model call; the agent that did the
 *     work writes it, from outcome.md.
 *   - set a phase. `done` is derived from task state alone and stays that
 *     way: a spec held back for a missing digest would lose its file history
 *     in the index and raise in-flight warnings for work that is finished.
 *   - fail. The exit code is 0 unless `--strict`: an agent in an unattended
 *     run stops when a check fails, and a long sentence is not worth a run.
 *   - print a file's content. Paths, counts and named defects only.
 *
 * It writes nothing but one `spec.close_checked` row in the activity record.
 *
 * FRAME_PROJECT_ROOT lets the same script run from .frame/bin/ inside a user
 * project. Dependency-free plain node.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const closeState = require('./spec-close-state');

// The sentence rule and the cap are spec-index.js's, required rather than
// copied, so "what the check measures" cannot drift from "what a hint
// carries". Guarded: an older .frame/bin generation of spec-index.js has no
// such exports, and then the length check says so instead of guessing.
let specIndex = null;
try {
  specIndex = require('./spec-index');
} catch {
  /* older or missing generation — the first-sentence check is skipped, visibly */
}
const DIGEST_LINE_CAP = (specIndex && specIndex.DIGEST_LINE_CAP) || 280;
const CAN_MEASURE = Boolean(specIndex
  && typeof specIndex.firstSentence === 'function' && typeof specIndex.firstParagraph === 'function');

const CHAIN_LINE = 'Chain: spec.md → plan.md → tasks.md → outcome.md';

// The shape an agent writes. The implement template carries the same block,
// because an agent that never runs this script must still know it; a test
// fails when the two differ.
const DIGEST_SHAPE = [
  '---',
  'keywords: <3-8 comma-separated concepts, reuse spec.md\'s line if present>',
  'related: <comma-separated slugs, or omit>',
  'supersedes: <slug, or omit>',
  '---',
  '<≤15 lines: what was done · why this path won (name the rejected',
  'alternatives) · the result · rules established for future work>',
  '',
  CHAIN_LINE
].join('\n');

function toPosix(p) { return String(p).split(path.sep).join('/'); }

function resolveRoot() {
  if (process.env.FRAME_PROJECT_ROOT) return path.resolve(process.env.FRAME_PROJECT_ROOT);
  // Shipped copy lives in <project>/.frame/bin/ — walk two up from there.
  if (path.basename(__dirname) === 'bin' && path.basename(path.dirname(__dirname)) === '.frame') {
    return path.dirname(path.dirname(__dirname));
  }
  return path.join(__dirname, '..');
}

function specDir(root, slug) { return path.join(root, '.frame', 'specs', slug); }

// ─── the digest check ─────────────────────────────────────

/**
 * Named defects of one digest, in the order a reader would fix them.
 * Each is `{ code, message }`; the message says what to change and never
 * quotes the file.
 */
function digestDefects(md) {
  const defects = [];
  const text = String(md || '');
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!fm) {
    defects.push({
      code: 'no-front-matter',
      message: 'no front-matter block — start the file with "---", a "keywords:" line, and "---"'
    });
  } else if (!/^keywords\s*:\s*\S/im.test(fm[1])) {
    defects.push({
      code: 'no-keywords',
      message: 'no "keywords:" line in the front-matter — list 3-8 comma-separated concepts'
    });
  }

  const body = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
  if (CAN_MEASURE) {
    const sentence = specIndex.firstSentence(specIndex.firstParagraph(body), Infinity);
    if (sentence.length > DIGEST_LINE_CAP) {
      defects.push({
        code: 'first-sentence-too-long',
        message: `first sentence is ${sentence.length} characters — a hint carries at most ${DIGEST_LINE_CAP} and cuts the rest, ` +
          'so make the first sentence say what was done on its own'
      });
    }
  }

  if (!/^Chain:\s*\S/m.test(body)) {
    defects.push({ code: 'no-chain-line', message: `no "Chain:" line — end the file with: ${CHAIN_LINE}` });
  }
  return defects;
}

// What each close item is checked for once it exists, and what to write when
// it does not. Keyed by the item's id in spec-close-state.js's CLOSE_ITEMS; an
// item with no entry here is reported as present or missing and nothing more.
const ITEM_CHECKS = {
  digest: {
    file: 'digest.md',
    defects: digestDefects,
    shape: DIGEST_SHAPE,
    howTo: 'from outcome.md\'s actuals, not plan.md\'s intent',
    // What an "ok" here does not cover. Said out loud: an unchecked length
    // reported as fine is the false assurance this script exists to remove.
    unchecked: () => (CAN_MEASURE ? [] : ['first-sentence length — the spec-index.js beside this script predates the check'])
  }
};

// ─── one spec ─────────────────────────────────────────────

/**
 * Everything this script knows about one spec, as data. Pure apart from
 * reading disk: no output, no activity row.
 */
function checkSpec(root, slug) {
  if (!closeState.SLUG_RE.test(String(slug)) || !fs.existsSync(specDir(root, slug))) {
    return { slug: String(slug), error: 'unknown-spec' };
  }
  const tasks = closeState.readTasks(root);
  const counts = tasks ? closeState.specTaskCounts(tasks).get(slug) : null;
  const total = counts ? counts.total : 0;
  const completed = counts ? counts.completed : 0;
  const closed = total > 0 && completed === total;
  const missing = closeState.missingItems(root, slug);

  const items = closeState.CLOSE_ITEMS.map((item) => {
    const check = ITEM_CHECKS[item.id] || {};
    const rel = check.file ? toPosix(path.join('.frame', 'specs', slug, check.file)) : null;
    if (missing.includes(item.id)) {
      // Nothing is owed before the last task completes.
      return { id: item.id, label: item.label, path: rel, status: closed ? 'missing' : 'not-due', defects: [], unchecked: [] };
    }
    let defects = [];
    if (check.defects && check.file) {
      let md = null;
      try { md = fs.readFileSync(path.join(specDir(root, slug), check.file), 'utf8'); } catch { /* unreadable → no named defects */ }
      if (md !== null) defects = check.defects(md);
    }
    const unchecked = check.unchecked ? check.unchecked() : [];
    return { id: item.id, label: item.label, path: rel, status: defects.length ? 'malformed' : 'ok', defects, unchecked };
  });

  let verdict = 'ok';
  if (items.some((i) => i.status === 'malformed')) verdict = 'malformed';
  else if (items.some((i) => i.status === 'missing')) verdict = 'missing';
  else if (items.some((i) => i.status === 'not-due')) verdict = 'not-due';

  return {
    slug,
    tasks: { total, completed, readable: tasks !== null },
    closed,
    verdict,
    defects: items.reduce((n, i) => n + i.defects.length, 0),
    items
  };
}

// ─── output ───────────────────────────────────────────────

function selfCommand(root, slug) {
  return `node ${closeState.closeScriptPath(root)} ${slug}`;
}

function taskLine(result) {
  const { total, completed, readable } = result.tasks;
  if (!readable) return `${result.slug}: .frame/tasks.json could not be read — task state unknown`;
  if (!total) return `${result.slug}: no tasks in .frame/tasks.json — not closed`;
  return `${result.slug}: ${completed} of ${total} task${total === 1 ? '' : 's'} completed — ${result.closed ? 'closed' : 'not closed yet'}`;
}

function textReport(root, result) {
  if (result.error) return [`No spec "${result.slug}" under .frame/specs/`];
  const lines = [taskLine(result)];
  let again = false;
  for (const item of result.items) {
    const check = ITEM_CHECKS[item.id] || {};
    if (item.status === 'ok') {
      lines.push(`${item.id}: ok — ${item.path || item.label}`);
    } else if (item.status === 'not-due') {
      lines.push(`${item.id}: not due — it is written when the last task completes`);
    } else if (item.status === 'missing') {
      again = true;
      if (check.shape) {
        lines.push(`${item.id}: missing — write ${item.path}${check.howTo ? ` ${check.howTo}` : ''}, in this shape:`, '', check.shape, '');
      } else {
        lines.push(`${item.id}: missing`);
      }
    } else {
      again = true;
      lines.push(`${item.id}: ${item.defects.length} defect${item.defects.length === 1 ? '' : 's'} — ${item.path || item.label}`);
      for (const d of item.defects) lines.push(`  - ${d.message}`);
    }
    for (const what of item.unchecked || []) lines.push(`  (not checked: ${what})`);
  }
  if (again) lines.push(`Then run this again: ${selfCommand(root, result.slug)}`);
  return lines;
}

function record(root, result) {
  // A spec that is not closed and has nothing to check produced no verdict.
  if (result.error || result.verdict === 'not-due') return;
  try {
    const activity = require('./activity-log');
    activity.appendSync(activity.projectKey(root), {
      ev: 'spec.close_checked',
      kind: 'action',
      host: 'cli',
      slug: result.slug,
      verdict: result.verdict,
      defects: result.defects
    });
  } catch {
    /* older .frame/bin generation, or an unwritable home — the check still ran */
  }
}

function main(argv) {
  const flags = argv.filter((a) => a.startsWith('--'));
  const slug = argv.find((a) => !a.startsWith('--'));
  const strict = flags.includes('--strict');
  if (!slug) {
    process.stderr.write('Usage: spec-close.js <slug> [--json] [--strict]\n');
    return strict ? 1 : 0;
  }
  const root = resolveRoot();
  const result = checkSpec(root, slug);
  record(root, result);

  if (flags.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.error) {
    process.stderr.write(`${textReport(root, result).join('\n')}\n`);
  } else {
    process.stdout.write(`${textReport(root, result).join('\n')}\n`);
  }
  const wrong = Boolean(result.error) || result.verdict === 'missing' || result.verdict === 'malformed';
  return strict && wrong ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    // Never a stack trace into an agent's turn, and never a failed command
    // over a check that could not run.
    process.stderr.write(`spec-close could not run: ${e && e.message ? e.message : 'unknown error'}\n`);
    process.exitCode = process.argv.includes('--strict') ? 1 : 0;
  }
}

module.exports = { DIGEST_SHAPE, CHAIN_LINE, DIGEST_LINE_CAP, ITEM_CHECKS, digestDefects, checkSpec, textReport };
