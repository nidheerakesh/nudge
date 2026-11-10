// Houses: wall, roof, door, chimney, smoke, sign, bell, night windows, and composeHouse.
const grid = (w, h, f = '.') => Array.from({ length: h }, () => Array(w).fill(f));
const put = (g, x, y, c) => { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c); };
const out = (g, w, h) => ({ w, h, rows: g.map((r) => r.join('')) });
const hash = (x, y) => ((x * 7 + y * 13 + x * y * 3) % 11);

// Walls (tileable horizontally: patterns repeat every 8 px or less)
const WALLS = {
  plaster(g) {
    rect(g, 0, 0, 16, 16, 'a');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const h = hash(x % 8, y);
      if (h === 0) put(g, x, y, 'b');
      if (h === 5 && y % 2) put(g, x, y, 'W');
    }
    rect(g, 0, 15, 16, 1, 'b');
  },
  wood(g) {
    rect(g, 0, 0, 16, 16, 'c');
    for (let x = 0; x < 16; x += 4) { rect(g, x, 0, 1, 16, 'd'); rect(g, x + 1, 0, 1, 16, 'b'); }
    for (let x = 2; x < 16; x += 8) put(g, x, 5, 'd');
    for (let x = 6; x < 16; x += 8) put(g, x, 11, 'd');
    rect(g, 0, 15, 16, 1, 'd');
  },
  brick(g) {
    rect(g, 0, 0, 16, 16, 'o');
    for (let y = 0; y < 16; y += 4) {
      rect(g, 0, y + 3, 16, 1, 'm');
      const off = (y / 4) % 2 ? 4 : 0;
      for (let x = off; x < 16; x += 8) rect(g, x, y, 1, 3, 'm');
      rect(g, 0, y + 2, 16, 1, 'p');
      for (let x = off + 1; x < 16; x += 8) put(g, x, y, 'n');
    }
    for (let x = 0; x < 16; x++) put(g, x, 15, 'm');
  },
};

function windowOn(g) {
  rect(g, 3, 2, 10, 11, 'O');
  rect(g, 4, 3, 8, 8, 's');
  rect(g, 4, 7, 8, 4, 't');
  rect(g, 7, 3, 2, 8, 'e');
  rect(g, 4, 6, 8, 1, 'e');
  put(g, 5, 4, 'W'); put(g, 5, 5, 'W'); put(g, 10, 8, 'W');
  rect(g, 2, 12, 12, 2, 'O');
  rect(g, 3, 12, 10, 1, 'a');
  rect(g, 3, 13, 10, 1, 'd');
  rect(g, 3, 12, 10, 1, 'h');
  for (const x of [4, 7, 10]) put(g, x, 12, 'n');
  put(g, 5, 12, 'l'); put(g, 11, 12, 'l');
}

// Roofs
const ROOFS = {
  red: { l: 'n', m: 'o', d: 'p', t: 'tile' },
  thatch: { l: 'a', m: 'b', d: 'd', t: 'straw' },
  blue: { l: 's', m: 't', d: 'v', t: 'tile' },
  purple: { l: 'q', m: 'r', d: 'w', t: 'tile' },
};

function roofFill(g, st, mask) {
  const { l, m, d, t } = st;
  for (let y = 0; y < 15; y++) for (let x = 0; x < 16; x++) {
    if (!mask(x, y)) continue;
    let c = m;
    if (t === 'tile') {
      const band = Math.floor(y / 4);
      const off = band % 2 ? 4 : 0;
      if (y % 4 === 3) c = d;
      else if ((x + off) % 8 === 0) c = d;
      else if (y % 4 === 0 && (x + off) % 8 === 1) c = l;
    } else {
      const h = hash(x, y);
      if (h === 1 || h === 6) c = l;
      else if (h === 3 || (y % 5 === 4)) c = d;
    }
    put(g, x, y, c);
  }
}

function edgeOutline(g, mask) {
  const o = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!mask(x, y)) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of n) if (!mask(x + dx, y + dy) && !(y + dy > 15)) { o.push([x, y]); break; }
  }
  for (const [x, y] of o) put(g, x, y, 'O');
}

function roofPiece(st, kind) {
  const g = grid(16, 16);
  const slope = (y) => Math.floor((14 - y) / 2);
  let mask;
  if (kind === 'm') mask = (x, y) => y >= 0 && y <= 14 && x >= 0 && x < 16;
  else if (kind === 'l') mask = (x, y) => y >= 0 && y <= 14 && x >= slope(y) && x < 16;
  else if (kind === 'r') mask = (x, y) => y >= 0 && y <= 14 && x < 16 - slope(y) && x >= 0;
  else mask = (x, y) => y >= 0 && y <= 14 && Math.abs(x - 7.5) <= 1.5 + y * 0.5;
  roofFill(g, st, mask);
  // outline: top always, bottom eave row, slanted sides
  const m2 = (x, y) => (kind === 'm' ? y >= 0 && y <= 14 && x >= -1 && x <= 16 : mask(x, y));
  edgeOutline(g, m2);
  rect(g, 0, 14, 16, 1, 'O');
  if (kind === 'l') for (let y = 0; y < 15; y++) if (slope(y) < 16) put(g, slope(y), y, 'O');
  if (kind === 'r') for (let y = 0; y < 15; y++) put(g, 15 - slope(y), y, 'O');
  if (kind === 'peak') for (let y = 0; y < 15; y++) { for (let x = 0; x < 16; x++) if (!mask(x, y)) put(g, x, y, '.'); }
  // eave shadow below
  for (let x = 0; x < 16; x++) if (g[14][x] === 'O') put(g, x, 15, '.');
  const eave = kind === 'peak' ? 'd' : st.d;
  for (let x = 0; x < 16; x++) {
    const inside = kind === 'l' ? x >= slope(14) : kind === 'r' ? x <= 15 - slope(14) : true;
    if (inside && kind !== 'peak') put(g, x, 15, eave);
  }
  if (kind === 'peak') { for (let x = 0; x < 16; x++) if (g[14][x] !== '.') put(g, x, 15, st.d); }
  return out(g, 16, 16);
}

// Rectangular roof pieces (ridge, body, eave) for the 3/4 front view
function roofRect(st, part, side) {
  const g = grid(16, 16);
  roofFill(g, st, () => true);
  for (let x = 0; x < 16; x++) put(g, x, 15, st.m);
  if (part === 'ridge') {
    rect(g, 0, 0, 16, 1, 'O');
    rect(g, 0, 1, 16, 1, st.l);
    rect(g, 0, 2, 16, 1, st.m);
  }
  if (part === 'eave') {
    rect(g, 0, 13, 16, 1, st.d);
    rect(g, 0, 14, 16, 1, 'O');
    rect(g, 0, 15, 16, 1, st.d);
  }
  if (side === 'l') rect(g, 0, 0, 1, part === 'eave' ? 15 : 16, 'O');
  if (side === 'r') rect(g, 15, 0, 1, part === 'eave' ? 15 : 16, 'O');
  if (part === 'eave') { if (side === 'l') put(g, 0, 15, '.'); if (side === 'r') put(g, 15, 15, '.'); }
  return out(g, 16, 16);
}

// Doors
const DOORS = {
  wood: ['c', 'd', 'b'],
  green: ['h', 'i', 'g'],
  blue: ['u', 'v', 't'],
  pink: ['n', 'p', 'm'],
};

function drawDoor(col, open) {
  const [m, d, l] = col;
  const g = grid(16, 16);
  // frame
  rect(g, 2, 0, 12, 16, 'O');
  rect(g, 3, 1, 10, 15, 'e');
  for (const [x, y] of [[3, 1], [12, 1], [3, 2], [12, 2]]) put(g, x, y, 'O');
  rect(g, 3, 1, 10, 1, 'O');
  if (!open) {
    rect(g, 4, 2, 8, 14, m);
    rect(g, 4, 2, 1, 14, l);
    rect(g, 11, 2, 1, 14, d);
    rect(g, 5, 4, 6, 4, d); rect(g, 6, 5, 4, 2, m);
    rect(g, 5, 9, 6, 5, d); rect(g, 6, 10, 4, 3, m);
    put(g, 10, 8, 'a'); put(g, 10, 9, 'b');
  } else {
    rect(g, 4, 2, 8, 14, 'f');
    rect(g, 5, 3, 6, 13, 'e');
    rect(g, 6, 8, 4, 8, 'd');
    rect(g, 4, 2, 3, 14, m);
    rect(g, 4, 2, 1, 14, l);
    rect(g, 6, 2, 1, 14, d);
    rect(g, 5, 4, 1, 4, d); rect(g, 5, 9, 1, 5, d);
    put(g, 5, 8, 'a');
  }
  rect(g, 1, 15, 14, 1, 'O');
  rect(g, 2, 14, 12, 1, 'b');
  return out(g, 16, 16);
}

// Chimney, smoke, sign, bell
function chimney() {
  const g = grid(8, 12);
  rect(g, 0, 0, 8, 3, 'O'); rect(g, 1, 1, 6, 1, 'd');
  rect(g, 1, 3, 6, 9, 'O');
  rect(g, 1, 3, 6, 9, 'O');
  rect(g, 2, 3, 4, 9, 'o');
  rect(g, 2, 3, 1, 9, 'n'); rect(g, 5, 3, 1, 9, 'p');
  for (let y = 5; y < 12; y += 3) rect(g, 2, y, 4, 1, 'm');
  rect(g, 1, 3, 1, 9, 'O'); rect(g, 6, 3, 1, 9, 'O');
  rect(g, 7, 3, 1, 9, '.');
  rect(g, 1, 3, 6, 1, 'e');
  rect(g, 0, 1, 8, 2, 'e');
  rect(g, 0, 0, 8, 1, 'O'); rect(g, 0, 3, 1, 0, 'O');
  rect(g, 0, 2, 8, 1, 'O');
  rect(g, 1, 1, 6, 1, 'd');
  return out(g, 8, 12);
}

const PUFFS = [
  [[3, 7, 2], [4, 3, 1]],
  [[3, 6, 2], [4, 2, 2], [2, 0, 1]],
  [[4, 5, 2], [3, 1, 2]],
  [[4, 8, 1], [3, 4, 2], [4, 0, 1]],
];
function smoke(i) {
  const g = grid(8, 10);
  for (const [cx, cy, r] of PUFFS[i]) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + 1) put(g, cx + x, cy + y, y < 0 || x < 0 ? 'W' : 's');
    }
  }
  return out(g, 8, 10);
}

function sign() {
  const g = grid(16, 8);
  rect(g, 0, 0, 16, 8, 'O');
  rect(g, 1, 1, 14, 6, 'c');
  rect(g, 1, 1, 14, 1, 'b');
  rect(g, 1, 6, 14, 1, 'd');
  put(g, 0, 0, '.'); put(g, 15, 0, '.'); put(g, 0, 7, '.'); put(g, 15, 7, '.');
  put(g, 2, 2, 'e'); put(g, 13, 2, 'e');
  return out(g, 16, 8);
}

function bell(ring) {
  const g = grid(8, 8);
  const sh = ring ? 1 : 0;
  rect(g, 3, 0, 2, 1, 'O');
  rect(g, 2 + sh, 1, 4, 1, 'O');
  rect(g, 1 + sh, 2, 6, 5, 'O');
  rect(g, 2 + sh, 2, 4, 4, 'a');
  rect(g, 2 + sh, 2, 1, 4, 'W');
  rect(g, 5 + sh, 3, 1, 3, 'c');
  rect(g, 2 + sh, 5, 4, 1, 'b');
  rect(g, 0 + sh, 6, 8 - sh * 0 - (sh ? 1 : 0) - 0, 1, 'O');
  put(g, 3 + sh, 7, 'O'); put(g, 4 + sh, 7, 'O');
  if (ring) { put(g, 0, 3, 'e'); put(g, 0, 4, 'e'); put(g, 7, 2, 'e'); }
  return out(g, 8, 8);
}

function lit() {
  const g = grid(16, 16);
  rect(g, 4, 3, 8, 8, 'a');
  rect(g, 4, 7, 8, 4, 'b');
  rect(g, 7, 3, 2, 8, 'd');
  rect(g, 4, 6, 8, 1, 'd');
  put(g, 5, 4, 'W'); put(g, 5, 5, 'W'); put(g, 10, 8, 'W');
  for (const [x, y] of [[3, 2], [12, 2], [3, 11], [12, 11]]) put(g, x, y, 'a');
  return out(g, 16, 16);
}

const sprites = {};
for (const mat of Object.keys(WALLS)) {
  const b = grid(16, 16); WALLS[mat](b);
  sprites[`wall.${mat}.base`] = out(b, 16, 16);
  const w = grid(16, 16); WALLS[mat](w); windowOn(w);
  sprites[`wall.${mat}.window`] = out(w, 16, 16);
}
for (const [s, st] of Object.entries(ROOFS)) {
  for (const k of ['l', 'm', 'r', 'peak']) sprites[`roof.${s}.${k}`] = roofPiece(st, k);
}
for (const [s2, st] of Object.entries(ROOFS)) {
  for (const part of ['ridge', 'body', 'eave']) {
    for (const sd of ['l', 'm', 'r']) sprites[`roof.${s2}.${part}.${sd}`] = roofRect(st, part, sd);
  }
}
for (const [c, col] of Object.entries(DOORS)) {
  sprites[`door.${c}.closed`] = drawDoor(col, false);
  sprites[`door.${c}.open`] = drawDoor(col, true);
}
sprites.chimney = chimney();
for (let i = 0; i < 4; i++) sprites[`smoke.${i}`] = smoke(i);
sprites.sign = sign();
sprites.bell = bell(false);
sprites['bell.ring'] = bell(true);
sprites['window.lit'] = lit();

const anims = {
  smoke: { id: 'smoke', frames: ['smoke.0', 'smoke.1', 'smoke.2', 'smoke.3'], fps: 4, loop: true },
};

const SIZES = { hut: [1, 1], small: [2, 2], medium: [3, 2], large: [3, 3], manor: [4, 3] };
const key = (id, kind) => String(id).startsWith(kind + ':') ? String(id).slice(kind.length + 1) : String(id);

export function houseSize(sizeId) {
  const s = SIZES[key(sizeId, 'house')] || SIZES.hut;
  return { w: s[0], h: s[1] };
}

export function doorTile(sizeId) {
  const s = houseSize(sizeId);
  return { x: Math.floor((s.w - 1) / 2), y: s.h - 1 };
}

export const HOUSE_ROOF_ROWS = 3;

export function composeHouse(look = {}, opts = {}) {
  const sz = key(look.size, 'house');
  const roof = ROOFS[key(look.roof, 'roof')] ? key(look.roof, 'roof') : 'red';
  const wall = WALLS[key(look.wall, 'wall')] ? key(look.wall, 'wall') : 'plaster';
  const door = DOORS[key(look.door, 'door')] ? key(look.door, 'door') : 'wood';
  const { w, h } = houseSize(sz);
  const dt = doorTile(sz);
  const P = [];
  const roofRows = h + HOUSE_ROOF_ROWS - 1;
  for (let ty = 0; ty < roofRows; ty++) {
    const part = ty === 0 ? 'ridge' : ty === roofRows - 1 ? 'eave' : 'body';
    for (let tx = 0; tx < w; tx++) {
      const sd = w === 1 ? 'm' : tx === 0 ? 'l' : tx === w - 1 ? 'r' : 'm';
      P.push({ sprite: `roof.${roof}.${part}.${sd}`, x: tx * 16, y: ty * 16 });
    }
  }
  const wy = roofRows * 16;
  for (let tx = 0; tx < w; tx++) {
    const x = tx * 16;
    if (tx === dt.x) { P.push({ sprite: `door.${door}.${opts.doorOpen ? 'open' : 'closed'}`, x, y: wy }); continue; }
    P.push({ sprite: `wall.${wall}.window`, x, y: wy });
    if (opts.night) P.push({ sprite: 'window.lit', x, y: wy });
  }
  if (w >= 2) P.push({ sprite: 'chimney', x: w * 16 - 28, y: 6 });
  return P;
}

export default {
  sprites,
  anims,
  meta: { kind: 'houses', sizes: SIZES },
};
