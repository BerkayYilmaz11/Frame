/**
 * "Close this terminal?" confirmation.
 *
 * The × on a terminal's breadcrumb chip closes that terminal for good — its
 * process is killed, and whatever is running in it (an agent mid-task, a dev
 * server) stops. The chip sits in the top bar, far from the terminal itself,
 * so it is easy to hit without looking at what is running; this asks first.
 *
 * "Don't ask again" is remembered in localStorage (the same store the bar's
 * other chrome preferences use); after that the × closes silently. The key is
 * new: an opt-out given to the old "only removes it from the bar" notice must
 * not turn into silently killing terminals.
 */

const SUPPRESS_KEY = 'frame-terminal-close-confirm-off';

let modalEl = null;
let titleEl = null;
let bodyEl = null;
let checkboxEl = null;
let cancelBtn = null;
let closeBtn = null;
let pending = null;   // the onConfirm of the open dialog

function _suppressed() {
  try {
    return localStorage.getItem(SUPPRESS_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function _persistSuppression() {
  if (!checkboxEl || !checkboxEl.checked) return;
  try {
    localStorage.setItem(SUPPRESS_KEY, '1');
  } catch (err) {
    console.error('Terminal chip notice: failed to persist preference', err);
  }
}

function _build() {
  if (modalEl) return;

  modalEl = document.createElement('div');
  modalEl.className = 'tcn-modal';
  modalEl.innerHTML = `
    <div class="tcn-container" role="dialog" aria-modal="true" aria-labelledby="tcn-title">
      <h3 class="tcn-title" id="tcn-title">Close this terminal?</h3>
      <p class="tcn-body"></p>
      <label class="tcn-check">
        <input type="checkbox" />
        <span>Don't ask again</span>
      </label>
      <div class="tcn-footer">
        <button type="button" class="tcn-cancel">Cancel</button>
        <button type="button" class="tcn-close">Close terminal</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  titleEl = modalEl.querySelector('.tcn-title');
  bodyEl = modalEl.querySelector('.tcn-body');
  checkboxEl = modalEl.querySelector('.tcn-check input');
  cancelBtn = modalEl.querySelector('.tcn-cancel');
  closeBtn = modalEl.querySelector('.tcn-close');

  cancelBtn.addEventListener('click', _cancel);
  closeBtn.addEventListener('click', _accept);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) _cancel();
  });

  // Esc cancels. Capture, so a surface underneath with its own Esc handler
  // (the dashboards) does not act on a key that was meant for this dialog.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !modalEl.classList.contains('visible')) return;
    e.stopPropagation();
    _cancel();
  }, true);

  // Closing kills a process, so Enter only closes when the Close button
  // itself has focus — anywhere else it backs out.
  modalEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (document.activeElement === closeBtn) _accept();
    else _cancel();
  });
}

function _close() {
  pending = null;
  if (modalEl) modalEl.classList.remove('visible');
}

function _cancel() {
  // The checkbox is a preference about this dialog, not about this answer —
  // ticking it and backing out still means "stop asking me".
  _persistSuppression();
  _close();
}

function _accept() {
  const go = pending;
  _persistSuppression();
  _close();
  if (go) go();
}

/**
 * Close a terminal from its chip, asking first unless the user opted out.
 *
 * @param {object} opts
 * @param {string} opts.name        - the terminal's display name
 * @param {Function} opts.onConfirm - run when the user goes ahead
 */
function confirmClose({ name, onConfirm }) {
  if (typeof onConfirm !== 'function') return;
  if (_suppressed()) {
    onConfirm();
    return;
  }

  _build();
  if (!modalEl) {           // no DOM to build into — never block the action
    onConfirm();
    return;
  }

  pending = onConfirm;
  checkboxEl.checked = false;
  bodyEl.textContent = '';
  const who = document.createElement('strong');
  who.textContent = name || 'This terminal';
  bodyEl.appendChild(who);
  bodyEl.append(
    ' will be closed and its process stopped. Anything still running in it — '
    + 'an agent mid-task, a server, a build — ends too, and its output is lost. '
    + 'This cannot be undone.'
  );

  modalEl.classList.add('visible');
  // Focus the safe choice: a stray Enter should not kill a terminal.
  requestAnimationFrame(() => cancelBtn && cancelBtn.focus());
}

module.exports = { confirmClose };
