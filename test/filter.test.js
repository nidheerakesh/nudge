import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, bad, WORDS } from '../public/town/shared/filter.js';

test('WORDS is a lowercase list of about 40 entries', () => {
  assert.ok(Array.isArray(WORDS));
  assert.ok(WORDS.length >= 40);
  for (const w of WORDS) assert.equal(w, w.toLowerCase());
});

test('masks a banned word with stars of the same length', () => {
  assert.equal(clean('shit'), '****');
  assert.equal(clean('fuck you'), '**** you');
});

test('mixed sentence masks only the bad word', () => {
  const s = 'what a shit day, really';
  const out = clean(s);
  assert.equal(out, 'what a **** day, really');
  assert.equal(out.length, s.length);
});

test('rule 1: case-insensitive', () => {
  assert.equal(clean('FUCK'), '****');
  assert.equal(clean('Shit'), '****');
});

test('rule 2: whole words only, listed clean words unchanged', () => {
  for (const w of ['class', 'assess', 'pass', 'Scunthorpe', 'analysis', 'hello', 'shell', 'cocktail', 'grape', 'duck']) {
    assert.equal(clean(w), w);
    assert.equal(bad(w), false);
  }
});

test('rule 2: boundaries are punctuation and spaces', () => {
  assert.equal(clean('fuck-off'), '****-off');
  assert.equal(clean('(shit)'), '(****)');
  assert.equal(clean('fuck!'), '****!');
});

test('rule 3: leetspeak counts', () => {
  assert.equal(clean('sh1t'), '****');
  assert.equal(clean('5hit'), '****');
  assert.equal(clean('@ss'), '***');
  assert.equal(clean('b1tch'), '*****');
});

test('rule 3: non-banned leetspeak stays unchanged', () => {
  assert.equal(clean('h3ll0'), 'h3ll0');
});

test('rule 4: repeated letters count', () => {
  assert.equal(clean('fuuuck'), '******');
  assert.equal(clean('shiiiit'), '*******');
});

test('rule 4: near-miss spellings stay unchanged', () => {
  assert.equal(clean('fuk'), 'fuk');
});

test('rule 5: plural and -ing/-er/-ed endings match', () => {
  assert.equal(clean('bitches'), '*******');
  assert.equal(clean('fucking'), '*******');
  assert.equal(clean('fucker'), '******');
  assert.equal(clean('fucked'), '******');
});

test('rule 5: other endings stay unchanged', () => {
  assert.equal(clean('bitchy'), 'bitchy');
});

test('bad() reports whether clean() changes the text', () => {
  assert.equal(bad('shit happens'), true);
  assert.equal(bad('hello there'), false);
});

test('non-string input cleans to empty string', () => {
  assert.equal(clean(null), '');
  assert.equal(clean(undefined), '');
  assert.equal(clean(42), '');
});

test('200 character message is fast', () => {
  const s = ('hello world shit class assess ').repeat(7).slice(0, 200);
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) clean(s);
  assert.ok(performance.now() - t0 < 100);
});
