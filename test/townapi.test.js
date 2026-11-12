import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, v3 } from './d1shim.js';
import { townRoute } from '../src/town/api.js';
import { deleteAccount } from '../src/auth.js';
import { patch } from '../src/db.js';

function mk() {
  const db = d1();
  v3(db);
  db.exec(readFileSync(new URL('../migrations/v3/0002_town.sql', import.meta.url), 'utf8'));
  for (const [id, n] of [[1, 'Ann'], [2, 'Bob'], [3, 'Cy']]) db.exec(`INSERT INTO users(id,email,name,pw_hash,salt,created) VALUES(${id},'u${id}@x.io','${n}','h','s',0)`);
  return { DB: db };
}

async function call(env, uid, method, path, body, q = '') {
  const req = new Request('https://t.test' + path + q, { method, headers: { 'content-type': 'application/json' } });
  const r = await townRoute(env, req, { id: uid, name: 'N' + uid }, path, body === undefined ? null : body);
  return { s: r.status, j: await r.json() };
}

const give = (env, uid, n) => env.DB.prepare("INSERT INTO coin_ledger(user_id,delta,reason,ref) VALUES(?,?,'session',?)").bind(uid, n, 'g' + Math.random()).run();

test('non town path returns null', async () => {
  const env = mk();
  assert.equal(await townRoute(env, new Request('https://t.test/api/tasks'), { id: 1 }, '/api/tasks', null), null);
});

test('join is idempotent and race safe', async () => {
  const env = mk();
  const a = await call(env, 1, 'POST', '/api/town/join');
  const b = await call(env, 2, 'POST', '/api/town/join');
  const a2 = await call(env, 1, 'POST', '/api/town/join');
  assert.equal(a.s, 200);
  assert.equal(b.s, 200);
  assert.deepEqual(a.j.plot.slot, a2.j.plot.slot);
  assert.notEqual(a.j.plot.slot, b.j.plot.slot);
  const n = await env.DB.prepare('SELECT COUNT(*) c FROM town_plots').first('c');
  assert.equal(n, 2);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) c FROM houses').first('c'), 2);
});

test('me before join, after join', async () => {
  const env = mk();
  assert.equal((await call(env, 1, 'GET', '/api/town/me')).j.joined, false);
  await call(env, 1, 'POST', '/api/town/join');
  const r = (await call(env, 1, 'GET', '/api/town/me')).j;
  assert.equal(r.joined, true);
  assert.equal(r.balance, 0);
  assert.equal(r.avatar.outfit, 'outfit:casual');
  assert.deepEqual(r.blocked, []);
  assert.equal(r.share_stats, false);
});

test('avatar validation and ownership', async () => {
  const env = mk();
  assert.equal((await call(env, 1, 'PUT', '/api/town/avatar', { skin: 2 })).s, 409);
  await call(env, 1, 'POST', '/api/town/join');
  await call(env, 2, 'POST', '/api/town/join');
  const put = (b) => call(env, 1, 'PUT', '/api/town/avatar', b);
  assert.equal((await put({ skin: 3, hair: 8, hair_color: 2 })).s, 200);
  for (const b of [{ skin: 0 }, { skin: 7 }, { hair: 9 }, { hair_color: 1.5 }, { skin: '2' }, { outfit: 'furn:desk' }, { accessory: 'outfit:casual' }, { name: '' }, { name: 'x'.repeat(25) }, { name: '\u0001\u0002' }]) {
    assert.equal((await put(b)).s, 400, JSON.stringify(b));
  }
  assert.equal((await put({ outfit: 'outfit:hoodie' })).s, 403);
  assert.equal((await put({ accessory: 'acc:cap' })).s, 403);
  await give(env, 1, 500);
  assert.equal((await call(env, 1, 'POST', '/api/town/buy', { item: 'outfit:hoodie' })).s, 200);
  const r = await put({ outfit: 'outfit:hoodie', name: ' A\u0007nn ' });
  assert.equal(r.j.avatar.outfit, 'outfit:hoodie');
  assert.equal(r.j.avatar.name, 'Ann');
  assert.equal((await put({ outfit: 'outfit:casual', accessory: null })).s, 200);
  assert.equal((await call(env, 2, 'PUT', '/api/town/avatar', { outfit: 'outfit:hoodie' })).s, 403);
});

test('buy rules and isolation', async () => {
  const env = mk();
  await call(env, 1, 'POST', '/api/town/join');
  await call(env, 2, 'POST', '/api/town/join');
  const buy = (u, item, qty) => call(env, u, 'POST', '/api/town/buy', { item, qty });
  let r = await buy(1, 'outfit:hoodie');
  assert.deepEqual([r.s, r.j.error], [400, 'coins']);
  r = await buy(1, 'nope:x');
  assert.deepEqual([r.s, r.j.error], [400, 'item']);
  await give(env, 1, 150);
  r = await buy(1, 'outfit:hoodie');
  assert.deepEqual([r.s, r.j.balance], [200, 50]);
  r = await buy(1, 'outfit:hoodie');
  assert.deepEqual([r.s, r.j.error], [400, 'owned']);
  r = await buy(1, 'food:cookie', 11);
  assert.deepEqual([r.s, r.j.error], [400, 'qty']);
  r = await buy(1, 'food:cookie', 3);
  assert.deepEqual([r.s, r.j.balance], [200, 20]);
  const m1 = (await call(env, 1, 'GET', '/api/town/me')).j;
  const m2 = (await call(env, 2, 'GET', '/api/town/me')).j;
  assert.ok(m1.wardrobe.includes('outfit:hoodie'));
  assert.deepEqual(m2.wardrobe, []);
  assert.equal(m1.pantry['food:cookie'], 3);
  assert.deepEqual(m2.pantry, {});
  assert.equal(m2.balance, 0);
  r = await call(env, 2, 'POST', '/api/town/eat', { item: 'food:cookie' });
  assert.deepEqual([r.s, r.j.error], [400, 'pantry']);
  r = await call(env, 1, 'POST', '/api/town/eat', { item: 'outfit:hoodie' });
  assert.deepEqual([r.s, r.j.error], [400, 'item']);
  r = await call(env, 1, 'POST', '/api/town/eat', { item: 'food:cookie' });
  assert.equal(r.s, 200);
  assert.ok(r.j.fed_until > Date.now());
  assert.equal((await call(env, 1, 'GET', '/api/town/me')).j.pantry['food:cookie'], 2);
});

test('house style and door mode', async () => {
  const env = mk();
  await call(env, 1, 'POST', '/api/town/join');
  const put = (b) => call(env, 1, 'PUT', '/api/town/house', b);
  assert.equal((await put({ door_mode: 'open', name: 'Home' })).s, 200);
  assert.equal((await put({ door_mode: 'bad' })).s, 400);
  assert.equal((await put({ name: '' })).s, 400);
  assert.equal((await put({ roof: 'wall:wood' })).s, 400);
  assert.equal((await put({ roof: 'roof:blue' })).s, 403);
  assert.equal((await put({ size: 'house:large' })).s, 403);
  assert.equal((await put({ size: 'house:small' })).j.house.size, 'house:small');
  assert.equal((await put({ size: 'house:medium' })).j.house.size, 'house:medium');
  await give(env, 1, 3500);
  await call(env, 1, 'POST', '/api/town/buy', { item: 'house:large' });
  assert.equal((await put({ size: 'house:large' })).j.house.size, 'house:large');
});

test('house items bounds, dup, ownership, replace', async () => {
  const env = mk();
  await call(env, 1, 'POST', '/api/town/join');
  const put = (items) => call(env, 1, 'PUT', '/api/town/house/items', { items });
  assert.equal((await put([{ item_id: 'furn:desk', x: 5, y: 4 }])).s, 200);
  for (const it of [{ item_id: 'furn:desk', x: 10, y: 0 }, { item_id: 'furn:desk', x: 0, y: 7 }, { item_id: 'furn:desk', x: -1, y: 0 }, { item_id: 'furn:desk', x: 1.5, y: 0 }]) {
    assert.deepEqual([(await put([it])).s, (await put([it])).j.error], [400, 'bounds']);
  }
  assert.equal((await put([{ item_id: 'furn:desk', x: 1, y: 1 }, { item_id: 'furn:bed', x: 1, y: 1 }])).j.error, 'dup');
  assert.equal((await put([{ item_id: 'outfit:casual', x: 1, y: 1 }])).j.error, 'item');
  assert.equal((await put([{ item_id: 'furn:bookshelf', x: 1, y: 1 }])).s, 403);
  assert.equal((await put(Array.from({ length: 41 }, (_, i) => ({ item_id: 'furn:desk', x: i % 6, y: 0 })))).s, 400);
  assert.equal((await put([{ item_id: 'furn:desk', x: 1, y: 1 }, { item_id: 'furn:bed', x: 2, y: 1, flip: 1 }])).s, 200);
  assert.equal((await put([{ item_id: 'furn:chair', x: 0, y: 0 }])).s, 200);
  const h = (await call(env, 1, 'GET', '/api/town/me')).j.house;
  assert.equal(h.items.length, 1);
  assert.equal(h.items[0].item_id, 'furn:chair');
});

test('house lookup and plots visibility', async () => {
  const env = mk();
  for (const u of [1, 2, 3]) await call(env, u, 'POST', '/api/town/join');
  let r = await call(env, 2, 'GET', '/api/town/house/1');
  assert.equal(r.s, 200);
  assert.equal(JSON.stringify(r.j).includes('u1@x.io'), false);
  assert.equal((await call(env, 2, 'GET', '/api/town/house/99')).s, 404);
  assert.equal((await call(env, 2, 'GET', '/api/town/house/abc')).s, 404);
  r = await call(env, 2, 'GET', '/api/town/plots', undefined, '?district=0');
  assert.equal(r.j.plots.length, 3);
  assert.equal(JSON.stringify(r.j).includes('@'), false);
  await env.DB.prepare("INSERT INTO prefs(user_id,k,v) VALUES(1,'show_in_town','0')").run();
  r = await call(env, 2, 'GET', '/api/town/plots', undefined, '?district=0');
  assert.deepEqual(r.j.plots.map((p) => p.owner.id).sort(), [2, 3]);
  assert.equal((await call(env, 2, 'GET', '/api/town/house/1')).s, 404);
  assert.equal((await call(env, 1, 'GET', '/api/town/house/1')).s, 200);
  assert.equal((await call(env, 2, 'GET', '/api/town/plots', undefined, '?district=x')).s, 400);
  await call(env, 2, 'POST', '/api/town/block', { user: 3 });
  r = await call(env, 2, 'GET', '/api/town/plots', undefined, '?district=0');
  assert.deepEqual(r.j.plots.map((p) => p.owner.id), [2]);
  r = await call(env, 3, 'GET', '/api/town/plots', undefined, '?district=0');
  assert.deepEqual(r.j.plots.map((p) => p.owner.id), [3]);
});

test('hall shows only opted in users', async () => {
  const env = mk();
  for (const u of [1, 2, 3]) await call(env, u, 'POST', '/api/town/join');
  const day = new Date().toISOString().slice(0, 10);
  for (const [sid, u] of [[1, 1], [2, 2], [3, 3]]) {
    await env.DB.prepare('INSERT INTO sessions(id,user_id,start_at) VALUES(?,?,?)').bind(sid, u, day + 'T10:00:00Z').run();
    await env.DB.prepare('INSERT INTO session_active(session_id,user_id,started,last_ping,verified_secs,last_ok) VALUES(?,?,0,?,?,0)').bind(sid, u, Date.now(), u * 600).run();
  }
  await env.DB.prepare("INSERT INTO prefs(user_id,k,v) VALUES(1,'share_stats','1'),(2,'share_stats','1'),(2,'show_in_town','0')").run();
  await env.DB.prepare("INSERT INTO courses(id,user_id,name,code) VALUES(1,1,'Math','MA101')").run();
  await env.DB.prepare('INSERT INTO tasks(id,user_id,title,course_id) VALUES(1,1,?,1)').bind('secret').run();
  await env.DB.prepare('UPDATE sessions SET task_id=1 WHERE id=1').run();
  let r = (await call(env, 3, 'GET', '/api/town/hall')).j;
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].id, 1);
  assert.equal(r.list[0].mins, 10);
  assert.equal(r.list[0].act, 'active');
  assert.equal(r.list[0].course, undefined);
  assert.equal(JSON.stringify(r).includes('secret'), false);
  await env.DB.prepare("INSERT INTO prefs(user_id,k,v) VALUES(1,'share_subject','1')").run();
  r = (await call(env, 3, 'GET', '/api/town/hall')).j;
  assert.equal(r.list[0].course, 'MA101');
});

test('block and report', async () => {
  const env = mk();
  assert.equal((await call(env, 1, 'POST', '/api/town/block', { user: 1 })).s, 400);
  assert.equal((await call(env, 1, 'POST', '/api/town/block', { user: 99 })).s, 400);
  assert.equal((await call(env, 1, 'POST', '/api/town/block', { user: 2 })).s, 200);
  assert.equal((await call(env, 1, 'POST', '/api/town/block', { user: 2 })).s, 200);
  assert.deepEqual((await call(env, 1, 'GET', '/api/town/me')).j.blocked, [2]);
  assert.deepEqual((await call(env, 2, 'GET', '/api/town/me')).j.blocked, []);
  assert.equal((await call(env, 2, 'DELETE', '/api/town/block/1')).s, 200);
  assert.deepEqual((await call(env, 1, 'GET', '/api/town/me')).j.blocked, [2]);
  assert.equal((await call(env, 1, 'DELETE', '/api/town/block/2')).s, 200);
  assert.deepEqual((await call(env, 1, 'GET', '/api/town/me')).j.blocked, []);
  assert.equal((await call(env, 1, 'POST', '/api/town/report', { user: 1, reason: 'spam' })).s, 400);
  for (let i = 0; i < 5; i++) assert.equal((await call(env, 1, 'POST', '/api/town/report', { user: 2, reason: 'spam', text: 'x' })).s, 200);
  assert.equal((await call(env, 1, 'POST', '/api/town/report', { user: 2, reason: 'spam' })).s, 429);
  assert.equal((await call(env, 2, 'POST', '/api/town/report', { user: 1, reason: 'abuse' })).s, 200);
});

test('unknown town route is 404', async () => {
  const env = mk();
  assert.equal((await call(env, 1, 'GET', '/api/town/nope')).s, 404);
});

function wsEnv(env) {
  const seen = [];
  const ns = (k) => ({ idFromName: (n) => k + n, get: (id) => ({ fetch: async (rq) => { seen.push({ id, h: rq.headers }); return new Response('ok'); } }) });
  return { ...env, DISTRICT: ns('D'), HOUSE: ns('H'), seen };
}

async function ws(env, uid, path, hdr = { upgrade: 'websocket' }) {
  const req = new Request('https://t.test' + path, { headers: hdr });
  const r = await townRoute(env, req, { id: uid, name: 'N' }, path.split('?')[0], null);
  return r.status;
}

test('websocket admission and header stripping', async () => {
  const env = wsEnv(mk());
  assert.equal(await ws(env, 1, '/api/town/ws?district=0'), 403);
  for (const u of [1, 2]) await call(env, u, 'POST', '/api/town/join');
  assert.equal(await ws(env, 1, '/api/town/ws?district=0', {}), 426);
  assert.equal(await ws(env, 1, '/api/town/ws?district=zz'), 400);
  assert.equal(await ws(env, 1, '/api/town/ws?district=0', { upgrade: 'websocket', 'x-uid': '2', 'x-name': 'evil', 'x-other': 'y' }), 200);
  const h = env.seen[0].h;
  assert.equal(env.seen[0].id, 'Dd:0');
  assert.equal(h.get('x-uid'), '1');
  assert.equal(h.get('x-name'), 'N1');
  assert.equal(h.get('x-other'), null);
  await env.DB.prepare("INSERT INTO prefs(user_id,k,v) VALUES(1,'show_in_town','0')").run();
  assert.equal(await ws(env, 1, '/api/town/ws?district=0'), 403);
  await env.DB.prepare('DELETE FROM prefs').run();
  assert.equal(await ws(env, 1, '/api/town/house/1/ws'), 200);
  assert.equal(env.seen[1].id, 'Hh:1');
  assert.equal(await ws(env, 2, '/api/town/house/1/ws'), 403);
  await env.DB.prepare('INSERT INTO house_access VALUES(1,2,?)').bind(Date.now() - 1000).run();
  assert.equal(await ws(env, 2, '/api/town/house/1/ws'), 403);
  await env.DB.prepare('UPDATE house_access SET expires=?').bind(Date.now() + 100000).run();
  assert.equal(await ws(env, 2, '/api/town/house/1/ws'), 200);
  await env.DB.prepare('INSERT INTO user_blocks VALUES(1,2)').run();
  assert.equal(await ws(env, 2, '/api/town/house/1/ws'), 403);
  await env.DB.prepare('DELETE FROM user_blocks').run();
  await env.DB.prepare("UPDATE houses SET door_mode='open' WHERE user_id=1").run();
  assert.equal(await ws(env, 2, '/api/town/house/1/ws'), 200);
  assert.equal(await ws(env, 2, '/api/town/house/1/ws', {}), 426);
  assert.equal(await ws(env, 2, '/api/town/house/9/ws'), 403);
});

test('session patch awards coins, failure never fails the patch', async () => {
  const env = mk();
  const db = env.DB;
  await db.prepare('INSERT INTO sessions(id,user_id,start_at) VALUES(1,1,?)').bind('2026-01-05T10:00:00Z').run();
  await db.prepare('INSERT INTO session_active(session_id,user_id,started,last_ping,verified_secs,last_ok) VALUES(1,1,0,0,1800,0)').run();
  const row = await patch(db, 1, 'sessions', 1, { end_kind: 'done' });
  assert.equal(row.end_kind, 'done');
  assert.equal(await db.prepare('SELECT SUM(delta) s FROM coin_ledger WHERE user_id=1').first('s'), 30);
  await assert.rejects(patch(db, 1, 'sessions', 1, { end_kind: 'stopped' }), (e) => e.status === 409);
  assert.equal(await db.prepare('SELECT SUM(delta) s FROM coin_ledger WHERE user_id=1').first('s'), 30);
  await patch(db, 1, 'sessions', 1, { rating: 3 });
  const bad = d1();
  v3(bad);
  await bad.prepare('INSERT INTO sessions(id,user_id,start_at) VALUES(1,1,?)').bind('2026-01-05T10:00:00Z').run();
  assert.equal((await patch(bad, 1, 'sessions', 1, { end_kind: 'done' })).end_kind, 'done');
});

test('deleteAccount removes town rows and frees the plot', async () => {
  const env = mk();
  const db = env.DB;
  for (const u of [1, 2]) await call(env, u, 'POST', '/api/town/join');
  await give(env, 1, 100);
  await call(env, 1, 'POST', '/api/town/buy', { item: 'food:cookie', qty: 1 });
  await call(env, 1, 'POST', '/api/town/eat', { item: 'food:cookie' });
  await call(env, 1, 'POST', '/api/town/buy', { item: 'furn:rug' });
  await call(env, 1, 'PUT', '/api/town/house/items', { items: [{ item_id: 'furn:desk', x: 0, y: 0 }] });
  await call(env, 1, 'POST', '/api/town/block', { user: 2 });
  await call(env, 2, 'POST', '/api/town/block', { user: 1 });
  await call(env, 1, 'POST', '/api/town/report', { user: 2, reason: 'spam' });
  await db.prepare('INSERT INTO house_access VALUES(2,1,5),(1,2,5)').run();
  await db.prepare('INSERT INTO session_active(session_id,user_id,started,last_ping,last_ok) VALUES(1,1,0,0,0)').run();
  await db.prepare('INSERT INTO checkins(session_id,user_id,due,expires) VALUES(1,1,0,0)').run();
  await deleteAccount(db, 1);
  for (const t of ['coin_ledger', 'wardrobe', 'pantry', 'user_status', 'session_active', 'checkins', 'avatar', 'houses', 'house_items']) {
    assert.equal(await db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE user_id=1`).first('c'), 0, t);
  }
  assert.equal(await db.prepare('SELECT COUNT(*) c FROM user_blocks').first('c'), 0);
  assert.equal(await db.prepare('SELECT COUNT(*) c FROM reports').first('c'), 0);
  assert.equal(await db.prepare('SELECT COUNT(*) c FROM house_access').first('c'), 0);
  assert.equal(await db.prepare('SELECT COUNT(*) c FROM town_plots WHERE user_id=1').first('c'), 0);
  assert.equal(await db.prepare('SELECT COUNT(*) c FROM avatar WHERE user_id=2').first('c'), 1);
  const r = await call(env, 3, 'POST', '/api/town/join');
  assert.equal(r.j.plot.slot, 0);
});

test('move plot: free plot works, taken plot refused, old plot freed', async () => {
  const env = mk();
  const a = await call(env, 1, 'POST', '/api/town/join');
  const b = await call(env, 2, 'POST', '/api/town/join');
  assert.equal((await call(env, 3, 'POST', '/api/town/plot', { district: 0, slot: 5 })).s, 409);
  const taken = await call(env, 1, 'POST', '/api/town/plot', { district: 0, slot: b.j.plot.slot });
  assert.equal(taken.s, 409);
  assert.equal((await call(env, 1, 'GET', '/api/town/me')).j.plot.slot, a.j.plot.slot);
  const mv = await call(env, 1, 'POST', '/api/town/plot', { district: 0, slot: 20 });
  assert.equal(mv.s, 200);
  assert.equal(mv.j.plot.slot, 20);
  const me = await call(env, 1, 'GET', '/api/town/me');
  assert.equal(me.j.plot.slot, 20);
  const list = await call(env, 2, 'GET', '/api/town/plots', undefined, '?district=0');
  assert.ok(list.j.taken.includes(20) && !list.j.taken.includes(a.j.plot.slot));
  const c = await call(env, 3, 'POST', '/api/town/join');
  assert.equal(c.j.plot.slot, a.j.plot.slot);
  assert.equal(await env.DB.prepare('SELECT plot_id FROM houses WHERE user_id=1').first('plot_id'), await env.DB.prepare('SELECT id FROM town_plots WHERE user_id=1').first('id'));
  for (const bad of [{ district: 0, slot: 40 }, { district: -1, slot: 0 }, { district: 9, slot: 0 }, { district: 'a', slot: 0 }, {}]) {
    assert.equal((await call(env, 1, 'POST', '/api/town/plot', bad)).s, 400);
  }
  assert.equal((await call(env, 1, 'POST', '/api/town/plot', { district: 1, slot: 3 })).s, 200);
});

test('new houses start medium sized', async () => {
  const env = mk();
  await call(env, 1, 'POST', '/api/town/join');
  assert.equal((await call(env, 1, 'GET', '/api/town/me')).j.house.size, 'house:medium');
});
