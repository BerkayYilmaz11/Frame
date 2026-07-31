/**
 * Sharing hint — repo-mode discovery.
 *
 * One direction of Git Sharing is self-solving: clone a repo with `.frame/`
 * committed and Frame derives repo mode with no prompting. This is the other
 * direction — a developer on a repo with a remote and several contributors,
 * sitting in local mode, whose specs and notes their teammates would benefit
 * from stay on one laptop. Nothing else ever tells them the mode exists.
 *
 * The specDrivenHint pattern pointed at a different condition: a free-floating
 * notice in the window's bottom-left corner, not anchored to anything (see
 * that module for why nothing is anchored). The signal is entirely local — no
 * network:
 * remote present AND >1 distinct author in the last ~200 commits AND
 * effective mode local AND not dismissed for this project. The author count
 * is a deliberate heuristic; being wrong costs one dismissible popover.
 *
 * "Share in the repository" performs the same SET_GIT_SHARING write as the
 * modal toggle — one code path for the transition, one place it can go wrong.
 * Dismissal lives in user settings keyed by project path: whether you want
 * to be nudged is a preference about Frame's UI, not a fact about the
 * project, and in repo mode a config-stored dismissal would silently travel
 * to every teammate.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const state = require('./state');

const DISMISSED_KEY = 'sharingHintDismissed';
const SHOW_DELAY_MS = 900;

let popoverEl = null;
let shownForPath = null;
let showTimer = null;
let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;

  state.onProjectChange(() => {
    hide();
    evaluate();
  });
  state.onFrameStatusChange(() => evaluate());

  document.addEventListener('keydown', (e) => {
    if (popoverEl && e.key === 'Escape') hide();
  });
}

/**
 * Show the hint if this project qualifies. Safe to call repeatedly — a
 * popover already shown for the same project is left as it is.
 */
async function evaluate() {
  const projectPath = state.getProjectPath();
  if (!projectPath || !state.getIsFrameProject()) {
    hide();
    return;
  }
  if ((popoverEl || showTimer) && shownForPath === projectPath) return;
  // Both notices claim the same corner; two stacked on top of each other is
  // noise. Spec-driven wins — this one returns on a later project open.
  if (document.querySelector('.spec-driven-hint')) return;

  try {
    if (await isDismissed(projectPath)) return;

    const sharing = await ipcRenderer.invoke(IPC.GET_GIT_SHARING_STATE, projectPath);
    if (!sharing || !sharing.isRepo || sharing.effective !== 'local') return;

    // The two git-log-class reads run only after the cheap gates passed.
    const signal = await ipcRenderer.invoke(IPC.GET_SHARING_REPO_SIGNAL, projectPath);
    if (!signal || !signal.hasRemote || !(signal.authorCount > 1)) return;

    // The project may have changed while we were awaiting.
    if (state.getProjectPath() !== projectPath) return;
    schedule(projectPath, signal.authorCount);
  } catch (err) {
    console.error('sharingHint: could not evaluate', err);
  }
}

function schedule(projectPath, authorCount) {
  clearTimeout(showTimer);
  shownForPath = projectPath;
  showTimer = setTimeout(() => {
    showTimer = null;
    if (state.getProjectPath() !== projectPath) return;
    render(projectPath, authorCount);
  }, SHOW_DELAY_MS);
}

/** Re-check after something changed the mode. */
function refresh() {
  hide();
  evaluate();
}

function render(projectPath, authorCount) {
  hide();
  shownForPath = projectPath;

  popoverEl = document.createElement('div');
  popoverEl.className = 'sharing-hint';
  popoverEl.setAttribute('role', 'dialog');
  popoverEl.setAttribute('aria-label', 'This looks like a shared project');
  popoverEl.innerHTML = `
    <button type="button" class="sharing-hint-close" aria-label="Dismiss">&#x2715;</button>
    <div class="sharing-hint-title">This looks like a shared project</div>
    <p class="sharing-hint-text">
      <span class="sharing-hint-count"></span> people have committed here, but
      Frame's specs and notes stay on this machine. Sharing puts them in the
      repository &mdash; machine-local files stay out.
    </p>
    <div class="sharing-hint-error" role="alert"></div>
    <div class="sharing-hint-actions">
      <button type="button" class="sharing-hint-never">Don't show again</button>
      <button type="button" class="sharing-hint-share">Share in the repository</button>
    </div>
  `;
  // textContent, not template interpolation: the count is git output.
  popoverEl.querySelector('.sharing-hint-count').textContent = String(authorCount);
  document.body.appendChild(popoverEl);

  popoverEl.querySelector('.sharing-hint-close').addEventListener('click', hide);
  popoverEl.querySelector('.sharing-hint-never').addEventListener('click', () => {
    dismissForever(projectPath);
  });
  popoverEl.querySelector('.sharing-hint-share').addEventListener('click', (e) => {
    share(projectPath, e.currentTarget);
  });

  // A click anywhere else means "later" — the hint returns on the next open.
  setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 0);
}

function onOutsideClick(e) {
  if (!popoverEl) return;
  if (popoverEl.contains(e.target)) return;
  // A click elsewhere means "later" — the notice returns on the next open.
  hide();
}

/** The same write path as the modal toggle (SET_GIT_SHARING). */
async function share(projectPath, btn) {
  const errorEl = popoverEl ? popoverEl.querySelector('.sharing-hint-error') : null;
  if (btn) btn.disabled = true;
  try {
    const result = await ipcRenderer.invoke(IPC.SET_GIT_SHARING, {
      projectPath,
      mode: 'repo'
    });
    if (!result || !result.success) {
      if (errorEl) {
        errorEl.textContent = 'Could not switch: ' + ((result && result.error) || 'unknown error');
      }
      if (btn) btn.disabled = false;
      return;
    }
    hide();
  } catch (err) {
    if (errorEl) errorEl.textContent = 'Could not switch: ' + err.message;
    if (btn) btn.disabled = false;
  }
}

async function dismissForever(projectPath) {
  hide();
  await markDismissed(projectPath);
}

/**
 * Remember that this project should not be hinted at again — user settings,
 * keyed by project path (the specDrivenHint.markDismissed precedent).
 */
async function markDismissed(projectPath) {
  if (!projectPath) return;
  try {
    const list = await readDismissed();
    if (list.includes(projectPath)) return;
    list.push(projectPath);
    await ipcRenderer.invoke(IPC.SET_USER_SETTING, DISMISSED_KEY, list);
  } catch (err) {
    console.error('sharingHint: could not persist dismissal', err);
  }
}

async function isDismissed(projectPath) {
  const list = await readDismissed();
  return list.includes(projectPath);
}

async function readDismissed() {
  const stored = await ipcRenderer.invoke(IPC.GET_USER_SETTING, DISMISSED_KEY);
  return Array.isArray(stored) ? stored.slice() : [];
}

function hide() {
  clearTimeout(showTimer);
  showTimer = null;
  document.removeEventListener('mousedown', onOutsideClick);
  if (popoverEl) {
    popoverEl.remove();
    popoverEl = null;
  }
  shownForPath = null;
}

module.exports = { init, refresh, markDismissed };
