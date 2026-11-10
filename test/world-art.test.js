import { test } from 'node:test';
import assert from 'node:assert/strict';
import world from '../public/town/art/world.js';

const want = {};
for (const k of ['cherry', 'green', 'autumn']) for (const i of [0, 1]) want[`tree.${k}.${i}`] = [48, 64];
for (const i of [0, 1]) want[`tree.pine.${i}`] = [32, 64];
for (const i of [0, 1, 2]) { want[`bush.${i}`] = [16, 16]; want[`flowers.${i}`] = [16, 16]; want[`fountain.${i}`] = [64, 64]; }
want.flowerbed = [32, 16];
want['lamp.day'] = [16, 40];
want['lamp.night'] = [16, 40];
want['bench.h'] = [32, 24];
for (const k of ['boutique', 'homestore', 'bakery', 'library']) { want[`landmark.${k}`] = [80, 96]; want[`landmark.${k}.night`] = [80, 96]; }
want['landmark.townhall'] = [112, 112];
want['landmark.townhall.night'] = [112, 112];
want['bridge.stone'] = [64, 48];
for (const i of [0, 1]) want[`lilypad.${i}`] = [16, 16];

test('contract sprite sizes and row lengths', () => {
  for (const [id, [w, h]] of Object.entries(want)) {
    const s = world.sprites[id];
    assert.ok(s, `${id} exists`);
    assert.equal(s.w, w, `${id} w`);
    assert.equal(s.h, h, `${id} h`);
    assert.equal(s.rows.length, h, `${id} rows`);
    s.rows.forEach((r, y) => assert.equal(r.length, w, `${id} row ${y}`));
  }
});

test('kept ids still exist', () => {
  const ids = ['fence.h', 'fence.v', 'fence.corner', 'gate', 'signpost', 'duck.walk.r.0', 'duck.swim.l.1', 'tile.3', 'tile.4', 'tile.5', 'tile.6', 'tile.7', 'tile.8', 'tile.9', 'tile.10.h', 'tile.10.v', 'rocks.0', 'mailbox', 'bin', 'gazebo', 'archway'];
  for (let i = 0; i <= 2; i++) ids.push(`tile.${i}`);
  for (const id of ids) assert.ok(world.sprites[id], id);
  assert.deepEqual(world.anims.fountain.frames, ['fountain.0', 'fountain.1', 'fountain.2']);
  assert.ok(world.anims.water);
});
