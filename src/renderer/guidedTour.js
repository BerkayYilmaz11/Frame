/**
 * Guided tour — the DOM host (first-run-guided-tour spec).
 *
 * A light layer over the live app: one step at a time, the step's target sits
 * in a clear cutout while the rest of the window dims a little, and a small
 * card beside it says what it is. The steps, their copy and every rule about
 * which one comes next live in tour/tourSteps.js, which is pure and tested;
 * this module only finds targets, measures them and paints.
 *
 * It never blocks the app. The overlay takes no clicks except on the card, so
 * a highlighted button still works and nothing else is locked while the tour
 * is open. It never navigates either: every target lives in the header, the
 * rail or the sidebar nav.
 *
 * Targets are looked up again on every reposition rather than held: the top
 * bar rewrites its chips on each render, so an element kept from the start of
 * a step can be detached a moment later.
 *
 * Listeners that follow layout (resize, sidebar, scroll, ResizeObserver) are
 * bound only while the tour is open, so a closed tour costs nothing.
 */

const state = require('./state');
const sidebarResize = require('./sidebarResize');
const tourSteps = require('./tour/tourSteps');

const { STEPS } = tourSteps;

/** Space between a target's edge and the cutout's. */
const HOLE_PADDING = 6;

let initialized = false;
let rootEl = null;
let holeEl = null;
let cardEl = null;

let isOpen = false;
let index = -1;
let startedWithoutProject = false;
let unbindWhileOpen = [];
let targetObserver = null;
let observedTarget = null;
let repositionQueued = false;
let loggedMissing = new Set();

function init() {
  // Init-once, like every other surface in the renderer: a reload must not
  // stack a second set of listeners (audit-q3-performance-resources T06).
  if (initialized) return;
  initialized = true;
}

function hasProject() {
  return !!state.getProjectPath();
}

/**
 * Start (or restart) the tour from the first step that applies: step 1 with
 * no project open, the project switcher with one.
 */
function start() {
  if (isOpen) close();
  if (!ensureNodes()) return;

  startedWithoutProject = !hasProject();
  loggedMissing = new Set();
  const first = tourSteps.firstStepIndex({ hasProject: hasProject(), isAvailable });
  if (first === -1) {
    console.error('guidedTour: no step has a target on screen — the tour did not start');
    return;
  }

  isOpen = true;
  rootEl.hidden = false;
  bindWhileOpen();
  show(first);
}

/** Leave the tour: remove the layer and every listener it bound. */
function close() {
  if (!isOpen) return;
  isOpen = false;
  index = -1;
  unbindWhileOpen.forEach((unbind) => unbind());
  unbindWhileOpen = [];
  observeTarget(null);
  if (rootEl) rootEl.hidden = true;
}

function next() {
  if (!isOpen) return;
  const following = tourSteps.nextStepIndex(index, { hasProject: hasProject(), isAvailable });
  if (following === -1) {
    close();
    return;
  }
  show(following);
}

function ensureNodes() {
  if (rootEl && rootEl.isConnected) return true;
  if (!document.body) {
    console.error('guidedTour: document.body is not ready — the tour cannot open');
    return false;
  }
  rootEl = document.createElement('div');
  rootEl.id = 'guided-tour';
  rootEl.hidden = true;

  holeEl = document.createElement('div');
  holeEl.className = 'tour-hole';

  cardEl = document.createElement('div');
  cardEl.className = 'tour-card';
  cardEl.setAttribute('role', 'dialog');
  cardEl.setAttribute('aria-live', 'polite');
  cardEl.tabIndex = -1;
  cardEl.addEventListener('click', onCardClick);

  rootEl.append(holeEl, cardEl);
  document.body.appendChild(rootEl);
  return true;
}

// ─── targets ──────────────────────────────────────────────

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** The step's first target that is on screen right now, with its entry. */
function resolveTarget(step) {
  for (const target of step.targets) {
    const el = document.querySelector(target.selector);
    if (isVisible(el)) return { el, target };
  }
  return null;
}

function isAvailable(step) {
  return !!resolveTarget(step);
}

// ─── painting ─────────────────────────────────────────────

function show(i) {
  const step = STEPS[i];
  const resolved = step && resolveTarget(step);
  if (!resolved) {
    skipMissing(i);
    return;
  }
  index = i;
  renderCard(step, i);
  cardEl.classList.add('tour-card-measuring');
  position();
  // One frame measured and placed, then let it be seen (and animate from
  // here on).
  requestAnimationFrame(() => {
    if (cardEl) cardEl.classList.remove('tour-card-measuring');
  });
}

/** A step whose target is gone: log it once, move on, never end the tour on it. */
function skipMissing(i) {
  const step = STEPS[i];
  if (step && !loggedMissing.has(step.id)) {
    loggedMissing.add(step.id);
    console.error(`guidedTour: step "${step.id}" has no target on screen — skipped`);
  }
  const following = tourSteps.nextStepIndex(i, { hasProject: hasProject(), isAvailable });
  if (following === -1) {
    close();
    return;
  }
  show(following);
}

/** The steps this run of the tour counts: step 1 only if it began without a project. */
function countedSteps() {
  return STEPS.filter((s) => startedWithoutProject || !s.requiresNoProject);
}

function renderCard(step, i) {
  const counted = countedSteps();
  const position = counted.indexOf(step) + 1;
  const last = tourSteps.isLastStep(i, { hasProject: hasProject() });

  cardEl.replaceChildren();
  cardEl.setAttribute('aria-label', step.title);

  const head = el('div', 'tour-card-head');
  head.append(
    el('h4', 'tour-card-title', step.title),
    el('span', 'tour-card-counter', `${position} of ${counted.length}`)
  );
  cardEl.append(head, el('p', 'tour-card-body', step.body));
  if (step.closing) cardEl.append(el('p', 'tour-card-closing', step.closing));

  const foot = el('div', 'tour-card-foot');
  const skip = el('button', 'tour-card-skip', 'Skip tour');
  skip.type = 'button';
  skip.dataset.tourAction = 'skip';
  foot.append(skip, el('span', 'tour-card-spacer'));

  const primary = el('button', 'primary-btn tour-card-next', last ? 'Done' : 'Next');
  primary.type = 'button';
  primary.dataset.tourAction = last ? 'done' : 'next';
  foot.append(primary);

  cardEl.append(foot);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function onCardClick(e) {
  const btn = e.target.closest('[data-tour-action]');
  if (!btn) return;
  const action = btn.dataset.tourAction;
  if (action === 'next') next();
  else if (action === 'skip' || action === 'done') close();
}

/** Measure the current target and move the cutout and the card to it. */
function position() {
  if (!isOpen || index === -1) return;
  const step = STEPS[index];
  const resolved = resolveTarget(step);
  if (!resolved) {
    // It was there when the step opened and has gone since (a project
    // removed, a view re-rendered away): treat it like any missing target.
    skipMissing(index);
    return;
  }
  observeTarget(resolved.el);

  const rect = resolved.el.getBoundingClientRect();
  const hole = {
    top: rect.top - HOLE_PADDING,
    left: rect.left - HOLE_PADDING,
    width: rect.width + HOLE_PADDING * 2,
    height: rect.height + HOLE_PADDING * 2
  };
  holeEl.style.top = `${hole.top}px`;
  holeEl.style.left = `${hole.left}px`;
  holeEl.style.width = `${hole.width}px`;
  holeEl.style.height = `${hole.height}px`;

  const placed = tourSteps.placeCard(
    hole,
    { width: cardEl.offsetWidth, height: cardEl.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    resolved.target.placement
  );
  cardEl.style.top = `${placed.top}px`;
  cardEl.style.left = `${placed.left}px`;
  cardEl.dataset.placement = placed.placement;
}

/** Coalesce bursts (a sidebar drag, a scroll) into one measurement per frame. */
function queueReposition() {
  if (repositionQueued) return;
  repositionQueued = true;
  requestAnimationFrame(() => {
    repositionQueued = false;
    position();
  });
}

function observeTarget(target) {
  if (observedTarget === target) return;
  if (targetObserver && observedTarget) targetObserver.unobserve(observedTarget);
  observedTarget = target;
  if (targetObserver && target) targetObserver.observe(target);
}

function bindWhileOpen() {
  const onResize = () => queueReposition();
  window.addEventListener('resize', onResize);
  unbindWhileOpen.push(() => window.removeEventListener('resize', onResize));

  // Scrolls anywhere (the sidebar nav, a panel) move targets without resizing
  // anything — capture catches the ones that do not bubble.
  const onScroll = () => queueReposition();
  document.addEventListener('scroll', onScroll, true);
  unbindWhileOpen.push(() => document.removeEventListener('scroll', onScroll, true));

  unbindWhileOpen.push(sidebarResize.onChange(() => queueReposition()));

  if (typeof ResizeObserver === 'function') {
    const layoutObserver = new ResizeObserver(() => queueReposition());
    const container = document.getElementById('terminal-container');
    if (container) layoutObserver.observe(container);
    targetObserver = new ResizeObserver(() => queueReposition());
    unbindWhileOpen.push(() => {
      layoutObserver.disconnect();
      targetObserver.disconnect();
      targetObserver = null;
      observedTarget = null;
    });
  }
}

module.exports = { init, start, close, isOpen: () => isOpen };
