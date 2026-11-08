import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../public/town/shared/catalog.js';
import art from '../public/town/art/accessories.js';

const al = { hairclip: 'clip', hairbow: 'bow', flowercrown: 'crown' };

test('every accessory in the catalog has art under its name or alias', () => {
  const miss = ITEMS.filter((i) => i.kind === 'acc').map((i) => i.id.split(':')[1]).filter((n) => !('acc.' + (al[n] || n) + '.d' in art.sprites));
  assert.deepEqual(miss, []);
});
