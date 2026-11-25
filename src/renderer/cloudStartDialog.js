/**
 * Cloud Start Work dialog (frame-cloud-brief-start spec)
 *
 * Begins one part of a shaped work brief on a branch of its own, in two
 * steps (frame-cloud-start-places): Start Work on a brief not started yet
 * first asks what to work on — every part, and Orchestrate, disabled — then,
 * after Next, where to work. Begin on a started brief's part opens on the
 * second step for that part alone. Back returns to the first step and keeps
 * every choice. The branch
 * row reads like a code host's new-branch control: the name as an editable
 * chip, prefilled with the suggestion, and "from <base> ⌄", the brief's
 * target unless the user picks another local or origin branch. The folder's
 * uncommitted changes are not asked about: the part opens in a workspace of
 * its own, and the main checkout is never switched or stashed
 * (frame-cloud-start-workspace). Under the branch row, the workspace's name
 * follows the branch as it is typed. With a server saved, a Location line
 * offers This Mac (always selected when the dialog opens) and each saved
 * Frame Server by host (frame-cloud-start-on-server). A server that is not
 * connected is disabled, and so is every server in local mode. Choosing a server
 * narrows the base menu to origin's branches — a server cuts only from
 * origin — and names the workspace against that server's workspaces.
 *
 * Main prepares the view and does every check and write again: this module
 * sends a folder path, a brief number and the user's choices. Its words live
 * in cloudBriefsCopy.js; the panel handles what follows a start through
 * `onStarted` and `onPartial`.
 */

const { ipcRenderer } = require('electron');
const { GitBranch, Cloud, ChevronDown, Check } = require('lucide');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');
const dock = require('./dock');
const { escapeHtml } = require('./htmlUtils');
const copy = require('./cloudBriefsCopy');

const ICON = {
  branch: dock.lucideIcon(GitBranch, 14),
  local: dock.lucideIcon(GitBranch, 13),
  remote: dock.lucideIcon(Cloud, 13),
  chevron: dock.lucideIcon(ChevronDown, 13),
  check: dock.lucideIcon(Check, 12),
};

// The one open dialog: { el, id, number, partId, view, step (1: what to work
// on, 2: where to work), choice, edited, branchText (the branch name as
// typed, kept across steps), base, location ('local' or a saved server's
// key), macBase (the base to restore when This Mac is chosen again),
// menuOpen, pending, done, onStarted, onPartial }.
let dialog = null;

function ref(name) {
  return dialog ? dialog.el.querySelector(`[data-ref="${name}"]`) : null;
}

/**
 * Open the dialog for brief `number`; `partId` names the part to begin on a
 * started brief (Begin). `onStarted(result)` runs after a part was begun (the
 * dialog is closed by then); `onPartial(result)` after one that failed past
 * the checks (the dialog stays, naming what is missing).
 */
function open({ number, partId = null, onStarted, onPartial }) {
  if (dialog) return;
  const el = document.createElement('div');
  el.className = 'cloud-briefs-dialog-backdrop';
  const id = `cloud-briefs-start-${number}`;
  el.innerHTML = `<div class="cloud-briefs-dialog cloud-briefs-start-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <h3 id="${id}-title" data-ref="title">${escapeHtml(copy.startDialogTitle(number))}</h3>
      <div data-ref="body"><p class="cloud-briefs-muted">Loading…</p></div>
    </div>`;
  dialog = {
    el, id, number, partId, view: null, step: 1, choice: null, edited: false, branchText: '', base: null,
    location: 'local', macBase: null,
    menuOpen: false, pending: false, done: false, onStarted, onPartial,
  };
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKeydown);
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
  // Begin names its part; Start Work begins with the first part that can be.
  const wanted = current.partId && view.parts.find((p) => p.partId === current.partId);
  if (view.mode === 'begin' && (!wanted || !wanted.canBegin)) {
    renderFailure(copy.startErrorMessage({ reason: wanted && wanted.begunBranch ? 'alreadyBegun' : 'notStartable', detail: wanted && wanted.begunBranch }));
    return;
  }
  const first = view.parts.find((p) => p.canBegin) || view.parts[0];
  current.view = view;
  current.choice = (wanted || first).partId;
  current.branchText = view.suggestions[current.choice] || '';
  current.base = view.base;
  // Begin knows its part: it opens on where to work.
  current.step = view.mode === 'begin' ? 2 : 1;
  if (view.mode === 'begin') ref('title').textContent = copy.beginDialogTitle(wanted.title);
  renderStep();
}

// ─── Rendering ────────────────────────────────────────────────

function renderFailure(message) {
  ref('body').innerHTML = `<p class="cloud-briefs-form-error">${escapeHtml(message)}</p>
    <div class="cloud-briefs-start-actions">
      <button type="button" class="cloud-briefs-web-btn" data-action="cancel">${escapeHtml(copy.CANCEL_LABEL)}</button>
    </div>`;
  ref('body').querySelector('[data-action="cancel"]').focus();
}

function chosenPart() {
  return dialog.view.parts.find((p) => p.partId === dialog.choice) || null;
}

function partChips(part) {
  return `<span class="cloud-briefs-chip">${escapeHtml(part.shape)}</span>
    <span class="cloud-briefs-chip">${escapeHtml(part.type)}</span>`;
}

function problemLine(part) {
  return part.problem
    ? `<span class="cloud-briefs-field-error">${escapeHtml(copy.partProblemMessage(part.title, part.problem))}</span>`
    : '';
}

/** Step 1 on a brief not started yet: a choice per part, and Orchestrate (not yet). */
function renderChoices() {
  const { view, id, choice } = dialog;
  const rows = view.parts.map((p) => {
    const disabled = !p.canBegin;
    return `<label class="cloud-briefs-start-choice${disabled ? ' disabled' : ''}">
        <input type="radio" name="${id}-choice" value="${escapeHtml(p.partId)}"${p.partId === choice ? ' checked' : ''}${disabled ? ' disabled' : ''}>
        <span class="cloud-briefs-start-choice-text">
          <span class="cloud-briefs-start-choice-label">${escapeHtml(p.title)} ${partChips(p)}</span>
          ${problemLine(p) || `<span class="cloud-briefs-field-hint">${escapeHtml(copy.beginHint(p.shape))}</span>`}
        </span>
      </label>`;
  }).join('');
  return `<fieldset class="cloud-briefs-field">
      <legend class="cloud-briefs-label">${escapeHtml(copy.START_CHOICE_TITLE)}</legend>
      <div class="cloud-briefs-start-choices">
        ${rows}
        <label class="cloud-briefs-start-choice disabled">
          <input type="radio" name="${id}-choice" value="" disabled>
          <span class="cloud-briefs-start-choice-text">
            <span class="cloud-briefs-start-choice-label">${escapeHtml(copy.ORCHESTRATE_LABEL)} <span class="cloud-briefs-start-soon">${escapeHtml(copy.COMING_SOON)}</span></span>
            <span class="cloud-briefs-field-hint">${escapeHtml(copy.ORCHESTRATE_HINT)}</span>
          </span>
        </label>
      </div>
    </fieldset>`;
}

/**
 * Step 2's first line: the part chosen, and on Start Work a Change link back
 * to step 1.
 */
function renderPicked() {
  const part = chosenPart();
  const change = dialog.view.mode === 'start'
    ? `<button type="button" class="cloud-briefs-start-change" data-action="back">${escapeHtml(copy.CHANGE_LABEL)}</button>`
    : '';
  return `<div class="cloud-briefs-start-picked">
      <span class="cloud-briefs-start-picked-what">${escapeHtml(copy.PART_LABEL)}</span>
      <span class="cloud-briefs-start-choice-label">${escapeHtml(part.title)} ${partChips(part)}</span>
      ${change}
    </div>
    ${problemLine(part)}`;
}

/** Start Work's step counter, left of the buttons; Begin has one step and none. */
function renderStepper() {
  if (dialog.view.mode !== 'start') return '';
  const two = dialog.step === 2;
  return `<span class="cloud-briefs-start-stepper">
      <span class="cloud-briefs-start-pips" aria-hidden="true"><span class="cloud-briefs-start-pip on"></span><span class="cloud-briefs-start-pip${two ? ' on' : ''}"></span></span>
      ${escapeHtml(copy.stepLabel(dialog.step))}
    </span>`;
}

/** The branch row: icon, the name as an editable chip, and "from <base> ⌄" with its menu. */
function renderBranchRow() {
  const { view, id } = dialog;
  const part = chosenPart();
  return `<div class="cloud-briefs-field">
      <label class="cloud-briefs-label" for="${id}-branch">${escapeHtml(copy.BRANCH_LABEL)}</label>
      <div class="cloud-briefs-branchrow">
        <span class="cloud-briefs-branchrow-icon">${ICON.branch}</span>
        <input id="${id}-branch" class="cloud-briefs-branchrow-name" data-ref="branch" spellcheck="false" autocomplete="off" value="${escapeHtml(dialog.branchText)}">
        <span class="cloud-briefs-branchrow-from">${escapeHtml(copy.FROM_LABEL)}</span>
        <span class="cloud-briefs-branchrow-base-wrap">
          <button type="button" class="cloud-briefs-branchrow-base" data-action="toggle-base" data-ref="base" aria-haspopup="listbox" aria-expanded="false"></button>
          <div class="cloud-briefs-basemenu" data-ref="basemenu" hidden>
            <input class="cloud-briefs-input cloud-briefs-basemenu-filter" data-ref="basefilter" placeholder="${escapeHtml(copy.BASE_FILTER_PLACEHOLDER)}" spellcheck="false" autocomplete="off">
            <div class="cloud-briefs-basemenu-list" data-ref="baselist" role="listbox"></div>
          </div>
        </span>
      </div>
      <p class="cloud-briefs-field-error" data-ref="basemissing" hidden>${escapeHtml(copy.baseMissingLine(view.targetBranch))}</p>
      <div class="cloud-briefs-start-where">
        <span class="cloud-briefs-start-where-label">${escapeHtml(copy.WORKSPACE_LABEL)}</span>
        <span class="cloud-briefs-start-workspace" data-ref="wsname"></span>
      </div>
      ${renderLocation()}
    </div>`;
}

/**
 * Where the workspace is created: This Mac, checked, and each saved Frame
 * Server by host — disabled while not connected, and every one in local mode
 * (C6). Shown only once a server is saved, as New Workspace's Location row
 * is. An older server is not disabled here: Start refuses it, naming the
 * update (D1).
 */
function renderLocation() {
  const servers = savedServers();
  if (servers.length === 0) return '';
  const name = `${dialog.id}-location`;
  const localMode = Boolean(dialog.view.localMode);
  const rows = servers.map((srv) => {
    const offline = !isConnected(srv);
    const disabled = offline || localMode;
    const hint = copy.serverLocationHint(srv.host, { offline, localMode });
    return `<label class="cloud-briefs-start-location${disabled ? ' disabled' : ''}" title="${escapeHtml(hint)}">
        <input type="radio" name="${name}" value="${escapeHtml(srv.key)}"${dialog.location === srv.key ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${escapeHtml(copy.serverLocationLabel(srv.host, { offline }))}
      </label>`;
  }).join('');
  return `<div class="cloud-briefs-start-where" role="radiogroup" aria-label="${escapeHtml(copy.LOCATION_LABEL)}">
      <span class="cloud-briefs-start-where-label">${escapeHtml(copy.LOCATION_LABEL)}</span>
      <label class="cloud-briefs-start-location">
        <input type="radio" name="${name}" value="local"${dialog.location === 'local' ? ' checked' : ''}> ${escapeHtml(copy.THIS_MAC_LABEL)}
      </label>
      ${rows}
    </div>
    <p class="cloud-briefs-field-hint cloud-briefs-start-location-hint" data-ref="locationhint" hidden></p>`;
}

/** The hint under Location: local mode's reason, else what the chosen server does; hidden on This Mac. */
function renderLocationHint() {
  const el = ref('locationhint');
  if (!el) return;
  const srv = chosenServer();
  const text = dialog.view.localMode
    ? copy.LOCAL_MODE_LOCATION_HINT
    : (srv ? copy.serverLocationHint(srv.host) : '');
  el.textContent = text;
  el.hidden = !text;
}

/** The project's saved Frame Servers; none when the list cannot be read. */
function savedServers() {
  try {
    // Lazy-required, as New Workspace reaches it.
    return require('./serverConnect').getServers() || [];
  } catch (_) {
    return [];
  }
}

function isConnected(srv) {
  return Boolean(srv && srv.status && srv.status.state === 'connected');
}

/** The saved server chosen as the location, or null for This Mac. */
function chosenServer() {
  if (!dialog || dialog.location === 'local') return null;
  return savedServers().find((s) => s.key === dialog.location) || null;
}

/** What the base menu offers: every base on This Mac, origin's alone on a server (D15). */
function basesFor() {
  const bases = dialog.view.bases || [];
  return dialog.location === 'local' ? bases : bases.filter((b) => b.remote);
}

/**
 * Move to `location`. A server keeps an origin base and swaps any other for
 * `origin/<target>` when offered, else origin's first branch, else none
 * (Start stays disabled); This Mac gets back the base it had.
 */
function setLocation(location) {
  const wasMac = dialog.location === 'local';
  dialog.location = location;
  if (location === 'local') {
    if (!wasMac) dialog.base = dialog.macBase;
  } else {
    if (wasMac) dialog.macBase = dialog.base;
    const remote = basesFor();
    if (!remote.some((b) => b.name === dialog.base)) {
      const target = dialog.view.targetBranch ? `origin/${dialog.view.targetBranch}` : null;
      dialog.base = (target && remote.some((b) => b.name === target)) ? target : (remote[0] ? remote[0].name : null);
    }
  }
  if (dialog.menuOpen) setMenu(false);
  renderBase();
  renderWorkspaceName();
  renderLocationHint();
}

/**
 * The workspace name line: what workspaceManager.create will call a
 * workspace opened on this branch (an empty field begins on the
 * suggestion), against the loaded workspaces of the chosen location — this
 * Mac's, or that server's.
 */
function renderWorkspaceName() {
  const el = ref('wsname');
  if (!el) return;
  const typed = dialog.branchText.trim();
  const branch = typed || dialog.view.suggestions[dialog.choice] || '';
  const here = dialog.location === 'local'
    ? (w) => w.location !== 'server'
    : (w) => w.location === 'server' && w.serverKey === dialog.location;
  let taken = [];
  try {
    taken = require('./workspaceSection').getWorkspaces()
      .filter(here)
      .map((w) => w.name);
  } catch (_) { /* the sidebar is not loaded: no names taken */ }
  el.textContent = copy.workspaceNameText(copy.beginWorkspaceName(branch, taken));
}

function renderStep() {
  if (dialog.menuOpen) dialog.menuOpen = false;
  if (dialog.step === 1) renderStepOne();
  else renderStepTwo();
}

/**
 * Step 1 · What to work on (Start Work only, D5): every part, even when
 * there is one, and Orchestrate, disabled. Next goes on with the chosen
 * part when it can be begun.
 */
function renderStepOne() {
  ref('body').innerHTML = `
    <p class="cloud-briefs-muted">${escapeHtml(copy.START_DIALOG_DESCRIPTION)}</p>
    ${renderChoices()}
    <p class="cloud-briefs-form-error" data-ref="error" hidden></p>
    <div class="cloud-briefs-start-actions" data-ref="actions">
      ${renderStepper()}
      <button type="button" class="cloud-briefs-web-btn" data-action="cancel">${escapeHtml(copy.CANCEL_LABEL)}</button>
      <button type="button" class="cloud-briefs-primary-btn" data-action="next">${escapeHtml(copy.NEXT_LABEL)}</button>
    </div>`;
  syncNext();
  const picked = dialog.el.querySelector(`input[name="${dialog.id}-choice"]:checked`) || ref('body').querySelector('[data-action="next"]');
  if (picked) picked.focus();
}

/** Step 2 · Where to work: the part chosen, then the branch, and Start. Back (Cancel on Begin) leaves it. */
function renderStepTwo() {
  const { view } = dialog;
  const leave = view.mode === 'start'
    ? `<button type="button" class="cloud-briefs-web-btn" data-action="back">${escapeHtml(copy.BACK_LABEL)}</button>`
    : `<button type="button" class="cloud-briefs-web-btn" data-action="cancel">${escapeHtml(copy.CANCEL_LABEL)}</button>`;
  ref('body').innerHTML = `
    ${view.mode === 'begin' ? `<p class="cloud-briefs-muted">${escapeHtml(copy.BEGIN_DIALOG_DESCRIPTION)}</p>` : ''}
    ${renderPicked()}
    ${renderBranchRow()}
    <p class="cloud-briefs-form-error" data-ref="error" hidden></p>
    <div class="cloud-briefs-start-actions" data-ref="actions">
      ${renderStepper()}
      ${leave}
      <button type="button" class="cloud-briefs-primary-btn" data-action="confirm">${escapeHtml(copy.startSubmitLabel(false))}</button>
    </div>`;
  renderBase();
  renderWorkspaceName();
  renderLocationHint();
  const name = ref('branch');
  name.focus();
  name.select();
}

/** Step 1's Next: only for a part that can be begun. */
function syncNext() {
  const next = ref('body').querySelector('[data-action="next"]');
  const part = chosenPart();
  if (next) next.disabled = !part || !part.canBegin;
}

function goToStep(step) {
  if (!dialog || dialog.pending || dialog.done) return;
  if (step === 2) {
    const part = chosenPart();
    if (!part || !part.canBegin) return;
  }
  dialog.step = step;
  renderStep();
}

/**
 * The base button, the missing-base line and whether confirm can go. The
 * button carries the base's icon, local or origin, as its menu row does.
 */
function renderBase() {
  const { base } = dialog;
  const button = ref('base');
  const known = base ? dialog.view.bases.find((b) => b.name === base) : null;
  const icon = !base ? '' : (known ? known.remote : base.startsWith('origin/')) ? ICON.remote : ICON.local;
  button.innerHTML = `${icon}<span>${escapeHtml(base || copy.PICK_BASE_LABEL)}</span>${ICON.chevron}`;
  ref('basemissing').hidden = Boolean(base);
  syncConfirm();
}

function syncConfirm() {
  const confirm = ref('body').querySelector('[data-action="confirm"]');
  const part = chosenPart();
  if (confirm) confirm.disabled = dialog.pending || !dialog.base || !part || !part.canBegin;
}

function renderBaseList() {
  const filter = ref('basefilter').value.trim().toLowerCase();
  const options = basesFor().filter((b) => !filter || b.name.toLowerCase().includes(filter));
  const section = (title, rows) => (rows.length === 0 ? '' : `<div class="cloud-briefs-basemenu-title">${escapeHtml(title)}</div>${rows.map((b) => `
      <button type="button" class="cloud-briefs-basemenu-item${b.name === dialog.base ? ' current' : ''}" role="option" aria-selected="${b.name === dialog.base}" data-action="pick-base" data-base="${escapeHtml(b.name)}">
        ${b.remote ? ICON.remote : ICON.local}<span>${escapeHtml(b.name)}</span>${b.name === dialog.base ? ICON.check : ''}
      </button>`).join('')}`);
  const html = section(copy.BASE_LOCAL_TITLE, options.filter((b) => !b.remote))
    + section(copy.BASE_REMOTE_TITLE, options.filter((b) => b.remote));
  ref('baselist').innerHTML = html || `<p class="cloud-briefs-muted cloud-briefs-basemenu-empty">${escapeHtml(copy.NO_BASE_MATCH)}</p>`;
}

function setMenu(openIt) {
  dialog.menuOpen = openIt;
  ref('basemenu').hidden = !openIt;
  ref('base').setAttribute('aria-expanded', String(openIt));
  if (openIt) {
    ref('basefilter').value = '';
    renderBaseList();
    ref('basefilter').focus();
  }
}

function showError(message) {
  const errorEl = ref('error');
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function setPending(on) {
  dialog.pending = on;
  const confirm = ref('body').querySelector('[data-action="confirm"]');
  if (confirm) confirm.textContent = copy.startSubmitLabel(on);
  for (const input of dialog.el.querySelectorAll('input')) input.disabled = on || input.closest('.disabled') !== null;
  ref('base').disabled = on;
  syncConfirm();
}

// ─── Events ───────────────────────────────────────────────────

function onClick(e) {
  if (!dialog) return;
  if (e.target === dialog.el) {
    close();
    return;
  }
  const action = e.target.closest('[data-action]');
  if (dialog.menuOpen && !e.target.closest('.cloud-briefs-branchrow-base-wrap')) setMenu(false);
  if (!action) return;
  const name = action.dataset.action;
  if (name === 'cancel') close();
  else if (name === 'next') goToStep(2);
  else if (name === 'back') goToStep(1);
  else if (name === 'confirm') confirm();
  else if (name === 'toggle-base') {
    setMenu(!dialog.menuOpen);
  } else if (name === 'pick-base') {
    dialog.base = action.dataset.base;
    setMenu(false);
    renderBase();
    ref('branch').focus();
  }
}

function onChange(e) {
  if (!dialog || !dialog.view || e.target.type !== 'radio' || !e.target.value) return;
  if (e.target.name === `${dialog.id}-location`) {
    setLocation(e.target.value);
    return;
  }
  if (e.target.name !== `${dialog.id}-choice`) return;
  dialog.choice = e.target.value;
  // The name follows the choice until the user types in it.
  if (!dialog.edited) dialog.branchText = dialog.view.suggestions[dialog.choice] || '';
  syncNext();
}

function onInput(e) {
  if (!dialog) return;
  if (e.target === ref('branch')) {
    dialog.edited = true;
    dialog.branchText = e.target.value;
    renderWorkspaceName();
  } else if (e.target === ref('basefilter')) renderBaseList();
}

function onKeydown(e) {
  if (e.key !== 'Escape' || !dialog) return;
  e.stopPropagation();
  // Esc closes the menu first, then the dialog.
  if (dialog.menuOpen) {
    setMenu(false);
    ref('base').focus();
  } else {
    close();
  }
}

async function confirm() {
  const current = dialog;
  if (!current || current.pending || current.done || !current.view) return;
  const part = chosenPart();
  if (!part || !part.canBegin || !current.base) return;
  const path = state.getProjectPath();
  const request = {
    number: current.number,
    beginPartId: part.partId,
    branch: current.branchText.trim(),
    base: current.base,
    ...(current.location !== 'local' ? { serverKey: current.location } : {}),
  };
  ref('error').hidden = true;
  setPending(true);
  let result;
  try {
    result = path
      ? await ipcRenderer.invoke(IPC.CLOUD_BRIEF_START, path, request)
      : { ok: false, reason: 'notConnected' };
  } catch (err) {
    console.error('cloudStartDialog: could not begin the part', err);
    result = { ok: false, reason: 'other' };
  }
  if (dialog !== current) return;
  setPending(false);

  if (result && result.ok) {
    close();
    if (current.onStarted) current.onStarted(result);
    return;
  }
  if (result && result.reason === 'partial') {
    // Past the checks: nothing to retry here, only what to finish by hand.
    current.done = true;
    showError(copy.partialMessage(result));
    const confirmBtn = ref('body').querySelector('[data-action="confirm"]');
    if (confirmBtn) confirmBtn.remove();
    for (const input of current.el.querySelectorAll('input')) input.disabled = true;
    ref('base').disabled = true;
    if (current.onPartial) current.onPartial(result);
    return;
  }
  showError(copy.startErrorMessage(result));
}

module.exports = { open };
