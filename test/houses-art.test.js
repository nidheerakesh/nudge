import { test } from 'node:test';
import assert from 'node:assert/strict';
import art, { composeHouse, houseSize, doorTile, HOUSE_ROOF_ROWS } from '../public/town/art/houses.js';

test('composeHouse matches 3/4 size contract', () => {
  assert.equal(HOUSE_ROOF_ROWS, 3);
  for (const size of Object.keys(art.meta.sizes)) {
    const { w, h } = houseSize(size);
    const parts = composeHouse({ size, roof: 'red', wall: 'plaster', door: 'wood' }, {});
    let mw = 0, mh = 0;
    for (const p of parts) {
      const s = art.sprites[p.sprite];
      assert.ok(s, `missing sprite ${p.sprite}`);
      assert.ok(p.x >= 0 && p.y >= 0);
      mw = Math.max(mw, p.x + s.w);
      mh = Math.max(mh, p.y + s.h);
    }
    assert.equal(mw, w * 16, `${size} width`);
    assert.equal(mh, (h + HOUSE_ROOF_ROWS) * 16, `${size} height`);
    const d = doorTile(size);
    assert.equal(d.y, h - 1);
    assert.ok(d.x >= 0 && d.x < w);
    const night = composeHouse({ size }, { night: true });
    assert.ok(w === 1 || night.some((p) => p.sprite === 'window.lit'));
  }
});
