import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, v3 } from './d1shim.js';
import { ITEMS, byId, isFree, ids, SKIN, HAIR_STYLES, HAIR_COLORS } from '../public/town/shared/catalog.js';

test('ids are unique', () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
});

test('every item has a tier matching its price', () => {
  for (const it of ITEMS) {
    const p = it.price;
    const t = p === 0 ? 'free' : p <= 150 ? 'common' : p <= 300 ? 'uncommon' : p <= 600 ? 'rare' : p <= 900 ? 'epic' : 'legendary';
    assert.equal(it.tier, t, it.id);
    assert.ok(Number.isInteger(p) && p >= 0);
  }
});

test('counts and free parts', () => {
  assert.equal(ids('outfit').length, 18);
  assert.equal(ids('acc').length, 14);
  assert.equal(ids('food').length, 12);
  assert.equal(ids('furn').length, 24);
  assert.deepEqual([SKIN, HAIR_STYLES, HAIR_COLORS], [6, 8, 8]);
  assert.ok(isFree('outfit:casual'));
  assert.ok(!isFree('outfit:hoodie'));
  assert.ok(!isFree('nope'));
  assert.equal(byId('nope'), null);
});

test('prices match the tables', () => {
  const want = {
    'outfit:hoodie': 100, 'outfit:school': 150, 'outfit:winter': 300, 'outfit:festival': 600, 'outfit:wizard': 900, 'outfit:space': 1200,
    'acc:hairclip': 60, 'acc:glasses': 100, 'acc:catears': 400, 'acc:bunnyears': 500, 'acc:headphones': 300,
    'house:hut': 0, 'house:small': 600, 'house:medium': 1500, 'house:large': 3500, 'house:manor': 8000,
    'roof:thatch': 100, 'roof:purple': 200, 'wall:brick': 180, 'door:pink': 100, 'floor:carpet': 120, 'wallpaper:stars': 150,
    'furn:desk': 0, 'furn:guitar': 250, 'furn:fishtank': 300, 'furn:books': 50,
    'food:cookie': 10, 'food:ramen': 40, 'food:pizza': 30,
  };
  for (const k of Object.keys(want)) assert.equal(byId(k)?.price, want[k], k);
  const out = ids('outfit').reduce((a, i) => a + byId(i).price, 0);
  const acc = ids('acc').reduce((a, i) => a + byId(i).price, 0);
  assert.equal(out + acc, 8740);
});

test('migration applies twice and covers contract tables', () => {
  const db = d1();
  v3(db);
  const sql = readFileSync(new URL('../migrations/v3/0002_town.sql', import.meta.url), 'utf8');
  db.exec(sql);
  db.exec(sql);
  for (const t of ['coin_ledger', 'wardrobe', 'avatar', 'town_plots', 'houses', 'house_items', 'house_access', 'user_blocks', 'reports', 'session_active', 'checkins', 'pantry', 'user_status']) {
    db.exec('SELECT 1 FROM ' + t);
  }
});
