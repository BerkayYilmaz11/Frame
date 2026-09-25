/**
 * cloudBriefsCopy — the words the cloud Briefs view says.
 *
 * A port of Frame Cloud's `apps/web/src/lib/brief.ts` (and the column copy of
 * `brief-board.tsx`, `new-brief-dialog.tsx` and `ai-links.tsx`), so a brief
 * reads the same in Frame as on the web: the columns a list falls into, the
 * words for kinds, priorities and ending facts, the history as sentences, and
 * the New brief form. Ported rather than shared — Frame takes no dependency on
 * the web app — and pure: no DOM, no Electron, so `node --test` covers it.
 *
 * Creating, discussing, shaping and starting are the writes: the web's other write copy
 * (Transform to Work, refusal sentences for other mutations, search params)
 * is left out.
 */

/** The board's open columns, in order. A brief lands in one by its derived status, never by a hand. */
const COLUMNS = [
  { status: 'backlog', title: 'Backlog' },
  { status: 'active', title: 'Active', hint: 'A brief moves here on its own once work starts on a machine.' },
  { status: 'done', title: 'Done', hint: 'A brief moves here on its own once its work lands on the target branch.' },
];

/** A list grouped by status, each group keeping the list's order. Unknown statuses fall into Backlog. */
function groupByColumn(briefs) {
  const groups = { backlog: [], active: [], done: [], closed: [] };
  for (const brief of Array.isArray(briefs) ? briefs : []) {
    (groups[brief && brief.status] || groups.backlog).push(brief);
  }
  return groups;
}

/** The two kinds as the user sees them. */
const KIND_COPY = {
  proposal: {
    label: 'Proposal',
    badge: 'PROPOSAL',
    explanation:
      'An idea not decided yet. You can discuss it with an AI agent and turn it into work once it is worth doing.',
  },
  work: {
    label: 'Work',
    badge: 'WORK',
    explanation:
      'Work that has been decided on. An AI agent shapes it: it reads the brief and the code, decides whether it becomes one spec, several specs or a task, and writes those parts. Then they run.',
  },
};

const STATUS_LABELS = { backlog: 'Backlog', active: 'Active', done: 'Done', closed: 'Closed' };

function statusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.backlog;
}

const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

function isPriority(value) {
  return value === 'high' || value === 'medium' || value === 'low';
}

/** 'High' / 'Medium' / 'Low', or '' for anything else. */
function priorityLabel(priority) {
  return PRIORITY_LABELS[priority] || '';
}

/** How a closed brief ended — `{ label, reason, at }` — or null for an open one. Close wins over drop over decision. */
function endingFact(brief) {
  const b = brief || {};
  if (b.closedAt) return { label: 'Closed', reason: b.closeReason || null, at: b.closedAt };
  if (b.droppedAt) return { label: 'Dropped', reason: b.dropReason || null, at: b.droppedAt };
  if (b.recordedDecisionAt) return { label: 'Recorded as decision', reason: null, at: b.recordedDecisionAt };
  return null;
}

/** The ending as one line: "Closed: reason", "Dropped", "Recorded as decision"; '' for an open brief. */
function endingLine(brief) {
  const ending = endingFact(brief);
  if (!ending) return '';
  return ending.reason ? `${ending.label}: ${ending.reason}` : ending.label;
}

/** "You" for the caller, "A workspace member" for anyone else: there is no member list. */
function actorLabel(id, meId) {
  return id && meId && id === meId ? 'You' : 'A workspace member';
}

const DATE_FORMAT = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

/** An ISO timestamp as "18 Sept 2026" in the viewer's time zone; '' when missing or unreadable. */
function formatDate(iso) {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date);
}

function text(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** "a", "a and b", "a, b and c". */
function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What happened, without who or when. `data` is whatever that event's write recorded. */
function eventAction(event, meId) {
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  switch (event.event) {
    case 'created':
      if (data.kind !== 'work') return 'created this brief as a proposal';
      return isPriority(data.priority)
        ? `created this brief as work with ${priorityLabel(data.priority).toLowerCase()} priority`
        : 'created this brief as work';
    case 'decided':
      return isPriority(data.priority)
        ? `transformed this proposal to work with ${priorityLabel(data.priority).toLowerCase()} priority`
        : 'transformed this proposal to work';
    case 'shaped': {
      const count = Number.isInteger(data.count) && data.count >= 0 ? data.count : 0;
      return `shaped this brief into ${count} ${count === 1 ? 'part' : 'parts'}`;
    }
    case 'started': {
      const count = Number.isInteger(data.count) && data.count >= 0 ? data.count : 0;
      return `started work on this brief's ${count} ${count === 1 ? 'part' : 'parts'}`;
    }
    case 'dropped': {
      const reason = text(data.reason);
      return reason ? `dropped this proposal: ${reason}` : 'dropped this proposal';
    }
    case 'decision-recorded':
      return 'recorded this proposal as a decision';
    case 'discussion-recorded': {
      // `provider` is free text the caller sent, so it reads as it was written.
      const provider = text(data.provider);
      return provider ? `recorded a discussion held with ${provider}` : 'recorded a discussion';
    }
    case 'updated': {
      const changes = [];
      if ('title' in data) changes.push('the title');
      if ('body' in data) changes.push('the description');
      if (isPriority(data.priority)) changes.push(`the priority to ${priorityLabel(data.priority).toLowerCase()}`);
      const branch = text(data.targetBranch);
      if (branch) changes.push(`the target branch to ${branch}`);
      return changes.length > 0 ? `changed ${joinList(changes)}` : 'saved this brief unchanged';
    }
    case 'part-added': {
      const title = text(data.title);
      return title ? `added the part “${title}”` : 'added a part';
    }
    case 'part-updated':
      return 'edited a part';
    case 'part-removed': {
      const title = text(data.title);
      return title ? `removed the part “${title}”` : 'removed a part';
    }
    case 'parts-reordered':
      return 'reordered the parts';
    case 'attachment-added': {
      const title = text(data.title);
      return title ? `attached “${title}”` : 'added an attachment';
    }
    case 'attachment-removed': {
      const title = text(data.title);
      return title ? `removed the attachment “${title}”` : 'removed an attachment';
    }
    case 'comment-added':
      return 'commented';
    case 'closed': {
      const reason = text(data.reason);
      return reason ? `closed this work: ${reason}` : 'closed this work';
    }
    case 'reopened':
      if (data.ended === 'dropped') return 'reopened this dropped proposal';
      if (data.ended === 'recorded') return 'reopened this proposal recorded as a decision';
      return 'reopened this work';
    case 'milestone-set':
      return text(data.milestoneId) ? 'moved this brief into a milestone' : 'took this brief out of its milestone';
    case 'assignee-set': {
      const assignee = text(data.assigneeId);
      if (!assignee) return 'cleared the assignee';
      if (assignee === event.actorId) return 'took this brief on';
      return assignee === meId ? 'assigned this brief to you' : 'assigned this brief to a workspace member';
    }
    default:
      // A server newer than this port: say something true rather than nothing.
      return 'changed this brief';
  }
}

/** One history line: who did what, and the day it happened. → `{ sentence, date }`. */
function eventSentence(event, meId) {
  const e = event || {};
  return {
    sentence: `${actorLabel(e.actorId, meId)} ${eventAction(e, meId)}.`,
    date: formatDate(e.at),
  };
}

/** The Parts tab's line for a shaped brief: "Shaped 18 Sept 2026"; '' when unshaped or unreadable. */
function shapedLine(iso) {
  const date = formatDate(iso);
  return date ? `Shaped ${date}` : '';
}

/** The Parts tab's line for a started brief: "Started 18 Sept 2026"; '' when unstarted or unreadable. */
function startedLine(iso) {
  const date = formatDate(iso);
  return date ? `Started ${date}` : '';
}

const PART_DEFINITION_LABEL = 'Definition';

const REASON_MESSAGES = {
  network: 'Frame Cloud could not be reached. Check your connection and try again.',
  notFound: 'This was not found in Frame Cloud. It may have been removed.',
  notConnected: 'This folder is not connected to a Frame Cloud project.',
  unauthorized: 'You are signed out of Frame Cloud.',
  noWorkspace: 'Your Frame Cloud account has no workspace.',
};

/** The panel's sentence for a failed read's `reason`. */
function reasonMessage(reason) {
  return REASON_MESSAGES[reason] || 'Something went wrong loading briefs. Try again.';
}

// ─── Discussions ──────────────────────────────────────────────

const DISCUSSIONS_TITLE = 'Discussions';

/** A card's record count: "1 discussion recorded", "2 discussions recorded"; '' for none or unknown. */
function discussionCountLabel(count) {
  if (!Number.isInteger(count) || count < 1) return '';
  return `${count} discussion${count === 1 ? '' : 's'} recorded`;
}

/**
 * Where an open proposal stands, which decides its controls:
 * 'discussing' (a Discuss lane is open) · 'discuss' (nothing recorded yet) ·
 * 'decide' (at least one record: Move to Work, then Discuss) · 'none' (work,
 * or ended). New comments are a separate fact layered on 'decide'.
 */
function proposalStage({ brief, laneOpen, discussionCount }) {
  if (laneOpen) return 'discussing';
  const b = brief || {};
  if (b.kind !== 'proposal' || b.status === 'closed') return 'none';
  return Number.isInteger(discussionCount) && discussionCount > 0 ? 'decide' : 'discuss';
}

/** "1 new comment", "3 new comments"; '' for none or unknown. */
function newCommentsLabel(count) {
  if (!Number.isInteger(count) || count < 1) return '';
  return `${count} new comment${count === 1 ? '' : 's'}`;
}

/**
 * The ids of the comments that are new: added by someone other than `meId`
 * after the latest discussion record. Empty while nothing was recorded.
 */
function newCommentIds(comments, events, meId) {
  const records = (Array.isArray(events) ? events : []).filter((e) => e && e.event === 'discussion-recorded');
  if (records.length === 0) return new Set();
  const lastAt = Date.parse(records[records.length - 1].at);
  if (Number.isNaN(lastAt)) return new Set();
  return new Set((Array.isArray(comments) ? comments : [])
    .filter((c) => c && c.authorId !== meId && Date.parse(c.createdAt) > lastAt)
    .map((c) => c.id));
}

const MOVE_TO_WORK_LABEL = 'Move to Work';
const MOVE_TO_WORK_DESCRIPTION = 'This proposal becomes work you have decided on. It keeps its number and stays in Backlog.';
const REDISCUSS_LABEL = 'Re-discuss';
const REDISCUSS_HINT = 'Start a new discussion that opens on these comments.';

const DECIDE_MESSAGES = {
  notAProposal: 'This brief is no longer a proposal.',
  alreadyWork: 'This proposal has already moved to work.',
  alreadyClosed: 'This proposal has ended.',
  notFound: 'This brief was not found in Frame Cloud. It may have been removed.',
  badRequest: 'Pick a priority and try again.',
  network: REASON_MESSAGES.network,
  notConnected: REASON_MESSAGES.notConnected,
  unauthorized: REASON_MESSAGES.unauthorized,
  noWorkspace: REASON_MESSAGES.noWorkspace,
};

/** The sentence for a Move to Work that failed. */
function decideErrorMessage(reason) {
  return DECIDE_MESSAGES[reason] || 'Something went wrong. Try again.';
}

/** A card's live lane: "Discussing in <lane>". */
function discussingIn(laneName) {
  return laneName ? `Discussing in ${laneName}` : 'Discussing';
}
const DISCUSS_LABEL = 'Discuss';
const GO_TO_DISCUSSION_LABEL = 'Go to discussion';
const DISCUSS_HINT = 'Talk this proposal over with an AI agent in a new lane. It can record what you settle here.';
const WRITE_UP_LABEL = 'Read the write-up';
const WRITE_UP_IN_LINKS = 'Write-up added to Links';

/** A trimmed string, or '' — a `brief_event.data` field is unknown on the wire. */
function eventText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function httpUrl(value) {
  const url = eventText(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

/**
 * The brief's discussion records, newest first (`brief.events` is oldest
 * first). → `[{ id, date, actor, provider, summary, url, inLinks }]`; `url` is
 * '' unless it is an http(s) link, and `inLinks` says the brief's
 * `attachments` hold that url (its write-up went to Links). Records without a
 * summary are left out.
 */
function discussionRecords(events, meId, attachments = []) {
  const linked = new Set((Array.isArray(attachments) ? attachments : []).map((a) => a && a.url));
  return (Array.isArray(events) ? events : [])
    .filter((e) => e && e.event === 'discussion-recorded')
    .map((e) => {
      const data = e.data && typeof e.data === 'object' ? e.data : {};
      return {
        id: e.id,
        date: formatDate(e.at),
        actor: actorLabel(e.actorId, meId),
        provider: eventText(data.provider),
        summary: eventText(data.summary),
        url: httpUrl(data.url),
      };
    })
    .map((r) => ({ ...r, inLinks: Boolean(r.url) && linked.has(r.url) }))
    .filter((r) => r.summary)
    .reverse();
}

const DISCUSS_MESSAGES = {
  notAnOpenProposal: 'Only an open proposal can be discussed.',
  unknownTool: 'Frame does not know the selected AI tool. Pick one in the AI tool menu and try again.',
  notFound: 'This brief was not found in Frame Cloud. It may have been removed.',
  network: REASON_MESSAGES.network,
  notConnected: REASON_MESSAGES.notConnected,
  unauthorized: REASON_MESSAGES.unauthorized,
  noWorkspace: REASON_MESSAGES.noWorkspace,
};

/** The sentence for a Discuss that could not start. */
function discussErrorMessage(reason) {
  return DISCUSS_MESSAGES[reason] || 'The discussion could not start. Try again.';
}

// ─── Shape ────────────────────────────────────────────────────

/**
 * Where a work brief stands, which decides its work control:
 * 'start' (open, shaped, unstarted work — ahead of an open lane, since
 * shaping is finished once the parts are written) · 'lane' (a brief lane of
 * either purpose is open — one lane per brief) · 'shape' (open work whose
 * parts were never written) · 'none' (a proposal, an ended brief, or one
 * already started: neither Shape nor Start Work comes back).
 */
function workStage({ brief, laneOpen }) {
  const b = brief || {};
  const openWork = b.kind === 'work' && b.status !== 'closed';
  if (openWork && b.shapedAt && !b.startedAt) return 'start';
  if (laneOpen) return 'lane';
  return openWork && !b.shapedAt ? 'shape' : 'none';
}

/** A brief lane's link: "Discussing in <lane>" or "Shaping in <lane>". A lane without a purpose is a Discuss lane. */
function laneLabel(purpose, laneName) {
  if (purpose !== 'shape') return discussingIn(laneName);
  return laneName ? `Shaping in ${laneName}` : 'Shaping';
}

const SHAPE_LABEL = 'Shape';
const SHAPE_HINT = 'Split this work into specs and tasks with an AI agent in a new lane. It writes the parts once you approve them.';
const GO_TO_SHAPING_LABEL = 'Go to shaping';

const SHAPE_MESSAGES = {
  notShapeable: 'Only open work that has not been shaped yet can be shaped.',
  unknownTool: DISCUSS_MESSAGES.unknownTool,
  notFound: DISCUSS_MESSAGES.notFound,
  network: REASON_MESSAGES.network,
  notConnected: REASON_MESSAGES.notConnected,
  unauthorized: REASON_MESSAGES.unauthorized,
  noWorkspace: REASON_MESSAGES.noWorkspace,
};

/** A shaped card's parts: "1 spec", "2 specs · 1 task"; '' for none or unknown. */
function partCountLabel(counts) {
  const c = counts && typeof counts === 'object' ? counts : {};
  const piece = (n, word) => (Number.isInteger(n) && n > 0 ? `${n} ${word}${n === 1 ? '' : 's'}` : '');
  return [piece(c.spec, 'spec'), piece(c.task, 'task')].filter(Boolean).join(' · ');
}

/** The toast when a Shape landed: "Brief #5 was shaped into 2 parts and is ready to run."; the count is left out when unknown. */
function shapedNotice(number, count) {
  if (!Number.isInteger(count) || count < 1) return `Brief #${number} was shaped and is ready to run.`;
  return `Brief #${number} was shaped into ${count} ${count === 1 ? 'part' : 'parts'} and is ready to run.`;
}

const OPEN_BRIEF_LABEL = 'Open brief';

/** The sentence for a Shape that could not start. */
function shapeErrorMessage(reason) {
  return SHAPE_MESSAGES[reason] || 'Shaping could not start. Try again.';
}

// ─── Start Work ───────────────────────────────────────────────

const START_WORK_LABEL = 'Start Work';
const START_WORK_HINT = 'Turn every part into a spec or a task on a new branch, and begin with the one you choose.';

/** The dialog's heading: "Start work on brief #5". */
function startDialogTitle(number) {
  return `Start work on brief #${number}`;
}

/** The Begin dialog's heading, for one part of a started brief: "Begin “Fix typo”". */
function beginDialogTitle(title) {
  return `Begin “${title}”`;
}

const START_DIALOG_DESCRIPTION = 'The part you begin gets its own branch and opens in a lane. The other parts wait on the brief until you begin them.';
const BEGIN_DIALOG_DESCRIPTION = 'This part gets its own branch and opens in a lane.';
const START_CHOICE_TITLE = 'Begin with';

/** A Begin choice: "Begin with “Login flow”". */
function beginWithLabel(title) {
  return `Begin with “${title}”`;
}

/** What Begin opens, by the part's shape. */
function beginHint(shape) {
  return shape === 'spec'
    ? 'Writes this spec on its own branch, then opens a lane that plans it.'
    : 'Writes this task on its own branch, then opens a lane that runs it.';
}

const ORCHESTRATE_LABEL = 'Orchestrate';
const ORCHESTRATE_HINT = 'Run every part side by side, each on its own branch.';
const COMING_SOON = 'Coming soon';
const BRANCH_LABEL = 'Branch';
const FROM_LABEL = 'from';
const BASE_FILTER_PLACEHOLDER = 'Find a branch…';
const BASE_LOCAL_TITLE = 'Local';
const BASE_REMOTE_TITLE = 'origin';
const NO_BASE_MATCH = 'No branch matches.';
const PICK_BASE_LABEL = 'Pick a base';

/** The line under the branch row when the brief's target branch is on neither this machine nor origin. */
function baseMissingLine(targetBranch) {
  return targetBranch
    ? `The target branch ${targetBranch} is not on this machine. Fetch it, or pick another base.`
    : 'This brief has no target branch. Pick a base to cut from.';
}

/** The dirty folder's warning: "feat/x has 3 uncommitted changes. …". */
function dirtyWarning(branch, count) {
  const changes = `${count} uncommitted ${count === 1 ? 'change' : 'changes'}`;
  const where = branch ? `${branch} has ${changes}` : `This folder has ${changes}`;
  return `${where}. Stash them so the new branch starts clean, or cancel and commit them first.`;
}

const STASH_AND_CONTINUE_LABEL = 'Stash and continue';
const CANCEL_LABEL = 'Cancel';

/** The confirm button: "Start", or "Starting…" while it runs. */
function startSubmitLabel(pending) {
  return pending ? 'Starting…' : 'Start';
}

const PART_PROBLEMS = {
  empty: 'has no definition',
  noProblem: 'has no Problem section',
  noGoal: 'has no Goal section',
  noDescription: 'has no Description section',
  textBeforeHeading: 'has text before its first heading',
};

/** A part whose definition does not parse: "“Fix typo” has no Description section. Edit it on the web." */
function partProblemMessage(title, reason) {
  return `“${title}” ${PART_PROBLEMS[reason] || 'cannot be read'}. Edit it on the web, then start again.`;
}

const START_MESSAGES = {
  notStartable: 'Only open work that is shaped and not started yet can be started.',
  notWork: 'This brief is a proposal. Only work can be started.',
  alreadyClosed: 'This brief has ended.',
  notShaped: 'This brief is not shaped yet. Shape it first.',
  alreadyStarted: 'This brief has already been started, maybe on another machine.',
  partsMismatch: 'The brief\'s parts changed on the web. Close this and start again.',
  recordRefTaken: 'Another brief already uses one of these spec or task names. Pull the latest changes and start again.',
  baseMissing: baseMissingLine(''),
  badRequest: 'Pick the part to begin and try again.',
  notFound: 'This brief was not found in Frame Cloud. It may have been removed.',
  network: REASON_MESSAGES.network,
  notConnected: REASON_MESSAGES.notConnected,
  unauthorized: REASON_MESSAGES.unauthorized,
  noWorkspace: REASON_MESSAGES.noWorkspace,
};

/** The sentence for a start that was refused before anything was written. `result` is `{ reason, part?, detail? }`. */
function startErrorMessage(result) {
  const r = result || {};
  if (r.reason === 'badBranch') return `${r.detail ? `“${r.detail}”` : 'That'} is not a branch name git accepts.`;
  if (r.reason === 'branchTaken') return `A branch named ${r.detail || 'that'} already exists. Pick another name.`;
  if (r.reason === 'baseMissing' && r.detail) return `The branch ${r.detail} is not on this machine. Fetch it, or pick another base.`;
  if (r.reason === 'alreadyBegun') return `This part was already begun${r.detail ? ` on ${r.detail}` : ''}.`;
  if (r.reason === 'badDefinition') return partProblemMessage(r.part || 'A part', r.detail);
  return START_MESSAGES[r.reason] || 'Start Work could not run. Try again.';
}

const PARTIAL_STEPS = {
  stash: 'stashing your changes failed',
  branch: 'creating the branch failed',
  files: 'writing the parts failed',
};

/**
 * A start that went through in the cloud and then failed locally: which step
 * failed, what was written, and each missing part with the name to create it
 * under.
 */
function partialMessage(result) {
  const r = result || {};
  const step = PARTIAL_STEPS[r.step] || 'a step failed';
  const lines = [`The brief is started in Frame Cloud, but ${step}${r.error ? `: ${r.error}` : ''}.`];
  const written = Array.isArray(r.written) ? r.written : [];
  const missing = Array.isArray(r.missing) ? r.missing : [];
  if (written.length > 0) lines.push(`Written: ${written.join(', ')}.`);
  if (missing.length > 0) {
    lines.push(`Not written — create these by hand under the same names: ${missing
      .map((m) => `“${m.title}” (${m.shape} ${m.ref})`).join(', ')}.`);
  }
  return lines.join(' ');
}

/**
 * The toast when a part was begun: "Brief #5 started: “Login flow” on
 * feat/login." for the brief's first part, "Began “Fix typo” on fix/typo."
 * for a later one, plus the stash when there was one.
 */
function startedNotice({ mode, number, part, branch, stashMessage } = {}) {
  const title = part && part.title ? `“${part.title}”` : 'the part';
  const main = mode === 'begin'
    ? `Began ${title} on ${branch}.`
    : `Brief #${number} started: ${title} on ${branch}.`;
  return stashMessage ? `${main} Your changes were stashed as “${stashMessage}”.` : main;
}

const OPEN_SPEC_LABEL = 'Open spec';
const OPEN_TASK_LABEL = 'Open task';

// ─── A started brief's progress ───────────────────────────────

/** A live lane's state, which wins over the record's own. */
const LANE_STATES = {
  'agent-working': { label: 'Working', tone: 'active' },
  'agent-approval': { label: 'Needs approval', tone: 'attention' },
};
const LANE_WAITING = { label: 'Awaiting input', tone: 'attention' };

function specState(spec) {
  const done = Number.isInteger(spec.completed_count) ? spec.completed_count : 0;
  const total = Number.isInteger(spec.task_count) ? spec.task_count : 0;
  switch (spec.phase) {
    case 'done': return { label: 'Done', tone: 'done', run: null };
    case 'implementing':
      return { label: total > 0 ? `Implementing · ${done}/${total}` : 'Implementing', tone: 'active', run: 'spec.implement' };
    case 'tasks_generated': return { label: 'Tasks ready', tone: 'idle', run: 'spec.implement' };
    case 'planned': return { label: 'Planned', tone: 'idle', run: 'spec.tasks' };
    default: return { label: 'Not started', tone: 'idle', run: 'spec.plan' };
  }
}

function taskState(task) {
  if (task.status === 'completed') return { label: 'Done', tone: 'done', run: null };
  if (task.status === 'in_progress') return { label: 'In progress', tone: 'active', run: 'task' };
  return { label: 'Not started', tone: 'idle', run: 'task' };
}

/**
 * Where one part of a started brief stands in this folder. `spec` is its
 * `SPEC_DATA` entry and `task` its `tasks.json` row (either absent when the
 * folder does not hold it), `lane` its lane info. A live agent's state wins
 * over the record's, and then the part has no Run: its lane is the way in.
 * → `{ label, tone: 'idle' | 'active' | 'attention' | 'done' | 'missing',
 * laneName, run: 'spec.plan' | 'spec.tasks' | 'spec.implement' | 'task' | null }`.
 */
function partStatus({ part, spec, task, lane } = {}) {
  const p = part || {};
  if (!p.recordRef) return { label: '', tone: 'idle', laneName: null, run: null };
  const record = p.shape === 'spec' ? spec : task;
  if (!record) return { label: 'Not on this branch', tone: 'missing', laneName: null, run: null };
  const own = p.shape === 'spec' ? specState(record) : taskState(record);
  if (own.tone === 'done' || !lane || !lane.agentName) return { ...own, laneName: null };
  return { ...(LANE_STATES[lane.status] || LANE_WAITING), laneName: lane.name || '', run: null };
}

const RUN_LABEL = 'Run';
const RUN_HINTS = {
  'spec.plan': 'Plan this spec in a new lane.',
  'spec.tasks': 'Break this spec\'s plan into tasks in a new lane.',
  'spec.implement': 'Implement this spec\'s tasks.',
  task: 'Run this task in a new lane.',
};

/** What Run does for a part, as its tooltip. */
function runHint(run) {
  return RUN_HINTS[run] || '';
}

/** A part's lane link: "in Frame 3". */
function laneLine(laneName) {
  return laneName ? `in ${laneName}` : 'in a lane';
}

/**
 * A started brief's line under its parts, only with more than one:
 * "1 of 3 done · 1 in progress · 1 not on this branch". `statuses` are
 * partStatus results.
 */
function partsSummary(statuses) {
  const list = Array.isArray(statuses) ? statuses : [];
  if (list.length < 2) return '';
  const count = (...tones) => list.filter((s) => s && tones.includes(s.tone)).length;
  const pieces = [`${count('done')} of ${list.length} done`];
  const active = count('active', 'attention');
  if (active > 0) pieces.push(`${active} in progress`);
  const missing = count('missing');
  if (missing > 0) pieces.push(`${missing} not on this branch`);
  return pieces.join(' · ');
}

/** A part link whose task this folder does not hold. */
function partNotHereMessage(ref) {
  return `${ref} is not in this folder's tasks. It may be on another branch or machine.`;
}

// ─── New brief ────────────────────────────────────────────────

const NEW_BRIEF_TITLE = 'New brief';
const NEW_BRIEF_DESCRIPTION = 'A proposal to think over, or work you have decided on.';

const AI_LINKS_TITLE = 'AI conversations & links';
const AI_LINKS_HINT =
  'Add a Claude artifact, a ChatGPT conversation or any link the agent should read. Use a shared link so the agent can open it.';
const INVALID_LINK = 'That is not a full link. It should start with https://.';

const TITLE_REQUIRED = 'Give the brief a title.';
const LINK_TITLE_REQUIRED = 'Each link needs a title.';

/** "Create work" / "Create proposal", or "Creating…" while the request runs. */
function submitLabel(kind, pending) {
  if (pending) return 'Creating…';
  return kind === 'proposal' ? 'Create proposal' : 'Create work';
}

// The web's refusal sentences (`briefErrorMessage`), keyed by the reason
// main reduces a failure to. The web's "Check the highlighted field" would
// point at nothing here: main refuses the request as a whole.
const CREATE_MESSAGES = {
  badRequest: 'Check the title, description and links, then try again.',
  notFound: 'This project does not exist.',
  network: REASON_MESSAGES.network,
  notConnected: REASON_MESSAGES.notConnected,
  unauthorized: REASON_MESSAGES.unauthorized,
  noWorkspace: REASON_MESSAGES.noWorkspace,
};
const CREATE_FALLBACK = 'Something went wrong. Try again.';

/** The form's sentence for a failed create's `reason`. */
function createErrorMessage(reason) {
  return CREATE_MESSAGES[reason] || CREATE_FALLBACK;
}

/** The board's notice when a brief was created but a link was not attached. */
function attachmentNotice(number, reason) {
  // A link that fails is refused on the brief, not the project.
  const sentence = reason === 'notFound' ? 'This brief does not exist.' : createErrorMessage(reason);
  return `Brief #${number} was created, but some links were not attached. ${sentence}`;
}

module.exports = {
  COLUMNS,
  groupByColumn,
  KIND_COPY,
  statusLabel,
  priorityLabel,
  endingFact,
  endingLine,
  actorLabel,
  formatDate,
  eventSentence,
  shapedLine,
  startedLine,
  PART_DEFINITION_LABEL,
  reasonMessage,
  DISCUSSIONS_TITLE,
  discussionCountLabel,
  discussingIn,
  proposalStage,
  newCommentsLabel,
  newCommentIds,
  MOVE_TO_WORK_LABEL,
  MOVE_TO_WORK_DESCRIPTION,
  REDISCUSS_LABEL,
  REDISCUSS_HINT,
  decideErrorMessage,
  DISCUSS_LABEL,
  GO_TO_DISCUSSION_LABEL,
  DISCUSS_HINT,
  WRITE_UP_LABEL,
  WRITE_UP_IN_LINKS,
  discussionRecords,
  discussErrorMessage,
  workStage,
  laneLabel,
  SHAPE_LABEL,
  SHAPE_HINT,
  GO_TO_SHAPING_LABEL,
  shapeErrorMessage,
  shapedNotice,
  OPEN_BRIEF_LABEL,
  partCountLabel,
  START_WORK_LABEL,
  START_WORK_HINT,
  startDialogTitle,
  beginDialogTitle,
  START_DIALOG_DESCRIPTION,
  BEGIN_DIALOG_DESCRIPTION,
  START_CHOICE_TITLE,
  beginWithLabel,
  beginHint,
  ORCHESTRATE_LABEL,
  ORCHESTRATE_HINT,
  COMING_SOON,
  BRANCH_LABEL,
  FROM_LABEL,
  BASE_FILTER_PLACEHOLDER,
  BASE_LOCAL_TITLE,
  BASE_REMOTE_TITLE,
  NO_BASE_MATCH,
  PICK_BASE_LABEL,
  baseMissingLine,
  dirtyWarning,
  STASH_AND_CONTINUE_LABEL,
  CANCEL_LABEL,
  startSubmitLabel,
  partProblemMessage,
  startErrorMessage,
  partialMessage,
  startedNotice,
  OPEN_SPEC_LABEL,
  OPEN_TASK_LABEL,
  partNotHereMessage,
  partStatus,
  RUN_LABEL,
  runHint,
  laneLine,
  partsSummary,
  NEW_BRIEF_TITLE,
  NEW_BRIEF_DESCRIPTION,
  AI_LINKS_TITLE,
  AI_LINKS_HINT,
  INVALID_LINK,
  TITLE_REQUIRED,
  LINK_TITLE_REQUIRED,
  submitLabel,
  createErrorMessage,
  attachmentNotice,
};
