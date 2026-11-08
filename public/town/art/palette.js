export const GLOBAL = {
  a: '#F6DDB8', b: '#EBC08A', c: '#D79A63', d: '#B26F45', e: '#7A4A33', f: '#4A2F2A',
  g: '#BFE07A', h: '#7CC24E', i: '#3E9A4A', j: '#2B7A4B', k: '#1F5A4A', l: '#163D3F',
  m: '#FFC2CF', n: '#FF8FA8', o: '#F76F7A', p: '#E0507A', q: '#A650A0', r: '#6A3F8E',
  s: '#CFE4FF', t: '#94BFF0', u: '#5F8FD8', v: '#3F63B0', w: '#2B3F86', x: '#1A2352',
};

// Special chars O (outline), W (white), E (eye), B (blush) are uppercase so they never
// collide with the lowercase a-x palette letters.
export const OUTLINE = '#2A1F2D';
export const WHITE = '#FFFFFF';
export const EYE = '#2A1F2D';
export const BLUSH = '#FF8FA8';

const hex = (n) => '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const dark = (c, p) => {
  const n = parseInt(c.slice(1), 16);
  const f = 1 - p;
  return hex((Math.round((n >> 16) * f) << 16) | (Math.round(((n >> 8) & 255) * f) << 8) | Math.round((n & 255) * f));
};

export const SKIN_BASE = ['#FBE3CE', '#F2CFA6', '#E2B183', '#C48A5E', '#9A6A47', '#6B4630'];
export const SKINS = SKIN_BASE.map((c) => [c, dark(c, 0.1), dark(c, 0.22)]);

export const HAIR_NAMES = ['brown', 'black', 'auburn', 'orange', 'blonde', 'pink', 'lilac', 'blue'];
const HAIR_MID = ['#7A4A33', '#3A2F3D', '#9A4A2F', '#E08A3C', '#E8C46A', '#F07FA8', '#B49AE0', '#5F8FD8'];
export const HAIRS = HAIR_MID.map((c) => {
  const n = parseInt(c.slice(1), 16);
  const lite = hex((Math.round((n >> 16) + (255 - (n >> 16)) * 0.22) << 16) | (Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * 0.22) << 8) | Math.round((n & 255) + (255 - (n & 255)) * 0.22));
  return [lite, c, dark(c, 0.25)];
});

// Private-use style chars standing in for skin and hair ramp colours after recolour
export const SKIN_CH = (i, j) => String.fromCharCode(0x100 + i * 3 + j);
export const HAIR_CH = (i, j) => String.fromCharCode(0x140 + i * 3 + j);

export const EXT = {};
SKINS.forEach((r, i) => r.forEach((c, j) => { EXT[SKIN_CH(i, j)] = c; }));
HAIRS.forEach((r, i) => r.forEach((c, j) => { EXT[HAIR_CH(i, j)] = c; }));

export const OUTFIT = {
  cream: 'a', sand: 'b', tan: 'c', brown: 'e', mint: 'g', green: 'h', forest: 'j', teal: 'k',
  blush: 'm', pink: 'n', coral: 'o', rose: 'p', plum: 'q', purple: 'r',
  sky: 's', blue: 'u', navy: 'w', night: 'x',
};
