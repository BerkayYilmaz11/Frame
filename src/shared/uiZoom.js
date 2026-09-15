/**
 * UI zoom ladder — the five interface sizes Frame offers (ui-zoom-steps spec).
 *
 * Pure by design (no DOM, no electron): required by the main-process owner
 * (src/main/uiZoom.js) to seed and apply the factor, and by the renderer
 * (commands, Frame Settings, status bar) to compute the next step and label
 * the current one. Everything that turns a step into a number reads from here
 * so the two processes can never disagree about what "+1" means.
 *
 * A step is an integer −2…+2. Step 0 is the untouched rendering — the density
 * pass's 12px base — and the ladder is deliberately tight (D1): +2 still fits
 * the 900px minimum window, −2 keeps text at 10.2px effective.
 */

const MIN_STEP = -2;
const MAX_STEP = 2;
const DEFAULT_STEP = 0;

/** Step → Chromium zoom factor. */
const LADDER = Object.freeze({
  '-2': 0.85,
  '-1': 0.92,
  '0': 1.0,
  '1': 1.10,
  '2': 1.20
});

/** Step → the name Frame Settings shows for it. */
const LABELS = Object.freeze({
  '-2': 'Smallest',
  '-1': 'Smaller',
  '0': 'Default',
  '1': 'Larger',
  '2': 'Largest'
});

/** Every step, ascending — the order the Settings select lists them. */
const STEPS = Object.freeze([-2, -1, 0, 1, 2]);

/** Integer within [MIN_STEP, MAX_STEP]; non-numbers land on the default. */
function clampStep(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_STEP;
  return Math.max(MIN_STEP, Math.min(MAX_STEP, Math.trunc(n)));
}

/**
 * A stored value → a step. Only an in-range integer counts; anything else
 * (absent key, string, float, out of range) is the default, so a hand-edited
 * settings file can never produce a factor the ladder does not have.
 */
function parseStep(raw) {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return DEFAULT_STEP;
  if (raw < MIN_STEP || raw > MAX_STEP) return DEFAULT_STEP;
  return raw;
}

function factorFor(step) {
  return LADDER[String(clampStep(step))];
}

/** Whole-number percentage: 85, 92, 100, 110, 120. */
function percentFor(step) {
  return Math.round(factorFor(step) * 100);
}

function labelFor(step) {
  return LABELS[String(clampStep(step))];
}

module.exports = {
  MIN_STEP,
  MAX_STEP,
  DEFAULT_STEP,
  STEPS,
  LADDER,
  clampStep,
  parseStep,
  factorFor,
  percentFor,
  labelFor
};
