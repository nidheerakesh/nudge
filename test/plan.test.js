import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest, toMin, toHM, freeGaps } from '../public/js/plan.js';

const D = '2026-11-08';
const T = o => ({ id: 1, title: 'Task', due: D, est: 60, priority: 2, done_at: null, ...o });
const P = { focus_mins: 45, break_mins: 10 };
const run = (o) => suggest({ day: D, tasks: [], blocks: [], prefs: P, ...o });

test('toMin and toHM', () => {
  assert.equal(toMin('09:30'), 570);
  assert.equal(toHM(570), '09:30');
  assert.equal(toHM(65), '01:05');
});

test('freeGaps sorts, merges and drops short gaps', () => {
  const busy = [{ s: 500, e: 520 }, { s: 510, e: 540 }, { s: 590, e: 600 }];
  assert.deepEqual(freeGaps(480, 600, busy), [{ s: 480, e: 500 }, { s: 540, e: 590 }]);
  assert.deepEqual(freeGaps(480, 490, [{ s: 483, e: 490 }]), []);
});

test('empty day: 60 min task becomes 45 and 15 with a break between', () => {
  const r = run({ tasks: [T()] });
  assert.deepEqual(r.blocks, [
    { day: D, start: '08:00', mins: 45, kind: 'task', task_id: 1, title: 'Task' },
    { day: D, start: '08:45', mins: 10, kind: 'break', task_id: null, title: 'Break' },
    { day: D, start: '08:55', mins: 15, kind: 'task', task_id: 1, title: 'Task' }
  ]);
  assert.deepEqual(r.unplaced, []);
});

test('remainder under 10 merges into previous chunk', () => {
  const r = run({ tasks: [T({ est: 50 })] });
  assert.deepEqual(r.blocks.map(b => [b.start, b.mins, b.kind]), [['08:00', 50, 'task']]);
});

test('null est defaults to 30 minutes', () => {
  const r = run({ tasks: [T({ est: null })], prefs: {} });
  assert.deepEqual(r.blocks.map(b => [b.start, b.mins]), [['08:00', 30]]);
});

test('existing fixed block 09:00-10:00 is avoided', () => {
  const fixed = { day: D, start: '09:00', mins: 60, kind: 'fixed', task_id: null, title: 'Class' };
  const r = run({ tasks: [T()], blocks: [fixed] });
  assert.deepEqual(r.blocks.filter(b => b.kind === 'task').map(b => b.start), ['08:00', '10:00']);
});

test('done task is ignored', () => {
  const r = run({ tasks: [T({ done_at: '2026-11-08T09:00:00.000Z' })] });
  assert.deepEqual(r, { blocks: [], unplaced: [] });
});

test('task already fully blocked that day proposes nothing', () => {
  const existing = { day: D, start: '08:00', mins: 30, kind: 'task', task_id: 1, title: 'Task' };
  const r = run({ tasks: [T({ est: 30 })], blocks: [existing] });
  assert.deepEqual(r, { blocks: [], unplaced: [] });
});

test('ordering: overdue, then today by priority, then no due date', () => {
  const tasks = [
    { id: 3, title: 'C', due: null, est: 15, priority: 2, done_at: null },
    { id: 2, title: 'B', due: D, est: 15, priority: 2, done_at: null },
    { id: 4, title: 'D', due: D, est: 15, priority: 1, done_at: null },
    { id: 1, title: 'A', due: '2026-11-07', est: 15, priority: 2, done_at: null }
  ];
  const r = run({ tasks });
  assert.deepEqual(r.blocks.filter(b => b.kind === 'task').map(b => b.title), ['A', 'D', 'B', 'C']);
});

test('now mid-day starts at the next 5 minute mark', () => {
  const r = run({ tasks: [T({ est: 30 })], prefs: {}, now: { day: D, hm: '13:02' } });
  assert.equal(r.blocks[0].start, '13:05');
});

test('past day returns empty result', () => {
  const r = run({ day: '2026-11-07', tasks: [T()], now: { day: D, hm: '10:00' } });
  assert.deepEqual(r, { blocks: [], unplaced: [] });
});

test('chunk that fits no gap goes to unplaced', () => {
  const r = run({ tasks: [T({ est: 45 })], prefs: { day_start: '08:00', day_end: '08:20' } });
  assert.deepEqual(r.blocks, []);
  assert.deepEqual(r.unplaced, [{ task_id: 1, title: 'Task', mins: 45 }]);
});

test('no trailing break at the end of the output', () => {
  const r = run({ tasks: [T({ est: 45 })] });
  assert.deepEqual(r.blocks.map(b => b.kind), ['task']);
});
