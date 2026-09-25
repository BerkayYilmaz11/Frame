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

test('shaped reads as the web says it, for one part and for several', () => {
  assert.equal(sentence('shaped', { count: 3 }, ME), 'You shaped this brief into 3 parts.');
  assert.equal(sentence('shaped', { count: 1 }, OTHER), 'A workspace member shaped this brief into 1 part.');
  assert.equal(sentence('shaped', {}, ME), 'You shaped this brief into 0 parts.');
});

test('shapedLine dates a shaped brief and is empty for an unshaped one', () => {
  assert.equal(copy.shapedLine(AT), `Shaped ${copy.formatDate(AT)}`);
  assert.equal(copy.shapedLine(null), '');
  assert.equal(copy.shapedLine('nope'), '');
});

test('started reads as the web says it, for one part and for several', () => {
  assert.equal(sentence('started', { count: 3 }, ME), 'You started work on this brief\'s 3 parts.');
  assert.equal(sentence('started', { count: 1 }, OTHER), 'A workspace member started work on this brief\'s 1 part.');
  assert.equal(sentence('started', {}, ME), 'You started work on this brief\'s 0 parts.');
});

test('startedLine dates a started brief and is empty for an unstarted one', () => {
  assert.equal(copy.startedLine(AT), `Started ${copy.formatDate(AT)}`);
  assert.equal(copy.startedLine(null), '');
  assert.equal(copy.startedLine('nope'), '');
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

// ─── Discussions ──────────────────────────────────────────────

test('discussion-recorded reads as the web says it, with and without a provider', () => {
  const e = (data) => ({ event: 'discussion-recorded', actorId: 'u1', at: '2026-09-21T10:00:00.000Z', data });
  assert.equal(copy.eventSentence(e({ summary: 'S', provider: 'Claude Code' }), 'u1').sentence, 'You recorded a discussion held with Claude Code.');
  assert.equal(copy.eventSentence(e({ summary: 'S' }), 'u2').sentence, 'A workspace member recorded a discussion.');
});

test('discussionRecords keeps the records only, newest first, with who, when and what', () => {
  const events = [
    { id: 'e1', event: 'created', actorId: 'u1', at: '2026-09-01T10:00:00.000Z', data: { kind: 'proposal' } },
    { id: 'e2', event: 'discussion-recorded', actorId: 'u1', at: '2026-09-02T10:00:00.000Z', data: { summary: ' First ', provider: 'Codex CLI' } },
    { id: 'e3', event: 'discussion-recorded', actorId: 'u2', at: '2026-09-05T10:00:00.000Z', data: { summary: 'Second', url: 'https://claude.ai/artifact/y' } },
  ];
  const records = copy.discussionRecords(events, 'u1');
  assert.deepEqual(records.map((r) => r.id), ['e3', 'e2']);
  assert.deepEqual(records[1], { id: 'e2', date: copy.formatDate('2026-09-02T10:00:00.000Z'), actor: 'You', provider: 'Codex CLI', summary: 'First', url: '', inLinks: false });
  assert.equal(records[0].actor, 'A workspace member');
  assert.equal(records[0].url, 'https://claude.ai/artifact/y');
  assert.equal(events[0].id, 'e1'); // the caller's array is not reordered
});

test('discussionRecords drops a non-http(s) url and a record without a summary, and survives no list', () => {
  const records = copy.discussionRecords([
    { id: 'a', event: 'discussion-recorded', data: { summary: '<script>x</script>', url: 'javascript:alert(1)' } },
    { id: 'b', event: 'discussion-recorded', data: { summary: '   ' } },
    { id: 'c', event: 'discussion-recorded', data: null },
  ]);
  assert.deepEqual(records.map((r) => [r.id, r.url, r.summary]), [['a', '', '<script>x</script>']]);
  assert.deepEqual(copy.discussionRecords(undefined), []);
});

test('the Discuss labels', () => {
  assert.equal(copy.DISCUSS_LABEL, 'Discuss');
  assert.equal(copy.GO_TO_DISCUSSION_LABEL, 'Go to discussion');
  assert.equal(copy.DISCUSSIONS_TITLE, 'Discussions');
});

test('discussErrorMessage has a sentence for each reason and a fallback', () => {
  for (const reason of ['notAnOpenProposal', 'unknownTool', 'notFound', 'network', 'notConnected', 'unauthorized', 'noWorkspace']) {
    assert.notEqual(copy.discussErrorMessage(reason), copy.discussErrorMessage('other'), reason);
  }
  assert.match(copy.discussErrorMessage('notAnOpenProposal'), /open proposal/);
  assert.match(copy.discussErrorMessage('whatever'), /could not start/);
});

test('discussionCountLabel counts records and is empty for none or unknown', () => {
  assert.equal(copy.discussionCountLabel(1), '1 discussion recorded');
  assert.equal(copy.discussionCountLabel(2), '2 discussions recorded');
  for (const none of [0, null, undefined, 1.5]) assert.equal(copy.discussionCountLabel(none), '', String(none));
});

test('discussingIn names the lane', () => {
  assert.equal(copy.discussingIn('Frame 3'), 'Discussing in Frame 3');
  assert.equal(copy.discussingIn(''), 'Discussing');
});

test('proposalStage follows the four states', () => {
  const proposal = { kind: 'proposal', status: 'backlog' };
  assert.equal(copy.proposalStage({ brief: proposal, laneOpen: false, discussionCount: 0 }), 'discuss');
  assert.equal(copy.proposalStage({ brief: proposal, laneOpen: false, discussionCount: null }), 'discuss');
  assert.equal(copy.proposalStage({ brief: proposal, laneOpen: true, discussionCount: 2 }), 'discussing');
  assert.equal(copy.proposalStage({ brief: proposal, laneOpen: false, discussionCount: 1 }), 'decide');
  assert.equal(copy.proposalStage({ brief: { kind: 'work', status: 'backlog' }, laneOpen: false, discussionCount: 1 }), 'none');
  assert.equal(copy.proposalStage({ brief: { kind: 'proposal', status: 'closed' }, laneOpen: false }), 'none');
  assert.equal(copy.proposalStage({ brief: { kind: 'work', status: 'active' }, laneOpen: true }), 'discussing');
});

// ─── Shape ────────────────────────────────────────────────────

test('workStage offers Shape only on open, unshaped work', () => {
  const work = { kind: 'work', status: 'backlog', shapedAt: null };
  assert.equal(copy.workStage({ brief: work, laneOpen: false }), 'shape');
  assert.equal(copy.workStage({ brief: { ...work, status: 'active' }, laneOpen: false }), 'shape');
  assert.equal(copy.workStage({ brief: { ...work, shapedAt: '2026-09-20T10:00:00.000Z', startedAt: '2026-09-25T10:00:00.000Z' }, laneOpen: false }), 'none');
  assert.equal(copy.workStage({ brief: { ...work, status: 'closed' }, laneOpen: false }), 'none');
  assert.equal(copy.workStage({ brief: { kind: 'proposal', status: 'backlog', shapedAt: null }, laneOpen: false }), 'none');
  assert.equal(copy.workStage({ brief: null, laneOpen: false }), 'none');
});

test('workStage offers Start Work on open, shaped, unstarted work, even with a lane open', () => {
  const shaped = { kind: 'work', status: 'backlog', shapedAt: '2026-09-20T10:00:00.000Z', startedAt: null };
  assert.equal(copy.workStage({ brief: shaped, laneOpen: false }), 'start');
  assert.equal(copy.workStage({ brief: shaped, laneOpen: true }), 'start');
});

test('workStage does not offer Start Work on a started, closed, unshaped or proposal brief', () => {
  const shaped = { kind: 'work', status: 'backlog', shapedAt: '2026-09-20T10:00:00.000Z', startedAt: null };
  assert.equal(copy.workStage({ brief: { ...shaped, status: 'active', startedAt: '2026-09-25T10:00:00.000Z' }, laneOpen: false }), 'none');
  assert.equal(copy.workStage({ brief: { ...shaped, status: 'closed' }, laneOpen: false }), 'none');
  assert.equal(copy.workStage({ brief: { ...shaped, shapedAt: null }, laneOpen: false }), 'shape');
  assert.equal(copy.workStage({ brief: { ...shaped, kind: 'proposal' }, laneOpen: false }), 'none');
});

test('workStage gives way to an open lane of either purpose', () => {
  assert.equal(copy.workStage({ brief: { kind: 'work', status: 'backlog', shapedAt: null }, laneOpen: true }), 'lane');
  assert.equal(copy.workStage({ brief: { kind: 'proposal', status: 'backlog' }, laneOpen: true }), 'lane');
});

test('laneLabel names the lane by its purpose, and a lane without one is a Discuss lane', () => {
  assert.equal(copy.laneLabel('shape', 'Frame 3'), 'Shaping in Frame 3');
  assert.equal(copy.laneLabel('shape', ''), 'Shaping');
  assert.equal(copy.laneLabel('discuss', 'Frame 3'), 'Discussing in Frame 3');
  assert.equal(copy.laneLabel(undefined, 'Frame 3'), 'Discussing in Frame 3');
});

test('shapedNotice names the brief and its part count, and leaves an unknown count out', () => {
  assert.equal(copy.shapedNotice(5, 1), 'Brief #5 was shaped into 1 part and is ready to run.');
  assert.equal(copy.shapedNotice(5, 3), 'Brief #5 was shaped into 3 parts and is ready to run.');
  assert.equal(copy.shapedNotice(5, undefined), 'Brief #5 was shaped and is ready to run.');
  assert.equal(copy.shapedNotice(5, 0), 'Brief #5 was shaped and is ready to run.');
  assert.equal(copy.OPEN_BRIEF_LABEL, 'Open brief');
});

test('partCountLabel counts a shaped card\'s parts by shape, and is empty for none or unknown', () => {
  assert.equal(copy.partCountLabel({ spec: 1, task: 0 }), '1 spec');
  assert.equal(copy.partCountLabel({ spec: 0, task: 1 }), '1 task');
  assert.equal(copy.partCountLabel({ spec: 2, task: 1 }), '2 specs · 1 task');
  assert.equal(copy.partCountLabel({ spec: 0, task: 3 }), '3 tasks');
  for (const none of [null, undefined, { spec: 0, task: 0 }]) assert.equal(copy.partCountLabel(none), '', String(none));
});

test('the Shape words', () => {
  assert.equal(copy.SHAPE_LABEL, 'Shape');
  assert.equal(copy.GO_TO_SHAPING_LABEL, 'Go to shaping');
  assert.match(copy.SHAPE_HINT, /approve/);
});

test('shapeErrorMessage has a sentence for each reason and a fallback', () => {
  for (const reason of ['notShapeable', 'unknownTool', 'notFound', 'network', 'notConnected', 'unauthorized', 'noWorkspace']) {
    assert.notEqual(copy.shapeErrorMessage(reason), copy.shapeErrorMessage('other'), reason);
  }
  assert.match(copy.shapeErrorMessage('notShapeable'), /not been shaped/);
  assert.match(copy.shapeErrorMessage('unauthorized'), /signed out/);
  assert.match(copy.shapeErrorMessage('whatever'), /could not start/);
});

test('newCommentsLabel and the Move to Work words', () => {
  assert.equal(copy.newCommentsLabel(1), '1 new comment');
  assert.equal(copy.newCommentsLabel(3), '3 new comments');
  assert.equal(copy.newCommentsLabel(0), '');
  assert.equal(copy.MOVE_TO_WORK_LABEL, 'Move to Work');
  assert.equal(copy.REDISCUSS_LABEL, 'Re-discuss');
  assert.match(copy.decideErrorMessage('alreadyWork'), /already moved/);
  assert.match(copy.decideErrorMessage('whatever'), /went wrong/);
});

test('newCommentIds marks others\' comments after the latest record', () => {
  const events = [
    { event: 'discussion-recorded', at: '2026-09-02T10:00:00.000Z' },
    { event: 'discussion-recorded', at: '2026-09-05T10:00:00.000Z' },
  ];
  const comments = [
    { id: 'c1', authorId: 'u2', createdAt: '2026-09-03T10:00:00.000Z' },
    { id: 'c2', authorId: 'u2', createdAt: '2026-09-06T10:00:00.000Z' },
    { id: 'c3', authorId: 'u1', createdAt: '2026-09-07T10:00:00.000Z' },
  ];
  assert.deepEqual([...copy.newCommentIds(comments, events, 'u1')], ['c2']);
  assert.equal(copy.newCommentIds(comments, [], 'u1').size, 0);
});

test('discussionRecords says a write-up went to Links when the brief holds that url', () => {
  const events = [
    { id: 'e1', event: 'discussion-recorded', data: { summary: 'Old', url: 'https://claude.ai/artifact/old' } },
    { id: 'e2', event: 'discussion-recorded', data: { summary: 'New', url: 'https://claude.ai/artifact/new' } },
  ];
  const attachments = [{ id: 'a1', title: 'Discussion write-up (2026-09-21)', url: 'https://claude.ai/artifact/new' }];
  const records = copy.discussionRecords(events, 'u1', attachments);
  assert.deepEqual(records.map((r) => [r.id, r.inLinks]), [['e2', true], ['e1', false]]);
  assert.equal(records[1].url, 'https://claude.ai/artifact/old');
  assert.equal(copy.WRITE_UP_IN_LINKS, 'Write-up added to Links');
});

// ─── Start Work ───────────────────────────────────────────────

test('startErrorMessage has a sentence for every refusal, naming what it can', () => {
  assert.equal(copy.startErrorMessage({ reason: 'recordRefTaken' }),
    'Another brief already uses one of these spec or task names. Pull the latest changes and start again.');
  assert.equal(copy.startErrorMessage({ reason: 'branchTaken', detail: 'feat/login' }), 'A branch named feat/login already exists. Pick another name.');
  assert.equal(copy.startErrorMessage({ reason: 'badBranch', detail: 'a b' }), '“a b” is not a branch name git accepts.');
  assert.equal(copy.startErrorMessage({ reason: 'baseMissing', detail: 'main' }),
    'The target branch main is not on this machine. Fetch or create it, then start again.');
  assert.equal(copy.startErrorMessage({ reason: 'badDefinition', part: 'Fix typo', detail: 'noDescription' }),
    '“Fix typo” has no Description section. Edit it on the web, then start again.');
  for (const reason of ['notStartable', 'notWork', 'alreadyClosed', 'notShaped', 'alreadyStarted', 'partsMismatch', 'notFound', 'network', 'notConnected', 'unauthorized', 'noWorkspace']) {
    const sentence = copy.startErrorMessage({ reason });
    assert.notEqual(sentence, 'Start Work could not run. Try again.', reason);
    assert.match(sentence, /\.$/, reason);
  }
  assert.equal(copy.startErrorMessage({ reason: 'mystery' }), 'Start Work could not run. Try again.');
  assert.equal(copy.startErrorMessage(null), 'Start Work could not run. Try again.');
});

test('partialMessage names the failed step, what was written and what is missing with its ref', () => {
  assert.equal(copy.partialMessage({
    step: 'files',
    error: 'disk full',
    written: ['login-flow'],
    missing: [{ title: 'Fix typo', shape: 'task', ref: 'task-fix-typo' }],
  }), 'The brief is started in Frame Cloud, but writing the parts failed: disk full. Written: login-flow. '
    + 'Not written — create these by hand under the same names: “Fix typo” (task task-fix-typo).');
  assert.equal(copy.partialMessage({ step: 'branch', written: [], missing: [{ title: 'A', shape: 'spec', ref: 'a' }] }),
    'The brief is started in Frame Cloud, but creating the branch failed. Not written — create these by hand under the same names: “A” (spec a).');
  assert.match(copy.partialMessage({ step: 'stash', written: [], missing: [] }), /stashing your changes failed\.$/);
});

test('startedNotice names the counts and the branch, and the stash when there was one', () => {
  assert.equal(copy.startedNotice({ number: 5, specs: 2, tasks: 1, branch: 'feat/login', stashMessage: null }),
    'Brief #5 started: 2 specs, 1 task on feat/login.');
  assert.equal(copy.startedNotice({ number: 5, specs: 1, tasks: 0, branch: 'feat/login', stashMessage: 'Start Work #5' }),
    'Brief #5 started: 1 spec on feat/login. Your changes were stashed as “Start Work #5”.');
  assert.equal(copy.startedNotice({ number: 5, specs: 0, tasks: 3, branch: 'fix/x' }), 'Brief #5 started: 3 tasks on fix/x.');
});

test('the Start Work dialog words', () => {
  assert.equal(copy.START_WORK_LABEL, 'Start Work');
  assert.equal(copy.startDialogTitle(5), 'Start work on brief #5');
  assert.equal(copy.beginWithLabel('Login flow'), 'Begin with “Login flow”');
  assert.equal(copy.ORCHESTRATE_LABEL, 'Orchestrate');
  assert.equal(copy.COMING_SOON, 'Coming soon');
  assert.equal(copy.cutFromLine('origin/main'), 'Cut from origin/main');
  assert.equal(copy.dirtyWarning('feat/x', 1), 'feat/x has 1 uncommitted change. Stash them so the new branch starts clean, or cancel and commit them first.');
  assert.match(copy.dirtyWarning('', 3), /^This folder has 3 uncommitted changes\./);
  assert.equal(copy.startSubmitLabel(true), 'Starting…');
  assert.match(copy.baseMissingLine(''), /no target branch/);
});

test('the part link words', () => {
  assert.equal(copy.OPEN_SPEC_LABEL, 'Open spec');
  assert.equal(copy.OPEN_TASK_LABEL, 'Open task');
  assert.equal(copy.partNotHereMessage('task-fix-typo'), 'task-fix-typo is not in this folder\'s tasks. It may be on another branch or machine.');
});
