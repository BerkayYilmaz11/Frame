/**
 * Feedback Panel
 *
 * The surface behind the Feedback button at the foot of the sidebar rail
 * (also the Help menu and the palette, via `feedback.open`), in three tabs —
 * one per kind of feedback, and the kind decides everything else:
 *
 *   Bug           → a prefilled issue on Frame's tracker, with the Environment
 *                   section attached.
 *   Feature idea  → a prefilled discussion under Ideas. A proposal is not a
 *                   defect: in a tracker it becomes an unassigned task that
 *                   reads as a rejection when closed, while a discussion can
 *                   be argued, upvoted, and converted into an issue the day
 *                   the work is committed to. It carries nothing about the
 *                   machine, because an idea does not depend on one.
 *   Reach us      → a mail draft to the Frame devs, for a question or for
 *                   anything the reporter would rather not post publicly.
 *
 * **The tab chooses the channel.** The panel used to offer the channels as
 * buttons and let the reporter pick. That asked a question nobody can answer:
 * they know what they have, not which transport suits it. Splitting by what
 * the feedback *is* also splits it by who can see it — the two GitHub tabs
 * are public and signed with the reporter's own account, the third is not —
 * and that is what makes assuming a GitHub account on the first two
 * acceptable, since the third is there for everyone else.
 *
 * Nothing here decides what a report *says*, and nothing here decides where a
 * kind goes: `src/shared/feedbackReport.js` holds one table with the labels,
 * the prompts, the channel and the diagnostics flag, and this module renders
 * it. The tabs are drawn from that table rather than written into
 * `index.html` — unlike `githubPanel`'s static tabs — so a kind cannot exist
 * in the markup and be unknown to the composer.
 *
 * A modal (`#feedback-modal`, the shared `.modal-overlay` chrome), not a
 * dock tab: feedback is about Frame, not about the project on screen, so it
 * has no place beside the terminals. `#feedback-panel` — tabs and form — is
 * the modal's body. Opened by `open()` / `toggle()`, closed by its ×, the
 * backdrop, Escape, or `close()`; Escape is gated on visibility so it never
 * leaks to the terminal (the openProjectModal idiom).
 *
 * One draft per tab, all of them living for the app run and each cleared only
 * once its own delivery succeeds. That is what makes a failed send survivable,
 * and what lets a reporter move between tabs without losing what they have
 * already written in any of them.
 */

const os = require('os');
const { shell, clipboard, ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const { escapeHtml } = require('./htmlUtils');
const notify = require('./notify');
const feedback = require('../shared/feedbackReport');

const KINDS = feedback.FEEDBACK_TYPES;

let activeTab = KINDS[0].id;

// One draft per kind, deliberately outside show()/hide(). See the note above.
let drafts = blankDrafts();

let panelEl = null;
let modalEl = null;

function blankDrafts() {
  return KINDS.reduce((all, kind) => {
    all[kind.id] = { title: '', description: '' };
    return all;
  }, {});
}

/**
 * What Frame will attach — read fresh each render so the panel never shows a
 * value it cached before an update. Two values, and the composer turns this
 * same object into both the preview and the body's Environment section.
 */
function diagnostics() {
  let appVersion = '';
  try {
    appVersion = require('../../package.json').version;
  } catch (_) {
    /* falls through to 'unknown' in diagnosticsLines */
  }
  return { appVersion, os: `${process.platform} ${os.release()}` };
}

function el() {
  if (!panelEl) panelEl = document.getElementById('feedback-panel');
  return panelEl;
}

function kind() {
  return feedback.typeById(activeTab) || KINDS[0];
}

function draft() {
  return drafts[kind().id];
}

// ─── rendering ────────────────────────────────────────────

function renderTabs() {
  const strip = el() && el().querySelector('.feedback-tabs');
  if (!strip) return;
  strip.innerHTML = KINDS.map((t) => `
    <button class="feedback-tab-btn${t.id === activeTab ? ' active' : ''}"
            data-tab="${escapeHtml(t.id)}" type="button">${escapeHtml(t.label)}</button>
  `).join('');
  strip.querySelectorAll('.feedback-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
  });
}

function diagnosticsBlock() {
  // Rendered only for a kind that attaches it — the preview and the body are
  // the same decision, so a tab that shows this block is exactly a tab that
  // sends it.
  if (!kind().attachesDiagnostics) return '';
  const lines = feedback.diagnosticsLines(diagnostics());
  return `
    <div class="feedback-diagnostics">
      <div class="feedback-diagnostics-title">Frame will attach</div>
      ${lines.map((line) => `<div class="feedback-diagnostics-line">${escapeHtml(line)}</div>`).join('')}
    </div>
  `;
}

// What the button does, said plainly. The tail is the promise about what
// travels, and it can only ever say what this kind actually carries.
function actionBlock() {
  const carries = kind().attachesDiagnostics
    ? 'It carries only what you typed and environment info.'
    : 'It carries only what you typed.';
  return `
    <div class="feedback-actions">
      <button class="btn btn-primary" data-action="send" type="button">${escapeHtml(kind().action)}</button>
    </div>
    <div class="feedback-note">${escapeHtml(kind().note)} ${carries}</div>
  `;
}

/** Draw the active kind's form. */
function render() {
  const body = el() && el().querySelector('#feedback-body');
  if (!body) return;

  const { fields, placeholders } = kind();

  body.innerHTML = `
    <div class="feedback-field">
      <label class="feedback-label" for="feedback-title">${escapeHtml(fields.title)}</label>
      <input id="feedback-title" class="feedback-input" type="text" maxlength="140"
             placeholder="${escapeHtml(placeholders.title)}"
             value="${escapeHtml(draft().title)}" />
      <div class="feedback-error" data-error="title"></div>
    </div>

    <div class="feedback-field">
      <label class="feedback-label" for="feedback-description">${escapeHtml(fields.description)}</label>
      <textarea id="feedback-description" class="feedback-textarea"
                placeholder="${escapeHtml(placeholders.description)}">${escapeHtml(draft().description)}</textarea>
      <div class="feedback-error" data-error="description"></div>
    </div>

    ${diagnosticsBlock()}
    ${actionBlock()}
  `;

  bindForm(body);
}

/** Put each message beside the field it belongs to, never in one summary line. */
function showErrors(errors) {
  const body = el() && el().querySelector('#feedback-body');
  if (!body) return;
  body.querySelectorAll('.feedback-error').forEach((node) => {
    const message = errors[node.dataset.error];
    node.textContent = message || '';
    node.classList.toggle('visible', Boolean(message));
  });
}

// ─── wiring ───────────────────────────────────────────────

function bindForm(body) {
  const title = body.querySelector('#feedback-title');
  if (title) title.addEventListener('input', () => { draft().title = title.value; });

  const description = body.querySelector('#feedback-description');
  if (description) description.addEventListener('input', () => { draft().description = description.value; });

  const send = body.querySelector('[data-action="send"]');
  if (send) send.addEventListener('click', () => submit());
}

function selectTab(id) {
  if (id === activeTab) return;
  if (!feedback.typeById(id)) return;
  activeTab = id;
  renderTabs();
  render();
}

/**
 * Validate the active tab's draft, then hand it to that kind's channel.
 *
 * `compose()` runs here, on the draft and the kind's diagnostics — which is
 * how a tab that attaches nothing sends a body with no Environment section
 * rather than an empty one.
 */
function submit() {
  const { ok, errors } = feedback.validate(draft());
  showErrors(errors);
  if (!ok) return;
  const report = feedback.compose(draft(), kind().attachesDiagnostics ? diagnostics() : null);
  deliver(kind().channel, report);
}

// What each channel opens, in the words of what the user will see next.
const OPENED_MESSAGES = {
  github_issue: 'Prefilled issue opened on GitHub — review it and submit.',
  github_discussion: 'Prefilled idea opened on GitHub — review it and post.',
  email: 'Draft opened in your mail client — send it from there.'
};

/**
 * Hand a finished report to a channel.
 *
 * Every channel is a URL channel — two prefilled GitHub forms and a mail
 * draft — so the oversize rule is one rule applied in one place: past the
 * threshold the body goes to the clipboard and the URL carries the subject
 * alone. The user never meets an empty compose window with no explanation.
 *
 * Nothing here is reported as *sent*, on any channel. Frame opens a draft the
 * user submits themselves — which is the point of routing GitHub through its
 * forms rather than filing for them — and claiming otherwise would be a claim
 * Frame cannot see the truth of.
 */
function deliver(channel, report) {
  const delivery = feedback.deliveryFor(channel, report.subject, report.body);
  if (!delivery.url) {
    notify.error('Frame does not know how to send that.');
    return false;
  }

  if (delivery.mode === 'clipboard') {
    try {
      clipboard.writeText(delivery.clipboardBody);
    } catch (err) {
      // Without the clipboard the short URL would open on an empty box with
      // nothing to paste — better to say so and keep the draft than to open it.
      notify.error(`Could not copy the report to the clipboard: ${err.message}`);
      return false;
    }
  }

  try {
    shell.openExternal(delivery.url);
  } catch (err) {
    notify.error(`Could not open ${channel === 'email' ? 'your mail client' : 'GitHub'}: ${err.message}`);
    return false;
  }

  if (delivery.mode === 'clipboard') {
    notify.info('Your report was too long for the link — it is on your clipboard, paste it in.');
  } else {
    notify.success(OPENED_MESSAGES[channel]);
  }

  track(channel);
  clearDraft();
  return true;
}

/**
 * One event, on the channel that actually carried the report.
 *
 * The channel is the whole event. Nothing the user typed and nothing from the
 * diagnostics goes with it — and `validateEvent` would strip it anyway, which
 * is the point of the registry.
 */
function track(channel) {
  try {
    ipcRenderer.send(IPC.TELEMETRY_TRACK, 'feedback_submitted', { channel });
  } catch (_) {
    /* telemetry never breaks a send */
  }
}

/**
 * Clear the tab that just delivered, and only that tab.
 *
 * Filing a bug must not throw away a half-written idea on the next tab — that
 * is the whole reason the drafts are separate.
 */
function clearDraft() {
  drafts[kind().id] = { title: '', description: '' };
  render();
}

// ─── the modal ────────────────────────────────────────────

function modal() {
  if (!modalEl) modalEl = document.getElementById('feedback-modal');
  return modalEl;
}

function init() {
  const root = modal();
  if (!root) {
    // A control that fails to bind must say so — the rail button would just
    // look like one that does nothing.
    console.error('feedbackPanel: #feedback-modal not found — Feedback will not open');
    return;
  }

  const closeBtn = root.querySelector('#feedback-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', close);

  // Click on the backdrop closes.
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  // Escape-to-close, gated on visibility so it never leaks to the terminal.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVisible()) close();
  });
}

function open() {
  const root = modal();
  if (!root) return;
  renderTabs();
  render();
  root.classList.add('visible');
  const title = root.querySelector('#feedback-title');
  if (title) title.focus();
}

function close() {
  const root = modal();
  if (root) root.classList.remove('visible');
}

function toggle() {
  if (isVisible()) close();
  else open();
}

function isVisible() {
  const root = modal();
  return !!root && root.classList.contains('visible');
}

module.exports = { init, open, close, toggle, isVisible };
