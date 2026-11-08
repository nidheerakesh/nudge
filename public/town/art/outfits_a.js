// Outfits 1 to 9: casual hoodie sweater school formal overalls cozy sports traditional.
// Tops are 16x9 (placed at y=13), bottoms 16x10 (placed at y=14). Rows are built from
// short centred strings by small helpers; the exported data is plain row strings.
const cen = (s) => {
  const l = Math.floor((16 - s.length) / 2);
  return '.'.repeat(l) + s + '.'.repeat(16 - s.length - l);
};
const blank = '.'.repeat(16);
const mapRow = (s, m) => s[0] + [...s.slice(1, -1)].map((c) => m[c] || c).join('') + s[s.length - 1];
// side view: drop two inner columns so the body reads narrower
const side = (s) => s.slice(0, 2) + s.slice(3, -3) + s.slice(-2);
const top = (rows, at = 0) => ({ w: 16, h: 9, rows: Array.from({ length: 9 }, (_, i) => (rows[i - at] ? cen(rows[i - at]) : blank)) });
const bot = (rows, at) => ({ w: 16, h: 10, rows: Array.from({ length: 10 }, (_, i) => (rows[i - at] ? cen(rows[i - at]) : blank)) });

const sprites = {};
const meta = { outfits: {} };

function add(name, d, opt = {}) {
  const u = d.map((r, i) => (opt.uRows && opt.uRows[i] ? opt.uRows[i] : mapRow(r, opt.u || {})));
  const l = d.map((r) => side(mapRow(r, opt.l || {})));
  sprites[`outfit.${name}.top.d`] = top(d);
  sprites[`outfit.${name}.top.u`] = top(u);
  sprites[`outfit.${name}.top.l`] = top(l);
  meta.outfits[name] = { top: `outfit.${name}.top`, bottom: opt.bottom || 'pants', c: opt.c };
}

function addBottom(name, d, at, u) {
  sprites[`outfit.${name}.bottom.d`] = bot(d, at);
  sprites[`outfit.${name}.bottom.u`] = bot(u || d, at);
  sprites[`outfit.${name}.bottom.l`] = bot(d.map(side), at);
}

// casual: striped tee
add('casual', [
  '.OO7777OO.',
  'O77777777O',
  'O88888888O',
  'O77777777O',
  'O88888888O',
  'O77777777O',
  'O99999999O',
], { c: ['m', 'n', 'p'], u: {} });

// hoodie: bulky hood, drawstrings, kangaroo pocket
add('hoodie', [
  'O88888888O',
  'O88799788O',
  'O77799777O',
  'O77777777O',
  'O78888887O',
  'O78777787O',
  'O78888887O',
  'O99999999O',
], {
  c: ['q', 'r', 'm'],
  uRows: { 1: 'O88888888O', 2: 'O88888888O', 3: 'O78888887O', 4: 'O77777777O', 5: 'O77777777O', 6: 'O77777777O' },
});

// sweater: turtleneck, cable knit, ribbed hem
add('sweater', [
  'OO999999OO',
  'O99999999O',
  'O78787878O',
  'O87878787O',
  'O78787878O',
  'O87878787O',
  'O99999999O',
  'O99999999O',
], { c: ['c', 'd', 'a'] });

// school: blazer, white collar, tie
add('school', [
  'OOWWWWWWOO',
  'O7WW99WW7O',
  'O77799777O',
  'O77799777O',
  'O77799777O',
  'O77777777O',
  'O88888888O',
], { bottom: 'skirt', c: ['w', 'v', 'p'], u: { 9: '7' }, uRows: { 0: 'OOWWWWWWOO' } });
addBottom('school', [
  'O77877877O',
  'O88888888O',
  'O7787778778O',
  'O9999999999O',
], 4);

// formal: tailcoat, lapels, white shirt, bow tie
add('formal', [
  'OOWWWWWWOO',
  'O8WW99WW8O',
  'O78WWWW87O',
  'O778WW877O',
  'O77788777O',
  'O77779777O',
  'O77777777O',
  'O777OO777O',
  'O77O..O77O',
], { c: ['x', 'w', 'p'], u: { W: '7', 9: '7', 8: '7' }, uRows: { 0: 'OO777777OO', 7: 'O777OO777O', 8: 'O77O..O77O' } });

// overalls: shirt under denim bib with straps and pocket
add('overalls', [
  'OO888888OO',
  'O87888878O',
  'O87777778O',
  'O89777798O',
  'O87777778O',
  'O87OOOO78O',
  'O77777777O',
], { c: ['u', 'a', 'b'], uRows: { 2: 'O87777778O', 3: 'O87777778O', 4: 'O87777778O', 5: 'O87777778O' } });

// cozy: cardigan with shawl collar, open front, hem rib
add('cozy', [
  'OO999999OO',
  'O79988997O',
  'O77988977O',
  'O77988977O',
  'O77988977O',
  'O77777777O',
  'O99999999O',
], { c: ['i', 'a', 'd'], u: { 8: '7' }, uRows: { 0: 'OO999999OO', 1: 'O77999977O' } });

// sports: jersey with number box, rib trim, short body
add('sports', [
  'OO999999OO',
  'O89777798O',
  'O87777778O',
  'O877WW778O',
  'O87W77W78O',
  'O87777778O',
  'O99999999O',
], { c: ['o', 'p', 'a'], u: { W: '7' }, uRows: { 3: 'O87777778O', 4: 'O87777778O' } });

// traditional: wrap collar, flared sleeves, sash; robe flare at the bottom
add('traditional', [
  'OO999999OO',
  'O99777799O',
  'O79977997O',
  'O77799777O',
  'O8777997778O',
  'O8888998888O',
  'O9777887779O',
], { bottom: 'robe', c: ['n', 'r', 'a'], uRows: { 1: 'O77777777O', 2: 'O77777777O', 3: 'O77777777O' } });
addBottom('traditional', [
  'O77799777O',
  'O77799777O',
  'O7777997777O',
  'O7777887777O',
  'O9999999999O',
], 5);

export default { sprites, anims: {}, meta };
