import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapSay } from '../public/town/scene.js';
import { canSend } from '../public/town/ui/streetbar.js';
import { CHAT_RATE_MS } from '../public/town/shared/protocol.js';

test('short text is one line', () => {
  assert.deepEqual(wrapSay('hello there'), ['hello there']);
});

test('a 45 character sentence wraps at a space into two lines of at most 30', () => {
  const text = 'the quick brown fox jumps over the lazy dog ok';
  assert.equal(text.length, 46);
  const lines = wrapSay(text);
  assert.equal(lines.length, 2);
  for (const l of lines) assert.ok(l.length <= 30, l);
  assert.equal(lines[0], 'the quick brown fox jumps over');
  assert.equal(lines[1], 'the lazy dog ok');
});

test('a 100 character text is cut to 60 with ... and gives 2 lines', () => {
  const long = 'word '.repeat(20).trim() + 'x';
  assert.equal(long.length, 100);
  const lines = wrapSay(long);
  assert.ok(lines.length <= 2);
  assert.ok(lines.join(' ').endsWith('...'));
  for (const l of lines) assert.ok(l.length <= 30, l);
});

test('one 40 character word with no spaces is split at 30', () => {
  const word = 'a'.repeat(40);
  const lines = wrapSay(word);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 30);
  assert.equal(lines[1].length, 10);
  assert.equal(lines.join(''), word);
});

test('empty text gives no lines', () => {
  assert.deepEqual(wrapSay('   '), []);
});

test('canSend is true at exactly the rate limit and false below it', () => {
  assert.equal(canSend(1000, 1000 + CHAT_RATE_MS), true);
  assert.equal(canSend(1000, 1000 + CHAT_RATE_MS - 1), false);
});
