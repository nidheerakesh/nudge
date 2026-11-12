import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { districtTemplate, WALK, W } from '../public/town/shared/plots.js';
import { project, makeLayout } from '../public/town/shared/layout.js';
import { staticRect, spawnTile, baseSolid } from '../public/town/scene.js';

const T = districtTemplate();
const solid = baseSolid(T);
const osm = JSON.parse(readFileSync(new URL('./fixtures/kottayam.json', import.meta.url), 'utf8'));
const feat = project(osm, { s: 9.75322, w: 76.64809, n: 9.75758, e: 76.65372 });
const L = makeLayout(feat);

test('spawn is a walkable, non-solid tile south of the fountain', () => {
  const s = spawnTile(T);
  assert.equal(s.y, T.fountain.y + T.fountain.h);
  assert.ok(WALK.has(T.ground[s.y][s.x]));
  assert.equal(solid[s.y * W + s.x], 0);
});

test('landmark doors are walkable and not solid', () => {
  for (const l of T.landmarks) {
    assert.ok(WALK.has(T.ground[l.door.y][l.door.x]), l.kind);
    assert.equal(solid[l.door.y * W + l.door.x], 0, l.kind);
  }
});

test('real buildings block walking on a real layout', () => {
  const s = baseSolid(L);
  assert.ok(L.real.length >= 5);
  for (const r of L.real) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      assert.equal(s[y * W + x], 1, `real ${r.x},${r.y} cell ${x},${y}`);
    }
  }
});

test('spawn stays walkable on a real layout', () => {
  const s = spawnTile(L);
  assert.ok(WALK.has(L.ground[s.y][s.x]));
  assert.equal(baseSolid(L)[s.y * W + s.x], 0);
});

test('bottom-centre anchor math', () => {
  assert.deepEqual(staticRect({ x: 10, y: 10, w: 1, h: 1 }, 48, 64), { x: 144, y: 112, key: 176 });
});
