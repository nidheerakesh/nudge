import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1, v3 } from './d1shim.js';
import { signup, changePassword, getUser } from '../src/auth.js';
import { insert, exportAll, setPrefs, all } from '../src/db.js';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

function mk() {
  const db = d1();
  v3(db);
  return db;
}

const req = (tok) => new Request('https://x.io/api/me', { headers: { cookie: 'nudge_s=' + tok } });

test('password change keeps this session and revokes the others', async () => {
  const db = mk();
  const a = await signup(db, { email: 'a@x.io', password: 'password1' });
  const { createSession } = await import('../src/auth.js');
  const other = await createSession(db, a.user.id);
  const res = await changePassword(db, a.user.id, 'password1', 'password22', req(a.token));
  assert.equal(res.ok, 1);
  assert.ok(await getUser(db, req(a.token)));
  assert.equal(await getUser(db, req(other)), null);
});

test('db rejects bad dates, times and minutes, accepts good ones', async () => {
  const db = mk();
  const a = await signup(db, { email: 'a@x.io', password: 'password1' });
  const id = a.user.id;
  for (const b of [{ title: 't', due: 'tomorrow' }, { title: 't', est: -5 }, { title: 't', est: 99999 }, { title: 't', est: 1.5 }]) {
    await assert.rejects(insert(db, id, 'tasks', b), (e) => e.status === 400);
  }
  await assert.rejects(insert(db, id, 'blocks', { day: '2026-11-12', start: '25:00', mins: 30, title: 'x' }), (e) => e.status === 400);
  await assert.rejects(insert(db, id, 'habits', { name: 'h', per_week: 9 }), (e) => e.status === 400);
  const ok = await insert(db, id, 'tasks', { title: 't', due: '2026-11-12', est: 45 });
  assert.equal(ok[0].due, '2026-11-12');
  await insert(db, id, 'blocks', { day: '2026-11-12', start: '09:30', mins: 30, title: 'x' });
});

test('export includes user, timer and town data; coach_rl is not settable or listed', async () => {
  const db = mk();
  const a = await signup(db, { email: 'a@x.io', password: 'password1' });
  const ex = await exportAll(db, a.user.id);
  assert.equal(ex.user.email, 'a@x.io');
  assert.ok(ex.town && Array.isArray(ex.town.wardrobe));
  assert.ok('timer' in ex);
  await assert.rejects(setPrefs(db, a.user.id, { coach_rl: '0:0' }), (e) => e.status === 400);
  await db.prepare("INSERT INTO prefs(user_id,k,v) VALUES(?,'coach_rl','1:1')").bind(a.user.id).run();
  assert.equal((await all(db, a.user.id)).prefs.coach_rl, undefined);
});

async function call(env, tok, body) {
  return worker.fetch(new Request('https://x.io/api/coach', { method: 'POST', headers: { origin: 'https://x.io', 'content-type': 'application/json', cookie: 'nudge_s=' + tok }, body: JSON.stringify(body) }), env);
}

test('coach: long messages are trimmed, rate limited to 10 a minute', async () => {
  const db = mk();
  const a = await signup(db, { email: 'a@x.io', password: 'password1' });
  let seen = 0;
  const env = { DB: db, ASSETS: { fetch: () => new Response('') }, AI: { run: async (_m, o) => { seen = o.messages[o.messages.length - 1].content.length; return { response: 'hi' }; } } };
  const r = await call(env, a.token, { messages: [{ role: 'user', content: 'x'.repeat(5000) }] });
  assert.equal(r.status, 200);
  assert.equal(seen, 2000);
  for (let i = 0; i < 9; i++) assert.equal((await call(env, a.token, { messages: [{ role: 'user', content: 'hi' }] })).status, 200);
  const slow = await call(env, a.token, { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(slow.status, 429);
});

test('websocket upgrade from a foreign origin is refused; headers are set', async () => {
  const db = mk();
  const env = { DB: db, ASSETS: { fetch: () => new Response('ok') } };
  const bad = await worker.fetch(new Request('https://x.io/api/town/ws/district?district=0', { headers: { upgrade: 'websocket', origin: 'https://evil.test' } }), env);
  assert.equal(bad.status, 403);
  const hdr = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(hdr, /Content-Security-Policy: default-src 'self'/);
  assert.match(hdr, /X-Frame-Options: DENY/);
  const api = await worker.fetch(new Request('https://x.io/api/me'), env);
  assert.equal(api.status, 401);
  assert.equal(api.headers.get('x-frame-options'), 'DENY');
});
