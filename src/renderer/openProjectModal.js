/**
 * Open Project Modal
 *
 * The header switcher's "Add a project…" entry. The body is the shared
 * projectStart block — the same three ways in the first-run screen and Home's
 * no-project state show — so the modal no longer carries its own option list
 * and clone form, which had drifted to different wording and icons.
 *
 * Like the other hosts, the modal does not close when a route starts: a folder
 * picker the user cancels leaves them here, and state.onProjectChange takes
 * the modal down when a project actually opens. The block owns its clone and
 * the CLONE_GITHUB_REPO_RESULT routing in index.js reaches it directly.
 *
 * Visibility follows the codebase modal convention (`.visible` on the overlay),
 * and Escape is gated on `classList.contains('visible')` so it never leaks a
 * key to the terminal (the b649542 fix).
 */

const state = require('./state');
const projectStart = require('./projectStart');

let modal = null;
let startEl = null;

/**
 * Show the modal, always on the three boxes with the clone row folded.
 */
function open() {
  if (!modal) return;
  if (startEl) projectStart.reset(startEl);
  modal.classList.add('visible');
}

function close() {
  if (!modal) return;
  modal.classList.remove('visible');
  if (startEl) projectStart.reset(startEl);
}

function isVisible() {
  return !!modal && modal.classList.contains('visible');
}

/**
 * Mount the block and wire the modal chrome. Safe to call once at startup.
 */
function init() {
  modal = document.getElementById('open-project-modal');
  if (!modal) return;

  const mount = document.getElementById('open-project-start');
  if (mount) {
    startEl = projectStart.create();
    mount.appendChild(startEl);
  } else {
    console.error('Open Project modal: #open-project-start not found — the three ways in will not render');
  }

  const closeBtn = document.getElementById('open-project-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', close);

  // Click on the backdrop closes.
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  // Escape-to-close, gated on visibility so it never leaks to the terminal.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isVisible()) return;
    // One keypress closes one thing: while the clone row is open, Escape
    // belongs to it (its input handles that itself and stops the event).
    if (projectStart.isCloneOpen(startEl)) return;
    e.preventDefault();
    close();
  });

  // Every route ends here, whichever box started it.
  state.onProjectChange((path) => {
    if (path && isVisible()) close();
  });
}

module.exports = {
  init,
  open,
  close,
  isVisible
};
