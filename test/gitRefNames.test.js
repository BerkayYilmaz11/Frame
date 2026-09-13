/**
 * Branch-name validation (status-bar-branch-picker spec, D8 / C11).
 *
 * Pure by design: shared between the renderer's create row and main's
 * createBranch, so it may not reach `electron` or the DOM. Pinned: every
 * `git check-ref-format --branch` rule the predicate implements, and the
 * injection-shaped names that must never pass — they are the reason the
 * predicate exists at all.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isValidBranchName } = require('../src/shared/gitRefNames');

test('accepts ordinary branch names', () => {
  for (const name of [
    'main', 'feat/x', 'feature/status-bar-branch-picker', 'v1.2.3',
    'frame/slug/work', 'user@host', 'a-b_c', 'UPPER', 'çalışma', '1', 'x.y'
  ]) {
    assert.equal(isValidBranchName(name), true, name);
  }
});

test('rejects non-strings and empty', () => {
  for (const name of [undefined, null, 42, {}, [], '']) {
    assert.equal(isValidBranchName(name), false, String(name));
  }
});

test('rejects whitespace and control characters', () => {
  for (const name of ['bad name', 'tab\tname', 'nl\nname', 'x\x01y', 'del\x7f', ' lead', 'trail ']) {
    assert.equal(isValidBranchName(name), false, JSON.stringify(name));
  }
});

test("rejects git's forbidden characters", () => {
  for (const name of ['a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b']) {
    assert.equal(isValidBranchName(name), false, name);
  }
});

test('rejects dotted edge rules', () => {
  for (const name of ['a..b', '.hidden', 'a/.b', 'a.', 'a/b.', 'foo.lock', 'a/foo.lock/b', '.', '..']) {
    assert.equal(isValidBranchName(name), false, name);
  }
});

test('rejects slash edge rules', () => {
  for (const name of ['/lead', 'trail/', 'a//b', '/']) {
    assert.equal(isValidBranchName(name), false, name);
  }
});

test('rejects option-looking, reflog and reserved names', () => {
  for (const name of ['-x', '--force', 'a@{1}', '@']) {
    assert.equal(isValidBranchName(name), false, name);
  }
});

test('rejects injection-shaped names, even ones git would take', () => {
  for (const name of [
    '$(rm -rf /)', '`id`', 'a"b', "a'b", 'a;b', 'a|b', 'a&b', 'a>b', 'a<b', '$HOME'
  ]) {
    assert.equal(isValidBranchName(name), false, name);
  }
});

test('length cap', () => {
  assert.equal(isValidBranchName('a'.repeat(255)), true);
  assert.equal(isValidBranchName('a'.repeat(256)), false);
});
