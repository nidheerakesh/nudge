import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, v3 } from './d1shim.js';
import { searchPlaces, boxOf, fetchMap, ensurePlace, districtFor, districtInfo } from '../src/town/places.js';

const HIT = { osm_type: 'way', osm_id: 1077351803, name: 'IIIT Kottayam', display_name: 'IIIT Kottayam, Valavoor, Kerala, India', lat: '9.7554364', lon: '76.6495350' };
const KOTTAYAM = readFileSync(new URL('./fixtures/kottayam.json', import.meta.url), 'utf8');
const LAT = 9.7554364;
const LON = 76.649535;

function mk() {
  const db = d1();
  v3(db);
  return db;
}

function fake() {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    if (url.includes('nominatim')) return new Response(JSON.stringify([HIT]), { status: 200 });
    if (url.includes('overpass')) return new Response('', { status: 502 });
    if (url.includes('api.openstreetmap.org')) return new Response(KOTTAYAM, { status: 200 });
    return new Response('', { status: 404 });
  };
  return { f, calls };
}

test('search validates the query', async () => {
  const { f } = fake();
  const db = mk();
  await assert.rejects(searchPlaces(db, 'ab', f), { status: 400, error: 'q' });
  await assert.rejects(searchPlaces(db, 'x'.repeat(61), f), { status: 400, error: 'q' });
  await assert.rejects(searchPlaces(db, null, f), { status: 400, error: 'q' });
});

test('search returns mapped hits and caches them', async () => {
  const { f, calls } = fake();
  const db = mk();
  const a = await searchPlaces(db, '  IIIT   Kottayam ', f, 1e6);
  assert.deepEqual(a, [{ osm: 'way/1077351803', name: 'IIIT Kottayam', display: 'IIIT Kottayam, Valavoor, Kerala, India', lat: LAT, lon: LON }]);
  const n = calls.length;
  const b = await searchPlaces(db, 'iiit kottayam', f, 1e6 + 5000);
  assert.deepEqual(b, a);
  assert.equal(calls.length, n);
});

test('search is paced to one request per 1100 ms', async () => {
  const { f } = fake();
  const db = mk();
  await searchPlaces(db, 'iiit kottayam', f, 1000);
  await assert.rejects(searchPlaces(db, 'kottayam town', f, 2000), { status: 429, error: 'slow' });
  const ok = await searchPlaces(db, 'kottayam town', f, 2100);
  assert.equal(ok.length, 1);
});

test('search fails with geo when nominatim fails', async () => {
  const db = mk();
  const f = async () => new Response('', { status: 503 });
  await assert.rejects(searchPlaces(db, 'iiit kottayam', f, 1e6), { status: 502, error: 'geo' });
});

test('boxOf gives a 616 by 484 metre box with the centre at a quarter of the width', () => {
  const b = boxOf(LAT, LON);
  const w = (b.e - b.w) * 111320 * Math.cos((LAT * Math.PI) / 180);
  const h = (b.n - b.s) * 111320;
  assert.ok(Math.abs(w / 616 - 1) < 0.01);
  assert.ok(Math.abs(h / 484 - 1) < 0.01);
  assert.ok(Math.abs((LON - b.w) / (b.e - b.w) - 0.25) < 1e-9);
  assert.ok(Math.abs((b.n + b.s) / 2 - LAT) < 1e-9);
});

test('fetchMap falls back to the api when overpass fails', async () => {
  const { f, calls } = fake();
  const j = await fetchMap(boxOf(LAT, LON), f);
  assert.ok(Array.isArray(j.elements));
  assert.equal(calls.filter((u) => u.includes('overpass')).length, 1);
  assert.equal(calls.filter((u) => u.includes('api.openstreetmap.org')).length, 1);
});

test('fetchMap throws map when both sources fail', async () => {
  const f = async () => new Response('', { status: 500 });
  await assert.rejects(fetchMap(boxOf(LAT, LON), f), { status: 502, error: 'map' });
});

test('ensurePlace stores features once and reuses them', async () => {
  const { f, calls } = fake();
  const db = mk();
  const hit = { osm: 'way/1077351803', name: 'IIIT Kottayam', display: 'IIIT Kottayam', lat: LAT, lon: LON };
  const p = await ensurePlace(db, hit, f);
  assert.ok(p.feat.bld.some((b) => b.n === 'Dining Hall'));
  const n = calls.length;
  const q = await ensurePlace(db, hit, f);
  assert.equal(calls.length, n);
  assert.equal(q.id, p.id);
  assert.equal(await db.prepare('SELECT COUNT(*) AS c FROM places').first('c'), 1);
});

test('districtFor creates, reuses and then opens a new district when 24 slots are taken', async () => {
  const db = mk();
  db.exec("INSERT INTO places(osm,name,display,lat,lon,feat) VALUES('way/1','A','A',0,0,NULL)");
  assert.equal(await districtFor(db, 1), 1);
  assert.equal(await districtFor(db, 1), 1);
  for (let i = 0; i < 24; i++) db.exec(`INSERT INTO town_plots(district,slot,user_id) VALUES(1,${i},${100 + i})`);
  assert.equal(await districtFor(db, 1), 2);
  assert.equal(await db.prepare('SELECT place_id FROM districts WHERE n=2').first('place_id'), 1);
});

test('districtInfo has no place or feat for a classic district', async () => {
  const db = mk();
  assert.deepEqual(await districtInfo(db, 0), { n: 0, place: null, feat: null });
});
