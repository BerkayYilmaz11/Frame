/**
 * How to Use Frame — the guide modal (how-to-use-frame-guide spec).
 *
 * The DOM host for guide/guideContent.js: an index tree on the left, one page
 * on the right (sketch, then explanation), Back / "n / N" / Next in the
 * footer. The markup in index.html is only a frame; everything inside it is
 * rendered from the content module, which is pure and tested.
 *
 * Reading: a tree row, Back / Next and ← / → move through the pages in tree
 * order across chapter boundaries. Chapters start expanded; a chapter can be
 * collapsed, and moving to one of its pages expands it again. Reopening
 * always starts on the first page (plan D3).
 *
 * Acting: a page's action links run command-registry ids. The guide closes
 * first so the target is visible — except theme and zoom links (`stay`),
 * whose effect shows in the guide itself. An id the registry does not know
 * renders disabled and is logged once per open, so a renamed command shows
 * up as a dead-looking button and a console line rather than a silent no-op
 * (audit-q3-ux-error-feedback).
 *
 * Shortcuts are never written into the copy: `{kbd:id}` reads the command's
 * accelerator from the registry and formats it for this platform.
 *
 * It never opens by itself: it is reference, reached from the rail's help
 * button, Help › How to Use Frame and the palette. (It used to own the launch
 * and open before Welcome; the user found it is not onboarding and moved it
 * back to on-demand only.)
 */

const commandRegistry = require('./commandRegistry');
const { formatShortcut } = require('./platform');
const { escapeHtml } = require('./htmlUtils');
const guideContent = require('./guide/guideContent');
const guideSketches = require('./guide/guideSketches');

let overlayEl = null;
let modalEl = null;
let treeEl = null;
let sketchEl = null;
let contentEl = null;
let backBtn = null;
let nextBtn = null;
let counterEl = null;

let isOpen = false;
let pages = [];
let index = 0;
let collapsed = new Set();
let loggedMissing = new Set();

/** Called with ({ via }) after every close. */
let closeListeners = [];

function init() {
  overlayEl = document.getElementById('guide-overlay');
  if (!overlayEl) {
    console.error('guideModal: #guide-overlay not found — How to Use Frame will not open');
    return;
  }
  modalEl = overlayEl.querySelector('.guide-modal');
  treeEl = document.getElementById('guide-tree');
  sketchEl = document.getElementById('guide-sketch');
  contentEl = document.getElementById('guide-page-content');
  backBtn = document.getElementById('guide-back');
  nextBtn = document.getElementById('guide-next');
  counterEl = document.getElementById('guide-counter');

  pages = guideContent.flattenPages();
  const problems = guideContent.validate();
  if (problems.length) console.error('guideModal: guide content has problems:\n' + problems.join('\n'));

  document.getElementById('guide-close').addEventListener('click', () => close());
  backBtn.addEventListener('click', () => go(index - 1));
  nextBtn.addEventListener('click', () => {
    if (index >= pages.length - 1) close();
    else go(index + 1);
  });

  overlayEl.addEventListener('mousedown', (e) => {
    if (e.target === overlayEl) close();
  });

  treeEl.addEventListener('click', onTreeClick);
  contentEl.addEventListener('click', onContentClick);

  document.addEventListener('keydown', onKeydown);
}

// ─── Open / close ─────────────────────────────────────────

function open() {
  if (!overlayEl) return;
  if (isOpen) {
    go(0);
    return;
  }
  isOpen = true;
  collapsed = new Set();
  loggedMissing = new Set();
  go(0);
  overlayEl.classList.add('visible');
  // Take focus so ← / → never reach a focused terminal.
  if (modalEl) modalEl.focus();
}

/**
 * @param {{ via?: 'action'|'dismiss' }} [opts] — 'action' when an action
 *   link closed the guide: the target keeps focus.
 */
function close({ via = 'dismiss' } = {}) {
  if (!isOpen) return;
  isOpen = false;
  overlayEl.classList.remove('visible');
  if (via !== 'action' && typeof window.terminalFocus === 'function') window.terminalFocus();
  for (const fn of closeListeners) {
    try { fn({ via }); } catch (err) { console.error('guideModal: close listener failed', err); }
  }
}

function toggle() {
  if (isOpen) close();
  else open();
}

function onClose(fn) {
  if (typeof fn === 'function') closeListeners.push(fn);
}

// ─── Navigation ───────────────────────────────────────────

function go(i) {
  if (pages.length === 0) return;
  index = Math.max(0, Math.min(pages.length - 1, i));
  collapsed.delete(pages[index].chapterId);
  renderTree();
  renderPage();
  renderFooter();
  const pageEl = document.getElementById('guide-page');
  if (pageEl) pageEl.scrollTop = 0;
}

function onKeydown(e) {
  if (!isOpen) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    go(index + 1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(index - 1);
  }
}

function onTreeClick(e) {
  const pageBtn = e.target.closest('[data-page-index]');
  if (pageBtn) {
    go(Number(pageBtn.dataset.pageIndex));
    return;
  }
  const chapterBtn = e.target.closest('[data-chapter-id]');
  if (chapterBtn) {
    const id = chapterBtn.dataset.chapterId;
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    renderTree();
  }
}

function onContentClick(e) {
  const btn = e.target.closest('[data-action-id]');
  if (!btn || btn.disabled) return;
  const id = btn.dataset.actionId;
  const stay = btn.dataset.stay === 'true';
  if (!stay) close({ via: 'action' });
  if (!commandRegistry.runById(id)) {
    console.error(`guideModal: command "${id}" did not run`);
    return;
  }
  // A theme or zoom link ran in place: redraw so the page (the theme
  // swatches mark the current one) reflects what just changed.
  if (stay && isOpen) renderPage();
}

// ─── Rendering ────────────────────────────────────────────

function renderTree() {
  const current = pages[index];
  let pageIndex = 0;
  treeEl.innerHTML = guideContent.CHAPTERS.map((chapter, ci) => {
    const isCollapsed = collapsed.has(chapter.id);
    const isCurrent = current && current.chapterId === chapter.id;
    const items = chapter.pages.map((page) => {
      const i = pageIndex++;
      const active = i === index;
      return `<li><button type="button" class="guide-page-btn${active ? ' active' : ''}" data-page-index="${i}"${active ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</button></li>`;
    }).join('');
    return `
      <div class="guide-chapter${isCollapsed ? ' collapsed' : ''}${isCurrent ? ' current' : ''}">
        <button type="button" class="guide-chapter-btn" data-chapter-id="${escapeHtml(chapter.id)}" aria-expanded="${!isCollapsed}">
          <span class="guide-chapter-num">${ci + 1}</span>
          <span class="guide-chapter-title">${escapeHtml(chapter.title)}</span>
          <span class="guide-chapter-chevron" aria-hidden="true">&#9662;</span>
        </button>
        <ul class="guide-chapter-pages">${items}</ul>
      </div>`;
  }).join('');

  const activeBtn = treeEl.querySelector('.guide-page-btn.active');
  if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
    activeBtn.scrollIntoView({ block: 'nearest' });
  }
}

function renderPage() {
  const { chapterId, page } = pages[index];
  const chapter = guideContent.CHAPTERS.find((c) => c.id === chapterId);

  sketchEl.innerHTML = renderSketch(page.sketch);

  const chip = page.claudeOnly ? '<span class="guide-chip">Claude Code only</span>' : '';
  const blocks = page.blocks.map(renderBlock).join('');
  const actions = (page.actions || []).map(renderAction).join('');

  contentEl.innerHTML = `
    <p class="guide-page-chapter">${escapeHtml(chapter ? chapter.title : '')}</p>
    <h2 class="guide-page-title">${escapeHtml(page.title)}${chip}</h2>
    ${blocks}
    ${actions ? `<div class="guide-actions">${actions}</div>` : ''}`;
}

/**
 * The page's illustration. A kind guideSketches does not draw leaves the slot
 * empty (CSS hides it) and is logged once per open.
 */
function renderSketch(sketch) {
  if (!sketch) return '';
  let html = null;
  try {
    html = guideSketches.render(sketch.kind, sketch.focus);
  } catch (err) {
    console.error(`guideModal: sketch "${sketch.kind}" failed to render`, err);
  }
  if (html === null) {
    logMissing(`sketch:${sketch.kind}`, `the guide cites sketch kind "${sketch.kind}", which guideSketches does not draw`);
    return '';
  }
  return html;
}

function renderBlock(block) {
  if (block.p !== undefined) return `<p>${renderInline(block.p)}</p>`;
  if (block.list !== undefined) return `<ul>${block.list.map((t) => `<li>${renderInline(t)}</li>`).join('')}</ul>`;
  if (block.code !== undefined) return `<code class="guide-code">${escapeHtml(block.code)}</code>`;
  if (block.note !== undefined) return `<p class="guide-note">${renderInline(block.note)}</p>`;
  return '';
}

function renderInline(text) {
  return guideContent.parseInline(text).map((seg) => {
    if (seg.type === 'code') return `<code>${escapeHtml(seg.value)}</code>`;
    if (seg.type === 'kbd') return renderKbd(seg.value);
    return escapeHtml(seg.value);
  }).join('');
}

/** A command's shortcut as <kbd>, or nothing when it has none / is unknown. */
function renderKbd(id) {
  const cmd = commandRegistry.getById(id);
  if (!cmd) {
    logMissing(id);
    return '';
  }
  return cmd.shortcut ? `<kbd>${escapeHtml(formatShortcut(cmd.shortcut))}</kbd>` : '';
}

function renderAction(action) {
  const cmd = commandRegistry.getById(action.id);
  if (!cmd) logMissing(action.id);
  let available = false;
  try {
    available = !!cmd && cmd.when();
  } catch (err) {
    available = false;
  }
  const kbd = cmd && cmd.shortcut ? ` <kbd>${escapeHtml(formatShortcut(cmd.shortcut))}</kbd>` : '';
  const title = !cmd
    ? 'This command is not available in this version of Frame'
    : (!available ? 'Not available right now' : '');
  return `<button type="button" class="guide-action" data-action-id="${escapeHtml(action.id)}"${action.stay ? ' data-stay="true"' : ''}${available ? '' : ' disabled'}${title ? ` title="${escapeHtml(title)}"` : ''}>
      <span class="guide-action-arrow" aria-hidden="true">&rarr;</span>${escapeHtml(action.label)}${kbd}
    </button>`;
}

function logMissing(id, message) {
  if (loggedMissing.has(id)) return;
  loggedMissing.add(id);
  console.error(`guideModal: ${message || `the guide cites command "${id}", which is not registered`}`);
}

function renderFooter() {
  const last = index >= pages.length - 1;
  backBtn.disabled = index === 0;
  nextBtn.innerHTML = last ? 'Done' : 'Next &rarr;';
  counterEl.textContent = `${index + 1} / ${pages.length}`;
}

module.exports = { init, open, close, toggle, onClose, isOpen: () => isOpen };
