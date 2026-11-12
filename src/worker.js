import { checkOrigin, signup, login, logout, getUser, changePassword, deleteAccount, verifyPassword, sessionCookie, clearCookie } from './auth.js';
import { insert, patch, remove, all, exportAll, setPrefs, getTimer, putTimer } from './db.js';
import { ask } from './coach.js';
import { townRoute } from './town/api.js';
import { verifyRoute } from './town/verify.js';

export { DistrictDO } from './town/district.js';
export { HouseDO } from './town/house.js';

const MAXBODY = 256 * 1024;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
  });
}

const fail = (status, error) => ({ status, error });

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAXBODY) throw fail(413, 'too_big');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw fail(400, 'json');
  }
}

const AUTHERR = { invalid_email: 400, weak_password: 400, exists: 409 };

async function authRoute(env, request, path, body) {
  if (path === '/api/auth/signup') {
    const res = await signup(env.DB, body || {});
    if (res.error) return json({ error: res.error }, AUTHERR[res.error] || 400);
    return json({ user: res.user }, 200, { 'set-cookie': sessionCookie(res.token) });
  }
  const res = await login(env.DB, body || {});
  if (res.error === 'locked') return json({ error: 'locked', retry: res.retry }, 429);
  if (res.error) return json({ error: 'invalid' }, 401);
  return json({ user: res.user }, 200, { 'set-cookie': sessionCookie(res.token) });
}

function todayOf(request) {
  const h = request.headers.get('x-today') || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : new Date().toISOString().slice(0, 10);
}

async function coach(env, request, u, body) {
  const ms = body && body.messages;
  if (!Array.isArray(ms) || !ms.length || ms.length > 20) throw fail(400, 'messages');
  for (const m of ms) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length > 2000) throw fail(400, 'messages');
  }
  const msgs = ms.map((m) => ({ role: m.role, content: m.content }));
  const data = await all(env.DB, u.id);
  try {
    return json(await ask(env, data, msgs, todayOf(request)));
  } catch (e) {
    console.error('ai', e && e.message);
    throw fail(502, 'ai');
  }
}

async function route(env, request, u, path, body) {
  const m = request.method;
  const parts = path.split('/').slice(2);
  const [a, b] = parts;
  if (path === '/api/me' && m === 'GET') return json({ user: u });
  if (path === '/api/auth/logout' && m === 'POST') {
    await logout(env.DB, request);
    return json({ ok: 1 }, 200, { 'set-cookie': clearCookie() });
  }
  if (path === '/api/auth/password' && m === 'POST') {
    const res = await changePassword(env.DB, u.id, body && body.old, body && body.new);
    return res.error ? json({ error: res.error }, 400) : json(res);
  }
  if (path === '/api/auth/delete' && m === 'POST') {
    const row = await env.DB.prepare('SELECT pw_hash, salt FROM users WHERE id=?').bind(u.id).first();
    const pw = String((body && body.password) || '');
    if (!row || !(await verifyPassword(pw, row.pw_hash, row.salt))) return json({ error: 'invalid' }, 400);
    await deleteAccount(env.DB, u.id);
    return json({ ok: 1 }, 200, { 'set-cookie': clearCookie() });
  }
  if (path === '/api/all' && m === 'GET') return json(await all(env.DB, u.id));
  if (path === '/api/export' && m === 'GET') {
    return json(await exportAll(env.DB, u.id), 200, { 'content-disposition': 'attachment; filename="nudge-export.json"' });
  }
  if (path === '/api/prefs' && m === 'PUT') {
    await setPrefs(env.DB, u.id, body);
    return json({ ok: 1 });
  }
  if (path === '/api/timer') {
    if (m === 'GET') return json({ data: await getTimer(env.DB, u.id) });
    if (m === 'PUT') {
      const bad = await putTimer(env.DB, u.id, body ? body.data : null, body ? body.prev : null);
      if (bad) return json(bad, 409);
      return json({ ok: 1 });
    }
  }
  if (path === '/api/coach' && m === 'POST') return coach(env, request, u, body);
  if (path.startsWith('/api/focus/')) { const vr = await verifyRoute(request, env, u, new URL(request.url), body); if (vr) return vr; }
  const tr = await townRoute(env, request, u, path, body);
  if (tr) return tr;
  if (parts.length === 1 && m === 'POST') return json({ rows: await insert(env.DB, u.id, a, body) });
  if (parts.length === 2 && /^\d+$/.test(b)) {
    const id = Number(b);
    if (m === 'PATCH') return json({ row: await patch(env.DB, u.id, a, id, body) });
    if (m === 'DELETE') {
      await remove(env.DB, u.id, a, id);
      return json({ ok: 1 });
    }
  }
  throw fail(404, 'not_found');
}

async function handle(request, env) {
  const path = new URL(request.url).pathname;
  if (!checkOrigin(request)) return json({ error: 'bad_origin' }, 403);
  const m = request.method;
  const body = m === 'POST' || m === 'PUT' || m === 'PATCH' ? await readBody(request) : null;
  if (m === 'POST' && (path === '/api/auth/signup' || path === '/api/auth/login')) return authRoute(env, request, path, body);
  const u = await getUser(env.DB, request);
  if (!u) return json({ error: 'auth' }, 401);
  return route(env, request, u, path, body);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path !== '/api' && !path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handle(request, env);
    } catch (e) {
      if (e && e.status && e.error) return json({ error: e.error }, e.status);
      if (e && /constraint/i.test(String(e.message))) return json({ error: 'invalid' }, 400);
      console.error('server', e && e.message);
      return json({ error: 'server' }, 500);
    }
  },
};
