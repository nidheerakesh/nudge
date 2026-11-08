// Hair layers (16x14). Shapes are cell sets, shaded and outlined at load time into plain row strings.
const W = 16;
const H = 14;
const key = (x, y) => y * W + x;
const R = (x0, y0, x1, y1) => {
  const s = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.add(key(x, y));
  return s;
};
const U = (...a) => new Set(a.flatMap((s) => [...s]));
const M = (a, ...b) => {
  const s = new Set(a);
  for (const t of b) for (const k of t) s.delete(k);
  return s;
};
const P = (...pts) => new Set(pts.filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H).map(([x, y]) => key(x, y)));
const wave = (x0, y0, x1, y1) => {
  const s = new Set();
  for (let y = y0; y <= y1; y++) {
    const o = (y >> 1) & 1;
    for (let x = Math.max(0, x0 - o); x <= Math.min(W - 1, x1 + 1 - o); x++) s.add(key(x, y));
  }
  return s;
};
const zig = (x, y0, y1) => {
  const s = new Set();
  for (let y = y0; y <= y1; y++) for (let i = 0; i < 2; i++) s.add(key(x + ((y - y0) % 2) + i, y));
  return s;
};

const capD = U(R(4, 2, 11, 2), R(3, 3, 12, 3), R(2, 4, 13, 6));
const capU = U(capD, R(2, 7, 13, 9), R(3, 10, 12, 10), R(4, 11, 11, 11));
const capL = U(R(4, 2, 11, 2), R(3, 3, 12, 3), R(3, 4, 13, 6), R(9, 7, 13, 8), R(10, 9, 13, 10), R(10, 11, 12, 11));
const burnD = U(R(2, 7, 3, 8), R(12, 7, 13, 8));

const render = (cells, prot) => {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const has = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cells.has(key(x, y));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!has(x, y)) continue;
      g[y][x] = !has(x, y - 1) ? '4' : (!has(x, y + 1) || !has(x + 1, y)) ? '6' : (x + y) % 5 === 0 ? '4' : '5';
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (has(x, y)) continue;
      if (prot && x >= prot[0] && x <= prot[2] && y >= prot[1] && y <= prot[3]) continue;
      if (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1)) g[y][x] = 'O';
    }
  }
  return { w: W, h: H, rows: g.map((r) => r.join('')) };
};

const HEAD = R(2, 3, 13, 13);
const PROT = { d: [3, 7, 12, 13], u: null, l: [2, 7, 9, 13] };
const mir = (c) => U(c, new Set([...c].map((k) => key(W - 1 - (k % W), (k / W) | 0))));
const side = (x0, y0, x1, y1) => mir(R(x0, y0, x1, y1));

const styles = {
  1: {
    f: {
      d: U(capD, R(2, 7, 2, 12), R(13, 7, 13, 12)),
      u: U(capU, wave(2, 12, 13, 13)),
      l: U(capL, wave(9, 9, 13, 13)),
    },
    b: { d: wave(0, 5, 14, 13), u: wave(1, 4, 14, 13), l: wave(8, 5, 14, 13) },
  },
  2: {
    f: {
      d: M(U(capD, burnD, P([5, 1], [9, 1], [12, 2], [2, 3], [7, 1])), P([3, 6], [6, 6], [9, 6], [12, 6], [7, 5])),
      u: M(U(capU, P([5, 1], [9, 1], [12, 2], [3, 2])), P([3, 10], [5, 11], [8, 11], [10, 10], [11, 11])),
      l: M(U(capL, P([5, 1], [8, 1], [11, 2], [3, 3])), P([3, 6], [5, 6], [7, 6])),
    },
    b: {
      d: P([1, 4], [0, 5], [1, 6], [0, 7], [1, 8], [14, 4], [15, 5], [14, 6], [15, 7], [14, 8], [3, 2], [1, 3], [14, 3]),
      u: R(3, 10, 12, 12),
      l: P([14, 4], [15, 5], [14, 6], [15, 7], [14, 8], [13, 2], [14, 3]),
    },
  },
  3: {
    f: {
      d: M(U(capD, R(1, 0, 4, 3), R(11, 0, 14, 3), burnD), P([1, 0], [4, 0], [11, 0], [14, 0], [3, 6], [7, 6], [8, 6], [12, 6])),
      u: U(capU, R(1, 0, 4, 3), R(11, 0, 14, 3)),
      l: U(capL, R(6, 0, 10, 3)),
    },
    b: { d: side(1, 4, 1, 8), u: R(1, 4, 14, 9), l: R(14, 4, 14, 8) },
  },
  4: {
    f: {
      d: U(capD, R(2, 7, 2, 10), R(13, 7, 13, 10)),
      u: U(capU, R(2, 10, 13, 11)),
      l: U(capL, R(9, 9, 13, 11)),
    },
    b: {
      d: M(R(0, 5, 15, 11), P([0, 5], [15, 5], [0, 6], [15, 6], [0, 11], [15, 11], [1, 11], [14, 11])),
      u: M(R(1, 4, 14, 11), P([1, 11], [14, 11])),
      l: M(R(8, 5, 15, 11), P([15, 5], [15, 6], [15, 11], [14, 11])),
    },
  },
  5: {
    f: {
      d: M(U(capD, R(2, 7, 2, 13), R(13, 7, 13, 13)), P([13, 5], [12, 6], [13, 6], [11, 6])),
      u: U(capU, R(2, 10, 13, 13)),
      l: U(capL, R(9, 9, 13, 13)),
    },
    b: { d: R(1, 4, 14, 13), u: R(1, 4, 14, 13), l: R(11, 4, 14, 13) },
  },
  6: {
    f: {
      d: U(capD, burnD, P([12, 2], [13, 3], [13, 2], [14, 3], [14, 2])),
      u: U(capU, R(6, 12, 9, 13), P([7, 11], [8, 11], [7, 10], [8, 10])),
      l: U(capL, R(13, 4, 15, 9), R(14, 10, 15, 12)),
    },
    b: {
      d: U(R(14, 3, 15, 8), R(14, 9, 15, 12)),
      u: R(2, 4, 13, 8),
      l: R(14, 4, 15, 9),
    },
  },
  7: {
    f: {
      d: U(capD, burnD, zig(0, 8, 13)),
      u: U(capU, zig(11, 10, 13)),
      l: U(capL, zig(11, 9, 13)),
    },
    b: { d: R(14, 4, 14, 8), u: R(2, 4, 13, 11), l: R(14, 4, 14, 9) },
  },
  8: {
    f: {
      d: M(U(capD, burnD, P([4, 1], [7, 1], [10, 1], [13, 1], [7, 0], [10, 0], [2, 3])), P([3, 6], [5, 6], [8, 6], [10, 6], [12, 6])),
      u: U(capU, P([4, 1], [7, 1], [10, 1], [13, 1], [7, 0], [10, 0])),
      l: M(U(capL, P([4, 1], [7, 1], [10, 1], [12, 1], [7, 0], [10, 0])), P([3, 6], [5, 6])),
    },
    b: {
      d: P([1, 4], [0, 3], [1, 6], [0, 7], [14, 4], [15, 3], [14, 6], [15, 7], [1, 8], [14, 8]),
      u: R(3, 10, 12, 11),
      l: P([14, 4], [15, 3], [14, 6], [15, 7], [14, 8]),
    },
  },
};

const sprites = {};
for (const [n, st] of Object.entries(styles)) {
  for (const d of ['d', 'u', 'l']) {
    const masked = d !== 'u';
    sprites[`hair.${n}.${d}.back`] = render(masked ? M(st.b[d], HEAD) : st.b[d], masked ? [2, 3, 13, 13] : null);
    sprites[`hair.${n}.${d}.front`] = render(st.f[d], PROT[d]);
  }
}

export default { sprites, anims: {}, meta: { styles: 8 } };
