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
 *   - Theme restore + picker. The persisted choice is applied at init, before
 *     the strip renders, exactly when TerminalTabBar's constructor used to do
 *     it. The button opens a popover with one row per themes.js entry (a
 *     swatch, the label, a check on the current one) and shows the current
 *     scheme as its icon. Both are painted from data-theme, so a theme set
 *     from the palette or the View menu shows here too. The
 *     applyTheme / currentTheme contract stays in terminalTabBar.js — the
 *     theme.* commands and terminalManager depend on it there.
 *   - The update bell: hidden until UPDATE_AVAILABLE, click opens the release.
 *   - The default-agent select: aiToolSelector.mountSelector() populates it.
 *   - The layout toggles. Click runs the registered command
 *     (panel.toggleSidebar / dock.toggle) so the button, ⌘B / ⌘J, the View
 *     menu and the palette share one path; the painted state comes from
 *     sidebarResize.onChange / dock.onChange, never from the click itself,
 *     so the buttons stay right whichever entry point moved the region.
 *
 * Start (#sidebar-agent-launch) and the project switcher keep their bindings
 * in index.js; they bind by id and the elements are simply there now.
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const { PanelLeft, PanelBottom, PanelRight, Sun, Moon, Check } = require('lucide');
const themes = require('./themes');
const { applyTheme, currentTheme } = require('./terminalTabBar');
const sidebarResize = require('./sidebarResize');
const dock = require('./dock');
const commandRegistry = require('./commandRegistry');

let initialized = false;

function initTheme(root) {
  let saved = null;
  try { saved = localStorage.getItem('frame-theme'); } catch (_) { /* non-fatal */ }
  applyTheme(saved);

  const btn = root.querySelector('#sidebar-theme-btn');
  const menu = root.querySelector('#theme-menu');
  if (!btn || !menu) return;

  // The button's face: the current scheme's icon and the theme's name.
  const paintButton = () => {
    const id = currentTheme();
    const t = themes.THEMES[id];
    btn.innerHTML = dock.lucideIcon(t.scheme === 'light' ? Sun : Moon, 16);
    btn.title = `Theme: ${t.label}`;
  };

  // One row per registry entry. The swatch is the theme's own terminal
  // colours (background disc, foreground wedge), so the four read apart
  // even before their labels do.
  const render = () => {
    const active = currentTheme();
    menu.innerHTML = '';
    for (const id of themes.THEME_IDS) {
      const t = themes.THEMES[id];
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'theme-menu-item' + (id === active ? ' active' : '');
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', id === active ? 'true' : 'false');
      item.dataset.theme = id;
      item.innerHTML = '<span class="theme-menu-swatch" aria-hidden="true"></span>'
        + '<span class="theme-menu-item-name"></span>'
        + (id === active ? dock.lucideIcon(Check, 13) : '');
      const swatch = item.querySelector('.theme-menu-swatch');
      swatch.style.setProperty('--swatch-bg', t.terminal.background);
      swatch.style.setProperty('--swatch-fg', t.terminal.foreground);
      item.querySelector('.theme-menu-item-name').textContent = t.label;
      item.addEventListener('click', () => {
        close();
        if (id !== active) applyTheme(id);
      });
      menu.appendChild(item);
    }
  };

  const onDocClick = (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) close();
  };
  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKeydown, true);
  };
  const open = () => {
    render();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKeydown, true);
  };

  btn.addEventListener('click', () => (menu.hidden ? open() : close()));

  // Follow data-theme wherever it is set from (palette, View menu, this
  // popover) — the same signal terminalManager watches for xterm.
  paintButton();
  new MutationObserver(() => {
    paintButton();
    if (!menu.hidden) render();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
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

/** Paint one toggle: pressed state, title, icon. */
function paintToggle(btn, { on, icon, label, shortcut }) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = `${on ? 'Hide' : 'Show'} ${label} (${shortcut})`;
  btn.innerHTML = dock.lucideIcon(icon, 16);
}

function initLayoutToggles(root) {
  const sidebarBtn = root.querySelector('#layout-toggle-sidebar');
  const dockBtn = root.querySelector('#layout-toggle-dock');
  if (!sidebarBtn || !dockBtn) return;

  const paintSidebar = (visible) => paintToggle(sidebarBtn, {
    on: visible, icon: PanelLeft, label: 'Sidebar', shortcut: '⌘B'
  });
  const paintDock = ({ open, position }) => paintToggle(dockBtn, {
    on: open,
    icon: position === 'right' ? PanelRight : PanelBottom,
    label: 'Panel',
    shortcut: '⌘J'
  });

  sidebarBtn.addEventListener('click', () => commandRegistry.runById('panel.toggleSidebar'));
  dockBtn.addEventListener('click', () => commandRegistry.runById('dock.toggle'));

  // Initial paint from the restored states, then follow every change.
  paintSidebar(sidebarResize.isVisible());
  paintDock({ open: dock.isOpen(), position: dock.position() });
  sidebarResize.onChange(paintSidebar);
  dock.onChange(paintDock);
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
  initLayoutToggles(root);
  // aiToolSelector.init() wires the select too, after awaiting
  // GET_AI_TOOL_CONFIG; this call leaves it populated and showing the active
  // tool whichever of the two runs second.
  require('./aiToolSelector').mountSelector();
}

module.exports = { init };
