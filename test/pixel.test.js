import test from 'node:test';
import assert from 'node:assert/strict';
import { recolorRows } from '../public/town/art/pixel.js';
import { SKIN_CH, HAIR_CH } from '../public/town/art/palette.js';
import { check } from '../scripts/art-check.mjs';
import good from '../scripts/fixtures/good-art.mjs';

test('skin and hair roles', () => {
  const r = recolorRows(['123456'], { skin: 2, hair: 3 });
  assert.equal(r[0], SKIN_CH(2, 0) + SKIN_CH(2, 1) + SKIN_CH(2, 2) + HAIR_CH(3, 0) + HAIR_CH(3, 1) + HAIR_CH(3, 2));
});

test('outfit colours and swatch names', () => {
  assert.equal(recolorRows(['789'], { colors: ['m', 'n', 'o'] })[0], 'mno');
  assert.equal(recolorRows(['789'], { colors: ['pink', 'navy', 'g'] })[0], 'nwg');
});

test('legs follow primary colour, literals untouched, flip', () => {
  assert.equal(recolorRows(['L.ow'], { colors: ['p', 'q', 'r'] })[0], 'p.ow');
  assert.equal(recolorRows(['ab.c'], { flip: true })[0], 'c.ba');
  assert.equal(recolorRows(['a7'], { colors: ['m'], flip: true })[0], 'ma');
});

test('checker accepts good art', () => {
  assert.deepEqual(check(good), []);
});

test('checker catches problems', () => {
  const row = (n, c = '.') => c.repeat(n);
  const bad = {
    sprites: {
      'x.rowlen': { w: 4, h: 2, rows: ['....', '...'] },
      'x.char': { w: 2, h: 1, rows: ['.Z'] },
      'Bad.Id': { w: 1, h: 1, rows: ['.'] },
      'head.d': { w: 12, h: 10, rows: Array.from({ length: 10 }, () => row(12)) },
    },
    anims: { 'x.a': { id: 'x.a', frames: ['x.char', 'x.nope'], fps: 4, loop: true } },
  };
  const out = check(bad).join('\n');
  assert.match(out, /x\.rowlen: row 1 has length 3/);
  assert.match(out, /x\.char: row 0 has unknown char 'Z'/);
  assert.match(out, /Bad\.Id: id must be lowercase/);
  assert.match(out, /frame 'x\.nope' does not exist/);
  assert.match(out, /head\.d: layer size 12x10, expected 12x11/);
});
