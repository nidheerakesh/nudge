const ITER = 100000;
const DAY = 86400000;
const enc = new TextEncoder();
const TABLES = ['courses', 'assessments', 'topics', 'assess_topics', 'cards', 'tasks', 'blocks', 'sessions', 'habits', 'hlog', 'notes', 'prefs', 'timer', 'auth_sessions'];

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function derive(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const out = await derive(pw, salt);
  return { hash: b64(out), salt: b64(salt) };
}

export async function verifyPassword(pw, hash, salt) {
  const got = await derive(pw, unb64(salt));
  const want = unb64(hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] || 0);
  return diff === 0;
}

export async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(buf)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export function newToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function sessionCookie(token) {
  return `nudge_s=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

export function clearCookie() {
  return 'nudge_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export function readToken(request) {
  const c = request.headers.get('cookie') || '';
  for (const p of c.split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === 'nudge_s') return p.slice(i + 1).trim() || null;
  }
  return null;
}

export function checkOrigin(request) {
  const m = request.method.toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (request.headers.get('origin') !== new URL(request.url).origin) return false;
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
    return (request.headers.get('content-type') || '').toLowerCase().startsWith('application/json');
  }
  return true;
}

export async function createSession(db, userId, now = Date.now()) {
  const token = newToken();
  const th = await sha256hex(token);
  await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(th, userId, now + 30 * DAY).run();
  return token;
}

const okPw = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;

export async function signup(db, { email, password, name } = {}, now = Date.now()) {
  const em = String(email || '').trim().toLowerCase();
  if (em.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return { error: 'invalid_email' };
  if (!okPw(password)) return { error: 'weak_password' };
  const dup = await db.prepare('SELECT id FROM users WHERE email=?').bind(em).first();
  if (dup) return { error: 'exists' };
  const { hash, salt } = await hashPassword(password);
  const nm = name ? String(name).trim().slice(0, 100) : null;
  let res;
  try {
    res = await db.prepare('INSERT INTO users(email,name,pw_hash,salt) VALUES(?,?,?,?)').bind(em, nm, hash, salt).run();
  } catch {
    return { error: 'exists' };
  }
  const user = { id: res.meta.last_row_id, email: em, name: nm };
  const token = await createSession(db, user.id, now);
  return { user, token };
}

export async function login(db, { email, password } = {}, now = Date.now()) {
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');
  const lim = await db.prepare('SELECT n, until FROM login_fail WHERE email=?').bind(em).first();
  if (lim && lim.until > now) return { error: 'locked', retry: Math.ceil((lim.until - now) / 1000) };
  const row = await db.prepare('SELECT id, email, name, pw_hash, salt FROM users WHERE email=?').bind(em).first();
  let ok;
  if (row) ok = await verifyPassword(pw, row.pw_hash, row.salt);
  else {
    await derive(pw, new Uint8Array(16));
    ok = false;
  }
  if (!ok) {
    let n = (lim ? lim.n : 0) + 1;
    let until = 0;
    if (n >= 5) {
      until = now + 15 * 60 * 1000;
      n = 0;
    }
    await db.prepare('INSERT INTO login_fail(email,n,until) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET n=excluded.n, until=excluded.until').bind(em, n, until).run();
    return { error: 'invalid' };
  }
  await db.prepare('DELETE FROM login_fail WHERE email=?').bind(em).run();
  const token = await createSession(db, row.id, now);
  return { user: { id: row.id, email: row.email, name: row.name }, token };
}

export async function getUser(db, request, now = Date.now()) {
  const token = readToken(request);
  if (!token) return null;
  const th = await sha256hex(token);
  const row = await db.prepare('SELECT u.id, u.email, u.name, s.expires FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').bind(th).first();
  if (!row) return null;
  if (row.expires <= now) {
    await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(th).run();
    return null;
  }
  return { id: row.id, email: row.email, name: row.name };
}

export async function logout(db, request) {
  const token = readToken(request);
  if (!token) return;
  await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await sha256hex(token)).run();
}

export async function changePassword(db, userId, oldPw, newPw) {
  const row = await db.prepare('SELECT pw_hash, salt FROM users WHERE id=?').bind(userId).first();
  if (!row) return { error: 'invalid' };
  if (!(await verifyPassword(String(oldPw || ''), row.pw_hash, row.salt))) return { error: 'invalid' };
  if (!okPw(newPw)) return { error: 'weak_password' };
  const { hash, salt } = await hashPassword(newPw);
  await db.prepare('UPDATE users SET pw_hash=?, salt=? WHERE id=?').bind(hash, salt, userId).run();
  return { ok: 1 };
}

export async function deleteAccount(db, userId) {
  const st = TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(userId));
  st.push(db.prepare('DELETE FROM users WHERE id=?').bind(userId));
  await db.batch(st);
}
