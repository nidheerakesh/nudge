const look = (a) => ({ skin: a.skin, hair: a.hair, hair_color: a.hair_color, outfit: a.outfit, accessory: a.accessory });
const fail = (status, error) => ({ status, error });

export const ONLINE_MS = 150000;
const ST = ['focus', 'break', 'idle'];
const KIND = ['house', 'room'];
const REF = /^[a-z0-9:_-]{1,40}$/;
const CAP = 200;
const sec = (now) => Math.floor(now / 1000);

const pid = (v) => {
  const n = /^\d{1,15}$/.test(String(v)) ? Number(v) : 0;
  if (n < 1) throw fail(400, 'user');
  return n;
};

async function who(db, id) {
  const av = (await db.prepare('SELECT skin, hair, hair_color, outfit, accessory, name FROM avatar WHERE user_id=?').bind(id).first()) || {};
  const un = await db.prepare('SELECT name FROM users WHERE id=?').bind(id).first('name');
  return { name: av.name || un || 'Student', look: look(av) };
}

async function blocked(db, a, b) {
  const r = await db.prepare('SELECT 1 AS x FROM user_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)').bind(a, b, b, a).first();
  return !!r;
}

async function blockSet(db, uid) {
  const rows = (await db.prepare('SELECT blocker, blocked FROM user_blocks WHERE blocker=? OR blocked=?').bind(uid, uid).all()).results;
  return new Set(rows.map((r) => (r.blocker === uid ? r.blocked : r.blocker)));
}

async function friendRow(db, o, now) {
  const w = await who(db, o);
  const pr = await db.prepare('SELECT seen, st, district FROM presence WHERE user_id=?').bind(o).first();
  const on = !!pr && pr.seen > now - ONLINE_MS;
  return { id: o, ...w, online: on, st: on ? pr.st : 'off', district: on ? pr.district : null };
}

async function listFriends(db, uid, now) {
  const bl = await blockSet(db, uid);
  const rows = (await db.prepare('SELECT a, b, status FROM friends WHERE a=? OR b=?').bind(uid, uid).all()).results;
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const o = r.a === uid ? r.b : r.a;
    if (bl.has(o)) continue;
    if (r.status === 'ok') out.friends.push(await friendRow(db, o, now));
    else if (r.b === uid) out.incoming.push({ id: o, ...(await who(db, o)) });
    else out.outgoing.push({ id: o, name: (await who(db, o)).name });
  }
  out.friends.sort((x, y) => (y.online - x.online) || x.name.localeCompare(y.name));
  return out;
}

async function addFriend(db, uid, body, now) {
  const t = pid(body && body.id);
  if (t === uid) throw fail(400, 'self');
  if (!(await db.prepare('SELECT 1 AS x FROM avatar WHERE user_id=?').bind(t).first())) throw fail(404, 'user');
  if (await blocked(db, uid, t)) throw fail(403, 'blocked');
  const cnt = await db.prepare('SELECT COUNT(*) AS n FROM friends WHERE a=? OR b=?').bind(uid, uid).first('n');
  if (cnt >= CAP) throw fail(409, 'limit');
  const rows = (await db.prepare('SELECT a, status FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(uid, t, t, uid).all()).results;
  const inc = rows.find((r) => r.a === t);
  if (inc && inc.status === 'pending') {
    await db.prepare("UPDATE friends SET status='ok' WHERE a=? AND b=?").bind(t, uid).run();
    return { ok: 1, status: 'ok' };
  }
  if (rows.length) return { ok: 1, status: rows[0].status };
  await db.prepare("INSERT INTO friends(a,b,status,created) VALUES(?,?,'pending',datetime(?,'unixepoch'))").bind(uid, t, sec(now)).run();
  return { ok: 1, status: 'pending' };
}

async function accept(db, uid, from) {
  const r = await db.prepare("UPDATE friends SET status='ok' WHERE a=? AND b=? AND status='pending'").bind(from, uid).run();
  if (!r.meta.changes) throw fail(404, 'request');
  return { ok: 1 };
}

async function unfriend(db, uid, id) {
  await db.prepare('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(uid, id, id, uid).run();
  return { ok: 1 };
}

async function presence(db, uid, body, now) {
  const st = ST.includes(body && body.st) ? body.st : 'idle';
  const d = body && body.district;
  const district = Number.isSafeInteger(d) && d >= 0 ? d : null;
  await db.prepare('INSERT INTO presence(user_id,seen,st,district) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET seen=excluded.seen, st=excluded.st, district=excluded.district').bind(uid, now, st, district).run();
  return { ok: 1 };
}

async function getInvites(db, uid, now) {
  const rows = (await db.prepare("SELECT id, from_id, kind, ref FROM invites WHERE to_id=? AND seen=0 AND created >= datetime(?, 'unixepoch') AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker=? AND blocked=invites.from_id) OR (blocker=invites.from_id AND blocked=?)) ORDER BY id DESC LIMIT 10").bind(uid, sec(now) - 600, uid, uid).all()).results;
  const out = [];
  for (const r of rows) out.push({ id: r.id, from: { id: r.from_id, name: (await who(db, r.from_id)).name }, kind: r.kind, ref: r.ref });
  return { invites: out };
}

async function sendInvite(db, uid, body, now) {
  const b = body || {};
  if (!KIND.includes(b.kind)) throw fail(400, 'kind');
  if (typeof b.ref !== 'string' || !REF.test(b.ref)) throw fail(400, 'ref');
  const t = pid(b.to);
  const f = await db.prepare("SELECT 1 AS x FROM friends WHERE status='ok' AND ((a=? AND b=?) OR (a=? AND b=?))").bind(uid, t, t, uid).first();
  if (!f) throw fail(403, 'friend');
  const cnt = await db.prepare("SELECT COUNT(*) AS n FROM invites WHERE from_id=? AND created >= datetime(?, 'unixepoch')").bind(uid, sec(now) - 60).first('n');
  if (cnt >= 10) throw fail(429, 'rate');
  await db.prepare("INSERT INTO invites(from_id,to_id,kind,ref,created) VALUES(?,?,?,?,datetime(?,'unixepoch'))").bind(uid, t, b.kind, b.ref, sec(now)).run();
  return { ok: 1 };
}

async function seen(db, uid, id) {
  await db.prepare('UPDATE invites SET seen=1 WHERE id=? AND to_id=?').bind(id, uid).run();
  return { ok: 1 };
}

function friendsRoute(db, uid, p, m, body, now) {
  if (p.length === 1 && m === 'GET') return listFriends(db, uid, now);
  if (p.length === 1 && m === 'POST') return addFriend(db, uid, body, now);
  if (p.length === 2 && m === 'DELETE') return unfriend(db, uid, pid(p[1]));
  if (p.length === 3 && p[2] === 'accept' && m === 'POST') return accept(db, uid, pid(p[1]));
  return null;
}

function invitesRoute(db, uid, p, m, body, now) {
  if (p.length === 1 && m === 'GET') return getInvites(db, uid, now);
  if (p.length === 1 && m === 'POST') return sendInvite(db, uid, body, now);
  if (p.length === 3 && p[2] === 'seen' && m === 'POST') return seen(db, uid, pid(p[1]));
  return null;
}

export async function social(db, uid, p, m, body, now = Date.now()) {
  if (p[0] === 'friends') return friendsRoute(db, uid, p, m, body, now);
  if (p[0] === 'presence' && p.length === 1 && m === 'POST') return presence(db, uid, body, now);
  if (p[0] === 'invites') return invitesRoute(db, uid, p, m, body, now);
  return null;
}

export async function chatMuted(db, uid) {
  const n = await db.prepare("SELECT COUNT(DISTINCT reporter) AS n FROM reports WHERE target=? AND created >= datetime('now','-1 day')").bind(uid).first('n');
  return n >= 3;
}
