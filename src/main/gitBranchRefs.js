/**
 * gitBranchRefs — the pure half of gitBranchesManager's branch listing and
 * remote-ref handling (status-bar-branch-picker spec, D6 / D9).
 *
 * No git, no filesystem, no electron: `parseBranchLine` turns one line of
 * `git branch -a --format=…` into a row, and `splitRemoteRef` decides which
 * remote a `<remote>/<name>` ref belongs to against the repo's real remote
 * list — longest remote first, so a remote named `a/b` and a branch named
 * `feat/x` both come out right. gitBranchesManager requires this; the tests
 * require it directly.
 */

/**
 * The format string gitBranchesManager passes to `git branch -a`. Six
 * `|`-separated fields; the subject comes last because it is the one field
 * that may itself contain `|`.
 */
const BRANCH_FORMAT = '%(refname)|%(refname:short)|%(objectname:short)|%(committerdate:relative)|%(committerdate:unix)|%(subject)';

/**
 * @param {string} line - one line of `git branch -a --format=BRANCH_FORMAT`
 * @returns {{ refname: string, name: string, commit: string, date: string, time: number, message: string, isRemote: boolean } | null}
 */
function parseBranchLine(line) {
  if (typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed) return null;
  const [refname, name, commit, date, time, ...rest] = trimmed.split('|');
  if (!refname || !name) return null;
  const parsed = parseInt(time, 10);
  return {
    refname,
    name,
    commit: commit || '',
    date: date || '',
    time: Number.isFinite(parsed) ? parsed : 0,
    message: rest.join('|'),
    isRemote: refname.startsWith('refs/remotes/')
  };
}

/**
 * Which remote does `<remote>/<name>` belong to?
 *
 * @param {string} name - a remote-tracking short name such as `origin/feat/x`
 * @param {string[]} remotes - output of `git remote`, one name per entry
 * @returns {{ remote: string, shortName: string } | null} null when no remote prefixes the name
 */
function splitRemoteRef(name, remotes) {
  if (typeof name !== 'string' || !Array.isArray(remotes)) return null;
  const candidates = remotes
    .filter((r) => typeof r === 'string' && r.length > 0)
    .sort((a, b) => b.length - a.length);
  for (const remote of candidates) {
    const prefix = `${remote}/`;
    if (name.startsWith(prefix) && name.length > prefix.length) {
      return { remote, shortName: name.slice(prefix.length) };
    }
  }
  return null;
}

module.exports = { BRANCH_FORMAT, parseBranchLine, splitRemoteRef };
