import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, ask, context } from '../src/coach.js';

const T = '2026-11-08';
const data = {
  courses: [{ id: 1, name: 'Calculus', code: 'MA101' }],
  assessments: [{ id: 1, course_id: 1, kind: 'exam', title: 'Midterm', date: '2026-11-20' }],
  tasks: [{ id: 5, title: 'Read chapter 3', due: '2026-11-10', est: 40, course_id: 1, done_at: null }],
  sessions: [{ start_at: '2026-11-07T10:00:00Z', act_mins: 50 }],
  prefs: { memory: 'prefers mornings' },
};

test('validate keeps good, drops bad', () => {
  const res = validate([
    { type: 'add_task', title: 'ok', due: '2026-11-09', est: 30, course_id: 1, extra: 1 },
    { type: 'add_task', title: 'past', due: '2026-11-01' },
    { type: 'add_task', title: 'bad course', course_id: 9 },
    { type: 'add_task', title: 'x'.repeat(201) },
    { type: 'add_task', title: 'est', est: 4 },
    { type: 'add_task', title: 'est', est: 601 },
    { type: 'delete_all' },
    { type: 'add_topic', course_id: 1, title: 'Limits' },
    { type: 'add_topic', course_id: 2, title: 'Nope' },
    { type: 'plan_day', day: '2026-11-09' },
    { type: 'plan_day', day: '2026-01-01' },
  ], data, T);
  assert.deepEqual(res, [
    { type: 'add_task', title: 'ok', due: '2026-11-09', est: 30, course_id: 1 },
    { type: 'add_topic', course_id: 1, title: 'Limits' },
    { type: 'plan_day', day: '2026-11-09' },
  ]);
});

test('validate caps at 8', () => {
  const a = Array.from({ length: 12 }, (_, i) => ({ type: 'add_task', title: 't' + i }));
  assert.equal(validate(a, data, T).length, 8);
});

test('ask strips json block and validates', async () => {
  let seen;
  const env = { AI: { run: async (m, o) => { seen = o; return { response: 'Study hard.\n```json\n{"actions":[{"type":"add_task","title":"Review"},{"type":"bogus"}]}\n```' }; } } };
  const res = await ask(env, data, [{ role: 'user', content: 'help' }], T);
  assert.equal(res.reply, 'Study hard.');
  assert.deepEqual(res.actions, [{ type: 'add_task', title: 'Review' }]);
  assert.equal(seen.messages[0].role, 'system');
  assert.equal(seen.max_tokens, 700);
});

test('context mentions assessment and task', () => {
  const c = context(data, T);
  assert.match(c, /Midterm/);
  assert.match(c, /Read chapter 3/);
  assert.match(c, /prefers mornings/);
  assert.ok(c.length < 6000);
});
