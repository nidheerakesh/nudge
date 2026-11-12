import { byId, isFree } from '../../public/town/shared/catalog.js';

const DAY_CAP = 240;
const MIN_MINS = 5;
const FED_MS = 2 * 3600 * 1000;
const err = (status, error) => ({ status, error });

export async function balance(db, uid) {
  const v = await db.prepare('SELECT COALESCE(SUM(delta),0) AS b FROM coin_ledger WHERE user_id=?').bind(uid).first('b');
  return Number(v) || 0;
}

export async function awardForSession(db, uid, s) {
  const sid = typeof s === 'object' && s ? s.id : s;
  if (!Number.isInteger(sid)) return 0;
  const sess = await db.prepare('SELECT id FROM sessions WHERE id=? AND user_id=?').bind(sid, uid).first();
  if (!sess) return 0;
  const act = await db.prepare("SELECT verified_secs, date(started/1000,'unixepoch') AS day FROM session_active WHERE session_id=? AND user_id=?").bind(sid, uid).first();
  if (!act) return 0;
  const mins = Math.floor((act.verified_secs || 0) / 60);
  if (mins < MIN_MINS) return 0;
  const day = act.day;
  const used = await db
    .prepare("SELECT COALESCE(SUM(l.delta),0) AS n FROM coin_ledger l JOIN session_active x ON CAST(x.session_id AS TEXT)=l.ref WHERE l.user_id=? AND l.reason='session' AND x.user_id=? AND date(x.started/1000,'unixepoch')=?")
    .bind(uid, uid, day)
    .first('n');
  const amt = Math.min(mins, DAY_CAP, DAY_CAP - (Number(used) || 0));
  if (amt <= 0) return 0;
  const r = await db.prepare("INSERT OR IGNORE INTO coin_ledger(user_id,delta,reason,ref) VALUES(?,?,'session',?)").bind(uid, amt, String(sid)).run();
  return r.meta.changes > 0 ? amt : 0;
}

export async function owns(db, uid, itemId) {
  if (isFree(itemId)) return true;
  const r = await db.prepare('SELECT 1 AS x FROM wardrobe WHERE user_id=? AND item_id=?').bind(uid, itemId).first();
  return !!r;
}

export async function ownedSet(db, uid) {
  const { results } = await db.prepare('SELECT item_id FROM wardrobe WHERE user_id=?').bind(uid).all();
  return new Set(results.map((r) => r.item_id));
}

const SPEND = "INSERT INTO coin_ledger(user_id,delta,reason,ref) SELECT ?,?,'purchase',? WHERE (SELECT COALESCE(SUM(delta),0) FROM coin_ledger WHERE user_id=?)>=?";

export async function buy(db, uid, itemId) {
  const it = byId(itemId);
  if (!it || it.kind === 'food') throw err(400, 'item');
  if (it.price === 0 || (await owns(db, uid, itemId))) throw err(409, 'owned');
  if ((await balance(db, uid)) < it.price) throw err(402, 'coins');
  const res = await db.batch([
    db.prepare(SPEND).bind(uid, -it.price, itemId, uid, it.price),
    db
      .prepare("INSERT INTO wardrobe(user_id,item_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM coin_ledger WHERE user_id=? AND reason='purchase' AND ref=?)")
      .bind(uid, itemId, uid, itemId),
  ]);
  if (!res[0].meta.changes) throw err(402, 'coins');
  return balance(db, uid);
}

export async function buyFood(db, uid, itemId, qty = 1) {
  const it = byId(itemId);
  if (!it || it.kind !== 'food') throw err(400, 'item');
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw err(400, 'qty');
  const cost = it.price * qty;
  if ((await balance(db, uid)) < cost) throw err(402, 'coins');
  const ref = 'food:' + itemId + ':' + crypto.randomUUID();
  const res = await db.batch([
    db.prepare(SPEND).bind(uid, -cost, ref, uid, cost),
    db
      .prepare(
        "INSERT INTO pantry(user_id,item_id,qty) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM coin_ledger WHERE user_id=? AND reason='purchase' AND ref=?) ON CONFLICT(user_id,item_id) DO UPDATE SET qty=qty+excluded.qty",
      )
      .bind(uid, itemId, qty, uid, ref),
  ]);
  if (!res[0].meta.changes) throw err(402, 'coins');
  return balance(db, uid);
}

export async function eat(db, uid, itemId, now) {
  const it = byId(itemId);
  if (!it || it.kind !== 'food') throw err(400, 'item');
  const r = await db.prepare('UPDATE pantry SET qty=qty-1 WHERE user_id=? AND item_id=? AND qty>=1').bind(uid, itemId).run();
  if (!r.meta.changes) throw err(409, 'pantry');
  const until = now + FED_MS;
  await db
    .prepare('INSERT INTO user_status(user_id,fed_until,fed_item) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET fed_until=excluded.fed_until, fed_item=excluded.fed_item')
    .bind(uid, until, itemId)
    .run();
  return until;
}
