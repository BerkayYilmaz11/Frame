/**
 * Project Start — the three ways into a project, as one block
 *
 * Open a folder · Create a new project · Clone from GitHub, with the clone
 * form inline rather than behind a modal. Three surfaces show it and they must
 * not drift: the first-run onboarding screen, Home's no-project state, and the
 * Open a Project modal behind the header switcher's "Add a project…".
 *
 * Each `create()` returns its own element, but the clone in flight is
 * module-level: main answers on one channel, and the reply belongs to
 * whichever block sent it, not to whichever was built last.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');

const FOLDER_ICON = '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>';
const PLUS_ICON = '<path d="M12 5v14"/><path d="M5 12h14"/>';
const GITHUB_ICON = '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>';

function icon(paths) {
  return `<svg class="project-start-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// The block that owns the clone currently in flight, so its result lands on
// the row the user is actually looking at.
let cloningBlock = null;

/**
 * Build one instance of the block.
 * @returns {HTMLElement}
 */
function create() {
  const el = document.createElement('div');
  el.className = 'project-start';
  el.innerHTML = `
    <div class="project-start-actions">
      <button type="button" class="project-start-box" data-action="folder">
        ${icon(FOLDER_ICON)}
        <span class="project-start-box-label">Open a folder</span>
        <span class="project-start-box-hint">Work in a project you already have</span>
      </button>
      <button type="button" class="project-start-box" data-action="create">
        ${icon(PLUS_ICON)}
        <span class="project-start-box-label">Create a new project</span>
        <span class="project-start-box-hint">Start an empty one from scratch</span>
      </button>
      <button type="button" class="project-start-box" data-action="clone">
        ${icon(GITHUB_ICON)}
        <span class="project-start-box-label">Clone from GitHub</span>
        <span class="project-start-box-hint">Pull a repository down first</span>
      </button>
    </div>
    <div class="project-start-clone">
      <div class="project-start-clone-row">
        <input type="text" class="project-start-clone-url"
          placeholder="https://github.com/user/repo"
          autocomplete="off" spellcheck="false" aria-label="Repository URL" />
        <button type="button" class="project-start-clone-go">Clone</button>
        <button type="button" class="project-start-clone-cancel">Cancel</button>
      </div>
      <div class="project-start-clone-error"></div>
    </div>
  `;

  const q = (sel) => el.querySelector(sel);
  const url = q('.project-start-clone-url');

  // None of these closes the surface it sits on. A folder picker the user
  // cancels has to leave them where they were, and the surfaces take
  // themselves down on state.onProjectChange when a project actually opens.
  el.querySelector('[data-action="folder"]').addEventListener('click', () => state.selectProjectFolder());
  el.querySelector('[data-action="create"]').addEventListener('click', () => state.createNewProject());
  el.querySelector('[data-action="clone"]').addEventListener('click', () => showClone(el));

  q('.project-start-clone-cancel').addEventListener('click', () => hideClone(el));
  q('.project-start-clone-go').addEventListener('click', () => submitClone(el));

  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitClone(el);
    } else if (e.key === 'Escape') {
      // Escape backs out of the clone row, not out of the surface around it.
      e.preventDefault();
      e.stopPropagation();
      hideClone(el);
    }
  });

  return el;
}

/**
 * Fold the clone row back and clear it. For hosts that are re-shown rather
 * than rebuilt (the Open a Project modal); a clone in flight is left alone.
 */
function reset(el) {
  if (el) hideClone(el);
}

/** Is this block's clone row open? Surfaces ask before claiming Escape. */
function isCloneOpen(el) {
  return !!el && el.classList.contains('project-start-cloning');
}

function showClone(el) {
  el.classList.add('project-start-cloning');
  setError(el, '');
  const url = el.querySelector('.project-start-clone-url');
  if (url) url.focus();
}

function hideClone(el) {
  if (cloningBlock === el) return;   // main is working; let it finish or fail
  el.classList.remove('project-start-cloning');
  setError(el, '');
  const url = el.querySelector('.project-start-clone-url');
  if (url) url.value = '';
}

function submitClone(el) {
  const url = el.querySelector('.project-start-clone-url');
  if (!url) return;
  const value = url.value.trim();
  if (!value) {
    setError(el, 'Paste a repository URL first.');
    url.focus();
    return;
  }
  setError(el, '');
  setBusy(el, true);
  cloningBlock = el;
  ipcRenderer.send(IPC.CLONE_GITHUB_REPO, value);
}

/**
 * Called by the CLONE_GITHUB_REPO_RESULT listener in index.js. Returns true
 * when a block owned this clone, so the failure is reported where the user is
 * looking.
 */
function handleCloneResult(result) {
  const el = cloningBlock;
  if (!el) return false;
  cloningBlock = null;
  setBusy(el, false);
  // Cancelled at main's destination picker: nothing failed, nothing happened.
  if (result.cancelled) return true;
  if (!result.success) {
    setError(el, result.error || 'Clone failed.');
    return true;
  }
  // Success needs no teardown here: setProjectPath fires onProjectChange, and
  // each surface leaves on that, the same way the other two routes end.
  return true;
}

function setBusy(el, value) {
  el.dataset.busy = value ? 'true' : 'false';
  const go = el.querySelector('.project-start-clone-go');
  if (go) go.textContent = value ? 'Cloning…' : 'Clone';
}

function setError(el, message) {
  const box = el.querySelector('.project-start-clone-error');
  if (!box) return;
  box.textContent = message;
  box.dataset.shown = message ? 'true' : 'false';
}

module.exports = { create, handleCloneResult, isCloneOpen, reset };
