import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, v3 } from './d1shim.js';
import { verifyRoute, nextCheckDelay, applyPing, applyCheckin, finish, finishSession, creditCard } from '../src/town/verify.js';
import { awardForSession } from '../src/town/coins.js';

const M = 60000;
const T0 = 1_800_000_000_000;

function mk() {
  const db = d1();
  v3(db);
  db.exec(readFileSync(new URL('../migrations/v3/0002_town.sql', import.meta.url), 'utf8'));
  return db;
}

let n = 0;
async function sess(db, uid, plan = 45) {
  n++;
  await db.prepare('INSERT INTO sessions(id,user_id,start_at,plan_mins) VALUES(?,?,?,?)').bind(n, uid, '2026-01-05T10:00:00Z', plan).run();
  return n;
}

async function call(db, uid, path, body, now) {
  const real = Date.now;
  Date.now = () => now;
  try {
    const res = await verifyRoute({ method: 'POST' }, { DB: db }, { id: uid }, new URL('http://x' + path), body);
    return await res.json();
  } finally {
    Date.now = real;
  }
}
const ping = (db, uid, sid, now, paused = false) => call(db, uid, '/api/focus/ping', { session_id: sid, paused }, now);
const ans = (db, uid, id, now) => call(db, uid, '/api/focus/checkin', { id }, now);
const code = (p, c) => assert.rejects(p, (e) => e.status === c || e.error === c);
const row = (db, sid) => db.prepare('SELECT * FROM session_active WHERE session_id=?').bind(sid).first();
const checks = async (db, sid) => (await db.prepare('SELECT * FROM checkins WHERE session_id=? ORDER BY id').bind(sid).all()).results;

// ping every 30s from `from` until `to` (ms), returns last response
async function run(db, uid, sid, from, to, onCheck) {
  let r;
  for (let t = from; t <= to; t += 30000) {
    r = await ping(db, uid, sid, t);
    if (r.check && onCheck) await onCheck(r.check, t);
  }
  return r;
}

test('delay ranges', () => {
  assert.equal(nextCheckDelay(0, true), 6 * M);
  assert.ok(nextCheckDelay(0.999, true) < 12 * M);
  assert.equal(nextCheckDelay(0, false), 10 * M);
  assert.ok(nextCheckDelay(0.999, false) < 16 * M);
});

test('ping adds at most 90s, paused adds 0', () => {
  const r = { last_ping: 0, active_secs: 0, paused: 0 };
  assert.equal(applyPing(r, 30000, false).active_secs, 30);
  assert.equal(applyPing(r, 5 * M, false).active_secs, 90);
  assert.equal(applyPing(r, 30000, true).active_secs, 0);
  assert.equal(applyPing({ ...r, paused: 1 }, 30000, false).active_secs, 0);
});

test('route: 5 minute gap adds 90 only, rate limit, paused', async () => {
  const db = mk();
  const s = await sess(db, 1);
  await ping(db, 1, s, T0);
  assert.equal((await ping(db, 1, s, T0 + 30000)).active_secs, 30);
  assert.equal((await ping(db, 1, s, T0 + 35000)).active_secs, 30);
  assert.equal((await ping(db, 1, s, T0 + 30000 + 5 * M)).active_secs, 120);
  assert.equal((await ping(db, 1, s, T0 + 60000 + 5 * M, true)).active_secs, 120);
  assert.equal((await ping(db, 1, s, T0 + 90000 + 5 * M)).active_secs, 120);
});

test('answered check-in verifies the interval; early and late rejected', async () => {
  const db = mk();
  const s = await sess(db, 1, 60);
  await ping(db, 1, s, T0);
  const c = (await checks(db, s))[0];
  assert.ok(c.due >= T0 + 6 * M && c.due <= T0 + 12 * M);
  await run(db, 1, s, T0 + 30000, c.due - 30000);
  await code(ans(db, 1, c.id, c.due - 1000), 'early');
  const r = await run(db, 1, s, c.due, c.due);
  assert.equal(r.check.id, c.id);
  await code(ans(db, 1, c.id, c.expires + 1), 'late');
  const ok = await ans(db, 1, c.id, c.due + 5000);
  assert.ok(ok.verified_secs > 0);
  assert.equal((await row(db, s)).misses, 0);
  await code(ans(db, 1, c.id, c.due + 6000), 409);
});

test('missed check-in leaves the interval unverified; two misses end', async () => {
  const db = mk();
  const s = await sess(db, 1, 60);
  await ping(db, 1, s, T0);
  const c = (await checks(db, s))[0];
  await run(db, 1, s, T0 + 30000, c.expires + 60000);
  let r = await row(db, s);
  assert.equal(r.misses, 1);
  assert.equal(r.verified_secs, 0);
  assert.equal(r.ended, 0);
  const c2 = (await checks(db, s))[1];
  assert.ok(c2.due >= c.expires + 10 * M);
  await run(db, 1, s, c.expires + 90000, c2.expires + 120000);
  r = await row(db, s);
  assert.equal(r.misses, 2);
  assert.equal(r.ended, 1);
  assert.equal(r.verified_secs, 0);
  assert.equal((await checks(db, s)).length, 2);
});

test('answer after a miss verifies only the new interval', async () => {
  const db = mk();
  const s = await sess(db, 1, 60);
  await ping(db, 1, s, T0);
  const c = (await checks(db, s))[0];
  await run(db, 1, s, T0 + 30000, c.expires + 60000);
  const c2 = (await checks(db, s))[1];
  const t = c2.due;
  await run(db, 1, s, c.expires + 90000, t);
  const before = (await row(db, s)).active_secs;
  const ok = await ans(db, 1, c2.id, t + 1000);
  const lost = c.expires / 1000 - T0 / 1000;
  assert.ok(ok.verified_secs > 0 && ok.verified_secs < before - 300);
  assert.ok(lost > 0);
  assert.equal((await row(db, s)).misses, 0);
});

test('tail: 8 minutes counts, 9 does not', () => {
  const r = { started: 0, last_ping: 0, active_secs: 480, verified_secs: 0, last_ok: 0, misses: 0, paused: 0, ended: 0, lost: 0 };
  assert.equal(finish(r, 0, null).verified_secs, 480);
  assert.equal(finish({ ...r, active_secs: 540 }, 0, null).verified_secs, 0);
  const after = { ...r, active_secs: 1000, verified_secs: 500 };
  assert.equal(finish({ ...after, active_secs: 980 }, 0, null).verified_secs, 980);
  assert.equal(finish({ ...after, active_secs: 1100 }, 0, null).verified_secs, 500);
  assert.equal(finish({ ...r, misses: 1 }, 0, null).verified_secs, 0);
});

test('applyCheckin window', () => {
  const r = { active_secs: 600, verified_secs: 0, misses: 0, ended: 0, lost: 0 };
  const c = { id: 1, due: 1000, expires: 91000, answered: null };
  assert.equal(applyCheckin(r, c, 999, 0).ok, false);
  assert.equal(applyCheckin(r, c, 91001, 0).ok, false);
  const ok = applyCheckin(r, c, 91000, 0);
  assert.equal(ok.row.verified_secs, 600);
  assert.equal(ok.next.due, 91000 + 10 * M);
});

test('midpoint check-in for a 10 minute session', async () => {
  const db = mk();
  const s = await sess(db, 1, 10);
  await ping(db, 1, s, T0);
  const c = (await checks(db, s))[0];
  assert.equal(c.due, T0 + 5 * M);
  assert.equal(c.expires, T0 + 5 * M + 90000);
});

test('another user gets 404', async () => {
  const db = mk();
  const s = await sess(db, 1);
  await code(ping(db, 2, s, T0), 404);
  await ping(db, 1, s, T0);
  const c = (await checks(db, s))[0];
  await code(ans(db, 2, c.id, c.due), 404);
});

test('credit card answers for open session', async () => {
  const db = mk();
  const s = await sess(db, 1, 60);
  await ping(db, 1, s, T0);
  await run(db, 1, s, T0 + 30000, T0 + 5 * M);
  assert.equal(await creditCard(db, 1, T0 + 5 * M + 1000, 0), true);
  const r = await row(db, s);
  assert.ok(r.verified_secs >= 290);
  assert.equal(await creditCard(db, 2, T0, 0), false);
});

test('pings only, never answered, earns 0 coins', async () => {
  const db = mk();
  const s = await sess(db, 1, 60);
  await run(db, 1, s, T0, T0 + 40 * M);
  assert.ok((await row(db, s)).active_secs > 35 * 60);
  assert.equal(await finishSession(db, 1, s, T0 + 40 * M), 0);
  assert.equal(await awardForSession(db, 1, s), 0);
});

test('answering every check-in pays', async () => {
  const db = mk();
  const s = await sess(db, 1, 60);
  await run(db, 1, s, T0, T0 + 40 * M, (c, t) => ans(db, 1, c.id, t));
  const v = await finishSession(db, 1, s, T0 + 40 * M);
  assert.ok(v > 20 * 60);
  assert.equal(await awardForSession(db, 1, s), Math.floor(v / 60));
});
