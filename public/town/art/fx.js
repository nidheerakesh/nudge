// Sky, weather, wildlife, emotes and UI icons. Fill is drawn with small helpers, output is plain row strings.
const G = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
const px = (g, x, y, c) => { if (g[y] && x >= 0 && x < g[0].length && y >= 0) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c); };
const disc = (g, cx, cy, r, c) => {
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = c;
  }
};
const line = (g, x0, y0, x1, y1, c, t = 2) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    rect(g, x, y, t, t, c);
  }
};
const outline = (g) => {
  const h = g.length, w = g[0].length;
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== '.') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] && g[y + dy][x + dx] !== '.' && g[y + dy][x + dx] !== 'O')) add.push([x, y]);
  }
  add.forEach(([x, y]) => { g[y][x] = 'O'; });
  return g;
};
const S = (g) => ({ w: g[0].length, h: g.length, rows: g.map((r) => r.join('')) });
const R = (rows) => ({ w: rows[0].length, h: rows.length, rows });
const sprites = {};
const anims = {};

// Sky
sprites['sky.sun'] = (() => {
  const g = G(16, 16);
  [[7, 0], [8, 0], [7, 15], [8, 15], [0, 7], [0, 8], [15, 7], [15, 8], [2, 2], [13, 2], [2, 13], [13, 13]].forEach(([x, y]) => px(g, x, y, 'b'));
  disc(g, 7.5, 7.5, 5, 'b');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (g[y][x] !== 'b' || (x - 7.5) ** 2 + (y - 7.5) ** 2 > 25) continue;
    if (x + y < 12) g[y][x] = 'a';
    else if (x + y > 17) g[y][x] = 'c';
  }
  return S(g);
})();
sprites['sky.moon'] = (() => {
  const g = G(16, 16);
  disc(g, 7.5, 8, 6, 'a');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if ((x - 10.5) ** 2 + (y - 6) ** 2 <= 30) g[y][x] = '.';
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (g[y][x] === 'a' && (x - 10.5) ** 2 + (y - 6) ** 2 <= 42) g[y][x] = 'b';
  }
  px(g, 3, 9, 'c'); px(g, 4, 9, 'c'); px(g, 5, 12, 'c'); px(g, 3, 6, 'b');
  return S(outline(g));
})();
const cloud = (parts, sh) => {
  const g = G(32, 12);
  parts.forEach(([x, y, r]) => disc(g, x, y, r, 'W'));
  for (let y = 9; y < 12; y++) for (let x = 0; x < 32; x++) g[y][x] = '.';
  for (let x = 0; x < 32; x++) {
    let low = -1;
    for (let y = 0; y < 12; y++) if (g[y][x] !== '.') low = y;
    if (low >= 0) { g[low][x] = 's'; if (low > 0 && g[low - 1][x] !== '.' && (x + sh) % 3) g[low - 1][x] = 's'; }
  }
  return S(outline(g));
};
sprites['sky.cloud.0'] = cloud([[9, 7, 4], [15, 5, 5], [22, 7, 4], [26, 8, 3]], 0);
sprites['sky.cloud.1'] = cloud([[6, 8, 3], [12, 6, 5], [19, 7, 4], [25, 6, 4]], 1);
sprites['sky.cloud.2'] = cloud([[8, 7, 4], [14, 7, 3], [20, 5, 4], [24, 7, 3]], 2);
sprites['sky.stars'] = (() => {
  const g = G(64, 32);
  let s = 7;
  const rnd = (n) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s >> 8) % n; };
  for (let i = 0; i < 26; i++) px(g, rnd(64), rnd(32), ['W', 'W', 's', 't'][rnd(4)]);
  [[10, 6], [40, 20], [55, 5], [24, 26]].forEach(([x, y]) => {
    px(g, x, y, 'W'); px(g, x - 1, y, 's'); px(g, x + 1, y, 's'); px(g, x, y - 1, 's'); px(g, x, y + 1, 's');
  });
  return S(g);
})();

// Weather particle fields (tileable, wrap at 16)
const field = (fn) => Array.from({ length: 3 }, (_, f) => { const g = G(16, 16); fn(g, f); return S(g); });
const wrap = (n) => ((n % 16) + 16) % 16;
const RAIN = [[2, 1], [7, 9], [12, 4], [5, 13], [14, 11], [9, 5]];
field((g, f) => RAIN.forEach(([x, y]) => {
  const yy = y + f * 5;
  px(g, wrap(x), wrap(yy), 's'); px(g, wrap(x), wrap(yy + 1), 't'); px(g, wrap(x - 1), wrap(yy + 2), 'u');
})).forEach((s, i) => { sprites[`fx.rain.${i}`] = s; });
const SNOW = [[2, 1, 0], [7, 8, 1], [12, 4, 0], [4, 12, 0], [14, 10, 1], [10, 15, 0]];
field((g, f) => SNOW.forEach(([x, y, big]) => {
  const xx = x + [0, 1, 0][f], yy = y + f * 2;
  px(g, wrap(xx), wrap(yy), 'W');
  if (big) { px(g, wrap(xx - 1), wrap(yy), 's'); px(g, wrap(xx + 1), wrap(yy), 's'); px(g, wrap(xx), wrap(yy - 1), 's'); px(g, wrap(xx), wrap(yy + 1), 's'); }
})).forEach((s, i) => { sprites[`fx.snow.${i}`] = s; });
const LEAF = [[2, 2, 'h', 'i'], [9, 6, 'o', 'p'], [13, 11, 'c', 'd'], [5, 12, 'g', 'h']];
field((g, f) => LEAF.forEach(([x, y, a, b]) => {
  const xx = x + f * 1 + [0, 1, 0][f], yy = y + f * 5;
  px(g, wrap(xx), wrap(yy), a); px(g, wrap(xx + 1), wrap(yy), a); px(g, wrap(xx + 1), wrap(yy + 1), b);
})).forEach((s, i) => { sprites[`fx.leaf.${i}`] = s; });
sprites['fx.splash.0'] = R(['........', '........', '........', '...WW...', '..tWWt..', '........']);
sprites['fx.splash.1'] = R(['........', '........', '..W..W..', '.t.WW.t.', '..tttt..', '........']);
sprites['fx.splash.2'] = R(['........', '........', '.t....t.', 't......t', '.tt..tt.', '..tttt..']);
anims.rain = { id: 'rain', frames: ['fx.rain.0', 'fx.rain.1', 'fx.rain.2'], fps: 6, loop: true };
anims.snow = { id: 'snow', frames: ['fx.snow.0', 'fx.snow.1', 'fx.snow.2'], fps: 6, loop: true };
anims.leaves = { id: 'leaves', frames: ['fx.leaf.0', 'fx.leaf.1', 'fx.leaf.2'], fps: 6, loop: true };

// Wildlife
sprites['bird.fly.0'] = R(['O........O', 'OO......OO', '.OcO..OcO.', '..OcOOcO..', '...OcccOO.', '...OcccEOo', '....OOOO..', '..........']);
sprites['bird.fly.1'] = R(['..........', '..........', 'OOO....OOO', 'OcccOOOccO', '.OOcccccOO', '..OcccEOo.', '...OOOOO..', '..........']);
sprites['bird.fly.2'] = R(['..........', '..........', '...OOOO...', '..OcccEOo.', '.OcccccOO.', 'OcOOcccOO.', 'OcO.OOO...', '.O........']);
anims.bird = { id: 'bird', frames: ['bird.fly.0', 'bird.fly.1', 'bird.fly.2'], fps: 6, loop: true };
sprites['butterfly.0'] = R(['OO....OO', 'OnO..OnO', 'OnnOOnnO', '.OnOOnO.', '.OqOOqO.', 'OqqOOqqO', 'OqO..OqO', '.O....O.']);
sprites['butterfly.1'] = R(['........', '........', '..O..O..', '.OnOOnO.', '.OnOOnO.', '.OqOOqO.', '..O..O..', '........']);
sprites['butterfly.2'] = R(['........', '...OO...', '..OnnO..', '..OnqO..', '..OqnO..', '..OqqO..', '...OO...', '........']);
anims.butterfly = { id: 'butterfly', frames: ['butterfly.0', 'butterfly.1', 'butterfly.2'], fps: 6, loop: true };
const catHead = ['..O.O.........O.', '.OcOcO.......OcO', '.OcEcEO......OcO', '.OcnccOOOOOOOcO.', '..OOcccccccccOO.', '...OcbbbbbbbcO..', '...OcccccccddO..', '...OccdcdccdcO..', '...OOOOOOOOOOO..'];
const cw = (legs) => R([...catHead, ...legs]);
sprites['cat.walk.l.0'] = cw(['...OcO....OcO...', '...OcO....OcO...', '...OOO....OOO...']);
sprites['cat.walk.l.1'] = cw(['..OcO.OcO.OcO...', '..OcO.OcO.OcO...', '..OOO.OOO.OOO...']);
sprites['cat.walk.l.2'] = cw(['....OcOOcO.OcO..', '....OcOOcO.OcO..', '....OOOOOO.OOO..']);
anims['cat.walk.l'] = { id: 'cat.walk.l', frames: ['cat.walk.l.0', 'cat.walk.l.1', 'cat.walk.l.2'], fps: 6, loop: true };
sprites['cat.sit'] = R(['..O.O...........', '.OcOcO..........', '.OcEcEO.........', '.OcnccO.........', '..OOcccO........', '...OcbbcO.......', '...OcbbcO.......', '..OccbbccO....OO', '..OccccccOO.OOcO', '..OcccccccccccO.', '..OOOOOOOOOOOO..', '................']);
sprites['cat.sleep.0'] = R(['................', '................', '................', '................', '................', '................', '....OOOOOOOO....', '..OOccccccccOO..', '.OccccdcdcdccccO', '.OEEcnccccbbbccO', '.OcccccccccccOO.', '..OOOOOOOOOOO...']);
sprites['cat.sleep.1'] = R(['................', '................', '................', '................', '................', '....OOOOOOOO....', '..OOccccccccOO..', '.OccccdcdcdccccO', '.OccccccccbbbccO', '.OEEcnccccccccO.', '.OcccccccccccOO.', '..OOOOOOOOOOO...']);
anims['cat.sleep'] = { id: 'cat.sleep', frames: ['cat.sleep.0', 'cat.sleep.1'], fps: 1, loop: true };

// Emote bubbles
const shell = ['..OOOOOOOOOOOO..', '.OWWWWWWWWWWWWO.', ...Array(9).fill('OWWWWWWWWWWWWWWO'), '.OWWWWWWWWWWWWO.', '..OOOWWOOOOOO...', '...OWO..........', '...OO...........', '................'];
const ICON = {
  heart: ['..ppp..ppp..', '.pnnnppnnnp.', '.pnnnnnnnnp.', '.pnnnnnnnop.', '..pnnnnnop..', '...pnnnop...', '....pnop....', '.....pp.....', '............'],
  cheer: ['n....bb...u.', '.....bb.....', '..bbbbbbbb..', '...bbccbb...', '....bbbb....', '...bbbbbb...', '..bbb..bbb..', '.u...cc...n.', '............'],
  wave: ['...d.d.d....', '..dbdbdbd...', '..dbbbbbbd..', '.dbbbbbbbd..', '.dbbbbbbbd..', '..dbbbbbd...', '...dbbbbd...', '....dddd....', '............'],
  zzz: ['......vvvvv.', '.......vv...', '......vv....', '.....vvvvv..', '..uuuu......', '...uu.......', '..uu........', '..uuuu......', '............'],
  think: ['............', '............', '............', '..qq.qq.qq..', '..rr.rr.rr..', '............', '............', '............', '............'],
  ok: ['............', '.........jh.', '........jhh.', '.jj....jhh..', '..jhj.jhh...', '...jhjhh....', '....jhh.....', '.....j......', '............'],
  knock: ['..eeeeeeee..', '..eccddcce..', '..eccddcce..', '..ecccccce..', '..ecccccce..', '..eccccace..', '..ecccccce..', '..eeeeeeee..', '............'],
  alert: ['....oooo....', '....oppo....', '....oppo....', '....oppo....', '.....pp.....', '............', '....oppo....', '....oooo....', '............'],
  study: ['............', '.dddddddddd.', '.daaaddaaad.', '.dcccddcccd.', '.daaaddaaad.', '.dcccddcccd.', '.daaaddaaad.', '.uuuuuuuuuu.', '............'],
};
for (const [name, ic] of Object.entries(ICON)) {
  const base = shell.map((r) => [...r]);
  ic.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') base[y + 2][x + 2] = c; }));
  const f0 = base.map((r) => r.join(''));
  sprites[`bubble.${name}.0`] = R(f0);
  sprites[`bubble.${name}.1`] = R(['................', ...f0.slice(0, 15)]);
  anims[`bubble.${name}`] = { id: `bubble.${name}`, frames: [`bubble.${name}.0`, `bubble.${name}.1`], fps: 3, loop: true };
}

// Focus ring
for (let k = 0; k <= 8; k++) {
  const g = G(24, 24);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const dx = x - 11.5, dy = y - 11.5, d = Math.hypot(dx, dy);
    if (d < 8.6 || d > 11.2) continue;
    const ang = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
    g[y][x] = ang < (k / 8) * 2 * Math.PI ? (d < 9.8 ? 'i' : 'h') : (d < 9.8 ? 'b' : 'a');
  }
  sprites[`ring.${k}`] = S(g);
}

// UI icons
const icon = (fn) => { const g = G(16, 16); fn(g); return S(outline(g)); };
const tomato = (n, o) => {
  const g = G(n, n), s = n / 16, c = n / 2;
  disc(g, c - 0.5, c + 1 * s, 6 * s, 'o');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x] === 'o' && (x - c) + (y - c) > 5 * s) g[y][x] = 'p';
  rect(g, Math.round(4.5 * s), Math.round(5.5 * s), Math.round(2 * s), Math.round(3 * s), 'm');
  rect(g, Math.round(5 * s), Math.round(3 * s), Math.round(6 * s), Math.round(2 * s), 'h');
  rect(g, Math.round(3.5 * s), Math.round(4 * s), Math.round(3 * s), Math.round(2 * s), 'h');
  rect(g, Math.round(9.5 * s), Math.round(4 * s), Math.round(3 * s), Math.round(2 * s), 'i');
  rect(g, Math.round(7.5 * s), Math.round(1.5 * s), Math.round(1.5 * s), Math.round(3 * s), 'j');
  return S(outline(g));
};
sprites['ui.coin'] = icon((g) => {
  disc(g, 7.5, 7.5, 6, 'b');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'b' && x + y > 17 && (x - 7.5) ** 2 + (y - 7.5) ** 2 > 20) g[y][x] = 'c';
  rect(g, 7, 4, 2, 8, 'd'); px(g, 4, 5, 'a'); px(g, 5, 4, 'a');
});
sprites['ui.play'] = icon((g) => { for (let y = 2; y <= 13; y++) { const n = Math.round(Math.min(y - 2, 13 - y) * 1.9) + 1; rect(g, 4, y, n, 1, 'h'); if (n > 2) px(g, 4, y, 'g'); } });
sprites['ui.pause'] = icon((g) => { rect(g, 4, 2, 3, 12, 'h'); rect(g, 9, 2, 3, 12, 'h'); rect(g, 6, 2, 1, 12, 'i'); rect(g, 11, 2, 1, 12, 'i'); });
sprites['ui.clipboard'] = icon((g) => {
  rect(g, 3, 2, 10, 13, 'd'); rect(g, 4, 4, 8, 10, 'W');
  [6, 8, 10, 12].forEach((y) => rect(g, 5, y, 6, 1, 'c'));
  rect(g, 6, 1, 4, 3, 'b'); rect(g, 7, 2, 2, 1, 'f');
});
sprites['ui.calendar'] = icon((g) => {
  rect(g, 2, 3, 12, 11, 'W'); rect(g, 2, 3, 12, 3, 'p'); rect(g, 4, 1, 2, 3, 'f'); rect(g, 10, 1, 2, 3, 'f');
  for (const y of [8, 10, 12]) for (const x of [4, 7, 10]) px(g, x, y, 'c');
  rect(g, 7, 10, 1, 1, 'p');
});
sprites['ui.backpack'] = icon((g) => {
  rect(g, 3, 4, 10, 11, 'o'); rect(g, 5, 2, 6, 3, 'o'); rect(g, 7, 1, 2, 1, 'e');
  rect(g, 4, 5, 1, 8, 'n'); rect(g, 11, 5, 2, 9, 'p'); rect(g, 5, 10, 6, 4, 'p'); rect(g, 7, 11, 2, 1, 'b');
});
sprites['ui.gear'] = icon((g) => {
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; rect(g, Math.round(7 + 5.6 * Math.cos(a)), Math.round(7 + 5.6 * Math.sin(a)), 3, 3, 'u'); }
  disc(g, 8, 8, 5, 'u'); disc(g, 8, 8, 2, '.');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'u' && x + y < 14) g[y][x] = 't';
});
sprites['ui.tomato'] = tomato(16);
sprites['ui.tomato.big'] = tomato(24);
sprites['ui.check'] = icon((g) => { line(g, 2, 8, 6, 12, 'h'); line(g, 6, 12, 13, 3, 'h'); line(g, 7, 12, 13, 4, 'i', 1); });
sprites['ui.x'] = icon((g) => { line(g, 3, 3, 12, 12, 'o'); line(g, 12, 3, 3, 12, 'o'); });
sprites['ui.bag'] = icon((g) => {
  rect(g, 5, 2, 1, 4, 'e'); rect(g, 10, 2, 1, 4, 'e'); rect(g, 5, 2, 6, 1, 'e');
  rect(g, 3, 5, 10, 10, 'n'); rect(g, 11, 5, 2, 10, 'o'); rect(g, 4, 6, 1, 7, 'm'); rect(g, 6, 8, 4, 3, 'W');
});
sprites['ui.lock'] = icon((g) => {
  rect(g, 5, 1, 6, 1, 'u'); rect(g, 4, 2, 2, 6, 'u'); rect(g, 10, 2, 2, 6, 'u');
  rect(g, 3, 7, 10, 8, 'b'); rect(g, 3, 12, 10, 3, 'c'); rect(g, 7, 9, 2, 3, 'f');
});
sprites['ui.map'] = icon((g) => {
  rect(g, 2, 3, 4, 11, 'g'); rect(g, 6, 3, 4, 11, 'h'); rect(g, 10, 3, 4, 11, 'g');
  line(g, 7, 4, 8, 12, 'u', 1); px(g, 11, 8, 'p'); px(g, 12, 8, 'p'); px(g, 11, 9, 'p'); px(g, 12, 9, 'p');
});
sprites['ui.door'] = icon((g) => {
  rect(g, 4, 1, 8, 14, 'e'); rect(g, 5, 2, 6, 5, 'c'); rect(g, 5, 8, 6, 6, 'c'); px(g, 10, 9, 'a');
});
sprites['ui.chat'] = icon((g) => {
  rect(g, 1, 3, 14, 8, 'W'); [[1, 3], [14, 3], [1, 10], [14, 10]].forEach(([x, y]) => px(g, x, y, '.'));
  rect(g, 2, 10, 12, 1, 's'); rect(g, 4, 11, 2, 2, 'W'); px(g, 4, 13, 'W');
  px(g, 4, 7, 'u'); px(g, 8, 7, 'u'); px(g, 11, 7, 'u');
});
sprites['ui.eye'] = icon((g) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x - 7.5) ** 2 / 36 + (y - 7.5) ** 2 / 12 <= 1) g[y][x] = 'W';
  disc(g, 7.5, 7.5, 3, 'u'); disc(g, 7.5, 7.5, 1.3, 'E'); px(g, 9, 6, 'W');
});

export default {
  sprites,
  anims,
  meta: {
    sky: {
      day: { top: '#8FC8F0', bottom: '#DCEFFF', tint: '#FFFFFF', strength: 0 },
      sunset: { top: '#6A5FB0', bottom: '#FFB27A', tint: '#FFC8A0', strength: 0.2 },
      dusk: { top: '#3F3A7A', bottom: '#C070A0', tint: '#8F80C0', strength: 0.3 },
      night: { top: '#0E1438', bottom: '#2B3F86', tint: '#1A2352', strength: 0.45 },
    },
    phases: { day: [7, 17], sunset: [17, 19], dusk: [19, 21], night: [21, 7] },
  },
};
