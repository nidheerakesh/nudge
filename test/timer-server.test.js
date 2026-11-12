import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1, v3 } from './d1shim.js';
import { getTimer, putTimer, patch } from '../src/db.js';

function mk() {
  const db = d1();
  v3(db);
  db.exec("INSERT INTO users(id,email,name,pw_hash,salt,created) VALUES(1,'a@x.io','A','h','s',0)");
  return db;
}

const tm = (id) => ({ session_id: id, title: 't', mins: 25, started: 1, paused_at: null, paused_ms: 0, pauses: 0 });

test('timer: stale clear and busy start are refused, correct prev succeeds', async () => {
  const db = mk();
  assert.equal(await putTimer(db, 1, tm(7), null), null);
  assert.deepEqual(await putTimer(db, 1, tm(7), 7), null);
  const stale = await putTimer(db, 1, null, 99);
  assert.equal(stale.error, 'stale');
  assert.equal(stale.data.session_id, 7);
  assert.equal((await getTimer(db, 1)).session_id, 7);
  const busy = await putTimer(db, 1, tm(8), null);
  assert.equal(busy.error, 'busy');
  assert.equal((await getTimer(db, 1)).session_id, 7);
  assert.equal(await putTimer(db, 1, tm(8), 7), null);
  assert.equal((await getTimer(db, 1)).session_id, 8);
  assert.equal(await putTimer(db, 1, null, 8), null);
  assert.equal(await getTimer(db, 1), null);
});

test('sessions: finished session cannot be rewritten, rating still allowed', async () => {
  const db = mk();
  await db.prepare("INSERT INTO sessions(id,user_id,start_at,plan_mins,act_mins,pauses,end_kind) VALUES(1,1,'2026-11-12T06:00:00.000Z',25,0,0,'open')").run();
  const done = await patch(db, 1, 'sessions', 1, { act_mins: 20, end_kind: 'done' });
  assert.equal(done.end_kind, 'done');
  for (const b of [{ act_mins: 40 }, { end_kind: 'stopped' }, { pauses: 3 }]) {
    await assert.rejects(patch(db, 1, 'sessions', 1, b), (e) => e.status === 409);
  }
  const r = await patch(db, 1, 'sessions', 1, { rating: 4 });
  assert.equal(r.rating, 4);
  assert.equal(r.act_mins, 20);
});
