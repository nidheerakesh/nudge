import { byId, SKIN, HAIR_STYLES, HAIR_COLORS } from '../../public/town/shared/catalog.js';
import { nextSlot, plotWorld, PLOTS } from '../../public/town/shared/plots.js';
import { RPLOTS } from '../../public/town/shared/layout.js';
import { balance, buy, buyFood, eat, owns, ownedSet } from './coins.js';
import { searchPlaces, ensurePlace, districtFor, freeSlot, districtInfo } from './places.js';
import { social, chatMuted } from './social.js';

const SIZES = { 'house:hut': [6, 5], 'house:small': [8, 6], 'house:medium': [10, 7], 'house:large': [12, 8], 'house:manor': [14, 9] };
const MAXITEMS = 40;
const STYLE = { size: 'house', roof: 'roof', wall: 'wall', door: 'door', floor: 'floor', wallpaper: 'wallpaper' };
const MODES = ['knock', 'open', 'closed'];
const REASONS = ['spam', 'abuse', 'name', 'other'];
const CTRL = /[\u0000-\u001f\u007f-\u009f]/g;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const fail = (status, error) => ({ status, error });
const isInt = (v) => Number.isInteger(v);
const uid_ = (s) => (/^\d{1,12}$/.test(String(s)) ? Number(s) : null);

function name(v) {
  if (typeof v !== 'string') throw fail(400, 'name');
  const s = v.replace(CTRL, '').trim();
  if (s.length < 1 || s.length > 24) throw fail(400, 'name');
  return s;
}

const HIDDEN = "NOT EXISTS(SELECT 1 FROM prefs WHERE user_id=%U AND k='show_in_town' AND v='0')";
const visible = (col) => HIDDEN.replace('%U', col);

async function pref(db, uid, k) {
  const r = await db.prepare('SELECT v FROM prefs WHERE user_id=? AND k=?').bind(uid, k).first();
  return r ? r.v : null;
}

async function blocked(db, a, b) {
  const r = await db.prepare('SELECT 1 AS x FROM user_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)').bind(a, b, b, a).first();
  return !!r;
}

async function joined(db, uid) {
  return db.prepare('SELECT p.district, p.slot, p.id FROM town_plots p WHERE p.user_id=?').bind(uid).first();
}

async function needJoin(db, uid) {
  const p = await joined(db, uid);
  if (!p) throw fail(409, 'join');
  return p;
}

const look = (a) => ({ skin: a.skin, hair: a.hair, hair_color: a.hair_color, outfit: a.outfit, accessory: a.accessory });
const HOUSE_LOOK = (h) => ({ size: h.size, roof: h.roof, wall: h.wall, door: h.door });

async function join(db, uid, uname) {
  let p = await joined(db, uid);
  for (let i = 0; i < 3 && !p; i++) {
    const { results } = await db.prepare('SELECT district, slot FROM town_plots WHERE user_id IS NOT NULL').all();
    const taken = new Set(results.map((r) => r.district + ':' + r.slot));
    const dd = (await db.prepare('SELECT n FROM districts').all()).results;
    for (const r of dd) for (let s = 0; s < PLOTS; s++) taken.add(r.n + ':' + s);
    const { district, slot } = nextSlot(taken);
    try {
      const up = await db.prepare('UPDATE town_plots SET user_id=? WHERE district=? AND slot=? AND user_id IS NULL').bind(uid, district, slot).run();
      if (!up.meta.changes) {
        await db
          .prepare('INSERT INTO town_plots(district,slot,user_id) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM town_plots WHERE district=? AND slot=?)')
          .bind(district, slot, uid, district, slot)
          .run();
      }
    } catch (e) {
      if (!/unique|constraint/i.test(String(e && e.message))) throw e;
    }
    p = await joined(db, uid);
  }
  if (!p) throw fail(503, 'busy');
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO houses(user_id,plot_id,size) VALUES(?,?,'house:medium')").bind(uid, p.id),
    db.prepare('INSERT OR IGNORE INTO avatar(user_id,name) VALUES(?,?)').bind(uid, uname ? String(uname).replace(CTRL, '').trim().slice(0, 24) || null : null),
  ]);
  return p;
}

async function items(db, uid) {
  const { results } = await db.prepare('SELECT item_id, x, y, flip FROM house_items WHERE user_id=? ORDER BY id').bind(uid).all();
  return results;
}

async function me(db, uid) {
  const p = await joined(db, uid);
  const av = await db.prepare('SELECT skin, hair, hair_color, outfit, accessory, name FROM avatar WHERE user_id=?').bind(uid).first();
  const h = await db.prepare('SELECT name, size, roof, wall, door, floor, wallpaper, door_mode FROM houses WHERE user_id=?').bind(uid).first();
  const pan = await db.prepare('SELECT item_id, qty FROM pantry WHERE user_id=? AND qty>0').bind(uid).all();
  const st = await db.prepare('SELECT fed_until FROM user_status WHERE user_id=?').bind(uid).first();
  const bl = await db.prepare('SELECT blocked FROM user_blocks WHERE blocker=?').bind(uid).all();
  const pantry = {};
  for (const r of pan.results) pantry[r.item_id] = r.qty;
  return {
    joined: !!p,
    avatar: av,
    balance: await balance(db, uid),
    wardrobe: [...(await ownedSet(db, uid))],
    pantry,
    fed_until: st ? st.fed_until : 0,
    house: h ? { ...h, items: await items(db, uid) } : null,
    plot: p ? { district: p.district, slot: p.slot, world: plotWorld(p.district, p.slot) } : null,
    blocked: bl.results.map((r) => r.blocked),
    share_stats: (await pref(db, uid, 'share_stats')) === '1',
    share_subject: (await pref(db, uid, 'share_subject')) === '1',
  };
}

async function putAvatar(db, uid, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'body');
  const cur = await db.prepare('SELECT skin, hair, hair_color, outfit, accessory, name FROM avatar WHERE user_id=?').bind(uid).first();
  if (!cur) throw fail(409, 'join');
  const n = { ...cur };
  const rng = (k, mx) => {
    if (!(k in body)) return;
    if (!isInt(body[k]) || body[k] < 1 || body[k] > mx) throw fail(400, k);
    n[k] = body[k];
  };
  rng('skin', SKIN);
  rng('hair', HAIR_STYLES);
  rng('hair_color', HAIR_COLORS);
  if ('outfit' in body) {
    const it = byId(body.outfit);
    if (!it || it.kind !== 'outfit') throw fail(400, 'outfit');
    if (!(await owns(db, uid, it.id))) throw fail(403, 'not_owned');
    n.outfit = it.id;
  }
  if ('accessory' in body) {
    if (body.accessory === null) n.accessory = null;
    else {
      const it = byId(body.accessory);
      if (!it || it.kind !== 'acc') throw fail(400, 'accessory');
      if (!(await owns(db, uid, it.id))) throw fail(403, 'not_owned');
      n.accessory = it.id;
    }
  }
  if ('name' in body) n.name = body.name === null ? null : name(body.name);
  await db
    .prepare('UPDATE avatar SET skin=?, hair=?, hair_color=?, outfit=?, accessory=?, name=? WHERE user_id=?')
    .bind(n.skin, n.hair, n.hair_color, n.outfit, n.accessory, n.name, uid)
    .run();
  return n;
}

async function putHouse(db, uid, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'body');
  const cur = await db.prepare('SELECT name, size, roof, wall, door, floor, wallpaper, door_mode FROM houses WHERE user_id=?').bind(uid).first();
  if (!cur) throw fail(409, 'join');
  const n = { ...cur };
  for (const k of Object.keys(STYLE)) {
    if (!(k in body)) continue;
    const it = byId(body[k]);
    if (!it || it.kind !== STYLE[k]) throw fail(400, k);
    if (!(await owns(db, uid, it.id))) throw fail(403, 'not_owned');
    n[k] = it.id;
  }
  if ('door_mode' in body) {
    if (!MODES.includes(body.door_mode)) throw fail(400, 'door_mode');
    n.door_mode = body.door_mode;
  }
  if ('name' in body) n.name = body.name === null ? null : name(body.name);
  if (n.size !== cur.size) {
    const [w, h] = SIZES[n.size];
    for (const it of await items(db, uid)) if (it.x >= w || it.y >= h) throw fail(400, 'bounds');
  }
  await db
    .prepare('UPDATE houses SET name=?, size=?, roof=?, wall=?, door=?, floor=?, wallpaper=?, door_mode=? WHERE user_id=?')
    .bind(n.name, n.size, n.roof, n.wall, n.door, n.floor, n.wallpaper, n.door_mode, uid)
    .run();
  return n;
}

async function putItems(db, uid, body) {
  const list = Array.isArray(body) ? body : body && body.items;
  if (!Array.isArray(list) || list.length > MAXITEMS) throw fail(400, 'items');
  const h = await db.prepare('SELECT size FROM houses WHERE user_id=?').bind(uid).first();
  if (!h) throw fail(409, 'join');
  const [w, ht] = SIZES[h.size] || SIZES['house:hut'];
  const seen = new Set();
  const own = new Map();
  const rows = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') throw fail(400, 'items');
    const id = it.item_id;
    if (typeof id !== 'string' || !id.startsWith('furn:') || !byId(id)) throw fail(400, 'item');
    if (!isInt(it.x) || !isInt(it.y) || it.x < 0 || it.y < 0 || it.x >= w || it.y >= ht) throw fail(400, 'bounds');
    const flip = it.flip === 1 || it.flip === true ? 1 : 0;
    if (it.flip !== undefined && it.flip !== 0 && it.flip !== 1 && typeof it.flip !== 'boolean') throw fail(400, 'flip');
    const key = it.x + ':' + it.y;
    if (seen.has(key)) throw fail(400, 'dup');
    seen.add(key);
    if (!own.has(id)) own.set(id, await owns(db, uid, id));
    if (!own.get(id)) throw fail(403, 'not_owned');
    rows.push([id, it.x, it.y, flip]);
  }
  await db.batch([
    db.prepare('DELETE FROM house_items WHERE user_id=?').bind(uid),
    ...rows.map((r) => db.prepare('INSERT INTO house_items(user_id,item_id,x,y,flip) VALUES(?,?,?,?,?)').bind(uid, ...r)),
  ]);
  return rows.map(([item_id, x, y, flip]) => ({ item_id, x, y, flip }));
}

async function houseOf(db, me_, owner) {
  const ok = me_ === owner ? '1' : visible('h.user_id');
  const h = await db
    .prepare(`SELECT h.user_id, h.name, h.size, h.roof, h.wall, h.door, h.floor, h.wallpaper, h.door_mode, p.district, p.slot FROM houses h JOIN town_plots p ON p.id=h.plot_id WHERE h.user_id=? AND ${ok}`)
    .bind(owner)
    .first();
  if (!h) return null;
  if (me_ !== owner && (await blocked(db, me_, owner))) return null;
  const a = await db.prepare('SELECT skin, hair, hair_color, outfit, accessory, name FROM avatar WHERE user_id=?').bind(owner).first();
  return {
    owner: { id: owner, name: a && a.name ? a.name : null, look: a ? look(a) : null },
    house: { name: h.name, size: h.size, roof: h.roof, wall: h.wall, door: h.door, floor: h.floor, wallpaper: h.wallpaper, door_mode: h.door_mode },
    items: await items(db, owner),
    plot: { district: h.district, slot: h.slot },
  };
}

async function plots(db, me_, d) {
  const { results } = await db
    .prepare(
      `SELECT p.slot, p.user_id, a.name, a.skin, a.hair, a.hair_color, a.outfit, a.accessory, h.name AS hname, h.size, h.roof, h.wall, h.door, h.door_mode FROM town_plots p
       JOIN avatar a ON a.user_id=p.user_id JOIN houses h ON h.user_id=p.user_id
       WHERE p.district=? AND p.user_id IS NOT NULL AND ${visible('p.user_id')}`,
    )
    .bind(d)
    .all();
  const out = [];
  for (const r of results) {
    if (r.user_id !== me_ && (await blocked(db, me_, r.user_id))) continue;
    out.push({ slot: r.slot, owner: { id: r.user_id, name: r.name, look: look(r) }, house: { ...HOUSE_LOOK(r), name: r.hname, door_mode: r.door_mode } });
  }
  const tk = await db.prepare('SELECT slot FROM town_plots WHERE district=? AND user_id IS NOT NULL').bind(d).all();
  return { district: d, plots: out, taken: tk.results.map((r) => r.slot) };
}

async function movePlot(db, uid, body) {
  const d = body && body.district;
  const s = body && body.slot;
  if (!isInt(d) || !isInt(s) || d < 0 || s < 0 || s >= PLOTS) throw fail(400, 'plot');
  const cur = await needJoin(db, uid);
  if (cur.district === d && cur.slot === s) return { plot: { district: d, slot: s, world: plotWorld(d, s) } };
  const top = await db.prepare('SELECT COALESCE(MAX(district),0) AS m FROM town_plots WHERE user_id IS NOT NULL').first('m');
  const real = await db.prepare('SELECT 1 AS x FROM districts WHERE n=?').bind(d).first();
  if (d > Number(top) + 1 && !real) throw fail(400, 'plot');
  if (real && s >= RPLOTS) throw fail(400, 'plot');
  await db.prepare('INSERT OR IGNORE INTO town_plots(district,slot,user_id) VALUES(?,?,NULL)').bind(d, s).run();
  await db.prepare('UPDATE town_plots SET user_id=NULL WHERE id=? AND user_id=?').bind(cur.id, uid).run();
  const up = await db.prepare('UPDATE town_plots SET user_id=? WHERE district=? AND slot=? AND user_id IS NULL').bind(uid, d, s).run();
  if (!up.meta.changes) {
    await db.prepare('UPDATE town_plots SET user_id=? WHERE id=? AND user_id IS NULL').bind(uid, cur.id).run();
    throw fail(409, 'taken');
  }
  const now = await joined(db, uid);
  await db.prepare('UPDATE houses SET plot_id=? WHERE user_id=?').bind(now.id, uid).run();
  return { plot: { district: d, slot: s, world: plotWorld(d, s) } };
}

async function toPlace(db, f, uid, body) {
  const cur = await needJoin(db, uid);
  const hit = (await searchPlaces(db, body && body.q, f)).find((h) => h.osm === (body && body.osm));
  if (!hit) throw fail(400, 'place');
  const pl = await ensurePlace(db, hit, f);
  const here = await db.prepare('SELECT 1 AS x FROM districts WHERE n=? AND place_id=?').bind(cur.district, pl.id).first();
  let r = { plot: { district: cur.district, slot: cur.slot, world: plotWorld(cur.district, cur.slot) } };
  if (!here) {
    const d = await districtFor(db, pl.id);
    r = await movePlot(db, uid, { district: d, slot: await freeSlot(db, d) });
  }
  return { ...r, place: { name: pl.name, display: pl.display } };
}

async function roomCount(env, d, n) {
  try {
    const r = await env.HOUSE.get(env.HOUSE.idFromName('room:' + d + ':' + n)).fetch('https://do/count');
    const j = await r.json();
    return { cnt: j.n, phase: j.phase, end: j.end };
  } catch {
    return { cnt: 0, phase: 'idle', end: 0 };
  }
}

async function rooms(env, d) {
  const out = [];
  for (let n = 1; n <= 6; n++) out.push({ n, ...(await roomCount(env, d, n)) });
  return { rooms: out };
}

const secs = (t) => (t > 1e12 ? t / 1000 : t);

async function hall(db, me_) {
  const day = new Date().toISOString().slice(0, 10);
  const { results } = await db
    .prepare(
      `SELECT u.id, a.name AS aname, u.name AS uname, a.skin, a.hair, a.hair_color, a.outfit, a.accessory,
        (SELECT COALESCE(SUM(sa.verified_secs),0) FROM session_active sa JOIN sessions s ON s.id=sa.session_id WHERE sa.user_id=u.id AND s.user_id=u.id AND substr(s.start_at,1,10)=?) AS vs,
        (SELECT sa.last_ping FROM session_active sa JOIN sessions s ON s.id=sa.session_id WHERE sa.user_id=u.id AND s.user_id=u.id AND s.end_kind='open' ORDER BY sa.last_ping DESC LIMIT 1) AS lp,
        (SELECT sa.misses FROM session_active sa JOIN sessions s ON s.id=sa.session_id WHERE sa.user_id=u.id AND s.user_id=u.id AND s.end_kind='open' ORDER BY sa.last_ping DESC LIMIT 1) AS ms,
        (SELECT c.code FROM sessions s JOIN session_active sa ON sa.session_id=s.id JOIN tasks t ON t.id=s.task_id JOIN courses c ON c.id=t.course_id
          WHERE s.user_id=u.id AND s.end_kind='open' AND EXISTS(SELECT 1 FROM prefs WHERE user_id=u.id AND k='share_subject' AND v='1') ORDER BY sa.last_ping DESC LIMIT 1) AS code
       FROM users u JOIN avatar a ON a.user_id=u.id
       WHERE EXISTS(SELECT 1 FROM prefs WHERE user_id=u.id AND k='share_stats' AND v='1') AND ${visible('u.id')}`,
    )
    .bind(day)
    .all();
  const now = Date.now() / 1000;
  const out = [];
  for (const r of results) {
    if (r.id !== me_ && (await blocked(db, me_, r.id))) continue;
    let act = 'away';
    if (r.lp !== null && r.lp !== undefined) {
      const age = now - secs(r.lp);
      if (age <= 90) act = age < 60 && !r.ms ? 'active' : 'idle';
    }
    const o = { id: r.id, name: r.aname || r.uname || 'Student', look: look(r), mins: Math.floor(r.vs / 60), act };
    if (r.code) o.course = r.code;
    out.push(o);
  }
  out.sort((a, b) => b.mins - a.mins);
  return { day, list: out };
}

async function exists(db, id) {
  return !!(await db.prepare('SELECT 1 AS x FROM users WHERE id=?').bind(id).first());
}

async function report(db, uid, body) {
  const t = body && uid_(body.user);
  if (!t || t === uid || !(await exists(db, t))) throw fail(400, 'user');
  const n = await db.prepare("SELECT COUNT(*) AS n FROM reports WHERE reporter=? AND created >= datetime('now','-1 hour')").bind(uid).first('n');
  if (n >= 5) throw fail(429, 'rate');
  const reason = REASONS.includes(body.reason) ? body.reason : 'other';
  const text = typeof body.text === 'string' ? body.text.replace(CTRL, ' ').trim().slice(0, 500) : null;
  await db.prepare('INSERT INTO reports(reporter,target,reason,text) VALUES(?,?,?,?)').bind(uid, t, reason, text).run();
  return { ok: 1 };
}

async function mutedH(db, uid) {
  return (await chatMuted(db, uid)) ? { 'x-muted': '1' } : {};
}

function wsReq(request, uid, nm, extra = {}) {
  const h = new Headers();
  for (const [k, v] of request.headers) if (!k.toLowerCase().startsWith('x-')) h.set(k, v);
  h.set('x-uid', String(uid));
  h.set('x-name', encodeURIComponent(nm));
  for (const k in extra) h.set(k, extra[k]);
  return new Request(request, { headers: h });
}

async function dname(db, uid) {
  const r = await db.prepare('SELECT a.name AS an, u.name AS un FROM users u LEFT JOIN avatar a ON a.user_id=u.id WHERE u.id=?').bind(uid).first();
  return (r && (r.an || r.un)) || 'Student';
}

async function wsDistrict(env, request, u, url) {
  if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return json({ error: 'upgrade' }, 426);
  const d = uid_(url.searchParams.get('district') ?? '');
  if (d === null || d > 100000) return json({ error: 'district' }, 400);
  if (!(await joined(env.DB, u.id))) return json({ error: 'join' }, 403);
  if ((await pref(env.DB, u.id, 'show_in_town')) === '0') return json({ error: 'hidden' }, 403);
  const stub = env.DISTRICT.get(env.DISTRICT.idFromName('d:' + d));
  return stub.fetch(wsReq(request, u.id, await dname(env.DB, u.id), { 'x-district': String(d), ...(await mutedH(env.DB, u.id)) }));
}

async function wsHall(env, request, u, url) {
  if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return json({ error: 'upgrade' }, 426);
  const d = uid_(url.searchParams.get('district') ?? '');
  if (d === null || d > 100000) return json({ error: 'district' }, 400);
  if (!(await joined(env.DB, u.id))) return json({ error: 'join' }, 403);
  if ((await pref(env.DB, u.id, 'show_in_town')) === '0') return json({ error: 'hidden' }, 403);
  const stub = env.HOUSE.get(env.HOUSE.idFromName('hall:' + d));
  return stub.fetch(wsReq(request, u.id, await dname(env.DB, u.id), { 'x-hall': '1', ...(await mutedH(env.DB, u.id)) }));
}

async function wsRoom(env, request, u, url, n) {
  if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return json({ error: 'upgrade' }, 426);
  const d = uid_(url.searchParams.get('district') ?? '');
  if (d === null || d > 100000) return json({ error: 'district' }, 400);
  if (n === null || n < 1 || n > 6) return json({ error: 'room' }, 400);
  if (!(await joined(env.DB, u.id))) return json({ error: 'join' }, 403);
  if ((await pref(env.DB, u.id, 'show_in_town')) === '0') return json({ error: 'hidden' }, 403);
  const stub = env.HOUSE.get(env.HOUSE.idFromName('room:' + d + ':' + n));
  return stub.fetch(wsReq(request, u.id, await dname(env.DB, u.id), { 'x-room': '1', ...(await mutedH(env.DB, u.id)) }));
}

async function wsHouse(env, request, u, owner) {
  if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return json({ error: 'upgrade' }, 426);
  const db = env.DB;
  const h = await db.prepare('SELECT door_mode FROM houses WHERE user_id=?').bind(owner).first();
  if (!h || !(await joined(db, u.id))) return json({ error: 'forbidden' }, 403);
  if (owner !== u.id) {
    if (await blocked(db, u.id, owner)) return json({ error: 'forbidden' }, 403);
    if ((await pref(db, owner, 'show_in_town')) === '0') return json({ error: 'forbidden' }, 403);
    let ok = h.door_mode === 'open';
    if (!ok && h.door_mode !== 'closed') {
      ok = !!(await db.prepare('SELECT 1 AS x FROM house_access WHERE house_user=? AND guest=? AND expires>?').bind(owner, u.id, Date.now()).first());
    }
    if (!ok) return json({ error: 'forbidden' }, 403);
  }
  const stub = env.HOUSE.get(env.HOUSE.idFromName('h:' + owner));
  return stub.fetch(wsReq(request, u.id, await dname(db, u.id), { ...(owner === u.id ? { 'x-owner': '1' } : {}), ...(await mutedH(db, u.id)) }));
}

async function inner(env, request, u, path, body) {
  const db = env.DB;
  const m = request.method;
  const url = new URL(request.url);
  const p = path.split('/').slice(3);
  const [a, b, c] = p;
  const uid = u.id;
  const f = env.FETCHER || fetch;
  if (a === 'ws' && p.length === 1 && m === 'GET') return wsDistrict(env, request, u, url);
  if (a === 'hall' && b === 'ws' && p.length === 2 && m === 'GET') return wsHall(env, request, u, url);
  if (a === 'room' && c === 'ws' && p.length === 3 && m === 'GET') return wsRoom(env, request, u, url, uid_(b));
  if (a === 'house' && c === 'ws' && p.length === 3 && m === 'GET') {
    const o = uid_(b);
    return o === null ? json({ error: 'user' }, 400) : wsHouse(env, request, u, o);
  }
  if (a === 'me' && m === 'GET') return json(await me(db, uid));
  if (a === 'join' && m === 'POST') {
    const pl = await join(db, uid, u.name);
    return json({ plot: { district: pl.district, slot: pl.slot, world: plotWorld(pl.district, pl.slot) } });
  }
  if (a === 'avatar' && m === 'PUT') return json({ avatar: await putAvatar(db, uid, body) });
  if (a === 'buy' && m === 'POST') {
    const id = body && body.item;
    if (typeof id !== 'string') throw fail(400, 'item');
    await needJoin(db, uid);
    try {
      if (id.startsWith('food:')) return json({ balance: await buyFood(db, uid, id, body.qty === undefined ? 1 : body.qty) });
      return json({ balance: await buy(db, uid, id) });
    } catch (e) {
      if (e && e.error) return json({ error: e.error }, 400);
      throw e;
    }
  }
  if (a === 'eat' && m === 'POST') {
    const id = body && body.item;
    if (typeof id !== 'string') throw fail(400, 'item');
    try {
      return json({ fed_until: await eat(db, uid, id, Date.now()) });
    } catch (e) {
      if (e && e.error) return json({ error: e.error }, 400);
      throw e;
    }
  }
  if (a === 'house' && p.length === 1 && m === 'PUT') return json({ house: await putHouse(db, uid, body) });
  if (a === 'house' && b === 'items' && p.length === 2 && m === 'PUT') return json({ items: await putItems(db, uid, body) });
  if (a === 'house' && p.length === 2 && m === 'GET') {
    const o = uid_(b);
    const r = o === null ? null : await houseOf(db, uid, o);
    if (!r) throw fail(404, 'not_found');
    return json(r);
  }
  if (a === 'plots' && p.length === 1 && m === 'GET') {
    const d = uid_(url.searchParams.get('district') ?? '');
    if (d === null || d > 100000) throw fail(400, 'district');
    return json(await plots(db, uid, d));
  }
  if (a === 'plot' && p.length === 1 && m === 'POST') return json(await movePlot(db, uid, body));
  if (a === 'places' && p.length === 1 && m === 'GET') {
    const r = await searchPlaces(db, url.searchParams.get('q') ?? '', f);
    return json({ places: r.map(({ osm, name, display }) => ({ osm, name, display })) });
  }
  if (a === 'place' && p.length === 1 && m === 'POST') return json(await toPlace(db, f, uid, body));
  if (a === 'district' && p.length === 2 && m === 'GET') {
    const n = uid_(b);
    if (n === null) throw fail(400, 'district');
    return json(await districtInfo(db, n));
  }
  if (a === 'rooms' && p.length === 1 && m === 'GET') {
    const d = uid_(url.searchParams.get('district') ?? '');
    if (d === null || d > 100000) throw fail(400, 'district');
    return json(await rooms(env, d));
  }
  if (a === 'hall' && p.length === 1 && m === 'GET') return json(await hall(db, uid));
  if (a === 'block' && p.length === 1 && m === 'POST') {
    const t = body && uid_(body.user);
    if (!t || t === uid || !(await exists(db, t))) throw fail(400, 'user');
    await db.prepare('INSERT OR IGNORE INTO user_blocks(blocker,blocked) VALUES(?,?)').bind(uid, t).run();
    await db.prepare('DELETE FROM house_access WHERE (house_user=? AND guest=?) OR (house_user=? AND guest=?)').bind(uid, t, t, uid).run();
    const dropIn = async (owner, gone) => {
      try { await env.HOUSE.get(env.HOUSE.idFromName('h:' + owner)).fetch('https://do/drop', { headers: { 'x-drop': String(gone) } }); } catch { /* DO unavailable, access already revoked */ }
    };
    await Promise.all([dropIn(uid, t), dropIn(t, uid)]);
    return json({ ok: 1 });
  }
  if (a === 'block' && p.length === 2 && m === 'DELETE') {
    const t = uid_(b);
    if (t === null) throw fail(400, 'user');
    await db.prepare('DELETE FROM user_blocks WHERE blocker=? AND blocked=?').bind(uid, t).run();
    return json({ ok: 1 });
  }
  if (a === 'report' && p.length === 1 && m === 'POST') return json(await report(db, uid, body));
  const sr = await social(db, uid, p, m, body);
  if (sr) return json(sr);
  throw fail(404, 'not_found');
}

export async function townRoute(env, request, u, path, body) {
  if (!path.startsWith('/api/town/')) return null;
  try {
    return await inner(env, request, u, path, body);
  } catch (e) {
    if (e && e.status && e.error) return json({ error: e.error }, e.status);
    throw e;
  }
}
