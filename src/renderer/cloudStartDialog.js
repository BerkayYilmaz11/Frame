/**
 * Cloud Start Work dialog (frame-cloud-brief-start spec)
 *
 * The confirm that turns a shaped work brief's parts into specs and tasks on
 * a new branch. It asks main to prepare (the parts, the branch suggestions,
 * the folder's branch and change count, and the base), lets the user pick
 * where to begin — Begin with a part, Create only, or Orchestrate (not yet)
 * — and a branch name, warns before a dirty folder is stashed, and then asks
 * main to start. Main re-checks everything and holds every write: this
 * module sends a folder path, a brief number and the user's choices.
 *
 * Its words live in cloudBriefsCopy.js. The panel decides what happens after
 * a start (the toast, the reload, the Begin lane) through `onStarted` and
 * `onPartial`.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');
const { escapeHtml } = require('./htmlUtils');
const copy = require('./cloudBriefsCopy');

// The one open dialog: { el, number, view, choice, edited, pending, stash, done }.
let dialog = null;

function ref(name) {
  return dialog ? dialog.el.querySelector(`[data-ref="${name}"]`) : null;
}

/**
 * Open the dialog for brief `number`. `onStarted(result)` runs after a start
 * that landed (the dialog is closed by then); `onPartial()` after one that
 * started in the cloud but failed locally (the dialog stays, showing what is
 * missing).
 */
function open({ number, onStarted, onPartial }) {
  if (dialog) return;
  const el = document.createElement('div');
  el.className = 'cloud-briefs-dialog-backdrop';
  const id = `cloud-briefs-start-${number}`;
  el.innerHTML = `<div class="cloud-briefs-dialog cloud-briefs-start-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <h3 id="${id}-title">${escapeHtml(copy.startDialogTitle(number))}</h3>
      <div data-ref="body"><p class="cloud-briefs-muted">Loading…</p></div>
    </div>`;
  dialog = { el, id, number, view: null, choice: null, edited: false, pending: false, stash: false, done: false, onStarted, onPartial };
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  document.body.appendChild(el);
  prepare();
}

function close() {
  if (!dialog || dialog.pending) return;
  dialog.el.remove();
  dialog = null;
}

async function prepare() {
  const current = dialog;
  const path = state.getProjectPath();
  let view;
  try {
    view = path
      ? await ipcRenderer.invoke(IPC.CLOUD_BRIEF_START_PREPARE, path, current.number)
      : { ok: false, reason: 'notConnected' };
  } catch (err) {
    console.error('cloudStartDialog: could not prepare Start Work', err);
    view = { ok: false, reason: 'other' };
  }
  if (dialog !== current) return; // closed while main answered
  if (!view || !view.ok) {
    renderFailure(copy.startErrorMessage(view));
    return;
  }
  current.view = view;
  current.choice = view.parts.length > 0 ? `begin:${view.parts[0].partId}` : 'create';
  renderReady();
}

// ─── Rendering ────────────────────────────────────────────────

function renderFailure(message) {
  ref('body').innerHTML = `<p class="cloud-briefs-form-error">${escapeHtml(message)}</p>
    <div class="cloud-briefs-form-actions cloud-briefs-start-actions">
      <button type="button" class="cloud-briefs-web-btn" data-action="cancel">${escapeHtml(copy.CANCEL_LABEL)}</button>
    </div>`;
  ref('body').querySelector('[data-action="cancel"]').focus();
}

/** The suggestion for the current choice: the part's for Begin, the brief's for Create only. */
function suggestion() {
  const { view, choice } = dialog;
  if (choice && choice.startsWith('begin:')) return view.suggestions.parts[choice.slice('begin:'.length)] || view.suggestions.createOnly;
  return view.suggestions.createOnly;
}

function choiceRow(value, label, hint, { disabled = false, tag = '' } = {}) {
  const checked = dialog.choice === value;
  return `<label class="cloud-briefs-start-choice${disabled ? ' disabled' : ''}">
      <input type="radio" name="${dialog.id}-choice" value="${escapeHtml(value)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
      <span class="cloud-briefs-start-choice-text">
        <span class="cloud-briefs-start-choice-label">${escapeHtml(label)}${tag ? ` <span class="cloud-briefs-start-soon">${escapeHtml(tag)}</span>` : ''}</span>
        <span class="cloud-briefs-field-hint">${escapeHtml(hint)}</span>
      </span>
    </label>`;
}

function renderReady() {
  const { view, id } = dialog;
  const blocked = view.problems.length > 0 || !view.base;
  ref('body').innerHTML = `
    <p class="cloud-briefs-muted">${escapeHtml(copy.START_DIALOG_DESCRIPTION)}</p>
    <ol class="cloud-briefs-start-parts">${view.parts.map((p) => `
      <li>
        <span class="cloud-briefs-part-title">${escapeHtml(p.title)}</span>
        <span class="cloud-briefs-chip">${escapeHtml(p.shape)}</span>
        <span class="cloud-briefs-chip">${escapeHtml(p.type)}</span>
      </li>`).join('')}
    </ol>
    <fieldset class="cloud-briefs-field">
      <legend class="cloud-briefs-label">${escapeHtml(copy.START_CHOICE_TITLE)}</legend>
      <div class="cloud-briefs-start-choices">
        ${view.parts.map((p) => choiceRow(`begin:${p.partId}`, copy.beginWithLabel(p.title), copy.beginHint(p.shape))).join('')}
        ${choiceRow('create', copy.CREATE_ONLY_LABEL, copy.CREATE_ONLY_HINT)}
        ${choiceRow('orchestrate', copy.ORCHESTRATE_LABEL, 'Plan and run every spec with the conductor.', { disabled: true, tag: copy.COMING_SOON })}
      </div>
    </fieldset>
    <div class="cloud-briefs-field">
      <label class="cloud-briefs-label" for="${id}-branch">${escapeHtml(copy.BRANCH_LABEL)}</label>
      <input id="${id}-branch" class="cloud-briefs-input" data-ref="branch" spellcheck="false" autocomplete="off" value="${escapeHtml(suggestion())}">
      ${view.base
        ? `<p class="cloud-briefs-field-hint">${escapeHtml(copy.cutFromLine(view.base))}</p>`
        : `<p class="cloud-briefs-field-error">${escapeHtml(copy.baseMissingLine(view.targetBranch))}</p>`}
    </div>
    ${view.problems.length > 0 ? `<ul class="cloud-briefs-start-problems">${view.problems
      .map((p) => `<li class="cloud-briefs-field-error">${escapeHtml(copy.partProblemMessage(p.title, p.reason))}</li>`).join('')}</ul>` : ''}
    <div class="cloud-briefs-start-dirty" data-ref="dirty" hidden></div>
    <p class="cloud-briefs-form-error" data-ref="error" hidden></p>
    <div class="cloud-briefs-form-actions cloud-briefs-start-actions" data-ref="actions">
      <button type="button" class="cloud-briefs-web-btn" data-action="cancel">${escapeHtml(copy.CANCEL_LABEL)}</button>
      <button type="button" class="cloud-briefs-primary-btn" data-action="confirm"${blocked ? ' disabled' : ''}>${escapeHtml(copy.startSubmitLabel(false))}</button>
    </div>`;
  const focus = blocked ? ref('body').querySelector('[data-action="cancel"]') : ref('branch');
  if (focus) focus.focus();
}

/** Ask before stashing: the folder's branch and change count, Stash and continue or Cancel. */
function showDirty(branch, count) {
  const dirty = ref('dirty');
  dirty.innerHTML = `<p>${escapeHtml(copy.dirtyWarning(branch, count))}</p>
    <div class="cloud-briefs-start-actions">
      <button type="button" class="cloud-briefs-web-btn" data-action="cancel">${escapeHtml(copy.CANCEL_LABEL)}</button>
      <button type="button" class="cloud-briefs-primary-btn" data-action="stash">${escapeHtml(copy.STASH_AND_CONTINUE_LABEL)}</button>
    </div>`;
  dirty.hidden = false;
  ref('actions').hidden = true;
  dirty.querySelector('[data-action="stash"]').focus();
}

function showError(message) {
  const errorEl = ref('error');
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function setPending(on) {
  dialog.pending = on;
  const confirm = ref('body').querySelector('[data-action="confirm"]');
  if (confirm) {
    confirm.disabled = on;
    confirm.textContent = copy.startSubmitLabel(on);
  }
  const stash = ref('body').querySelector('[data-action="stash"]');
  if (stash) stash.disabled = on;
  for (const input of dialog.el.querySelectorAll('input')) input.disabled = on || input.closest('.disabled') !== null;
}

// ─── Events ───────────────────────────────────────────────────

function onClick(e) {
  if (!dialog) return;
  if (e.target === dialog.el) {
    close();
    return;
  }
  const action = e.target.closest('[data-action]');
  if (!action) return;
  const name = action.dataset.action;
  if (name === 'cancel') close();
  else if (name === 'confirm') confirm();
  else if (name === 'stash') {
    dialog.stash = true;
    confirm();
  }
}

function onChange(e) {
  if (!dialog || !dialog.view || e.target.type !== 'radio') return;
  dialog.choice = e.target.value;
  // The field follows the choice until the user types in it.
  if (!dialog.edited) ref('branch').value = suggestion();
}

function onInput(e) {
  if (dialog && e.target === ref('branch')) dialog.edited = true;
}

async function confirm() {
  const current = dialog;
  if (!current || current.pending || current.done || !current.view) return;
  if (current.view.changeCount > 0 && !current.stash) {
    showDirty(current.view.currentBranch, current.view.changeCount);
    return;
  }
  const path = state.getProjectPath();
  const choice = current.choice || 'create';
  const request = {
    number: current.number,
    beginPartId: choice.startsWith('begin:') ? choice.slice('begin:'.length) : null,
    branch: ref('branch').value.trim(),
    stash: current.stash,
  };
  ref('error').hidden = true;
  setPending(true);
  let result;
  try {
    result = path
      ? await ipcRenderer.invoke(IPC.CLOUD_BRIEF_START, path, request)
      : { ok: false, reason: 'notConnected' };
  } catch (err) {
    console.error('cloudStartDialog: could not start the brief', err);
    result = { ok: false, reason: 'other' };
  }
  if (dialog !== current) return;
  setPending(false);

  if (result && result.ok) {
    close();
    if (current.onStarted) current.onStarted(result);
    return;
  }
  if (result && result.reason === 'dirty') {
    // The folder changed after the dialog opened: ask now, never stash silently.
    current.view.changeCount = result.changeCount;
    current.view.currentBranch = result.currentBranch;
    showDirty(result.currentBranch, result.changeCount);
    return;
  }
  // A refusal returns to the form; the dirty question is asked again next time.
  current.stash = false;
  ref('dirty').hidden = true;
  ref('actions').hidden = false;
  if (result && result.reason === 'partial') {
    // Started in the cloud: nothing to retry here, only what to finish by hand.
    current.done = true;
    showError(copy.partialMessage(result));
    const confirmBtn = ref('body').querySelector('[data-action="confirm"]');
    if (confirmBtn) confirmBtn.remove();
    for (const input of current.el.querySelectorAll('input')) input.disabled = true;
    if (current.onPartial) current.onPartial(result);
    return;
  }
  showError(copy.startErrorMessage(result));
}

module.exports = { open };
