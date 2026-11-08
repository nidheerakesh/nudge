// Study Hall: room background, desk, chair, notice board and rug.
const mk = (w, h, c = '.') => Array.from({ length: h }, () => Array(w).fill(c));
const px = (g, x, y, c) => { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c); };
const spr = (g) => ({ w: g[0].length, h: g.length, rows: g.map((r) => r.join('')) });
const outl = (g) => {
  const add = [];
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    if (g[y][x] !== '.') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => g[y + b] && g[y + b][x + a] && g[y + b][x + a] !== '.')) add.push([x, y]);
  }
  add.forEach(([x, y]) => { g[y][x] = 'O'; });
  return g;
};

const BOOK = ['o', 'u', 'h', 'q', 'b', 'n', 'v', 'j'];
const bookshelf = (g, x, y, w, h) => {
  rect(g, x, y, w, h, 'e');
  for (let r = 0; r + 18 <= h; r += 18) {
    rect(g, x + 2, y + 2 + r, w - 4, 14, 'f');
    let bx = x + 3;
    let i = (x + r) % 8;
    while (bx + 4 < x + w - 2) {
      const bw = 2 + (i % 3);
      const bh = 9 + ((i * 5) % 5);
      rect(g, bx, y + 16 + r - bh, bw, bh, BOOK[i % 8]);
      rect(g, bx, y + 16 + r - bh, 1, bh, 'W');
      bx += bw + 1;
      i += 3;
    }
    rect(g, x + 1, y + 16 + r, w - 2, 2, 'd');
  }
};
const win = (g, x, y) => {
  rect(g, x, y, 28, 72, 'W');
  rect(g, x + 2, y + 2, 24, 68, 's');
  rect(g, x + 2, y + 2, 24, 22, 't');
  rect(g, x + 13, y + 2, 2, 68, 'W'); rect(g, x + 2, y + 34, 24, 2, 'W');
  rect(g, x + 5, y + 6, 5, 1, 'W'); rect(g, x + 18, y + 40, 5, 1, 'W');
  rect(g, x - 2, y + 72, 32, 3, 'b');
};

const room = () => {
  const g = mk(384, 256, 'a');
  for (let x = 0; x < 384; x += 16) { rect(g, x, 0, 1, 160, 'b'); }
  rect(g, 0, 0, 384, 12, 'd'); rect(g, 0, 12, 384, 3, 'e');
  for (let x = 0; x < 384; x += 96) { rect(g, x, 0, 6, 160, 'd'); rect(g, x + 1, 0, 1, 160, 'c'); }
  [64, 160, 256].forEach((x) => win(g, x + 8, 30));
  bookshelf(g, 8, 40, 46, 108);
  bookshelf(g, 330, 40, 46, 108);
  bookshelf(g, 108, 70, 28, 78);
  bookshelf(g, 204, 70, 28, 78);
  bookshelf(g, 300, 70, 28, 78);
  rect(g, 0, 148, 384, 12, 'W'); rect(g, 0, 148, 384, 1, 'b');
  rect(g, 0, 160, 384, 3, 'e');
  for (let y = 163; y < 256; y += 6) {
    rect(g, 0, y, 384, 6, ((y - 163) / 6) % 2 ? 'c' : 'b');
    rect(g, 0, y + 5, 384, 1, 'd');
    for (let x = ((y / 6) | 0) % 2 ? 20 : 60; x < 384; x += 70) rect(g, x, y, 1, 5, 'd');
  }
  return g;
};

const desk = () => {
  const g = mk(24, 16);
  rect(g, 0, 5, 24, 4, 'c'); rect(g, 0, 5, 24, 1, 'b'); rect(g, 0, 9, 24, 1, 'd');
  rect(g, 1, 10, 3, 5, 'e'); rect(g, 20, 10, 3, 5, 'e');
  rect(g, 4, 10, 16, 3, 'd');
  rect(g, 3, 4, 5, 1, 'a'); rect(g, 3, 3, 5, 1, 'W');
  // lamp
  rect(g, 17, 4, 4, 1, 'f'); rect(g, 18, 1, 1, 3, 'f'); rect(g, 16, 0, 5, 2, 'h'); rect(g, 17, 0, 3, 1, 'g');
  return spr(outl(g));
};
const chair = () => {
  const g = mk(16, 16);
  rect(g, 4, 1, 8, 6, 'd'); rect(g, 5, 2, 6, 4, 'o');
  rect(g, 3, 8, 10, 4, 'o'); rect(g, 3, 8, 10, 1, 'n'); rect(g, 3, 11, 10, 1, 'p');
  rect(g, 4, 12, 2, 3, 'e'); rect(g, 10, 12, 2, 3, 'e');
  return spr(outl(g));
};
const board = () => {
  const g = mk(32, 24);
  rect(g, 0, 0, 32, 24, 'd'); rect(g, 2, 2, 28, 20, 'c');
  rect(g, 2, 2, 28, 1, 'b');
  rect(g, 4, 4, 14, 17, 'W');
  for (let y = 7; y < 20; y += 3) rect(g, 6, y, 10, 1, 't');
  rect(g, 6, 5, 6, 1, 'u');
  rect(g, 20, 4, 8, 7, 'm'); rect(g, 21, 6, 6, 1, 'n'); rect(g, 21, 8, 5, 1, 'n');
  rect(g, 20, 13, 8, 7, 's'); rect(g, 21, 15, 6, 1, 't'); rect(g, 21, 17, 5, 1, 't');
  [[10, 3], [23, 3], [23, 12]].forEach(([x, y]) => px(g, x - 5 + 5, y, 'o'));
  return spr(g);
};
const rug = () => {
  const g = mk(48, 32, 'q');
  rect(g, 2, 2, 44, 28, 'p'); rect(g, 4, 4, 40, 24, 'n');
  for (let i = 0; i < 6; i++) { rect(g, 24 - 2 * (i + 1), 16 - 1 - i * 2, 4 * (i + 1), 1, 'm'); }
  rect(g, 20, 14, 8, 4, 'q');
  for (let y = 0; y < 32; y += 2) { px(g, 0, y, 'r'); px(g, 47, y, 'r'); }
  return spr(g);
};

export default {
  sprites: { 'hall.room': spr(room()), 'hall.desk': desk(), 'hall.chair': chair(), 'hall.board': board(), 'hall.rug': rug() },
  anims: {},
  meta: {},
};
