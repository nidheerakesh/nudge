import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsedMs, remainingMs, addDays, today, parseHash } from '../public/js/store.js';

const t0 = { mins: 25, started: 1000000, paused_at: null, paused_ms: 0, pauses: 0 };

test('elapsed running', () => assert.equal(elapsedMs(t0, 1060000), 60000));
test('elapsed paused', () => assert.equal(elapsedMs({ ...t0, paused_at: 1030000 }, 9999999), 30000));
test('elapsed with paused_ms', () => assert.equal(elapsedMs({ ...t0, paused_ms: 20000 }, 1060000), 40000));
test('remaining', () => {
  assert.equal(remainingMs(t0, 1060000), 25 * 60000 - 60000);
  assert.equal(remainingMs({ ...t0, paused_at: 1030000 }, 5000000), 25 * 60000 - 30000);
});
test('addDays', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});
test('today format', () => {
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(today(new Date(2026, 0, 5)), '2026-01-05');
});
test('parseHash', () => {
  assert.deepEqual(parseHash('#/study/course/5?x=1'), { tab: 'study', params: { sub: 'course', id: '5', x: '1' } });
  assert.deepEqual(parseHash(''), { tab: 'today', params: {} });
  assert.deepEqual(parseHash('#/today?plan=1'), { tab: 'today', params: { plan: '1' } });
  assert.deepEqual(parseHash('#/more/habits').params, { sub: 'habits' });
  assert.equal(parseHash('#/nope').tab, 'today');
});
