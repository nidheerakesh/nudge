import { project, RPLOTS } from '../../public/town/shared/layout.js';

const UA = 'NudgeTown/1.0 (https://nudge.treasure05.workers.dev)';
const GAP = 1100;
const HH = 242;
const HW = 308;
const CTRL = /[\u0000-\u001f\u007f-\u009f]/g;
const TYPES = ['node', 'way', 'relation'];
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const fail = (status, error) => ({ status, error });

const clean = (v, mx) => String(v || '').replace(CTRL, '').slice(0, mx);
const norm = (q) => (typeof q === 'string' ? q.trim().replace(/\s+/g, ' ').toLowerCase() : '');
const good = (r) => TYPES.includes(r.osm_type) && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon));

function hitOf(r) {
  return {
    osm: r.osm_type + '/' + r.osm_id,
    name: clean(r.name || String(r.display_name || '').split(',')[0], 60),
    display: clean(r.display_name, 120),
    lat: Number(r.lat),
    lon: Number(r.lon),
  };
}

async function pace(db, now) {
  const last = await db.prepare("SELECT res FROM geo_cache WHERE q='@last'").first('res');
  if (last !== null && now - Number(last) < GAP) throw fail(429, 'slow');
  await db.prepare("INSERT OR REPLACE INTO geo_cache(q,res) VALUES('@last',?)").bind(String(now)).run();
}

async function nominatim(q, f) {
  try {
    const r = await f('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' + encodeURIComponent(q), {
      headers: { 'user-agent': UA, accept: 'application/json' },
    });
    return r.status === 200 ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function searchPlaces(db, q, f, now = Date.now()) {
  const s = norm(q);
  if (s.length < 3 || s.length > 60) throw fail(400, 'q');
  const hit = await db.prepare('SELECT res FROM geo_cache WHERE q=?').bind(s).first('res');
  if (hit !== null) return JSON.parse(hit);
  await pace(db, now);
  const rows = await nominatim(s, f);
  if (!Array.isArray(rows)) throw fail(502, 'geo');
  const out = rows.filter(good).map(hitOf);
  await db.prepare('INSERT OR REPLACE INTO geo_cache(q,res) VALUES(?,?)').bind(s, JSON.stringify(out)).run();
  return out;
}

export function boxOf(lat, lon) {
  const dLat = HH / 111320;
  const dLon = HW / (111320 * Math.cos((lat * Math.PI) / 180));
  return { s: lat - dLat, w: lon - dLon / 2, n: lat + dLat, e: lon + dLon * 1.5 };
}

const query = (b) =>
  `[out:json][timeout:8];(way["highway"](${b});way["building"](${b});way["natural"="water"](${b});way["leisure"](${b});way["landuse"](${b}););out geom;`;

async function getJson(url, init, f) {
  try {
    const r = await f(url, init);
    if (r.status !== 200) return null;
    const j = await r.json();
    return j && Array.isArray(j.elements) ? j : null;
  } catch {
    return null;
  }
}

export async function fetchMap(box, f) {
  const b = [box.s, box.w, box.n, box.e].join(',');
  const j = await getJson(
    OVERPASS,
    {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query(b)),
      signal: AbortSignal.timeout(9000),
    },
    f,
  );
  if (j) return j;
  const k = await getJson(
    `https://api.openstreetmap.org/api/0.6/map.json?bbox=${box.w},${box.s},${box.e},${box.n}`,
    { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(9000) },
    f,
  );
  if (k) return k;
  throw fail(502, 'map');
}

const view = (r) => ({ id: r.id, name: r.name, display: r.display, feat: r.feat ? JSON.parse(r.feat) : null });
const byOsm = (db, osm) => db.prepare('SELECT id, name, display, feat FROM places WHERE osm=?').bind(osm).first();

export async function ensurePlace(db, hit, f) {
  const old = await byOsm(db, hit.osm);
  if (old) return view(old);
  const box = boxOf(hit.lat, hit.lon);
  const feat = project(await fetchMap(box, f), box);
  const keep = feat.roads.length + feat.bld.length > 0;
  await db
    .prepare('INSERT OR IGNORE INTO places(osm,name,display,lat,lon,feat) VALUES(?,?,?,?,?,?)')
    .bind(hit.osm, hit.name, hit.display, hit.lat, hit.lon, keep ? JSON.stringify(feat) : null)
    .run();
  return view(await byOsm(db, hit.osm));
}

async function openSlots(db, n) {
  const cnt = await db.prepare('SELECT COUNT(*) AS c FROM town_plots WHERE district=? AND user_id IS NOT NULL AND slot<?').bind(n, RPLOTS).first('c');
  return cnt < RPLOTS;
}

export async function districtFor(db, placeId) {
  const { results } = await db.prepare('SELECT n FROM districts WHERE place_id=? ORDER BY n').bind(placeId).all();
  for (const r of results) if (await openSlots(db, r.n)) return r.n;
  const a = await db.prepare('SELECT COALESCE(MAX(district),0) AS m FROM town_plots').first('m');
  const b = await db.prepare('SELECT COALESCE(MAX(n),0) AS m FROM districts').first('m');
  const n = 1 + Math.max(Number(a), Number(b));
  await db.prepare('INSERT INTO districts(n,place_id) VALUES(?,?)').bind(n, placeId).run();
  return n;
}

export async function freeSlot(db, n) {
  const { results } = await db.prepare('SELECT slot FROM town_plots WHERE district=? AND user_id IS NOT NULL').bind(n).all();
  const taken = new Set(results.map((r) => r.slot));
  for (let s = 0; s < RPLOTS; s++) if (!taken.has(s)) return s;
  throw fail(409, 'full');
}

export async function districtInfo(db, n) {
  const r = await db.prepare('SELECT p.name, p.display, p.feat FROM districts d JOIN places p ON p.id=d.place_id WHERE d.n=?').bind(n).first();
  return { n, place: r ? { name: r.name, display: r.display } : null, feat: r && r.feat ? JSON.parse(r.feat) : null };
}
