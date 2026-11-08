import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1, v3 } from './d1shim.js';
import { insert, patch, remove, all, setPrefs, exportAll } from '../src/db.js';

function setup() {
  const db = d1();
  v3(db);
  for (const e of ['a@x.io', 'b@x.io']) db.exec(`INSERT INTO users(email,pw_hash,salt) VALUES('${e}','h','s')`);
  return db;
}
const rej = (p, status, error) => assert.rejects(p, (e) => e.status === status && e.error === error);
const cnt = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).first('n'));

test('insert, patch, all, no user_id leak', async () => {
  const db = setup();
  const [c] = await insert(db, 1, 'courses', { name: 'Math' });
  assert.equal(c.user_id, undefined);
  const row = await patch(db, 1, 'courses', c.id, { code: 'M1' });
  assert.equal(row.code, 'M1');
  const res = await all(db, 1);
  assert.equal(res.courses.length, 1);
  assert.equal(res.user.email, 'a@x.io');
});

test('insert array of 3', async () => {
  const db = setup();
  const rows = await insert(db, 1, 'tasks', [{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
  assert.equal(rows.length, 3);
  assert.equal(rows[2].priority, 2);
});

test('isolation between users', async () => {
  const db = setup();
  const [t] = await insert(db, 1, 'tasks', { title: 'secret' });
  await rej(patch(db, 2, 'tasks', t.id, { title: 'x' }), 404, 'not_found');
  await rej(remove(db, 2, 'tasks', t.id), 404, 'not_found');
  assert.equal((await all(db, 2)).tasks.length, 0);
  assert.equal((await all(db, 1)).tasks[0].title, 'secret');
});

test('column and ref checks', async () => {
  const db = setup();
  const [c] = await insert(db, 1, 'courses', { name: 'Math' });
  await rej(insert(db, 1, 'tasks', { title: 'x', user_id: 2 }), 400, 'column');
  await rej(insert(db, 1, 'tasks', { title: 'x', bogus: 1 }), 400, 'column');
  await rej(insert(db, 2, 'tasks', { title: 'x', course_id: c.id }), 400, 'ref');
  await rej(insert(db, 1, 'nope', { a: 1 }), 404, 'table');
  const [t] = await insert(db, 2, 'tasks', { title: 'x' });
  await rej(patch(db, 2, 'tasks', t.id, { course_id: c.id }), 400, 'ref');
});

test('inherited names are not tables', async () => {
  const db = setup();
  for (const tb of ['constructor', 'toString']) {
    await rej(insert(db, 1, tb, { a: 1 }), 404, 'table');
    await rej(patch(db, 1, tb, 1, { a: 1 }), 404, 'table');
    await rej(remove(db, 1, tb, 1), 404, 'table');
  }
});

test('cascades', async () => {
  const db = setup();
  const [c] = await insert(db, 1, 'courses', { name: 'M' });
  const [as] = await insert(db, 1, 'assessments', { course_id: c.id, title: 'E' });
  const [tp] = await insert(db, 1, 'topics', { course_id: c.id, title: 'T' });
  await insert(db, 1, 'assess_topics', { assessment_id: as.id, topic_id: tp.id });
  await insert(db, 1, 'cards', { topic_id: tp.id, front: 'f', due: '2026-01-01' });
  const [t] = await insert(db, 1, 'tasks', { title: 't', course_id: c.id, topic_id: tp.id });
  const [n] = await insert(db, 1, 'notes', { course_id: c.id, body: 'b' });
  const [o] = await insert(db, 2, 'courses', { name: 'other' });
  await remove(db, 1, 'courses', c.id);
  for (const tb of ['assessments', 'topics', 'assess_topics', 'cards']) assert.equal(await cnt(db, `SELECT COUNT(*) n FROM ${tb}`), 0, tb);
  const r = await all(db, 1);
  assert.equal(r.tasks[0].course_id, null);
  assert.equal(r.tasks[0].topic_id, null);
  assert.equal(r.notes[0].course_id, null);
  assert.equal((await all(db, 2)).courses[0].id, o.id);
  assert.ok(t && n);
});

test('topic, assessment, task, habit cascades', async () => {
  const db = setup();
  const [c] = await insert(db, 1, 'courses', { name: 'M' });
  const [as] = await insert(db, 1, 'assessments', { course_id: c.id, title: 'E' });
  const [tp] = await insert(db, 1, 'topics', { course_id: c.id, title: 'T' });
  await insert(db, 1, 'assess_topics', { assessment_id: as.id, topic_id: tp.id });
  await insert(db, 1, 'cards', { topic_id: tp.id, front: 'f', due: '2026-01-01' });
  const [t] = await insert(db, 1, 'tasks', { title: 't', topic_id: tp.id });
  await remove(db, 1, 'topics', tp.id);
  assert.equal(await cnt(db, 'SELECT COUNT(*) n FROM cards'), 0);
  assert.equal(await cnt(db, 'SELECT COUNT(*) n FROM assess_topics'), 0);
  assert.equal((await all(db, 1)).tasks[0].topic_id, null);
  const [tp2] = await insert(db, 1, 'topics', { course_id: c.id, title: 'T2' });
  await insert(db, 1, 'assess_topics', { assessment_id: as.id, topic_id: tp2.id });
  await remove(db, 1, 'assessments', as.id);
  assert.equal(await cnt(db, 'SELECT COUNT(*) n FROM assess_topics'), 0);
  await insert(db, 1, 'blocks', { day: '2026-01-01', start: '09:00', mins: 30, task_id: t.id, title: 't' });
  await insert(db, 1, 'sessions', { task_id: t.id, start_at: new Date().toISOString() });
  await remove(db, 1, 'tasks', t.id);
  assert.equal(await cnt(db, 'SELECT COUNT(*) n FROM blocks'), 0);
  assert.equal((await all(db, 1)).sessions[0].task_id, null);
  const [h] = await insert(db, 1, 'habits', { name: 'h' });
  await insert(db, 1, 'hlog', { habit_id: h.id, day: '2026-01-01' });
  await remove(db, 1, 'habits', h.id);
  assert.equal(await cnt(db, 'SELECT COUNT(*) n FROM hlog'), 0);
});

test('prefs validation and notes updated', async () => {
  const db = setup();
  await setPrefs(db, 1, { day_start: '08:00', focus_mins: 45 });
  await setPrefs(db, 1, { day_start: '09:00' });
  const r = await all(db, 1);
  assert.deepEqual(r.prefs, { day_start: '09:00', focus_mins: '45' });
  await rej(setPrefs(db, 1, { 'Bad-Key': 1 }), 400, 'key');
  await rej(setPrefs(db, 1, { k: 'x'.repeat(4001) }), 400, 'value');
  const [n] = await insert(db, 1, 'notes', { body: 'a', updated: '2000-01-01 00:00:00' });
  const p = await patch(db, 1, 'notes', n.id, { body: 'b' });
  assert.notEqual(p.updated, '2000-01-01 00:00:00');
  assert.equal((await exportAll(db, 1)).notes.length, 1);
});
