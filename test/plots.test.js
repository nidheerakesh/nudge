import { test } from 'node:test';
import assert from 'node:assert/strict';
import { districtTemplate, spiral, nextSlot, plotWorld, WALK } from '../public/town/shared/plots.js';

const T = districtTemplate();
const inR = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function blocked() {
  const bl = new Set();
  const fill = r => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) bl.add(x + ',' + y); };
  for (const l of T.landmarks) fill(l);
  fill(T.fountain);
  for (const l of T.landmarks) bl.delete(l.door.x + ',' + l.door.y);
  return bl;
}

function reach(sx, sy) {
  const bl = blocked();
  const seen = new Set([sx + ',' + sy]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx >= T.w || ny >= T.h || seen.has(k) || bl.has(k)) continue;
      if (!WALK.has(T.ground[ny][nx])) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

test('template is deterministic and sized', () => {
  assert.equal(T.w, 56);
  assert.equal(T.h, 44);
  assert.equal(T.ground.length, 44);
  assert.equal(T.ground[0].length, 56);
  assert.equal(JSON.stringify(districtTemplate()), JSON.stringify(districtTemplate()));
});

test('landmarks have doors on the square and do not overlap plots', () => {
  const kinds = T.landmarks.map(l => l.kind).sort();
  assert.deepEqual(kinds, ['bakery', 'boutique', 'homestore', 'library', 'townhall']);
  const sq = reach(27, 19);
  for (const l of T.landmarks) {
    assert.ok(inR(l.door.x, l.door.y, l));
    assert.equal(l.door.y, l.y + l.h - 1);
    assert.ok(WALK.has(T.ground[l.door.y + 1][l.door.x]), l.kind);
    assert.ok(sq.has(l.door.x + ',' + (l.door.y + 1)), l.kind + ' outside tile');
    assert.ok(sq.has(l.door.x + ',' + l.door.y), l.kind + ' door');
    for (const p of T.plots) assert.ok(!ov(l, p), l.kind);
  }
});

test('40 distinct plots, no overlaps, none on square or river', () => {
  assert.equal(T.plots.length, 40);
  assert.equal(new Set(T.plots.map(p => p.slot)).size, 40);
  for (let i = 0; i < 40; i++) {
    const p = T.plots[i];
    assert.equal(p.slot, i);
    assert.equal(p.w, 6);
    assert.equal(p.h, 5);
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= T.w && p.y + p.h <= T.h);
    assert.ok(!ov(p, T.square));
    assert.ok(inR(p.door.x, p.door.y, p));
    assert.ok(['n', 's'].includes(p.face));
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const g = T.ground[y][x];
      assert.ok(g <= 3, 'plot tile ' + x + ',' + y + ' is ' + g);
    }
    for (let j = i + 1; j < 40; j++) assert.ok(!ov(p, T.plots[j]), i + ' vs ' + j);
  }
});

test('river has a bridge', () => {
  const flat = T.ground.flat();
  assert.ok(flat.includes(6));
  assert.ok(flat.includes(10));
});

test('every plot door reaches the square', () => {
  const sq = reach(27, 19);
  for (const p of T.plots) {
    assert.ok(WALK.has(T.ground[p.door.y][p.door.x]));
    assert.ok(sq.has(p.door.x + ',' + p.door.y), 'plot ' + p.slot);
    const fy = p.face === 's' ? p.door.y + 1 : p.door.y - 1;
    assert.equal(T.ground[fy][p.door.x], 3, 'path in front of plot ' + p.slot);
  }
});

test('gates connect to the square and sit on road', () => {
  const sq = reach(27, 19);
  for (const k of ['n', 'e', 's', 'w']) {
    const g = T.gates[k];
    assert.equal(T.ground[g.y][g.x], 4);
    assert.ok(sq.has(g.x + ',' + g.y), k);
  }
});

test('decor sits on grass outside plots', () => {
  assert.ok(T.decor.length > 20);
  const kinds = new Set(T.decor.map(d => d.kind));
  for (const k of ['tree', 'bush', 'flower', 'flowerbed', 'lamp', 'bench', 'fence']) assert.ok(kinds.has(k), k);
  for (const d of T.decor) {
    assert.ok(T.ground[d.y][d.x] <= 2);
    for (const p of T.plots) assert.ok(!inR(d.x, d.y, p));
  }
});

test('plaza, fountain, landmark doors, lilies and trees', () => {
  const flat = T.ground.flat();
  assert.ok(flat.filter(t => t === 5).length >= 120);
  const f = T.fountain;
  assert.equal(f.w, 4);
  assert.equal(f.h, 3);
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) assert.equal(T.ground[y][x], 5);
  const sq = reach(27, 19);
  for (const l of T.landmarks) {
    assert.ok(WALK.has(T.ground[l.door.y][l.door.x]), l.kind);
    assert.equal(l.door.x, l.x + (l.kind === 'townhall' ? 3 : 2));
    assert.ok([3, 4, 5].includes(T.ground[l.door.y + 1][l.door.x]), l.kind + ' front');
    assert.ok(sq.has(l.door.x + ',' + (l.door.y + 1)), l.kind + ' reach');
  }
  assert.ok(T.lilies.length >= 4 && T.lilies.length <= 8);
  for (const l of T.lilies) assert.equal(T.ground[l.y][l.x], 6);
  const trees = T.decor.filter(d => d.kind === 'tree');
  assert.ok(trees.length >= 60);
  assert.ok(trees.filter(d => d.treeKind === 'cherry').length >= trees.length * 0.25);
  for (const t of trees) assert.ok(['cherry', 'green', 'pine'].includes(t.treeKind));
});

test('spiral order', () => {
  const want = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [2, -1]];
  want.forEach(([dx, dy], i) => assert.deepEqual(spiral(i), { dx, dy }, 'i=' + i));
  const seen = new Set();
  let prev = spiral(0);
  for (let i = 0; i < 49; i++) {
    const s = spiral(i);
    seen.add(s.dx + ',' + s.dy);
    if (i) assert.equal(Math.abs(s.dx - prev.dx) + Math.abs(s.dy - prev.dy) <= 1 || (s.dx === prev.dx + 1 && s.dy === prev.dy - 2 + 1), true);
    prev = s;
  }
  assert.equal(seen.size, 49);
});

test('nextSlot fills district 0 then 1', () => {
  const taken = new Set();
  for (let i = 0; i < 40; i++) {
    const n = nextSlot(taken);
    assert.deepEqual(n, { district: 0, slot: i });
    taken.add(n.district + ':' + n.slot);
  }
  assert.deepEqual(nextSlot(taken), { district: 1, slot: 0 });
  taken.delete('0:5');
  assert.deepEqual(nextSlot(taken), { district: 0, slot: 5 });
});

test('plotWorld offsets by district', () => {
  const a = plotWorld(0, 3);
  const b = plotWorld(1, 3);
  assert.equal(b.x - a.x, 56);
  assert.equal(b.y, a.y);
  assert.equal(plotWorld(2, 0).y - plotWorld(0, 0).y, 44);
  assert.equal(plotWorld(0, 99), null);
});
