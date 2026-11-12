import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, v3 } from './d1shim.js';
import { balance, awardForSession, buy, owns, ownedSet, buyFood, eat } from '../src/town/coins.js';

function mk() {
  const db = d1();
  v3(db);
  db.exec(readFileSync(new URL('../migrations/v3/0002_town.sql', import.meta.url), 'utf8'));
  return db;
}

let sid = 0;
async function sess(db, uid, verified, day = '2026-01-05', active = verified) {
  sid++;
  await db.prepare('INSERT INTO sessions(id,user_id,start_at) VALUES(?,?,?)').bind(sid, uid, day + 'T10:00:00Z').run();
  if (verified !== null) {
    await db.prepare('INSERT INTO session_active(session_id,user_id,started,last_ping,active_secs,verified_secs,last_ok) VALUES(?,?,?,0,?,?,0)').bind(sid, uid, Date.parse(day + 'T10:00:00Z'), active * 60, verified * 60).run();
  }
  return sid;
}

async function fail(p, code) {
  await assert.rejects(p, (e) => e.error === code);
}

async function give(db, uid, n) {
  await db.prepare("INSERT INTO coin_ledger(user_id,delta,reason,ref) VALUES(?,?,'session',?)").bind(uid, n, 'g' + Math.random()).run();
}

test('award rules', async () => {
  const db = mk();
  assert.equal(await awardForSession(db, 1, await sess(db, 1, 4)), 0);
  assert.equal(await awardForSession(db, 1, await sess(db, 1, 45)), 45);
  assert.equal(await awardForSession(db, 1, await sess(db, 1, 0, '2026-01-06', 45)), 0);
  assert.equal(await awardForSession(db, 1, await sess(db, 1, null, '2026-01-07')), 0);
  assert.equal(await awardForSession(db, 1, await sess(db, 1, 300, '2026-01-08')), 240);
  assert.equal(await balance(db, 1), 285);
});

test('day cap across sessions and idempotency', async () => {
  const db = mk();
  const a = await sess(db, 1, 200);
  const b = await sess(db, 1, 100);
  assert.equal(await awardForSession(db, 1, a), 200);
  assert.equal(await awardForSession(db, 1, a), 0);
  assert.equal(await awardForSession(db, 1, b), 40);
  assert.equal(await awardForSession(db, 1, await sess(db, 1, 50)), 0);
  assert.equal(await balance(db, 1), 240);
  assert.equal(await awardForSession(db, 2, a), 0);
});

test('buy rules', async () => {
  const db = mk();
  await give(db, 1, 150);
  await fail(buy(db, 1, 'nope'), 'item');
  await fail(buy(db, 1, 'outfit:cozy'), 'coins');
  assert.equal(await balance(db, 1), 150);
  assert.equal((await ownedSet(db, 1)).size, 0);
  assert.equal(await buy(db, 1, 'outfit:hoodie'), 50);
  assert.ok(await owns(db, 1, 'outfit:hoodie'));
  await fail(buy(db, 1, 'outfit:hoodie'), 'owned');
  assert.equal(await balance(db, 1), 50);
  await fail(buy(db, 1, 'outfit:casual'), 'owned');
  assert.ok(await owns(db, 1, 'outfit:casual'));
  assert.equal(await balance(db, 1), 50);
});

test('cannot spend another user coins', async () => {
  const db = mk();
  await give(db, 1, 500);
  await fail(buy(db, 2, 'outfit:hoodie'), 'coins');
  assert.equal(await balance(db, 1), 500);
  assert.equal(await balance(db, 2), 0);
  assert.ok(!(await owns(db, 2, 'outfit:hoodie')));
});

test('balance never negative', async () => {
  const db = mk();
  await give(db, 1, 300);
  const list = ['outfit:hoodie', 'acc:cap', 'outfit:cozy', 'acc:glasses', 'furn:rug', 'wall:brick', 'outfit:space'];
  for (const id of list) {
    try { await buy(db, 1, id); } catch {}
    assert.ok((await balance(db, 1)) >= 0);
  }
  try { await buyFood(db, 1, 'food:ramen', 10); } catch {}
  assert.ok((await balance(db, 1)) >= 0);
});

test('food and eating', async () => {
  const db = mk();
  await give(db, 1, 100);
  await fail(eat(db, 1, 'food:cookie', 1000), 'pantry');
  await fail(buyFood(db, 1, 'outfit:hoodie'), 'item');
  await fail(buyFood(db, 1, 'food:cookie', 11), 'qty');
  await fail(buyFood(db, 1, 'food:cookie', 0), 'qty');
  assert.equal(await buyFood(db, 1, 'food:pizza', 2), 40);
  assert.equal(await buyFood(db, 1, 'food:pizza'), 10);
  await fail(buyFood(db, 1, 'food:ramen'), 'coins');
  assert.equal((await db.prepare('SELECT qty FROM pantry WHERE user_id=1 AND item_id=?').bind('food:pizza').first()).qty, 3);
  const now = 5000000;
  await eat(db, 1, 'food:pizza', now);
  const st = await db.prepare('SELECT * FROM user_status WHERE user_id=1').first();
  assert.equal(st.fed_until, now + 2 * 3600 * 1000);
  assert.equal(st.fed_item, 'food:pizza');
  assert.equal(await balance(db, 1), 10);
  assert.equal((await db.prepare('SELECT qty FROM pantry WHERE user_id=1').first()).qty, 2);
  const s = await sess(db, 1, 30);
  assert.equal(await awardForSession(db, 1, s), 30);
  await eat(db, 1, 'food:pizza', now);
  await eat(db, 1, 'food:pizza', now);
  await fail(eat(db, 1, 'food:pizza', now), 'pantry');
  assert.equal(await balance(db, 1), 40);
});

test('day cap uses server start, not client start_at', async () => {
  const db = mk();
  for (let i = 0; i < 4; i++) {
    const s = await sess(db, 1, 100, '2026-02-0' + (i + 1));
    await db.prepare("UPDATE sessions SET start_at=? WHERE id=?").bind('2026-03-0' + (i + 1) + 'T10:00:00Z', s).run();
    await db.prepare('UPDATE session_active SET started=? WHERE session_id=?').bind(Date.parse('2026-01-05T10:00:00Z') + i * 1000, s).run();
    await awardForSession(db, 1, s);
  }
  assert.equal(await balance(db, 1), 240);
});
