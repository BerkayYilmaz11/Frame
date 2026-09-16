/**
 * Open Project Modal
 *
 * A UI shell over the existing project-opening IPC flows. It does NOT own any
 * business logic — Select Folder and Create New delegate straight to `state`,
 * and Clone GitHub sends `CLONE_GITHUB_REPO` exactly as the old inline sidebar
 * row did. The `CLONE_GITHUB_REPO_RESULT` listener stays in `index.js`; it
 * calls back into `handleCloneResult()` here for in-modal feedback.
 *
 * Visibility follows the codebase modal convention (`.visible` on the overlay),
 * and Escape is gated on `classList.contains('visible')` so it never leaks a
 * key to the terminal (the b649542 fix).
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');

let modal = null;
let cloneForm = null;
let cloneFooter = null;
let cloneUrlInput = null;
let cloneError = null;

/**
 * Show the modal. Pass `{ clone: true }` to open straight into the clone form
 * (used by the onboarding screen's "Clone from GitHub" box).
 */
function open(opts = {}) {
  if (!modal) return;
  resetCloneForm();
  modal.classList.add('visible');
  if (opts && opts.clone) showCloneForm();
}

/**
 * Hide the modal and reset the clone form.
 */
function close() {
  if (!modal) return;
  modal.classList.remove('visible');
  resetCloneForm();
}

function isVisible() {
  return !!modal && modal.classList.contains('visible');
}

/**
 * Collapse the clone form back to the option list and clear its state.
 */
function resetCloneForm() {
  if (cloneForm) cloneForm.style.display = 'none';
  if (cloneFooter) cloneFooter.style.display = 'none';
  if (cloneError) {
    cloneError.style.display = 'none';
    cloneError.textContent = '';
  }
  if (cloneUrlInput) cloneUrlInput.value = '';
}

/**
 * Reveal the in-modal clone URL form and focus the input.
 */
function showCloneForm() {
  if (cloneForm) cloneForm.style.display = '';
  if (cloneFooter) cloneFooter.style.display = '';
  if (cloneError) {
    cloneError.style.display = 'none';
    cloneError.textContent = '';
  }
  if (cloneUrlInput) {
    cloneUrlInput.focus();
  }
}

/**
 * Send the clone request for the current URL value (if any).
 */
function submitClone() {
  if (!cloneUrlInput) return;
  const url = cloneUrlInput.value.trim();
  if (!url) return;
  ipcRenderer.send(IPC.CLONE_GITHUB_REPO, url);
}

/**
 * Called by the `CLONE_GITHUB_REPO_RESULT` listener in index.js. Shows the
 * error inline when the clone form is active, otherwise the caller handles it.
 * Returns true if it consumed the result (modal handled the feedback).
 */
function handleCloneResult(result) {
  if (!isVisible()) return false;
  if (!result.success) {
    if (cloneError) {
      cloneError.textContent = result.error || 'Clone failed.';
      cloneError.style.display = '';
    }
    return true;
  }
  // Success: the listener applies setProjectPath; we just close.
  close();
  return true;
}

/**
 * Wire all modal controls. Safe to call once at startup.
 */
function init() {
  modal = document.getElementById('open-project-modal');
  if (!modal) return;

  cloneForm = document.getElementById('open-project-clone-form');
  cloneFooter = document.getElementById('open-project-clone-footer');
  cloneUrlInput = document.getElementById('open-project-clone-url');
  cloneError = document.getElementById('open-project-clone-error');

  const closeBtn = document.getElementById('open-project-modal-close');
  const selectBtn = document.getElementById('open-project-select');
  const createBtn = document.getElementById('open-project-create');
  const cloneToggle = document.getElementById('open-project-clone-toggle');
  const cloneConfirm = document.getElementById('open-project-clone-confirm');
  const cloneCancel = document.getElementById('open-project-clone-cancel');

  if (closeBtn) closeBtn.addEventListener('click', close);

  if (selectBtn) {
    selectBtn.addEventListener('click', () => {
      state.selectProjectFolder();
      close();
    });
  }

  if (createBtn) {
    createBtn.addEventListener('click', () => {
      state.createNewProject();
      close();
    });
  }

  if (cloneToggle) cloneToggle.addEventListener('click', showCloneForm);
  if (cloneCancel) cloneCancel.addEventListener('click', resetCloneForm);
  if (cloneConfirm) cloneConfirm.addEventListener('click', submitClone);

  if (cloneUrlInput) {
    cloneUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitClone();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        resetCloneForm();
      }
    });
  }

  // Click on the backdrop closes.
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  // Escape-to-close, gated on visibility so it never leaks to the terminal.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVisible()) {
      // If the clone form is open, first Escape collapses it (handled by the
      // input's own listener when focused); here we close the whole modal.
      if (document.activeElement === cloneUrlInput) return;
      close();
    }
  });
}

module.exports = {
  init,
  open,
  close,
  isVisible,
  handleCloneResult
};
