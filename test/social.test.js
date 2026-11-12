import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1, v3 } from './d1shim.js';
import { social, chatMuted, ONLINE_MS } from '../src/town/social.js';

const NOW = 1000000000000;

function mk() {
  const db = d1();
  v3(db);
  for (const [id, n] of [[1, 'Ann'], [2, 'Bob'], [3, 'Cy'], [4, 'Dee'], [999, 'Zed']]) {
    db.exec(`INSERT INTO users(id,email,name,pw_hash,salt,created) VALUES(${id},'u${id}@x.io','${n}','h','s',0)`);
    db.prepare('INSERT INTO avatar(user_id,name) VALUES(?,?)').bind(id, n).run();
  }
  return db;
}

const list = (db, uid, now = NOW) => social(db, uid, ['friends'], 'GET', null, now);
const befriend = async (db, a, b) => {
  await social(db, a, ['friends'], 'POST', { id: b }, NOW);
  await social(db, b, ['friends', String(a), 'accept'], 'POST', null, NOW);
};

async function fails(pr, status, error) {
  await assert.rejects(pr, (e) => e.status === status && e.error === error);
}

test('request then accept', async () => {
  const db = mk();
  assert.deepEqual(await social(db, 1, ['friends'], 'POST', { id: 2 }, NOW), { ok: 1, status: 'pending' });
  const inc = await list(db, 2);
  assert.equal(inc.incoming.length, 1);
  assert.equal(inc.incoming[0].id, 1);
  assert.equal(inc.incoming[0].name, 'Ann');
  assert.deepEqual((await list(db, 1)).outgoing, [{ id: 2, name: 'Bob' }]);
  assert.deepEqual(await social(db, 2, ['friends', '1', 'accept'], 'POST', null, NOW), { ok: 1 });
  const f = await list(db, 1);
  assert.equal(f.friends.length, 1);
  assert.equal(f.friends[0].id, 2);
  assert.equal(f.friends[0].online, false);
  assert.equal(f.friends[0].st, 'off');
  assert.equal(f.friends[0].district, null);
  assert.deepEqual(f.outgoing, []);
});

test('accept without a request is 404', async () => {
  const db = mk();
  await fails(social(db, 2, ['friends', '1', 'accept'], 'POST', null, NOW), 404, 'request');
});

test('mutual request auto-accepts', async () => {
  const db = mk();
  await social(db, 1, ['friends'], 'POST', { id: 2 }, NOW);
  assert.deepEqual(await social(db, 2, ['friends'], 'POST', { id: 1 }, NOW), { ok: 1, status: 'ok' });
  assert.equal((await list(db, 1)).friends.length, 1);
  assert.equal((await list(db, 2)).friends.length, 1);
  assert.deepEqual(await social(db, 1, ['friends'], 'POST', { id: 2 }, NOW), { ok: 1, status: 'ok' });
});

test('self and unknown target errors', async () => {
  const db = mk();
  await fails(social(db, 1, ['friends'], 'POST', { id: 1 }, NOW), 400, 'self');
  await fails(social(db, 1, ['friends'], 'POST', { id: 77 }, NOW), 404, 'user');
  await fails(social(db, 1, ['friends'], 'POST', { id: 'abc' }, NOW), 400, 'user');
  await fails(social(db, 1, ['friends'], 'POST', null, NOW), 400, 'user');
  await fails(social(db, 1, ['friends', 'abc'], 'DELETE', null, NOW), 400, 'user');
});

test('friend limit is 200', async () => {
  const db = mk();
  for (let i = 0; i < 200; i++) db.prepare("INSERT INTO friends(a,b,status) VALUES(1,?,'ok')").bind(1000 + i).run();
  await fails(social(db, 1, ['friends'], 'POST', { id: 999 }, NOW), 409, 'limit');
});

test('block hides a friend and refuses a request', async () => {
  const db = mk();
  await befriend(db, 1, 2);
  await social(db, 2, ['friends'], 'POST', { id: 3 }, NOW);
  db.prepare('INSERT INTO user_blocks(blocker,blocked) VALUES(?,?)').bind(2, 1).run();
  assert.deepEqual((await list(db, 1)).friends, []);
  assert.deepEqual((await list(db, 2)).friends, []);
  await fails(social(db, 1, ['friends'], 'POST', { id: 2 }, NOW), 403, 'blocked');
  db.prepare('INSERT INTO user_blocks(blocker,blocked) VALUES(?,?)').bind(4, 3).run();
  await fails(social(db, 3, ['friends'], 'POST', { id: 4 }, NOW), 403, 'blocked');
  assert.equal((await list(db, 3)).incoming.length, 1);
});

test('block hides a pending request', async () => {
  const db = mk();
  await social(db, 3, ['friends'], 'POST', { id: 1 }, NOW);
  db.prepare('INSERT INTO user_blocks(blocker,blocked) VALUES(?,?)').bind(1, 3).run();
  assert.deepEqual((await list(db, 1)).incoming, []);
});

test('DELETE works from both sides', async () => {
  const db = mk();
  await befriend(db, 1, 2);
  assert.deepEqual(await social(db, 2, ['friends', '1'], 'DELETE', null, NOW), { ok: 1 });
  assert.deepEqual((await list(db, 1)).friends, []);
  await social(db, 1, ['friends'], 'POST', { id: 3 }, NOW);
  assert.deepEqual(await social(db, 3, ['friends', '1'], 'DELETE', null, NOW), { ok: 1 });
  assert.deepEqual((await list(db, 3)).incoming, []);
  assert.deepEqual((await list(db, 1)).outgoing, []);
});

test('presence makes a friend online and it expires', async () => {
  const db = mk();
  await befriend(db, 1, 2);
  assert.deepEqual(await social(db, 2, ['presence'], 'POST', { st: 'focus', district: 3 }, NOW), { ok: 1 });
  const on = (await list(db, 1)).friends[0];
  assert.equal(on.online, true);
  assert.equal(on.st, 'focus');
  assert.equal(on.district, 3);
  const off = (await list(db, 1, NOW + 151000)).friends[0];
  assert.equal(off.online, false);
  assert.equal(off.st, 'off');
  assert.equal(off.district, null);
  assert.ok(ONLINE_MS === 150000);
});

test('presence falls back to idle for unknown state', async () => {
  const db = mk();
  await befriend(db, 1, 2);
  await social(db, 2, ['presence'], 'POST', { st: 'party', district: -1 }, NOW);
  const f = (await list(db, 1)).friends[0];
  assert.equal(f.st, 'idle');
  assert.equal(f.district, null);
});

test('invite only to friends', async () => {
  const db = mk();
  await fails(social(db, 1, ['invites'], 'POST', { to: 2, kind: 'room', ref: 'r1' }, NOW), 403, 'friend');
  await befriend(db, 1, 2);
  assert.deepEqual(await social(db, 1, ['invites'], 'POST', { to: 2, kind: 'room', ref: 'r1' }, NOW), { ok: 1 });
  const g = await social(db, 2, ['invites'], 'GET', null, NOW);
  assert.equal(g.invites.length, 1);
  assert.deepEqual(g.invites[0].from, { id: 1, name: 'Ann' });
  assert.equal(g.invites[0].kind, 'room');
  assert.equal(g.invites[0].ref, 'r1');
});

test('invite validation', async () => {
  const db = mk();
  await befriend(db, 1, 2);
  await fails(social(db, 1, ['invites'], 'POST', { to: 2, kind: 'party', ref: 'r1' }, NOW), 400, 'kind');
  await fails(social(db, 1, ['invites'], 'POST', { to: 2, kind: 'house', ref: 'Bad Ref' }, NOW), 400, 'ref');
  await fails(social(db, 1, ['invites'], 'POST', { to: 2, kind: 'house', ref: 5 }, NOW), 400, 'ref');
});

test('invite rate limit is 10 per minute', async () => {
  const db = mk();
  await befriend(db, 1, 2);
  for (let i = 0; i < 10; i++) await social(db, 1, ['invites'], 'POST', { to: 2, kind: 'house', ref: 'h:' + i }, NOW);
  await fails(social(db, 1, ['invites'], 'POST', { to: 2, kind: 'house', ref: 'h:x' }, NOW), 429, 'rate');
  assert.deepEqual(await social(db, 1, ['invites'], 'POST', { to: 2, kind: 'house', ref: 'h:y' }, NOW + 61000), { ok: 1 });
});

test('seen hides an invite and expired invites are hidden', async () => {
  const db = mk();
  await befriend(db, 1, 2);
  await social(db, 1, ['invites'], 'POST', { to: 2, kind: 'house', ref: 'h1' }, NOW);
  await social(db, 1, ['invites'], 'POST', { to: 2, kind: 'room', ref: 'r2' }, NOW);
  const g = await social(db, 2, ['invites'], 'GET', null, NOW);
  assert.equal(g.invites.length, 2);
  assert.equal(g.invites[0].ref, 'r2');
  assert.deepEqual(await social(db, 2, ['invites', String(g.invites[0].id), 'seen'], 'POST', null, NOW), { ok: 1 });
  assert.equal((await social(db, 2, ['invites'], 'GET', null, NOW)).invites.length, 1);
  assert.equal((await social(db, 2, ['invites'], 'GET', null, NOW + 601000)).invites.length, 0);
});

test('chatMuted needs three distinct reporters', async () => {
  const db = mk();
  const rep = (r) => db.prepare('INSERT INTO reports(reporter,target,reason,text) VALUES(?,1,?,?)').bind(r, 'spam', 'x').run();
  await rep(2);
  await rep(2);
  await rep(3);
  assert.equal(await chatMuted(db, 1), false);
  await rep(4);
  assert.equal(await chatMuted(db, 1), true);
});

test('unknown routes return null', async () => {
  const db = mk();
  assert.equal(await social(db, 1, ['tasks'], 'GET', null, NOW), null);
  assert.equal(await social(db, 1, ['presence'], 'GET', null, NOW), null);
  assert.equal(await social(db, 1, ['friends', '2', 'x', 'y'], 'GET', null, NOW), null);
  assert.equal(await social(db, 1, ['invites', '2'], 'POST', null, NOW), null);
});
