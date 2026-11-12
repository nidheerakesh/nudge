import { awardForSession } from './town/coins.js';
import { finishSession, creditCard } from './town/verify.js';

export const TABLES = {
  courses: ['name', 'code', 'color', 'archived'],
  assessments: ['course_id', 'kind', 'title', 'date', 'time'],
  topics: ['course_id', 'title', 'status', 'mins', 'sort'],
  assess_topics: ['assessment_id', 'topic_id'],
  cards: ['topic_id', 'front', 'back', 'due', 'ivl', 'ease', 'reps'],
  tasks: ['title', 'notes', 'course_id', 'topic_id', 'due', 'est', 'priority', 'done_at', 'created'],
  blocks: ['day', 'start', 'mins', 'kind', 'task_id', 'title', 'done'],
  sessions: ['task_id', 'start_at', 'plan_mins', 'act_mins', 'pauses', 'end_kind', 'rating'],
  habits: ['name', 'per_week', 'archived'],
  hlog: ['habit_id', 'day'],
  notes: ['course_id', 'title', 'body', 'pinned', 'updated'],
};

export const REFS = { course_id: 'courses', topic_id: 'topics', task_id: 'tasks', assessment_id: 'assessments', habit_id: 'habits' };

const err = (status, error) => ({ status, error });
const strip = (row) => {
  if (row) delete row.user_id;
  return row;
};

function clean(table, body) {
  if (!Object.hasOwn(TABLES, table)) throw err(404, 'table');
  const cols = TABLES[table];
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw err(400, 'body');
  const keys = Object.keys(body);
  for (const k of keys) if (!cols.includes(k)) throw err(400, 'column');
  const out = {};
  for (const k of keys) {
    let v = body[k];
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (v !== null && typeof v !== 'string' && typeof v !== 'number') throw err(400, 'value');
    out[k] = v;
  }
  return out;
}

async function checkRefs(db, uid, obj) {
  for (const k of Object.keys(obj)) {
    const t = REFS[k];
    if (!t || obj[k] === null) continue;
    const ok = await db.prepare(`SELECT 1 AS x FROM ${t} WHERE id=? AND user_id=?`).bind(obj[k], uid).first();
    if (!ok) throw err(400, 'ref');
  }
}

export async function insert(db, uid, table, body) {
  const list = Array.isArray(body) ? body : [body];
  if (list.length < 1 || list.length > 200) throw err(400, 'count');
  const objs = list.map((b) => clean(table, b));
  for (const o of objs) await checkRefs(db, uid, o);
  const rows = [];
  for (const o of objs) {
    const keys = Object.keys(o);
    const cols = ['user_id', ...keys].join(',');
    const qs = new Array(keys.length + 1).fill('?').join(',');
    const res = await db.prepare(`INSERT INTO ${table}(${cols}) VALUES(${qs}) RETURNING *`).bind(uid, ...keys.map((k) => o[k])).all();
    rows.push(strip(res.results[0]));
  }
  return rows;
}

export async function patch(db, uid, table, id, body) {
  const o = clean(table, body);
  const keys = Object.keys(o);
  if (!keys.length) throw err(400, 'column');
  await checkRefs(db, uid, o);
  if (table === 'sessions' && ('act_mins' in o || 'end_kind' in o || 'pauses' in o)) {
    const cur = await db.prepare('SELECT end_kind FROM sessions WHERE id=? AND user_id=?').bind(id, uid).first();
    if (cur && cur.end_kind !== 'open') throw err(409, 'closed');
  }
  const sets = keys.map((k) => `${k}=?`);
  if (table === 'notes' && !keys.includes('updated')) sets.push("updated=datetime('now')");
  const res = await db.prepare(`UPDATE ${table} SET ${sets.join(',')} WHERE id=? AND user_id=? RETURNING *`).bind(...keys.map((k) => o[k]), id, uid).all();
  if (!res.results.length) throw err(404, 'not_found');
  if (table === 'sessions' && (o.end_kind === 'done' || o.end_kind === 'stopped')) {
    try {
      await finishSession(db, uid, id, Date.now());
      await awardForSession(db, uid, id);
    } catch (e) {
      console.error('award', e && e.message);
    }
  }
  if (table === 'cards' && 'reps' in o) await creditCard(db, uid, Date.now()).catch(() => {});
  return strip(res.results[0]);
}

export async function remove(db, uid, table, id) {
  if (!Object.hasOwn(TABLES, table)) throw err(404, 'table');
  const own = await db.prepare(`SELECT 1 AS x FROM ${table} WHERE id=? AND user_id=?`).bind(id, uid).first();
  if (!own) throw err(404, 'not_found');
  const q = (sql, ...a) => db.prepare(sql).bind(...a);
  let st = [];
  if (table === 'courses') {
    const ass = 'SELECT id FROM assessments WHERE course_id=? AND user_id=?';
    const top = 'SELECT id FROM topics WHERE course_id=? AND user_id=?';
    st = [
      q(`DELETE FROM assess_topics WHERE user_id=? AND (assessment_id IN (${ass}) OR topic_id IN (${top}))`, uid, id, uid, id, uid),
      q(`DELETE FROM cards WHERE user_id=? AND topic_id IN (${top})`, uid, id, uid),
      q(`UPDATE tasks SET topic_id=NULL WHERE user_id=? AND topic_id IN (${top})`, uid, id, uid),
      q('DELETE FROM assessments WHERE course_id=? AND user_id=?', id, uid),
      q('DELETE FROM topics WHERE course_id=? AND user_id=?', id, uid),
      q('UPDATE tasks SET course_id=NULL WHERE course_id=? AND user_id=?', id, uid),
      q('UPDATE notes SET course_id=NULL WHERE course_id=? AND user_id=?', id, uid),
    ];
  } else if (table === 'topics') {
    st = [
      q('DELETE FROM cards WHERE topic_id=? AND user_id=?', id, uid),
      q('DELETE FROM assess_topics WHERE topic_id=? AND user_id=?', id, uid),
      q('UPDATE tasks SET topic_id=NULL WHERE topic_id=? AND user_id=?', id, uid),
    ];
  } else if (table === 'assessments') {
    st = [q('DELETE FROM assess_topics WHERE assessment_id=? AND user_id=?', id, uid)];
  } else if (table === 'tasks') {
    st = [
      q('DELETE FROM blocks WHERE task_id=? AND user_id=?', id, uid),
      q('UPDATE sessions SET task_id=NULL WHERE task_id=? AND user_id=?', id, uid),
    ];
  } else if (table === 'habits') {
    st = [q('DELETE FROM hlog WHERE habit_id=? AND user_id=?', id, uid)];
  }
  st.push(q(`DELETE FROM ${table} WHERE id=? AND user_id=?`, id, uid));
  await db.batch(st);
}

const LIM = {
  sessions: " AND start_at >= date('now','-120 day')",
  hlog: " AND day >= date('now','-120 day')",
};

async function prefsOf(db, uid) {
  const res = await db.prepare('SELECT k, v FROM prefs WHERE user_id=?').bind(uid).all();
  const out = {};
  for (const r of res.results) out[r.k] = r.v;
  return out;
}

async function dump(db, uid, limited) {
  const out = {};
  for (const t of Object.keys(TABLES)) {
    const lim = limited ? LIM[t] || '' : '';
    const res = await db.prepare(`SELECT * FROM ${t} WHERE user_id=?${lim} ORDER BY id`).bind(uid).all();
    out[t] = res.results.map(strip);
  }
  return out;
}

export async function all(db, uid) {
  const user = await db.prepare('SELECT id, email, name FROM users WHERE id=?').bind(uid).first();
  return { user, prefs: await prefsOf(db, uid), ...(await dump(db, uid, true)) };
}

export async function exportAll(db, uid) {
  return { prefs: await prefsOf(db, uid), ...(await dump(db, uid, false)) };
}

export async function setPrefs(db, uid, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw err(400, 'body');
  const ents = Object.entries(obj);
  const st = [];
  for (const [k, v] of ents) {
    if (!/^[a-z_]{1,32}$/.test(k)) throw err(400, 'key');
    const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
    if (s.length > 4000) throw err(400, 'value');
    st.push(db.prepare('INSERT INTO prefs(user_id,k,v) VALUES(?,?,?) ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v').bind(uid, k, s));
  }
  if (st.length) await db.batch(st);
}

export async function getTimer(db, uid) {
  const row = await db.prepare('SELECT data FROM timer WHERE user_id=?').bind(uid).first();
  return row ? JSON.parse(row.data) : null;
}

export async function putTimer(db, uid, data, prev) {
  const stored = await getTimer(db, uid);
  const cur = stored ? stored.session_id : undefined;
  const p = prev === undefined ? null : prev;
  if (data === null || data === undefined) {
    if (cur !== undefined && p !== cur) return { error: 'stale', data: stored };
    await db.prepare('DELETE FROM timer WHERE user_id=?').bind(uid).run();
    return null;
  }
  if (typeof data !== 'object' || Array.isArray(data)) throw err(400, 'body');
  if (cur !== undefined && cur !== data.session_id && p !== cur) return { error: 'busy', data: stored };
  const s = JSON.stringify(data);
  if (s.length > 4000) throw err(400, 'value');
  await db.prepare('INSERT INTO timer(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').bind(uid, s).run();
  return null;
}
