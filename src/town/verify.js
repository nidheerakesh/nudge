const MIN = 60000;
const WINDOW = 90000;
const GAP = 10000;
const TAIL = 480;
const err = (status, error) => ({ status, error });
const out = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export const nextCheckDelay = (rand, first) => Math.floor(((first ? 6 : 10) + rand * 6) * MIN);

// rows: lost = active secs in missed intervals; boundary = verified_secs + lost
const bound = (r) => r.verified_secs + (r.lost || 0);
const mkCheck = (due) => ({ due, expires: due + WINDOW });

export function firstCheck(started, plan, rand) {
  if (Number.isInteger(plan) && plan >= 5 && plan <= 12) return mkCheck(started + plan * 30000);
  return mkCheck(started + nextCheckDelay(rand, true));
}

export function applyPing(row, now, paused) {
  const gap = Math.max(0, (now - row.last_ping) / 1000);
  const gain = paused || row.paused ? 0 : Math.floor(Math.min(gap, 90));
  return { ...row, last_ping: now, paused: paused ? 1 : 0, active_secs: row.active_secs + gain };
}

// unanswered check past its window: interval stays unverified, two in a row end paying
export function applyMiss(row, check, now, rand = Math.random) {
  if (!check || check.answered != null || now <= check.expires) return null;
  const lostNow = Math.max(0, row.active_secs - bound(row));
  const misses = row.misses + 1;
  const next = row.ended || misses >= 2 ? null : mkCheck(now + nextCheckDelay(rand, false));
  const r = { ...row, misses, lost: (row.lost || 0) + lostNow, ended: row.ended || misses >= 2 ? 1 : 0 };
  return { row: r, mark: -lostNow, next };
}

function close(row, now, rand) {
  const gain = Math.max(0, row.active_secs - bound(row));
  const r = { ...row, verified_secs: row.verified_secs + gain, last_ok: now, misses: 0 };
  return { row: r, next: row.ended ? null : mkCheck(now + nextCheckDelay(rand, false)) };
}

export function applyCheckin(row, check, now, rand = Math.random) {
  if (!check || check.answered != null) return { ok: false, error: 'done' };
  if (row.ended) return { ok: false, error: 'ended' };
  if (now < check.due) return { ok: false, error: 'early' };
  if (now > check.expires) return { ok: false, error: 'late' };
  return { ok: true, ...close(row, now, rand) };
}

export function applyCredit(row, now, rand = Math.random) {
  if (row.ended) return null;
  return close(row, now, rand);
}

export function finish(row, now, check, rand = Math.random) {
  let r = row;
  const m = applyMiss(r, check, now, rand);
  if (m) r = m.row;
  if (!r.ended && r.misses === 0 && r.verified_secs > 0) {
    const tail = Math.max(0, r.active_secs - bound(r));
    if (tail <= TAIL) r = { ...r, verified_secs: r.verified_secs + tail };
  }
  return { ...r, ended: 1 };
}

async function load(db, uid, sid) {
  return db
    .prepare('SELECT a.*, COALESCE((SELECT -SUM(answered) FROM checkins WHERE session_id=a.session_id AND answered<=0),0) AS lost FROM session_active a WHERE a.session_id=? AND a.user_id=?')
    .bind(sid, uid)
    .first();
}

const pending = (db, sid) => db.prepare('SELECT id, due, expires, answered FROM checkins WHERE session_id=? AND answered IS NULL ORDER BY id DESC LIMIT 1').bind(sid).first();

const save = (db, r) =>
  db
    .prepare('UPDATE session_active SET last_ping=?, active_secs=?, verified_secs=?, last_ok=?, misses=?, paused=?, ended=? WHERE session_id=? AND user_id=?')
    .bind(r.last_ping, r.active_secs, r.verified_secs, r.last_ok, r.misses, r.paused, r.ended, r.session_id, r.user_id)
    .run();

const addCheck = (db, r, c) => db.prepare('INSERT INTO checkins(session_id,user_id,due,expires) VALUES(?,?,?,?)').bind(r.session_id, r.user_id, c.due, c.expires).run();
const mark = (db, id, v) => db.prepare('UPDATE checkins SET answered=? WHERE id=? AND answered IS NULL').bind(v, id).run();

async function settle(db, row, check, now, rand) {
  const m = applyMiss(row, check, now, rand);
  if (!m) return { row, check };
  await mark(db, check.id, m.mark);
  if (m.next) await addCheck(db, m.row, m.next);
  return { row: m.row, check: m.next ? await pending(db, row.session_id) : null };
}

const view = (row, check, now) => ({
  ok: 1,
  active_secs: row.active_secs,
  verified_secs: row.verified_secs,
  ended: row.ended,
  check: check && now >= check.due && now <= check.expires ? { id: check.id, due: check.due, expires: check.expires } : null,
});

async function ping(db, uid, body, now, rand) {
  const sid = body && body.session_id;
  if (!Number.isInteger(sid)) throw err(400, 'session_id');
  const sess = await db.prepare('SELECT id, plan_mins, end_kind FROM sessions WHERE id=? AND user_id=?').bind(sid, uid).first();
  if (!sess) throw err(404, 'not_found');
  if (sess.end_kind !== 'open') throw err(409, 'closed');
  const paused = !!(body && body.paused);
  let row = await load(db, uid, sid);
  if (!row) {
    const c = firstCheck(now, sess.plan_mins, rand);
    await db
      .prepare('INSERT OR IGNORE INTO session_active(session_id,user_id,started,last_ping,last_ok,paused) VALUES(?,?,?,?,?,?)')
      .bind(sid, uid, now, now, now, paused ? 1 : 0)
      .run();
    await addCheck(db, { session_id: sid, user_id: uid }, c);
    row = await load(db, uid, sid);
    return view(row, await pending(db, sid), now);
  }
  let check = await pending(db, sid);
  if (now - row.last_ping < GAP) return view(row, check, now);
  row = applyPing(row, now, paused);
  ({ row, check } = await settle(db, row, check, now, rand));
  await save(db, row);
  return view(row, check, now);
}

async function checkin(db, uid, body, now, rand) {
  const id = body && body.id;
  if (!Number.isInteger(id)) throw err(400, 'id');
  const check = await db.prepare('SELECT id, session_id, due, expires, answered FROM checkins WHERE id=? AND user_id=?').bind(id, uid).first();
  if (!check) throw err(404, 'not_found');
  const row = await load(db, uid, check.session_id);
  if (!row) throw err(404, 'not_found');
  const r = applyCheckin(row, check, now, rand);
  if (!r.ok) throw err(r.error === 'done' ? 409 : 400, r.error);
  const m = await mark(db, id, now);
  if (!m.meta.changes) throw err(409, 'done');
  await save(db, r.row);
  if (r.next) await addCheck(db, r.row, r.next);
  return view(r.row, null, now);
}

export async function verifyRoute(req, env, user, url, body) {
  const p = url.pathname;
  if (req.method !== 'POST' || (p !== '/api/focus/ping' && p !== '/api/focus/checkin')) return null;
  if (body === undefined) {
    try {
      body = await req.json();
    } catch {
      throw err(400, 'json');
    }
  }
  const now = Date.now();
  return out(await (p === '/api/focus/ping' ? ping : checkin)(env.DB, user.id, body || {}, now, Math.random()));
}

export async function creditCard(db, uid, now, rand = Math.random()) {
  const open = await db
    .prepare("SELECT a.session_id FROM session_active a JOIN sessions s ON s.id=a.session_id WHERE a.user_id=? AND a.ended=0 AND s.end_kind='open' ORDER BY a.session_id DESC LIMIT 1")
    .bind(uid)
    .first();
  if (!open) return false;
  let row = await load(db, uid, open.session_id);
  let check = await pending(db, row.session_id);
  ({ row, check } = await settle(db, row, check, now, rand));
  const r = applyCredit(row, now, rand);
  if (!r) return false;
  if (check) await mark(db, check.id, now);
  await save(db, r.row);
  if (r.next) await addCheck(db, r.row, r.next);
  return true;
}

export async function finishSession(db, uid, sid, now, rand = Math.random()) {
  let row = await load(db, uid, sid);
  if (!row) return 0;
  let check = await pending(db, sid);
  if (row.ended && !check) return row.verified_secs;
  const m = applyMiss(row, check, now, rand);
  if (m) await mark(db, check.id, m.mark);
  const r = finish(row, now, check, rand);
  await save(db, r);
  return r.verified_secs;
}
