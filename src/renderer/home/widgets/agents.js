/**
 * Agents widget.
 *
 * What is running, and how to start one more. Two jobs, and the second is
 * why the top bar can drop its tool `<select>`: the launcher lives here now,
 * where there is room for the choice next to the button (G8).
 *
 * Rows are `agentRows`' output — the filter and the attention order are
 * tested there, not here (C8). This module's job is drawing them and wiring
 * the clicks. Every action that can fail says so through `notify.error` (C7);
 * none of them touches `ipcRenderer` (D3, S6) — `homeData` owns the write.
 */

const { Terminal } = require('lucide');
const { escapeHtml } = require('./../../htmlUtils');
const notify = require('./../../notify');
const laneStatus = require('./../../laneStatus');
const homeData = require('./../homeData');
const { agentRows } = require('./../agentRows');
const { widgetShell } = require('./../widgetShell');

// Fallback for a host that does not say how many lanes a project may hold;
// the real number comes from the terminal manager through `ctx.maxAgents`.
const DEFAULT_MAX_AGENTS = 9;

module.exports = {
  id: 'agents',
  title: 'Terminals',
  icon: Terminal,
  sources: ['lanes', 'aiTool'],
  defaultSpan: 1,
  defaultEnabled: true,

  isAvailable: () => true,

  mount(el, ctx) {
    this.ctx = ctx;
    this.card = widgetShell({
      id: 'agents',
      icon: Terminal,
      title: 'Terminals',
      // The header is not a doorway: this card is not the Terminals section,
      // and a chevron that pretended to open it would be a lie.
      onOpen: null
    });

    // The launcher is the first thing in the card, above the slots, and is
    // always there — an agent you want to start is not something you only
    // want when none is running. It is the one action Home exists for, so
    // it sits centred where the eye lands first, with a line saying what it
    // does and the controls directly under it.
    this.launcher = document.createElement('div');
    this.launcher.className = 'home-agent-launcher';
    // Same picker as the terminal header (.ai-tool-picker in terminal.css):
    // the <label> is the visible box, the native <select> underneath stays
    // the interactive element, so clicking anywhere on the box opens it.
    this.launcher.innerHTML = `
      <div class="home-agent-launcher-text">
        <p class="home-agent-launcher-lead">Start an agent</p>
        <p class="home-agent-launcher-hint">This is where work in Frame begins. Pick a tool and press Start — Frame opens it in a terminal and tracks it here: when it finishes, needs input, or asks to run something.</p>
      </div>
      <div class="home-agent-launcher-controls">
        <label class="ai-tool-picker" title="Default agent — Start launches this one">
          <span class="ai-tool-picker-label">Agent</span>
          <select class="ai-tool-select home-agent-tool" aria-label="Default agent"></select>
          <svg class="ai-tool-picker-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </label>
        <button type="button" class="primary-btn home-agent-start" title="Start the default agent">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span>Start</span>
        </button>
      </div>
    `;
    this.card.el.insertBefore(this.launcher, this.card.body);

    this.toolEl = this.launcher.querySelector('.home-agent-tool');
    this.toolEl.addEventListener('change', () => this._setTool(this.toolEl.value));

    const start = this.launcher.querySelector('.home-agent-start');
    // startDefaultAgent already routes every failure it can hit to
    // notify.error; this catches the ones it cannot reach.
    start.addEventListener('click', () => {
      Promise.resolve()
        .then(() => require('./../../agentDispatch').startDefaultAgent())
        .catch(err => notify.error(`Could not start the agent: ${err.message || 'launch failed'}`));
    });
    // The same right-click affordance the old New-terminal tile had: pick the
    // shell the agent will run in.
    start.addEventListener('contextmenu', (e) => {
      if (!ctx.showShellMenu) return;
      e.preventDefault();
      ctx.showShellMenu(e.clientX, e.clientY);
    });

    el.appendChild(this.card.el);
  },

  update({ lanes, aiTool }) {
    const card = this.card;
    if (!card) return;

    this._renderTool(aiTool);

    const rows = agentRows(lanes);
    const max = (this.ctx && this.ctx.maxAgents) || DEFAULT_MAX_AGENTS;
    card.count.textContent = `${rows.length} / ${max}`;

    // One tile per open terminal, agent or plain shell — nothing drawn for
    // the room that is left; the count in the header already says that.
    // Approval first, then input, then working, then shells — the order
    // agentRows fixed. The mark and the label come from laneStatus so that
    // Home and the rails describe the same state in the same words.
    const tiles = rows.slice(0, max).map((r) => {
      const mark = laneStatus.attentionMark(r.status);
      const label = laneStatus.statusLabel(r.status, {
        agentName: r.agentName, foreground: r.foreground, commandLine: r.commandLine, short: true
      });
      const when = laneStatus.formatRelativeTime(r.lastActivityAt);
      return `
        <button type="button" class="home-card-row home-agent-tile ${r.status}" data-id="${escapeHtml(r.id)}"
                title="${escapeHtml(label)}">
          <span class="home-card-row-name">
            <span class="lane-status-dot ${r.status}"></span>${escapeHtml(r.name)}
            ${mark ? `<span class="home-card-row-mark">${mark}</span>` : ''}
          </span>
          <span class="home-card-row-meta">${escapeHtml(label)}${when ? ` · ${escapeHtml(when)}` : ''}</span>
        </button>
      `;
    });
    card.body.innerHTML = '<div class="home-agent-grid">' + tiles.join('') + '</div>';

    // A row is the way into the lane it names — the whole reason to list it.
    card.body.querySelectorAll('.home-card-row').forEach((row) => {
      row.addEventListener('click', () => this.ctx.enterLane(row.dataset.id));
    });
  },

  /** The options and the selection, from homeData's `aiTool` source. */
  _renderTool(aiTool) {
    const available = (aiTool && aiTool.available) || {};
    const current = aiTool && aiTool.current;
    const ids = Object.keys(available);

    // Rebuilding the options on every tick would fight the open dropdown.
    if (ids.join(',') !== this._toolIds) {
      this._toolIds = ids.join(',');
      this.toolEl.innerHTML = ids.map(id => {
        const name = String(available[id].name || id).replace(' Code', '').replace(' CLI', '');
        return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
      }).join('');
    }

    if (current && this.toolEl.value !== current.id) this.toolEl.value = current.id;
    this._toolId = current ? current.id : null;
  },

  _setTool(toolId) {
    homeData.setAiTool(toolId)
      .then((ok) => {
        if (ok !== false) return;
        // Nothing changed, so the select must not claim otherwise.
        if (this._toolId) this.toolEl.value = this._toolId;
        notify.error('Could not switch the default agent');
      })
      .catch((err) => {
        if (this._toolId) this.toolEl.value = this._toolId;
        notify.error(`Could not switch the default agent: ${err.message || 'the change was rejected'}`);
      });
  },

  dispose() {
    this.card = null;
    this.launcher = null;
    this.toolEl = null;
    this._toolIds = null;
    this.ctx = null;
  }
};
