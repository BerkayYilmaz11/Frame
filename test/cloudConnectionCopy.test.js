/**
 * cloudConnectionCopy tests — the words Frame says about a device's Frame
 * Cloud connection (frame-cloud-teammate-connection).
 * Runs with Node's built-in runner: `npm test`.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const copy = require('../src/renderer/cloudConnectionCopy');
const { ROLE_FORBIDDEN } = require('../src/renderer/cloudRoles');

const A = { id: 'p1', slug: 'app', name: 'App' };

test('statusChip: one chip per row state, Connected green and Ready blue', () => {
  assert.deepEqual(copy.statusChip('connected'), { label: 'Connected', className: 'cloud-chip-connected' });
  assert.deepEqual(copy.statusChip('ready'), { label: 'Ready to connect', className: 'cloud-chip-ready' });
  assert.deepEqual(copy.statusChip('notConnected'), { label: 'Not connected', className: '' });
  assert.deepEqual(copy.statusChip('notClaimed'), { label: 'Not claimed', className: '' });
  assert.equal(copy.statusChip('linked').label, 'Not connected', 'an unknown state reads Not connected');
});

test('no chip says Linked: the identity is never a state on screen', () => {
  for (const chip of Object.values(copy.STATUS_CHIPS)) assert.doesNotMatch(chip.label, /link/i);
});

test('CLAIM_LINE says claiming picks the folder, and that clones then connect with one click', () => {
  assert.match(copy.CLAIM_LINE, /^Claiming picks the folder that is this project\./);
  assert.match(copy.CLAIM_LINE, /every member's clone/);
  assert.match(copy.CLAIM_LINE, /one click/);
});

test('notHereNote: a claimed project asks for a clone and Connect, never a Connect step in On this device', () => {
  const note = copy.notHereNote('notConnected');
  assert.match(note, /clone of its repository/);
  assert.match(note, /"Add a project…"/);
  assert.match(note, /click Connect\.$/);
  assert.doesNotMatch(note, /On this device/);
});

test('notHereNote: a connected device with no folder here can re-add one or disconnect', () => {
  const note = copy.notHereNote('connected');
  assert.match(note, /This device is connected/);
  assert.match(note, /opens connected/);
  assert.match(note, /disconnect this device/);
});

test('notHereNote: an unclaimed project is chosen with Connect a folder…', () => {
  assert.match(copy.notHereNote('notClaimed'), /Connect a folder…/);
  assert.equal(copy.notHereNote('something'), copy.notHereNote('notConnected'));
});

test('disconnectQuestion names the project, says Briefs leave this device, and who stays connected', () => {
  const q = copy.disconnectQuestion(A);
  assert.match(q, /^Disconnect this device from App\?/);
  assert.match(q, /Briefs stop showing here\./);
  assert.match(q, /Your teammates and your other devices stay connected/);
  assert.match(q, /the folder stays as it is\./);
  const away = copy.disconnectQuestion(A, { folderHere: false });
  assert.doesNotMatch(away, /folder/);
  assert.match(copy.disconnectQuestion({ slug: 'app' }), /from app\?/);
  assert.match(copy.disconnectQuestion(null), /from this project\?/);
});

test('connectRefusal: a stale list says it was refreshed; sign-out says nothing', () => {
  assert.match(copy.connectRefusal('unlinked'), /no longer claimed — the list was refreshed\./);
  assert.match(copy.connectRefusal('identityChanged'), /another folder — the list was refreshed\./);
  assert.match(copy.connectRefusal('notFound'), /no longer exists/);
  assert.equal(copy.connectRefusal('roleForbidden'), ROLE_FORBIDDEN);
  assert.equal(copy.connectRefusal('unauthorized'), null);
  assert.equal(copy.connectRefusal('other'), "Couldn't connect this device. Try again.");
});

test('disconnectRefusal: network and the fallback name this device', () => {
  assert.equal(copy.disconnectRefusal('network'), "Frame Cloud couldn't be reached.");
  assert.equal(copy.disconnectRefusal('other'), "Couldn't disconnect this device. Try again.");
  assert.equal(copy.disconnectRefusal('unauthorized'), null);
});
