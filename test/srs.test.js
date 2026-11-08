import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, review, dueCards, GRADES } from '../public/js/srs.js';

const TODAY = '2026-11-08';
const card = o => ({ id: 1, ivl: 0, ease: 2.5, reps: 0, due: TODAY, ...o });

test('new card, good: ivl 1, reps 1', () => {
  const r = review(card(), 4, TODAY);
  assert.equal(r.ivl, 1);
  assert.equal(r.reps, 1);
  assert.equal(r.due, '2026-11-09');
});

test('second good review: ivl 6', () => {
  const r = review(card({ ivl: 1, reps: 1 }), 4, TODAY);
  assert.equal(r.ivl, 6);
  assert.equal(r.reps, 2);
  assert.equal(r.due, '2026-11-14');
});

test('third good review with ease 2.5: ivl 15', () => {
  const r = review(card({ ivl: 6, reps: 2, ease: 2.5 }), 4, TODAY);
  assert.equal(r.ivl, 15);
  assert.equal(r.ease, 2.5);
  assert.equal(r.reps, 3);
  assert.equal(r.due, '2026-11-23');
});

test('again resets reps and ivl, lowers ease', () => {
  const r = review(card({ ivl: 15, reps: 3, ease: 2.5 }), 1, TODAY);
  assert.equal(r.reps, 0);
  assert.equal(r.ivl, 1);
  assert.equal(r.ease, 1.96);
});

test('ease never drops below 1.3', () => {
  assert.equal(review(card({ ivl: 10, reps: 5, ease: 1.3 }), 0, TODAY).ease, 1.3);
  assert.equal(review(card({ ivl: 10, reps: 5, ease: 1.3 }), 3, TODAY).ease, 1.3);
});

test('due date math across month and year ends', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-11-28', 15), '2026-12-13');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  const r = review(card({ ivl: 6, reps: 2 }), 4, '2026-11-28');
  assert.equal(r.due, '2026-12-13');
});

test('GRADES exposes the four buttons', () => {
  assert.deepEqual(GRADES.map(x => x.g), [1, 3, 4, 5]);
});

test('dueCards filters by today and sorts by due then id', () => {
  const cards = [
    { id: 3, due: '2026-11-08' },
    { id: 1, due: '2026-11-05' },
    { id: 2, due: '2026-11-08' },
    { id: 4, due: '2026-11-09' }
  ];
  assert.deepEqual(dueCards(cards, TODAY).map(c => c.id), [1, 2, 3]);
});
