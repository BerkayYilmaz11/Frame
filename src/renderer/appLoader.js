/**
 * App Loader
 *
 * Full-screen splash shown on boot until the first WORKSPACE_DATA arrives.
 * Avoids the brief flash of empty sidebar / unmounted terminal that users
 * see while the main process loads workspace state.
 *
 * It also plays Frame's intro: the mark fills along its own perimeter like a
 * progress ring, then the wordmark unrolls out of it and pushes it left. The
 * splash leaves only once BOTH the intro has finished and workspace data has
 * arrived — whichever is slower — so the animation is never cut mid-beat and
 * a slow boot never adds the intro's length on top of itself.
 *
 * If the failsafe timeout fires before any data, the splash swaps to a
 * "couldn't load workspace" state with a Retry button instead of silently
 * dropping the user into a blank app. Main has no error variant for
 * LOAD_WORKSPACE — the timeout is the only failure signal the renderer has.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

const FAILSAFE_MS = 10000;
const FADE_MS = 280;

/* Intro beats. These mirror the durations in
   styles/components/app-loader.css — the two move together. */
const SWEEP_MS = 1900;   // mark fills around its perimeter
const REVEAL_MS = 560;   // wordmark unrolls, mark slides left
const HOLD_MS = 2000;    // finished lockup sits still, long enough to read
const REDUCED_MOTION_MS = 500; // no beats to play; just don't blink past it

let loaderEl = null;
let firstDataArrived = false;
let introDone = false;
let failsafeTimer = null;
let introTimers = [];
let initialized = false;

function init() {
  loaderEl = document.getElementById('app-loader');
  if (!loaderEl) return;
  // Init-once: a re-init must not stack a second WORKSPACE_DATA listener.
  if (initialized) return;
  initialized = true;

  // Hide as soon as workspace data arrives the first time. Registered before
  // welcomeOverlay's listener so the loader fades out before the welcome
  // modal can open behind it. Also resolves the failure state: if data
  // arrives late (slow main, or after Retry), the loader still goes away.
  ipcRenderer.on(IPC.WORKSPACE_DATA, () => {
    if (firstDataArrived) return;
    firstDataArrived = true;
    hideWhenReady();
  });

  playIntro();
  armFailsafe();
}

/* Drives the intro's beats by class. The wordmark's target width is measured
   just before it unrolls — CSS can't transition to "the content's width", and
   measuring late means the local fonts have long since settled. */
function playIntro() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    loaderEl.classList.add('app-loader-run', 'app-loader-reveal');
    introTimers.push(setTimeout(finishIntro, REDUCED_MOTION_MS));
    return;
  }

  loaderEl.classList.add('app-loader-run');

  introTimers.push(setTimeout(() => {
    if (!loaderEl) return;
    const wordmark = loaderEl.querySelector('.app-loader-wordmark');
    const text = loaderEl.querySelector('.app-loader-wordmark-text');
    if (wordmark && text) {
      wordmark.style.setProperty('--app-loader-wordmark-w', `${Math.ceil(text.scrollWidth)}px`);
    }
    loaderEl.classList.add('app-loader-reveal');
  }, SWEEP_MS));

  introTimers.push(setTimeout(finishIntro, SWEEP_MS + REVEAL_MS + HOLD_MS));
}

function finishIntro() {
  introDone = true;
  hideWhenReady();
}

function clearIntroTimers() {
  introTimers.forEach(clearTimeout);
  introTimers = [];
}

/* The splash owes the user two things: a finished intro and a loaded
   workspace. Neither alone is enough to leave. */
function hideWhenReady() {
  if (!firstDataArrived || !introDone) return;
  hide();
}

function armFailsafe() {
  if (failsafeTimer) clearTimeout(failsafeTimer);
  failsafeTimer = setTimeout(() => {
    if (!firstDataArrived) showFailureState();
  }, FAILSAFE_MS);
}

function showFailureState() {
  if (!loaderEl) return;
  // The intro is beside the point once boot has failed — stop its beats so a
  // late timer can't hide the error the user still needs to read.
  clearIntroTimers();
  introDone = true;
  loaderEl.classList.remove('app-loader-run', 'app-loader-reveal');
  loaderEl.innerHTML = `
    <div class="app-loader-error-mark">&#10022;</div>
    <div class="app-loader-error-title">Couldn't load your workspace</div>
    <div class="app-loader-error-detail">The workspace didn't respond in time. You can retry, or restart Frame if this keeps happening.</div>
    <button type="button" class="btn app-loader-retry">Retry</button>
  `;
  loaderEl.querySelector('.app-loader-retry').addEventListener('click', () => {
    loaderEl.querySelector('.app-loader-error-title').textContent = 'Retrying…';
    ipcRenderer.send(IPC.LOAD_WORKSPACE);
    armFailsafe();
  });
}

function hide() {
  if (failsafeTimer) {
    clearTimeout(failsafeTimer);
    failsafeTimer = null;
  }
  clearIntroTimers();
  if (!loaderEl) return;
  loaderEl.classList.add('app-loader-hidden');
  setTimeout(() => {
    if (loaderEl && loaderEl.parentNode) {
      loaderEl.parentNode.removeChild(loaderEl);
    }
    loaderEl = null;
  }, FADE_MS);
}

module.exports = { init };
