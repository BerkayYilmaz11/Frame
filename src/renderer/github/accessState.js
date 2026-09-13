/**
 * GitHub access state — pure (github-view-tree-layout spec, G3 / D6).
 *
 * Main resolves `gh --version` → `gh auth status` → `gh repo view` once per
 * project and answers `{ gh, authed, repoName }` over GITHUB_ACCESS_STATE.
 * This module turns that payload into one of four states, the availability
 * of each section in that state, and the one-line copy the panel shows.
 * No DOM, no Electron — pinned by `test/githubAccessState.test.js`.
 *
 *   no-gh      gh is not installed         → git sections only, install link
 *   no-auth    gh is installed, not signed in → git sections only, Sign in
 *   no-remote  signed in, remote is not GitHub → git sections only, a note
 *   ok         everything                   → all four sections
 *
 * Branches and Worktrees are plain git, so they are available in every
 * state; Pull Requests and Issues only in `ok`.
 */

const STATES = ['no-gh', 'no-auth', 'no-remote', 'ok'];

const COPY = {
  'no-gh': {
    title: 'GitHub CLI not found',
    message: 'Install gh to see pull requests and issues.',
    action: 'install',
    actionLabel: 'Get GitHub CLI',
    actionUrl: 'https://cli.github.com/'
  },
  'no-auth': {
    title: 'Not signed in to GitHub',
    message: 'Sign in to load pull requests and issues. Refresh when done.',
    action: 'signin',
    actionLabel: 'Sign in to GitHub',
    actionUrl: null
  },
  'no-remote': {
    title: 'Not a GitHub remote',
    message: 'Pull requests and issues need a GitHub remote. Branches and worktrees still work.',
    action: null,
    actionLabel: null,
    actionUrl: null
  },
  ok: null
};

/** The state id for a payload; anything unreadable counts as `no-gh`. */
function stateOf(payload) {
  if (!payload || typeof payload !== 'object') return 'no-gh';
  if (payload.gh !== true) return 'no-gh';
  if (payload.authed !== true) return 'no-auth';
  if (typeof payload.repoName !== 'string' || payload.repoName.trim() === '') return 'no-remote';
  return 'ok';
}

function availabilityOf(state) {
  const github = state === 'ok';
  return { prs: github, issues: github, branches: true, worktrees: true };
}

/**
 * Resolve a GITHUB_ACCESS_STATE payload.
 * @returns {{ state, repoName, available, copy }} — `copy` is null in `ok`;
 *   in `no-remote` a main-side `error` string, when present, is appended to
 *   the message so a slow or offline `gh repo view` explains itself.
 */
function resolve(payload) {
  const state = stateOf(payload);
  const repoName = state === 'ok' ? payload.repoName.trim() : null;
  let copy = COPY[state] ? { ...COPY[state] } : null;
  if (copy && state === 'no-remote' && payload && typeof payload.error === 'string' && payload.error.trim()) {
    copy.message = `${copy.message} (${payload.error.trim()})`;
  }
  return { state, repoName, available: availabilityOf(state), copy };
}

function isAvailable(resolved, section) {
  return !!(resolved && resolved.available && resolved.available[section] === true);
}

module.exports = {
  STATES,
  stateOf,
  availabilityOf,
  resolve,
  isAvailable
};
