/**
 * How to Use Frame — page illustrations (how-to-use-frame-guide spec).
 *
 * Sketches, not screenshots (plan D1): each page's illustration is a small
 * wireframe of the relevant part of Frame, drawn with HTML and the app's own
 * design tokens and lucide icons, so it follows all four themes and every
 * zoom step and weighs nothing. The user chose to try sketches and replace
 * them if they do not land — everything visual about them lives in this file
 * and the `.gs-*` rules in guide.css, behind one entry point.
 *
 * render(kind, focus) → HTML string, or null for a kind this file does not
 * draw (the host logs it once). A handful of kinds serve all pages through
 * `focus` (plan D10): the named region is drawn in the accent colour and the
 * rest of the sketch recedes. `focus` may be one region name or several
 * separated by commas.
 *
 * Every label drawn here is a literal UI string or a short caption; nothing
 * interpolated comes from the user or the filesystem, but text still goes
 * through escapeHtml so a future caption cannot break the markup.
 */

const {
  Package, Files, FilePlus2, Github, Plug, MessageSquarePlus, Settings, CircleHelp,
  Play, Sun, GitBranch, Bot, KeyRound, ChevronDown, SquareTerminal
} = require('lucide');
const { lucideIcon } = require('../dock');
const { escapeHtml } = require('../htmlUtils');

// ─── Primitives ───────────────────────────────────────────

const icon = (data, size = 12) => lucideIcon(data, size);

/** Parse `focus` ("a" | "a,b" | ["a","b"]) into a Set of region names. */
function focusSet(focus) {
  if (!focus) return new Set();
  const list = Array.isArray(focus) ? focus : String(focus).split(',');
  return new Set(list.map((s) => s.trim()).filter(Boolean));
}

/**
 * A focusable region. Regions named in `focus` get .gs-focus; when the
 * sketch has any focus the others recede (CSS on .gs-has-focus).
 */
function region(name, focused, cls, inner) {
  const on = focused.has(name);
  return `<div class="gs-region ${cls || ''}${on ? ' gs-focus' : ''}" data-region="${escapeHtml(name)}">${inner}</div>`;
}

/** Placeholder text: a rounded bar of a given width (percent). */
const bar = (w, cls = '') => `<span class="gs-bar ${cls}" style="width:${w}%"></span>`;

/** A short literal label. */
const label = (text, cls = '') => `<span class="gs-label ${cls}">${escapeHtml(text)}</span>`;

/** A small bordered pill, optionally with a status dot ('ok'|'warn'|'err'|'accent'). */
function chip(text, { dot, cls = '' } = {}) {
  const d = dot ? `<span class="gs-dot gs-dot-${dot}"></span>` : '';
  return `<span class="gs-chip ${cls}">${d}${escapeHtml(text)}</span>`;
}

/** A fake terminal body: a prompt line plus a few output bars. */
function terminalLines(prompt, widths = [72, 54, 63]) {
  return `<div class="gs-term-lines">
      ${prompt ? `<div class="gs-term-prompt"><span class="gs-term-caret">$</span>${escapeHtml(prompt)}</div>` : ''}
      ${widths.map((w) => `<div>${bar(w)}</div>`).join('')}
    </div>`;
}

/** The sketch's outer frame. */
function frame(kind, focused, inner, cls = '') {
  return `<div class="gs gs-${kind}${focused.size ? ' gs-has-focus' : ''} ${cls}">${inner}</div>`;
}

// ─── Kinds ────────────────────────────────────────────────

const KINDS = {
  /** Three agent CLIs, your own sign-in, running inside Frame's terminals. */
  agents(focused) {
    const cli = (name, cmd) => `
      <div class="gs-agent-card">
        <div class="gs-agent-name">${icon(SquareTerminal, 13)}${escapeHtml(name)}</div>
        <div class="gs-agent-cmd">${escapeHtml(cmd)}</div>
      </div>`;
    return frame('agents', focused, `
      <div class="gs-agents-col">
        ${region('clis', focused, 'gs-agents-clis', cli('Claude Code', 'claude') + cli('Codex CLI', 'codex') + cli('Gemini CLI', 'gemini'))}
        ${region('key', focused, 'gs-agents-key', `${icon(KeyRound, 12)}${label('your own sign-in')}`)}
      </div>
      <div class="gs-agents-arrow" aria-hidden="true"><span></span></div>
      ${region('frame', focused, 'gs-agents-frame', `
        <div class="gs-window-bar"><span class="gs-mark"></span>${label('Frame', 'gs-strong')}</div>
        <div class="gs-agents-panes">
          <div class="gs-pane">${terminalLines('claude', [70, 48])}${chip('working', { dot: 'accent' })}</div>
          <div class="gs-pane">${terminalLines('codex', [58, 66])}${chip('waiting for input', { dot: 'warn' })}</div>
        </div>
        <div class="gs-agents-context">
          ${chip('STRUCTURE.json')}${chip('PROJECT_NOTES.md')}${chip('tasks.json')}${chip('specs/')}
        </div>`)}
    `);
  },

  /**
   * The whole window. Regions: header-switcher, header-agent, header-start,
   * header-theme, rail-views, rail-foot, rail-guide, sidebar-nav, center,
   * dock, statusbar-left, statusbar-right.
   */
  shell(focused) {
    const railBtn = (data, name) => region(name, focused, 'gs-rail-btn', icon(data, 12));
    const navRow = (text, extra = '') => `<div class="gs-nav-row">${bar(0, 'gs-nav-icon')}${label(text)}${extra}</div>`;

    const header = `
      <div class="gs-shell-header">
        <span class="gs-mark"></span>
        ${region('header-switcher', focused, 'gs-switcher', `${label('my-project')}${icon(ChevronDown, 10)}`)}
        <div class="gs-header-right">
          ${region('header-agent', focused, 'gs-agent-picker', `${label('Agent', 'gs-dim')}${label('Claude Code')}${icon(ChevronDown, 10)}`)}
          ${region('header-start', focused, 'gs-start', `${icon(Play, 10)}${label('Start')}`)}
          ${region('header-theme', focused, 'gs-icon-btn', icon(Sun, 12))}
        </div>
      </div>`;

    const rail = `
      <div class="gs-rail">
        ${region('rail-views', focused, 'gs-rail-group', `
          <span class="gs-rail-icon gs-rail-active">${icon(Package, 12)}</span>
          <span class="gs-rail-icon">${icon(Files, 12)}</span>
          <span class="gs-rail-icon">${icon(FilePlus2, 12)}</span>
          <span class="gs-rail-icon">${icon(Github, 12)}</span>`)}
        <div class="gs-rail-spacer"></div>
        ${region('rail-foot', focused, 'gs-rail-group', `
          ${railBtn(Plug, 'rail-plugins')}
          ${railBtn(MessageSquarePlus, 'rail-feedback')}
          ${railBtn(Settings, 'rail-settings')}
          ${railBtn(CircleHelp, 'rail-guide')}`)}
      </div>`;

    const sidebar = region('sidebar-nav', focused, 'gs-sidebar', `
      <div class="gs-nav-group">${label('WORK', 'gs-eyebrow')}</div>
      ${navRow('Terminals')}
      ${navRow('Orchestration', chip('Beta', { cls: 'gs-chip-tiny' }))}
      <div class="gs-nav-group">${label('CONTEXT', 'gs-eyebrow')}</div>
      ${navRow('Specs')}
      ${navRow('Tasks')}
      ${navRow('Sessions')}
      <div class="gs-nav-foot">${navRow('Project Settings')}</div>`);

    const center = region('center', focused, 'gs-center', `
      <div class="gs-grid gs-grid-2">
        <div class="gs-pane">${terminalLines('claude', [66, 44, 58])}</div>
        <div class="gs-pane">${terminalLines('npm test', [52, 70])}</div>
      </div>`);

    const dock = region('dock', focused, 'gs-dock', `
      <div class="gs-dock-tabs">${label('Decisions', 'gs-tab gs-tab-active')}${label('Prompts', 'gs-tab')}${label('Activity', 'gs-tab')}</div>
      <div class="gs-dock-body">${bar(64)}${bar(48)}</div>`);

    const status = `
      <div class="gs-status">
        ${region('statusbar-left', focused, 'gs-status-left', `${icon(GitBranch, 10)}${label('main')}<span class="gs-status-sep"></span>${icon(Bot, 10)}${chip('1 waiting', { dot: 'warn', cls: 'gs-chip-tiny' })}`)}
        ${region('statusbar-right', focused, 'gs-status-right', `${label('Session', 'gs-dim')}<span class="gs-meter"><span style="width:38%"></span></span>${label('Weekly', 'gs-dim')}<span class="gs-meter"><span style="width:61%"></span></span>`)}
      </div>`;

    return frame('shell', focused, `
      ${header}
      <div class="gs-shell-body">
        ${rail}
        ${sidebar}
        <div class="gs-shell-main">${center}${dock}</div>
      </div>
      ${status}`);
  }
};

/**
 * @param {string} kind — one of guideContent.SKETCH_KINDS
 * @param {string|string[]} [focus]
 * @returns {string|null} HTML, or null when this file does not draw `kind`
 */
function render(kind, focus) {
  const draw = Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null;
  if (!draw) return null;
  return draw(focusSet(focus));
}

/** The kinds drawn here — the host compares against guideContent.SKETCH_KINDS. */
const DRAWN_KINDS = Object.freeze(Object.keys(KINDS));

module.exports = { render, DRAWN_KINDS };
