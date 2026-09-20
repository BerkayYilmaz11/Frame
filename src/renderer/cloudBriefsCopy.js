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
 * Creating is the one write: the web's other write copy (Transform to Work,
 * refusal sentences for other mutations, search params) is left out.
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
    case 'dropped': {
      const reason = text(data.reason);
      return reason ? `dropped this proposal: ${reason}` : 'dropped this proposal';
    }
    case 'decision-recorded':
      return 'recorded this proposal as a decision';
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
  reasonMessage,
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
