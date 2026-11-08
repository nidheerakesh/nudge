import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1, v3 } from './d1shim.js';
import * as A from '../src/auth.js';

const fresh = () => {
  const db = d1();
  v3(db);
  return db;
};
const req = (method, headers = {}, url = 'https://app.test/api/x') => new Request(url, { method, headers });
const withTok = (t) => req('GET', { cookie: `nudge_s=${t}` });
const P = 'correct horse';

test('hash and verify', async () => {
  const { hash, salt } = await A.hashPassword(P);
  assert.equal(await A.verifyPassword(P, hash, salt), true);
  assert.equal(await A.verifyPassword('wrong horse!', hash, salt), false);
});

test('salt makes hashes differ', async () => {
  const a = await A.hashPassword(P);
  const b = await A.hashPassword(P);
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(a.salt, b.salt);
});

test('signup validation', async () => {
  const db = fresh();
  assert.deepEqual(await A.signup(db, { email: 'nope', password: P }), { error: 'invalid_email' });
  assert.deepEqual(await A.signup(db, { email: 'a@b.co', password: 'short' }), { error: 'weak_password' });
  const r = await A.signup(db, { email: ' A@B.co ', password: P, name: 'A' });
  assert.equal(r.user.email, 'a@b.co');
  assert.deepEqual(await A.signup(db, { email: 'a@B.CO', password: P }), { error: 'exists' });
});

test('login and getUser', async () => {
  const db = fresh();
  await A.signup(db, { email: 'a@b.co', password: P, name: 'A' });
  const r = await A.login(db, { email: 'a@b.co', password: P });
  assert.ok(r.token);
  const u = await A.getUser(db, withTok(r.token));
  assert.deepEqual(u, r.user);
  const row = await db.prepare('SELECT token_hash FROM auth_sessions WHERE user_id=?').bind(u.id).first();
  assert.notEqual(row.token_hash, r.token);
});

test('invalid login is uniform', async () => {
  const db = fresh();
  await A.signup(db, { email: 'a@b.co', password: P });
  assert.deepEqual(await A.login(db, { email: 'a@b.co', password: 'wrongwrong' }), { error: 'invalid' });
  assert.deepEqual(await A.login(db, { email: 'x@b.co', password: P }), { error: 'invalid' });
});

test('lockout after 5 failures', async () => {
  const db = fresh();
  await A.signup(db, { email: 'a@b.co', password: P });
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) assert.equal((await A.login(db, { email: 'a@b.co', password: 'wrongwrong' }, t0)).error, 'invalid');
  const r = await A.login(db, { email: 'a@b.co', password: P }, t0 + 1000);
  assert.equal(r.error, 'locked');
  assert.ok(r.retry > 0 && r.retry <= 900);
  const ok = await A.login(db, { email: 'a@b.co', password: P }, t0 + 16 * 60 * 1000);
  assert.ok(ok.token);
});

test('expired session', async () => {
  const db = fresh();
  const t0 = Date.now();
  const r = await A.signup(db, { email: 'a@b.co', password: P }, t0);
  assert.ok(await A.getUser(db, withTok(r.token), t0 + 1000));
  assert.equal(await A.getUser(db, withTok(r.token), t0 + 31 * 86400000), null);
  const row = await db.prepare('SELECT COUNT(*) c FROM auth_sessions').first();
  assert.equal(row.c, 0);
});

test('logout removes session', async () => {
  const db = fresh();
  const r = await A.signup(db, { email: 'a@b.co', password: P });
  await A.logout(db, withTok(r.token));
  assert.equal(await A.getUser(db, withTok(r.token)), null);
});

test('changePassword', async () => {
  const db = fresh();
  const r = await A.signup(db, { email: 'a@b.co', password: P });
  assert.deepEqual(await A.changePassword(db, r.user.id, P, 'newpass123'), { ok: 1 });
  assert.equal((await A.login(db, { email: 'a@b.co', password: P })).error, 'invalid');
  assert.ok((await A.login(db, { email: 'a@b.co', password: 'newpass123' })).token);
  assert.ok((await A.changePassword(db, r.user.id, 'bad', 'newpass456')).error);
});

test('deleteAccount leaves other users', async () => {
  const db = fresh();
  const a = await A.signup(db, { email: 'a@b.co', password: P });
  const b = await A.signup(db, { email: 'b@b.co', password: P });
  for (const u of [a.user, b.user]) {
    await db.prepare('INSERT INTO tasks(user_id,title) VALUES(?,?)').bind(u.id, 't').run();
    await db.prepare('INSERT INTO courses(user_id,name) VALUES(?,?)').bind(u.id, 'c').run();
    await db.prepare('INSERT INTO prefs(user_id,k,v) VALUES(?,?,?)').bind(u.id, 'k', 'v').run();
  }
  await A.deleteAccount(db, a.user.id);
  const cnt = async (t, id) => (await db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE user_id=?`).bind(id).first()).c;
  for (const t of ['tasks', 'courses', 'prefs', 'auth_sessions']) {
    assert.equal(await cnt(t, a.user.id), 0);
    assert.equal(await cnt(t, b.user.id), 1);
  }
  assert.equal(await db.prepare('SELECT id FROM users WHERE id=?').bind(a.user.id).first(), null);
  assert.ok(await db.prepare('SELECT id FROM users WHERE id=?').bind(b.user.id).first());
});

test('checkOrigin', () => {
  const o = 'https://app.test';
  const js = 'application/json';
  assert.equal(A.checkOrigin(req('GET')), true);
  assert.equal(A.checkOrigin(req('POST', { origin: o, 'content-type': js })), true);
  assert.equal(A.checkOrigin(req('POST', { origin: 'https://evil.test', 'content-type': js })), false);
  assert.equal(A.checkOrigin(req('POST', { 'content-type': js })), false);
  assert.equal(A.checkOrigin(req('POST', { origin: o, 'content-type': 'text/plain' })), false);
  assert.equal(A.checkOrigin(req('DELETE', { origin: o })), true);
});

test('cookie flags', () => {
  const c = A.sessionCookie('abc');
  for (const s of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) assert.ok(c.includes(s), s);
});
