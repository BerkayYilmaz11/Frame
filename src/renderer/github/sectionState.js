/**
 * GitHub panel section state — pure (github-view-tree-layout spec, D7).
 *
 * The panel body is four stacked, collapsible sections plus one sub-group
 * (Remote, under Branches). This module owns which of them are expanded and
 * nothing else — no DOM, no localStorage, no Electron — in the shape
 * `dock/dockState.js` already proved, so the transitions are pinned by
 * `test/githubSectionState.test.js`.
 *
 * The host (`githubPanel.js`) applies a state to the DOM and persists
 * `serialize()`'s string under `STORAGE_KEY`, app-wide, not per project.
 */

const STORAGE_KEY = 'frame-github-sections';

/** Ordered section ids — the panel's top-to-bottom order. */
const SECTIONS = ['prs', 'issues', 'branches', 'worktrees'];

/** Collapsible sub-groups inside a section. */
const SUBGROUPS = ['remote'];

const IDS = SECTIONS.concat(SUBGROUPS);

/**
 * D3: Pull Requests and Branches start expanded — the two most used
 * sections fit a 280px sidebar without a scroll. Issues, Worktrees and the
 * Remote sub-group start collapsed.
 */
function defaults() {
  return { prs: true, issues: false, branches: true, worktrees: false, remote: false };
}

function isId(id) {
  return IDS.includes(id);
}

/**
 * A valid state from anything: a JSON string, a parsed object, garbage,
 * nothing. Each key falls back to its default on its own, so one bad value
 * never resets the others.
 */
function load(raw) {
  const base = defaults();
  let input = raw;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch (_) {
      return base;
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;

  const next = {};
  for (const id of IDS) {
    next[id] = typeof input[id] === 'boolean' ? input[id] : base[id];
  }
  return next;
}

function copy(state) {
  const next = {};
  for (const id of IDS) next[id] = state[id] === true;
  return next;
}

function isExpanded(state, id) {
  return isId(id) && state[id] === true;
}

/** Flip one section or sub-group; an unknown id is a no-op copy. */
function toggle(state, id) {
  const next = copy(state);
  if (!isId(id)) return next;
  next[id] = !next[id];
  return next;
}

function setExpanded(state, id, expanded) {
  const next = copy(state);
  if (!isId(id)) return next;
  next[id] = expanded === true;
  return next;
}

/** The section ids that are currently expanded, in panel order. */
function expandedSections(state) {
  return SECTIONS.filter((id) => state[id] === true);
}

/** The string written to localStorage. */
function serialize(state) {
  return JSON.stringify(copy(state));
}

module.exports = {
  STORAGE_KEY,
  SECTIONS,
  SUBGROUPS,
  defaults,
  isId,
  load,
  isExpanded,
  toggle,
  setExpanded,
  expandedSections,
  serialize
};
