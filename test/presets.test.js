import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, missingParts } from '../public/town/shared/presets.js';
import { byId, SKIN, HAIR_STYLES, HAIR_COLORS } from '../public/town/shared/catalog.js';

test('24 presets with valid parts', () => {
  assert.equal(PRESETS.length, 24);
  assert.equal(new Set(PRESETS.map((p) => p.name)).size, 24);
  for (const p of PRESETS) {
    assert.ok(p.skin >= 1 && p.skin <= SKIN, p.name);
    assert.ok(p.hair >= 1 && p.hair <= HAIR_STYLES, p.name);
    assert.ok(p.hair_color >= 1 && p.hair_color <= HAIR_COLORS, p.name);
    assert.equal(byId(p.outfit)?.kind, 'outfit', p.name);
    if (p.accessory) assert.equal(byId(p.accessory)?.kind, 'acc', p.name);
  }
});

test('missingParts totals', () => {
  const p = PRESETS.find((x) => x.name === 'Merlin');
  const a = missingParts(p, new Set());
  assert.deepEqual(a.need, ['outfit:wizard', 'acc:hat']);
  assert.equal(a.cost, 900 + 150);
  const b = missingParts(p, new Set(['outfit:wizard']));
  assert.deepEqual(b.need, ['acc:hat']);
  assert.equal(b.cost, 150);
  assert.equal(missingParts(p, new Set(['outfit:wizard', 'acc:hat'])).cost, 0);
});

test('free presets cost 0', () => {
  const free = PRESETS.filter((p) => p.outfit === 'outfit:casual' && !p.accessory);
  assert.ok(free.length >= 6);
  for (const p of free) assert.deepEqual(missingParts(p, new Set()), { need: [], cost: 0 });
  for (const p of PRESETS) assert.ok(missingParts(p, new Set()).cost >= 0);
});
