/**
 * App Header — the one row across the top of the window
 * (shell-chrome-app-header-collapsible-panels spec).
 *
 * The markup is static in index.html: the Frame mark and version on the
 * left, the current-project switcher in the center, and on the right the
 * agent launcher, the layout toggles, the theme toggle and the update bell.
 * This module only wires behavior to elements that already exist at
 * DOMContentLoaded — which is the point: the tab bar used to render these
 * controls from a template, and everything that bound to them had to wait
 * for that render (aiToolSelector.mountSelector, the theme button).
 *
 * What is wired here and why here:
 *   - Theme restore + toggle. The persisted choice is applied at init, before
 *     the strip renders, exactly when TerminalTabBar's constructor used to do
 *     it; the button flips to the theme's counterpart (themes.js). The
 *     applyTheme / currentTheme contract stays in terminalTabBar.js — the
 *     theme.* commands and terminalManager depend on it there.
 *   - The update bell: hidden until UPDATE_AVAILABLE, click opens the release.
 *   - The default-agent select: aiToolSelector.mountSelector() populates it.
 *
 * Start (#sidebar-agent-launch) and the project switcher keep their bindings
 * in index.js; they bind by id and the elements are simply there now.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const themes = require('./themes');
const { applyTheme, currentTheme } = require('./terminalTabBar');

let initialized = false;

function initTheme(root) {
  let saved = null;
  try { saved = localStorage.getItem('frame-theme'); } catch (_) { /* non-fatal */ }
  applyTheme(saved);

  root.querySelector('#sidebar-theme-btn')?.addEventListener('click', () => {
    applyTheme(themes.counterpartOf(currentTheme()));
  });
}

function initUpdateBell(root) {
  const updateBtn = root.querySelector('.btn-update-notify');
  if (!updateBtn) return;
  let updateInfo = null;

  updateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (updateInfo) {
      const { shell } = require('electron');
      shell.openExternal(updateInfo.releaseUrl);
    }
  });

  ipcRenderer.on(IPC.UPDATE_AVAILABLE, (event, info) => {
    updateInfo = info;
    updateBtn.style.display = '';
    updateBtn.title = `New version available: v${info.latestVersion}`;
  });
}

function init() {
  if (initialized) return;
  const root = document.getElementById('app-header');
  if (!root) {
    console.error('appHeader: #app-header not found — the header controls will not work');
    return;
  }
  initialized = true;

  initTheme(root);
  initUpdateBell(root);
  // aiToolSelector.init() wires the select too, after awaiting
  // GET_AI_TOOL_CONFIG; this call leaves it populated and showing the active
  // tool whichever of the two runs second.
  require('./aiToolSelector').mountSelector();
}

module.exports = { init };
