/**
 * Which terminals Home lists, and in what order.
 *
 * Pure by contract: no `electron`, no `lucide`, no `laneStatus` (C8). CI runs
 * `npm test` with no `npm ci`, so a test that reaches into `node_modules`
 * passes locally and fails there. This module takes plain data and returns
 * plain data; formatting a status into a label or a mark stays in the widget,
 * which may require whatever it likes.
 *
 * The two decisions that live here are the ones worth a regression test: what
 * counts as an agent, and which one you should look at first.
 */

/**
 * Every open terminal is a row — a shell you just opened and have not started
 * an agent in yet is still a lane the project holds, and the board is the
 * one place that says how many are open.
 *
 * The order of the keys is the order of the board: approval first because it
 * is blocking on you, then input because it is waiting on you, then working
 * because it is not waiting at all, then plain shells — a running command
 * before an idle prompt. That is what `laneStatus`'s ATTENTION_MARKS already
 * implies — the first two carry a mark, the rest do not. An unknown status
 * sorts after everything it recognises.
 */
const ATTENTION_ORDER = {
  'agent-approval': 0,
  'agent-input': 1,
  'agent-working': 2,
  'running': 3,
  'idle': 4
};
const UNKNOWN_RANK = Object.keys(ATTENTION_ORDER).length;

function rank(status) {
  const r = ATTENTION_ORDER[status];
  return r === undefined ? UNKNOWN_RANK : r;
}

/**
 * @param {Array<{terminal: Object, status: Object}>} lanes - homeData's `lanes`
 * @returns {Array<{id, name, status, agentName, foreground, commandLine, lastActivityAt, assignment}>}
 */
function agentRows(lanes) {
  return (lanes || [])
    .filter(l => l && l.terminal && l.status && l.status.status)
    .map(({ terminal, status }) => ({
      id: terminal.id,
      name: terminal.customName || terminal.name || '',
      status: status.status,
      agentName: status.agentName || null,
      // What a plain shell is running, so the label can name the command.
      foreground: status.foreground || null,
      commandLine: status.commandLine || null,
      lastActivityAt: status.lastActivityAt || null,
      assignment: terminal.assignment || null
    }))
    .sort((a, b) => {
      const byRank = rank(a.status) - rank(b.status);
      if (byRank !== 0) return byRank;
      // Within one status, the one that spoke most recently is the one you
      // were just looking at. A lane that has never reported sorts last.
      return (Date.parse(b.lastActivityAt) || 0) - (Date.parse(a.lastActivityAt) || 0);
    });
}

module.exports = { agentRows, ATTENTION_ORDER };
