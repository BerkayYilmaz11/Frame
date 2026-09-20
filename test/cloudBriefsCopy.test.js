/**
 * cloudBriefsCopy tests — the words the cloud Briefs view says.
 * Runs with Node's built-in runner: `npm test` (node --test test/).
 * Pure: no DOM, no Electron.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const copy = require('../src/renderer/cloudBriefsCopy');

const ME = 'u-me';
const OTHER = 'u-other';
// Noon UTC, so the date reads the same in every viewer time zone.
const AT = '2026-09-10T12:00:00.000Z';

function ev(event, data = {}, actorId = ME) {
  return { id: 'e1', at: AT, actorId, event, data };
}

function sentence(event, data, actorId) {
  return copy.eventSentence(ev(event, data, actorId), ME).sentence;
}

// ─── Columns ──────────────────────────────────────────────────

test('groupByColumn groups by status and keeps the list order', () => {
  const briefs = [
    { id: 'a', status: 'done' },
    { id: 'b', status: 'backlog' },
    { id: 'c', status: 'active' },
    { id: 'd', status: 'backlog' },
    { id: 'e', status: 'closed' },
  ];
  const groups = copy.groupByColumn(briefs);
  assert.deepEqual(groups.backlog.map((b) => b.id), ['b', 'd']);
  assert.deepEqual(groups.active.map((b) => b.id), ['c']);
  assert.deepEqual(groups.done.map((b) => b.id), ['a']);
  assert.deepEqual(groups.closed.map((b) => b.id), ['e']);
});

test('groupByColumn puts an unknown status in Backlog and survives no list', () => {
  assert.deepEqual(copy.groupByColumn([{ id: 'x', status: 'weird' }]).backlog.map((b) => b.id), ['x']);
  assert.deepEqual(copy.groupByColumn(undefined), { backlog: [], active: [], done: [], closed: [] });
});

test('the columns are Backlog / Active / Done, with hints on the two a brief moves into by itself', () => {
  assert.deepEqual(copy.COLUMNS.map((c) => c.title), ['Backlog', 'Active', 'Done']);
  assert.equal(copy.COLUMNS[0].hint, undefined);
  assert.ok(copy.COLUMNS[1].hint && copy.COLUMNS[2].hint);
});

// ─── Labels ───────────────────────────────────────────────────

test('kind, status and priority labels', () => {
  assert.equal(copy.KIND_COPY.proposal.badge, 'PROPOSAL');
  assert.equal(copy.KIND_COPY.work.label, 'Work');
  assert.equal(copy.statusLabel('active'), 'Active');
  assert.equal(copy.statusLabel('nope'), 'Backlog');
  assert.equal(copy.priorityLabel('high'), 'High');
  assert.equal(copy.priorityLabel(null), '');
});

// ─── Ending facts ─────────────────────────────────────────────

test('endingFact: closed wins over dropped over recorded; open briefs have none', () => {
  const all = {
    closedAt: AT, closeReason: 'shipped',
    droppedAt: AT, dropReason: 'dup',
    recordedDecisionAt: AT,
  };
  assert.deepEqual(copy.endingFact(all), { label: 'Closed', reason: 'shipped', at: AT });
  assert.deepEqual(copy.endingFact({ ...all, closedAt: null }), { label: 'Dropped', reason: 'dup', at: AT });
  assert.deepEqual(
    copy.endingFact({ recordedDecisionAt: AT, closedAt: null, droppedAt: null }),
    { label: 'Recorded as decision', reason: null, at: AT }
  );
  assert.equal(copy.endingFact({ closedAt: null, droppedAt: null, recordedDecisionAt: null }), null);
});

test('endingLine reads as the card shows it', () => {
  assert.equal(copy.endingLine({ closedAt: AT, closeReason: 'shipped' }), 'Closed: shipped');
  assert.equal(copy.endingLine({ droppedAt: AT, dropReason: null }), 'Dropped');
  assert.equal(copy.endingLine({ recordedDecisionAt: AT }), 'Recorded as decision');
  assert.equal(copy.endingLine({}), '');
});

// ─── People and dates ─────────────────────────────────────────

test('actorLabel says You only for the caller', () => {
  assert.equal(copy.actorLabel(ME, ME), 'You');
  assert.equal(copy.actorLabel(OTHER, ME), 'A workspace member');
  assert.equal(copy.actorLabel('', ''), 'A workspace member');
});

test('formatDate reads day, month and year, and is empty for no date', () => {
  const out = copy.formatDate(AT);
  assert.match(out, /10/);
  assert.match(out, /Sep/);
  assert.match(out, /2026/);
  assert.equal(copy.formatDate(null), '');
  assert.equal(copy.formatDate('not a date'), '');
});

// ─── History sentences ────────────────────────────────────────

test('eventSentence names the actor and carries the date', () => {
  const mine = copy.eventSentence(ev('comment-added', {}, ME), ME);
  assert.equal(mine.sentence, 'You commented.');
  assert.equal(mine.date, copy.formatDate(AT));
  assert.equal(sentence('comment-added', {}, OTHER), 'A workspace member commented.');
});

test('eventSentence covers every event the web knows', () => {
  const cases = [
    ['created', {}, 'You created this brief as a proposal.'],
    ['created', { kind: 'work' }, 'You created this brief as work.'],
    ['created', { kind: 'work', priority: 'high' }, 'You created this brief as work with high priority.'],
    ['decided', {}, 'You transformed this proposal to work.'],
    ['decided', { priority: 'low' }, 'You transformed this proposal to work with low priority.'],
    ['dropped', {}, 'You dropped this proposal.'],
    ['dropped', { reason: 'dup' }, 'You dropped this proposal: dup.'],
    ['decision-recorded', {}, 'You recorded this proposal as a decision.'],
    ['updated', {}, 'You saved this brief unchanged.'],
    ['updated', { title: 'x' }, 'You changed the title.'],
    ['updated', { title: 'x', body: 'y' }, 'You changed the title and the description.'],
    [
      'updated',
      { title: 'x', body: 'y', priority: 'medium', targetBranch: 'dev' },
      'You changed the title, the description, the priority to medium and the target branch to dev.',
    ],
    ['part-added', {}, 'You added a part.'],
    ['part-added', { title: 'API' }, 'You added the part “API”.'],
    ['part-updated', {}, 'You edited a part.'],
    ['part-removed', {}, 'You removed a part.'],
    ['part-removed', { title: 'API' }, 'You removed the part “API”.'],
    ['parts-reordered', {}, 'You reordered the parts.'],
    ['attachment-added', {}, 'You added an attachment.'],
    ['attachment-added', { title: 'Doc' }, 'You attached “Doc”.'],
    ['attachment-removed', {}, 'You removed an attachment.'],
    ['attachment-removed', { title: 'Doc' }, 'You removed the attachment “Doc”.'],
    ['comment-added', {}, 'You commented.'],
    ['closed', {}, 'You closed this work.'],
    ['closed', { reason: 'shipped' }, 'You closed this work: shipped.'],
    ['reopened', {}, 'You reopened this work.'],
    ['reopened', { ended: 'dropped' }, 'You reopened this dropped proposal.'],
    ['reopened', { ended: 'recorded' }, 'You reopened this proposal recorded as a decision.'],
    ['milestone-set', { milestoneId: 'm1' }, 'You moved this brief into a milestone.'],
    ['milestone-set', { milestoneId: null }, 'You took this brief out of its milestone.'],
    ['assignee-set', { assigneeId: null }, 'You cleared the assignee.'],
    ['assignee-set', { assigneeId: ME }, 'You took this brief on.'],
  ];
  for (const [event, data, expected] of cases) {
    assert.equal(sentence(event, data, ME), expected, `${event} ${JSON.stringify(data)}`);
  }
});

test('assignee-set from someone else says who it went to', () => {
  assert.equal(sentence('assignee-set', { assigneeId: ME }, OTHER), 'A workspace member assigned this brief to you.');
  assert.equal(
    sentence('assignee-set', { assigneeId: 'u-third' }, OTHER),
    'A workspace member assigned this brief to a workspace member.'
  );
});

test('an event this port does not know still reads as a sentence', () => {
  assert.equal(sentence('something-new', {}, ME), 'You changed this brief.');
  assert.equal(copy.eventSentence({ event: 'closed', actorId: OTHER, data: null }, ME).sentence, 'A workspace member closed this work.');
});

// ─── Errors ───────────────────────────────────────────────────

test('reasonMessage has a sentence for every read failure and a fallback', () => {
  for (const reason of ['network', 'notFound', 'notConnected', 'unauthorized', 'noWorkspace']) {
    assert.ok(copy.reasonMessage(reason).length > 0);
  }
  assert.match(copy.reasonMessage('other'), /Try again/);
  assert.notEqual(copy.reasonMessage('network'), copy.reasonMessage('other'));
});

// ─── New brief ────────────────────────────────────────────────

test('submitLabel follows the kind, and says Creating… while pending', () => {
  assert.equal(copy.submitLabel('work', false), 'Create work');
  assert.equal(copy.submitLabel('proposal', false), 'Create proposal');
  assert.equal(copy.submitLabel('work', true), 'Creating…');
  assert.equal(copy.submitLabel('proposal', true), 'Creating…');
});

test('createErrorMessage turns reasons into the web\'s sentences', () => {
  assert.equal(copy.createErrorMessage('badRequest'), 'Check the title, description and links, then try again.');
  assert.equal(copy.createErrorMessage('notFound'), 'This project does not exist.');
  assert.equal(copy.createErrorMessage('network'), copy.reasonMessage('network'));
  assert.equal(copy.createErrorMessage('notConnected'), copy.reasonMessage('notConnected'));
  assert.equal(copy.createErrorMessage('other'), 'Something went wrong. Try again.');
  assert.equal(copy.createErrorMessage(undefined), 'Something went wrong. Try again.');
});

test('attachmentNotice names the brief and adds the error sentence', () => {
  assert.equal(
    copy.attachmentNotice(12, 'network'),
    `Brief #12 was created, but some links were not attached. ${copy.reasonMessage('network')}`,
  );
  assert.match(copy.attachmentNotice(3, 'notFound'), /^Brief #3 was created, but some links were not attached\. This brief does not exist\.$/);
  assert.match(copy.attachmentNotice(3, 'other'), /Something went wrong\. Try again\.$/);
});

test('the form\'s fixed sentences match the web', () => {
  assert.equal(copy.TITLE_REQUIRED, 'Give the brief a title.');
  assert.equal(copy.LINK_TITLE_REQUIRED, 'Each link needs a title.');
  assert.equal(copy.INVALID_LINK, 'That is not a full link. It should start with https://.');
  assert.equal(copy.AI_LINKS_TITLE, 'AI conversations & links');
});
