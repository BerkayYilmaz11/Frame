/**
 * The onboarding screen's gate (first-run-onboarding-screen spec, D4).
 *
 * Pure by design: CI runs `npm test` with no `npm ci`, so this module may not
 * reach `electron` or the DOM. Requiring it at the top is half the test — if
 * the gate ever grows a renderer dependency, this suite stops loading.
 *
 * What is pinned is what a reader would get wrong: that an unknown project
 * count is not an empty one, that a boot screen is never dismissible however
 * it was reached, and that skipping stores nothing — the gate has no memory,
 * so the same inputs always produce the same screen.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { decide, LAUNCH, COMMAND } = require('../src/renderer/onboarding/onboardingGate');

const PROJECT = { name: 'Frame', path: '/tmp/frame' };

// ─── launch ───────────────────────────────────────────────

test('launch with zero projects: shows, and Skip is the only way out', () => {
  assert.deepEqual(decide({ trigger: LAUNCH, projects: [] }), {
    show: true,
    dismissible: false
  });
});

test('launch with one or more projects: never shows', () => {
  assert.deepEqual(decide({ trigger: LAUNCH, projects: [PROJECT] }), {
    show: false,
    dismissible: false
  });
  assert.equal(decide({ trigger: LAUNCH, projects: [PROJECT, PROJECT] }).show, false);
});

test('launch with an uncountable payload: unknown is not empty', () => {
  // A malformed or missing push means we do not know the count. Showing a
  // first-run screen to a user who has projects is the worse failure, so
  // every one of these stays hidden.
  for (const projects of [undefined, null, 0, '', 'none', {}, { length: 0 }]) {
    assert.equal(
      decide({ trigger: LAUNCH, projects }).show,
      false,
      `expected no screen for ${JSON.stringify(projects) ?? String(projects)}`
    );
  }
});

test('an unrecognised trigger follows the launch rule, not the command one', () => {
  // Only COMMAND earns dismissibility; anything else is treated as a boot.
  assert.deepEqual(decide({ trigger: 'whatever', projects: [] }), {
    show: true,
    dismissible: false
  });
  assert.deepEqual(decide(), { show: false, dismissible: false });
});

// ─── command ──────────────────────────────────────────────

test('the palette command shows at any project count, and closes like an overlay', () => {
  for (const projects of [[], [PROJECT], undefined]) {
    assert.deepEqual(decide({ trigger: COMMAND, projects }), {
      show: true,
      dismissible: true
    });
  }
});

// ─── no memory ────────────────────────────────────────────

test('the gate stores nothing: a skipped launch decides the same way next time', () => {
  const first = decide({ trigger: LAUNCH, projects: [] });
  // Whatever happens in between — the user skipping, the app running for a
  // week — the same inputs must produce the same answer. The project count is
  // the only gate; there is no dismissal flag for a later launch to read.
  decide({ trigger: COMMAND, projects: [] });
  assert.deepEqual(decide({ trigger: LAUNCH, projects: [] }), first);
});
