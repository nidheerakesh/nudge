import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick } from '../public/js/parse.js';

const TODAY = '2026-11-08';
const WD = 0;
const parse = s => parseQuick(s, TODAY, WD);

test('combined tokens are parsed and removed from the title', () => {
  assert.deepEqual(parse('read ch3 tmrw 45m !1'), {
    title: 'read ch3',
    due: '2026-11-09',
    est: 45,
    priority: 1
  });
});

test('weekday names pick the next day strictly after today', () => {
  assert.equal(parse('mon').due, '2026-11-09');
  assert.equal(parse('sun').due, '2026-11-15');
  assert.equal(parse('Wednesday').due, '2026-11-11');
});

test('today and tomorrow aliases', () => {
  assert.equal(parse('tod').due, TODAY);
  assert.equal(parse('tmr').due, '2026-11-09');
});

test('hour estimates', () => {
  assert.equal(parse('1h30m').est, 90);
  assert.equal(parse('1.5h').est, 90);
  assert.equal(parse('1h').est, 60);
  assert.equal(parse('90mins').est, 90);
});

test('DD/MM dates roll to next year when already past', () => {
  assert.equal(parse('05/01').due, '2027-01-05');
  assert.equal(parse('25/12').due, '2026-12-25');
});

test('ISO date is taken as is', () => {
  assert.equal(parse('2026-12-01').due, '2026-12-01');
});

test('plain text gives all nulls', () => {
  assert.deepEqual(parse('buy milk'), { title: 'buy milk', due: null, est: null, priority: null });
});

test('estimate alone falls back to the original text as title', () => {
  const r = parse('45m');
  assert.equal(r.title, '45m');
  assert.equal(r.est, 45);
});

test('last occurrence of a kind wins and other words stay', () => {
  const r = parse('study ch3 mon !2 tue !3');
  assert.equal(r.title, 'study ch3');
  assert.equal(r.due, '2026-11-10');
  assert.equal(r.priority, 3);
});
