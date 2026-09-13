/**
 * Branch picker list model — pure (status-bar-branch-picker spec, D5 / C12).
 *
 * Turns a `LOAD_GIT_BRANCHES` result, a `LOAD_GIT_WORKTREES` result and the
 * filter text into the rows the popover draws, in the order it draws them:
 *
 *   create → local (current first, then newest commit) → remote → manage
 *
 * Remote rows are hidden when a local branch of the same short name exists
 * (`origin/foo` says nothing `foo` does not). Local rows checked out in
 * another worktree stay visible but disabled, with the reason on the row,
 * because git will refuse them and the orchestration makes that common
 * (`frame/<slug>/work`). No `lucide`, no DOM, no Electron — pinned by
 * `test/branchPickerModel.test.js`.
 */

const { isValidBranchName } = require('../../shared/gitRefNames');

// ─── paths ────────────────────────────────────────────────

function normalizePath(p) {
  if (typeof p !== 'string') return '';
  const slashed = p.replace(/\\/g, '/');
  return slashed.length > 1 ? slashed.replace(/\/+$/, '') : slashed;
}

function basename(p) {
  const norm = normalizePath(p);
  return norm.split('/').filter(Boolean).pop() || norm;
}

/**
 * The worktree (other than the project's own) that has `name` checked out,
 * or null.
 *
 * @param {string} name
 * @param {Array<{ path: string, branch?: string }>} worktrees
 * @param {string} projectPath
 * @returns {{ path: string, branch: string } | null}
 */
function worktreeFor(name, worktrees, projectPath) {
  if (!name || !Array.isArray(worktrees)) return null;
  const here = normalizePath(projectPath);
  for (const wt of worktrees) {
    if (!wt || wt.branch !== name) continue;
    const there = normalizePath(wt.path);
    if (there && there !== here) return { path: wt.path, branch: wt.branch };
  }
  return null;
}

// ─── rows ─────────────────────────────────────────────────

function byRecency(a, b) {
  if (a.current !== b.current) return a.current ? -1 : 1;
  if ((b.time || 0) !== (a.time || 0)) return (b.time || 0) - (a.time || 0);
  return a.name.localeCompare(b.name);
}

function matches(name, needle) {
  return !needle || name.toLowerCase().includes(needle);
}

/**
 * @param {object} input
 * @param {Array} input.branches - `LOAD_GIT_BRANCHES` rows
 * @param {string} input.currentBranch - '' on detached HEAD
 * @param {Array} input.worktrees - `LOAD_GIT_WORKTREES` rows
 * @param {string} input.projectPath
 * @param {string} input.filter - the input's text, raw
 */
function buildRows(input) {
  const branches = Array.isArray(input && input.branches) ? input.branches : [];
  const currentBranch = (input && input.currentBranch) || '';
  const worktrees = (input && input.worktrees) || [];
  const projectPath = (input && input.projectPath) || '';
  const text = typeof (input && input.filter) === 'string' ? input.filter.trim() : '';
  const needle = text.toLowerCase();

  const localAll = branches.filter((b) => b && !b.isRemote && b.name);
  const localNames = new Set(localAll.map((b) => b.name));

  const local = localAll
    .filter((b) => matches(b.name, needle))
    .map((b) => {
      const wt = worktreeFor(b.name, worktrees, projectPath);
      return {
        kind: 'local',
        name: b.name,
        ref: b.name,
        current: b.name === currentBranch,
        date: b.date || '',
        time: b.time || 0,
        disabledReason: wt ? `in worktree ${basename(wt.path)}` : null
      };
    })
    .sort(byRecency);

  const remote = branches
    .filter((b) => b && b.isRemote && b.name)
    .filter((b) => {
      // Without a shortName (no remote matched in main) the row cannot be
      // deduped, so it stays — better one duplicate than a hidden branch.
      const short = b.shortName;
      return !(short && localNames.has(short));
    })
    .filter((b) => matches(b.name, needle))
    .map((b) => ({
      kind: 'remote',
      name: b.name,
      ref: b.name,
      shortName: b.shortName || b.name,
      current: false,
      date: b.date || '',
      time: b.time || 0,
      disabledReason: null
    }))
    .sort(byRecency);

  let create;
  if (!text) {
    create = { kind: 'create', name: '', valid: false, hidden: false, reason: 'Type a name' };
  } else if (localNames.has(text)) {
    create = { kind: 'create', name: text, valid: false, hidden: true, reason: null };
  } else if (!isValidBranchName(text)) {
    create = { kind: 'create', name: text, valid: false, hidden: false, reason: 'Invalid branch name' };
  } else {
    create = { kind: 'create', name: text, valid: true, hidden: false, reason: null };
  }

  return { create, local, remote, empty: local.length === 0 && remote.length === 0 };
}

// ─── keyboard order ───────────────────────────────────────

/**
 * The rows in the order the keyboard walks them. Each carries `enabled`.
 */
function flatten(output) {
  const items = [];
  if (output.create && !output.create.hidden) {
    items.push({ ...output.create, enabled: output.create.valid });
  }
  for (const row of output.local) items.push({ ...row, enabled: !row.disabledReason });
  for (const row of output.remote) items.push({ ...row, enabled: !row.disabledReason });
  items.push({ kind: 'manage', enabled: true });
  return items;
}

/**
 * Next highlight index from `index` by `delta` (±1), skipping disabled rows
 * and wrapping. -1 when nothing is enabled. From -1 (nothing highlighted),
 * +1 lands on the first enabled row and -1 on the last.
 */
function moveHighlight(items, index, delta) {
  const n = Array.isArray(items) ? items.length : 0;
  if (n === 0 || !items.some((i) => i.enabled)) return -1;
  const step = delta < 0 ? -1 : 1;
  let i = index;
  if (i < 0 || i >= n) i = step > 0 ? -1 : n;
  for (let tries = 0; tries < n; tries += 1) {
    i = (i + step + n) % n;
    if (items[i].enabled) return i;
  }
  return -1;
}

/** The first enabled row after the current one, for the initial highlight. */
function initialHighlight(items) {
  const idx = items.findIndex((i) => i.enabled && i.current);
  if (idx >= 0) return idx;
  return moveHighlight(items, -1, 1);
}

module.exports = { buildRows, worktreeFor, flatten, moveHighlight, initialHighlight };
