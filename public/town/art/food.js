// Food icons (16x16), hand props (8x8) and the well-fed badge.
const mk = (w, h, c = '.') => Array.from({ length: h }, () => Array(w).fill(c));
const px = (g, x, y, c) => { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c); };
const disc = (g, cx, cy, r, c) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r / 2) px(g, cx + i, cy + j, c); };
const rows = (g) => g.map((r) => r.join(''));
const outl = (g) => {
  const add = [];
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    if (g[y][x] !== '.') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => g[y + b] && g[y + b][x + a] && g[y + b][x + a] !== '.')) add.push([x, y]);
  }
  add.forEach(([x, y]) => { g[y][x] = 'O'; });
  return g;
};
// Shrink 16x16 to 8x8: keep the most common colour of each 2x2 block if at least two cells are filled
const half = (g) => {
  const o = mk(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const n = {};
    let t = 0;
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const c = g[y * 2 + b][x * 2 + a]; if (c !== '.') { n[c] = (n[c] || 0) + 1; t++; } }
    if (t >= 2) o[y][x] = Object.keys(n).sort((p, q) => n[q] - n[p])[0];
  }
  return o;
};

const draw = {
  cookie: (g) => { disc(g, 8, 8, 6, 'c'); disc(g, 8, 9, 5, 'b'); [[5, 6], [9, 5], [10, 9], [6, 10], [8, 8]].forEach(([x, y]) => rect(g, x, y, 2, 2, 'e')); rect(g, 4, 12, 8, 1, 'd'); },
  onigiri: (g) => { for (let y = 2; y < 13; y++) { const w = 2 + Math.floor((y - 2) * 0.85); rect(g, 8 - w, y, w * 2, 1, 'W'); } rect(g, 4, 10, 8, 3, 'l'); rect(g, 5, 10, 6, 1, 'k'); rect(g, 7, 4, 2, 1, 's'); },
  fruit: (g) => { disc(g, 8, 9, 5, 'o'); disc(g, 6, 8, 2, 'n'); rect(g, 10, 11, 3, 2, 'p'); rect(g, 8, 2, 1, 3, 'e'); rect(g, 9, 3, 3, 2, 'h'); px(g, 6, 7, 'm'); },
  tea: (g) => { rect(g, 3, 6, 8, 7, 'W'); rect(g, 4, 7, 6, 2, 'h'); rect(g, 11, 7, 2, 1, 'W'); rect(g, 12, 8, 1, 3, 'W'); rect(g, 11, 11, 1, 1, 'W'); rect(g, 2, 13, 11, 1, 'u'); rect(g, 3, 12, 8, 1, 's'); px(g, 5, 3, 's'); px(g, 6, 4, 's'); px(g, 8, 2, 's'); px(g, 9, 3, 's'); },
  sandwich: (g) => { rect(g, 3, 4, 10, 2, 'c'); rect(g, 2, 6, 12, 1, 'h'); rect(g, 2, 7, 12, 1, 'o'); rect(g, 3, 8, 10, 1, 'b'); rect(g, 2, 9, 12, 1, 'n'); rect(g, 3, 10, 10, 2, 'c'); rect(g, 4, 4, 3, 1, 'b'); },
  cupcake: (g) => { rect(g, 4, 9, 8, 5, 'u'); rect(g, 5, 10, 1, 4, 't'); rect(g, 8, 10, 1, 4, 't'); rect(g, 11, 10, 1, 3, 't'); disc(g, 8, 7, 4, 'm'); rect(g, 5, 9, 7, 1, 'n'); rect(g, 7, 2, 2, 2, 'o'); px(g, 6, 5, 'W'); },
  coffee: (g) => { rect(g, 4, 5, 8, 9, 'a'); rect(g, 5, 14, 6, 1, 'a'); rect(g, 3, 3, 10, 2, 'f'); rect(g, 4, 8, 8, 4, 'c'); rect(g, 4, 8, 8, 1, 'd'); rect(g, 5, 9, 2, 2, 'W'); px(g, 6, 1, 's'); px(g, 8, 0, 's'); },
  icecream: (g) => { for (let y = 8; y < 15; y++) { const w = Math.max(1, 5 - (y - 8)); rect(g, 8 - w + 1, y, w * 2 - 1, 1, (y % 2) ? 'c' : 'b'); } disc(g, 8, 6, 3, 'm'); disc(g, 8, 3, 2, 's'); rect(g, 4, 8, 8, 1, 'n'); px(g, 7, 1, 'o'); },
  soup: (g) => { rect(g, 2, 8, 12, 3, 'u'); rect(g, 3, 11, 10, 2, 'u'); rect(g, 5, 13, 6, 1, 'v'); rect(g, 3, 7, 10, 2, 'o'); rect(g, 5, 7, 2, 1, 'b'); rect(g, 9, 7, 2, 1, 'h'); rect(g, 2, 8, 12, 1, 't'); px(g, 5, 4, 's'); px(g, 6, 3, 's'); px(g, 9, 4, 's'); px(g, 10, 3, 's'); },
  bubbletea: (g) => { rect(g, 4, 4, 8, 10, 's'); rect(g, 5, 7, 6, 6, 'c'); rect(g, 5, 7, 6, 1, 'b'); rect(g, 3, 3, 10, 2, 'W'); rect(g, 9, 0, 2, 4, 'p'); [[5, 12], [7, 12], [9, 12], [6, 11], [8, 11], [10, 11]].forEach(([x, y]) => px(g, x, y, 'f')); },
  pizza: (g) => { rect(g, 2, 2, 12, 3, 'c'); rect(g, 2, 2, 12, 1, 'd'); for (let y = 5; y < 15; y++) { const w = Math.max(1, 6 - Math.floor((y - 5) * 0.6)); rect(g, 8 - w, y, w * 2, 1, 'b'); } disc(g, 6, 7, 1, 'o'); disc(g, 10, 8, 1, 'o'); disc(g, 8, 11, 1, 'o'); px(g, 8, 7, 'h'); },
  ramen: (g) => { rect(g, 2, 8, 12, 3, 'o'); rect(g, 3, 11, 10, 2, 'o'); rect(g, 5, 13, 6, 1, 'p'); rect(g, 3, 6, 10, 3, 'b'); rect(g, 4, 6, 8, 1, 'a'); disc(g, 6, 6, 2, 'W'); px(g, 6, 6, 'c'); rect(g, 9, 5, 3, 2, 'n'); rect(g, 12, 1, 1, 6, 'e'); rect(g, 13, 1, 1, 6, 'e'); },
};

const sprites = {};
for (const k of Object.keys(draw)) {
  const g = mk(16, 16);
  draw[k](g);
  const big = mk(16, 16);
  // icons are drawn in a 16 box, so outline only where there is room
  draw[k](big);
  outl(g);
  sprites[`food.${k}`] = { w: 16, h: 16, rows: rows(g) };
  sprites[`prop.${k}`] = { w: 8, h: 8, rows: rows(half(big)) };
}
sprites['fx.fed'] = {
  w: 8, h: 8,
  rows: ['.oo.oo.W', 'omooooo.', 'oooooooo', 'poooooop', '.pooooo.', '..poop..', '...pp...', '.W......'],
};

export default { sprites, anims: {}, meta: {} };
