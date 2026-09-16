/**
 * The status bar notice tray's model (status-bar-notice-tray spec, D6 / D9).
 *
 * Pure by design: requiring it at the top must not reach `electron`,
 * `lucide` or the DOM. Pinned: identical repeats merge into one row that
 * counts, re-marks unread and moves to the top; distinct messages stay
 * separate; the list is capped at MAX_NOTICES; the tone is the worst unread
 * severity and the unread number excludes info; dismiss / clear / markAllRead
 * never mutate their input; source labels fall back to the raw key; row
 * focus wraps.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/renderer/statusBar/noticeTrayModel');

function push(list, input, now, id) {
  return model.add(list, input, { now, id });
}

const ERR = { severity: 'error', source: 'uncaught-exception', message: 'Main process error: ENOENT' };
const WARN = { severity: 'warning', source: 'dependency', message: 'gh was not found' };
const INFO = { severity: 'info', source: 'migration', message: 'Frame moved 3 files into .frame/.' };

test('a new notice becomes an unread row at the top', () => {
  let list = push([], WARN, 1, 1);
  list = push(list, ERR, 2, 2);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], {
    id: 2, severity: 'error', source: 'uncaught-exception', message: ERR.message,
    count: 1, firstAt: 2, lastAt: 2, unread: true
  });
  assert.equal(list[1].id, 1);
});

test('an identical repeat merges: count, time, unread, moved to the top', () => {
  let list = push([], ERR, 1, 1);
  list = push(list, WARN, 2, 2);
  list = model.markAllRead(list);
  list = push(list, ERR, 3, 3);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 1);
  assert.equal(list[0].count, 2);
  assert.equal(list[0].firstAt, 1);
  assert.equal(list[0].lastAt, 3);
  assert.equal(list[0].unread, true);
  assert.equal(list[1].unread, false);
});

test('twenty identical errors are one row with count 20', () => {
  let list = [];
  for (let i = 0; i < 20; i += 1) list = push(list, ERR, i, i + 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].count, 20);
});

test('same message with a different severity or source is a separate row', () => {
  let list = push([], ERR, 1, 1);
  list = push(list, { ...ERR, severity: 'warning' }, 2, 2);
  list = push(list, { ...ERR, source: 'unhandled-rejection' }, 3, 3);
  assert.equal(list.length, 3);
});

test('an unknown severity is treated as an error', () => {
  const list = push([], { source: 'x', message: 'm', severity: 'fatal' }, 1, 1);
  assert.equal(list[0].severity, 'error');
});

test('the list is capped, dropping the oldest', () => {
  let list = [];
  for (let i = 0; i < model.MAX_NOTICES + 5; i += 1) {
    list = push(list, { ...ERR, message: `error ${i}` }, i, i + 1);
  }
  assert.equal(list.length, model.MAX_NOTICES);
  assert.equal(list[0].message, `error ${model.MAX_NOTICES + 4}`);
  assert.equal(list[list.length - 1].message, 'error 5');
});

test('indicator: none when empty or everything is read', () => {
  assert.deepEqual(model.indicator([]), { tone: 'none', unread: 0 });
  const read = model.markAllRead(push(push([], ERR, 1, 1), WARN, 2, 2));
  assert.deepEqual(model.indicator(read), { tone: 'none', unread: 0 });
});

test('indicator: error beats warning beats info; info is not counted', () => {
  const info = push([], INFO, 1, 1);
  assert.deepEqual(model.indicator(info), { tone: 'info', unread: 0 });

  const warn = push(info, WARN, 2, 2);
  assert.deepEqual(model.indicator(warn), { tone: 'warning', unread: 1 });

  const err = push(warn, ERR, 3, 3);
  assert.deepEqual(model.indicator(err), { tone: 'error', unread: 2 });
});

test('indicator ignores a read error when an unread warning remains', () => {
  let list = model.markAllRead(push([], ERR, 1, 1));
  list = push(list, WARN, 2, 2);
  assert.deepEqual(model.indicator(list), { tone: 'warning', unread: 1 });
});

test('dismiss removes one row; clear empties; neither mutates the input', () => {
  const list = push(push([], ERR, 1, 1), WARN, 2, 2);
  const snapshot = JSON.parse(JSON.stringify(list));

  const after = model.dismiss(list, 1);
  assert.deepEqual(after.map((n) => n.id), [2]);
  assert.deepEqual(model.clear(), []);
  model.markAllRead(list);
  assert.deepEqual(list, snapshot);
});

test('sourceLabel names known sources and falls back to the key', () => {
  assert.equal(model.sourceLabel('uncaught-exception'), 'Main process');
  assert.equal(model.sourceLabel('migration'), 'Layout migration');
  assert.equal(model.sourceLabel('main-process'), 'Main process');
  assert.equal(model.sourceLabel('something-new'), 'something-new');
  assert.equal(model.sourceLabel(undefined), 'Frame');
});

test('moveFocus wraps and enters from either end', () => {
  assert.equal(model.moveFocus(-1, 3, 1), 0);
  assert.equal(model.moveFocus(-1, 3, -1), 2);
  assert.equal(model.moveFocus(2, 3, 1), 0);
  assert.equal(model.moveFocus(0, 3, -1), 2);
  assert.equal(model.moveFocus(1, 3, 1), 2);
  assert.equal(model.moveFocus(0, 0, 1), -1);
});
