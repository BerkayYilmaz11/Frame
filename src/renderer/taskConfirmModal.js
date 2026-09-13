/**
 * Task Confirm-Delete Modal
 *
 * One small confirmation dialog shared between the tasks side panel (✕ on a
 * row) and the dashboard detail aside (Delete button on a selected card).
 * Centralized so both entry points share copy, styling, and the same
 * "Are you sure?" guard before any DELETE_TASK is dispatched.
 *
 * github-view-tree-layout spec (D8): `open()` also accepts `heading`,
 * `message` and `confirmLabel`, so the GitHub panel's branch delete /
 * worktree remove flows share this one modal — one confirm discipline
 * (Cancel focused first, Enter activates only the focused button) instead
 * of a second dialog to keep in sync. The task wording stays the default.
 */

const DEFAULT_HEADING = 'Delete task?';
const DEFAULT_MESSAGE = "This task will be removed permanently. This action can't be undone.";
const DEFAULT_CONFIRM_LABEL = 'Delete';

let modalEl = null;
let headingEl = null;
let messageEl = null;
let cancelBtn = null;
let deleteBtn = null;
let activeOnConfirm = null;
let activeOnCancel = null;
let initialized = false;

function init() {
  if (initialized) return;
  modalEl = document.getElementById('task-confirm-delete-modal');
  if (!modalEl) return;
  headingEl = document.getElementById('task-confirm-delete-heading');
  messageEl = document.getElementById('task-confirm-delete-message');
  cancelBtn = document.getElementById('task-confirm-cancel');
  deleteBtn = document.getElementById('task-confirm-delete');

  cancelBtn.addEventListener('click', cancel);
  deleteBtn.addEventListener('click', confirm);

  // Backdrop click cancels
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) cancel();
  });

  // Esc cancels (capture phase to beat the dashboard's Esc handler)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modalEl.classList.contains('visible')) return;
    e.stopPropagation();
    cancel();
  }, true);

  // Enter activates the focused button. Anywhere else (or focus lost),
  // Enter cancels — delete is irreversible, so the safe action is the
  // default and the destructive path needs an explicit choice.
  modalEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && modalEl.classList.contains('visible')) {
      e.preventDefault();
      if (document.activeElement === deleteBtn) confirm();
      else cancel();
    }
  });

  initialized = true;
}

/**
 * Open the modal.
 * @param {object} opts
 * @param {string} [opts.title]   - Optional task title; appears in the message.
 * @param {string} [opts.heading] - Dialog heading; defaults to the task wording.
 * @param {string} [opts.message] - Body text; overrides the task wording (and `title`).
 * @param {string} [opts.confirmLabel] - Confirm button label; defaults to "Delete".
 * @param {function} opts.onConfirm - Called when user confirms delete.
 * @param {function} [opts.onCancel] - Optional cancel callback.
 */
function open(opts = {}) {
  if (!initialized) init();
  if (!modalEl) return;

  activeOnConfirm = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
  activeOnCancel = typeof opts.onCancel === 'function' ? opts.onCancel : null;

  if (headingEl) {
    headingEl.textContent = typeof opts.heading === 'string' && opts.heading ? opts.heading : DEFAULT_HEADING;
  }
  if (deleteBtn) {
    deleteBtn.textContent = typeof opts.confirmLabel === 'string' && opts.confirmLabel
      ? opts.confirmLabel
      : DEFAULT_CONFIRM_LABEL;
  }
  if (messageEl) {
    if (typeof opts.message === 'string' && opts.message) {
      messageEl.textContent = opts.message;
    } else if (opts.title) {
      messageEl.innerHTML = `&ldquo;<strong></strong>&rdquo; will be removed permanently. This action can't be undone.`;
      messageEl.querySelector('strong').textContent = opts.title;
    } else {
      messageEl.textContent = DEFAULT_MESSAGE;
    }
  }

  modalEl.classList.add('visible');
  // Focus Cancel so a blind Enter is safe; deleting requires Tab/click.
  requestAnimationFrame(() => cancelBtn && cancelBtn.focus());
}

function close() {
  if (!modalEl) return;
  modalEl.classList.remove('visible');
  activeOnConfirm = null;
  activeOnCancel = null;
}

function confirm() {
  const cb = activeOnConfirm;
  close();
  if (cb) cb();
}

function cancel() {
  const cb = activeOnCancel;
  close();
  if (cb) cb();
}

module.exports = {
  init,
  open
};
