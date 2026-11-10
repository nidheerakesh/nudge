import { test } from 'node:test';
import assert from 'node:assert/strict';
import { districtTemplate, WALK, W } from '../public/town/shared/plots.js';
import { staticRect, spawnTile, baseSolid } from '../public/town/scene.js';

const T = districtTemplate();
const solid = baseSolid(T);

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

test('bottom-centre anchor math', () => {
  assert.deepEqual(staticRect({ x: 10, y: 10, w: 1, h: 1 }, 48, 64), { x: 144, y: 112, key: 176 });
});
