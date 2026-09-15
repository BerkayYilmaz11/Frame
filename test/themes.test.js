/**
 * The theme registry (src/renderer/themes.js).
 *
 * Pure by design: CI runs `npm test` with no `npm ci`, so this module may
 * not reach `electron`, `lucide` or the DOM. Requiring it at the top is half
 * the test.
 *
 * Pinned: every theme is whole (label, command, scheme, counterpart, xterm
 * palette), the toggle flips scheme but stays in the family, unknown ids
 * fall back to the default, and the xterm theme is a complete table.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const themes = require('../src/renderer/themes');
const { THEMES, THEME_IDS, DEFAULT_THEME, normalize, schemeOf, counterpartOf, terminalTheme } = themes;

const ANSI_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue',
  'brightMagenta', 'brightCyan', 'brightWhite'
];

test('registry: the four themes, in menu order, each whole', () => {
  assert.deepEqual(THEME_IDS, ['dark', 'light', 'dark-plus', 'light-plus']);
  for (const id of THEME_IDS) {
    const t = THEMES[id];
    assert.equal(typeof t.label, 'string');
    assert.match(t.command, /^theme\.[a-zA-Z]+$/);
    assert.ok(['dark', 'light'].includes(t.scheme), `${id}: scheme`);
    assert.ok(THEMES[t.counterpart], `${id}: counterpart exists`);
  }
  // Command ids never collide — the palette registers one per theme.
  const commands = THEME_IDS.map((id) => THEMES[id].command);
  assert.equal(new Set(commands).size, commands.length);
});

test('counterpart: flips the scheme and stays in the family', () => {
  for (const id of THEME_IDS) {
    const other = counterpartOf(id);
    assert.notEqual(schemeOf(other), schemeOf(id), `${id} → ${other}`);
    assert.equal(counterpartOf(other), id, `${id} round-trips`);
  }
  assert.equal(counterpartOf('dark-plus'), 'light-plus');
  assert.equal(counterpartOf('dark'), 'light');
});

test('normalize: garbage falls back to the default, ids pass through', () => {
  assert.equal(DEFAULT_THEME, 'dark');
  for (const bad of [undefined, null, '', 'neon', 42, '__proto__', 'constructor']) {
    assert.equal(normalize(bad), DEFAULT_THEME, String(bad));
  }
  for (const id of THEME_IDS) assert.equal(normalize(id), id);
  assert.equal(schemeOf('nope'), 'dark');
});

test('terminalTheme: a full xterm palette per theme, background per theme', () => {
  const seen = new Set();
  for (const id of THEME_IDS) {
    const t = terminalTheme(id);
    for (const k of [...ANSI_KEYS, 'background', 'foreground', 'cursor']) {
      assert.match(t[k], /^#[0-9a-f]{6}$/i, `${id}.${k}`);
    }
    seen.add(t.background);
  }
  assert.equal(seen.size, THEME_IDS.length, 'each theme has its own terminal background');
  // The fallback keeps the terminal readable even for an unknown id.
  assert.deepEqual(terminalTheme('nope'), terminalTheme(DEFAULT_THEME));
});
