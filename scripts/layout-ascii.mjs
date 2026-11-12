import { readFileSync } from 'node:fs';
import { project, makeLayout } from '../public/town/shared/layout.js';

const path = process.argv[2] || new URL('../test/fixtures/kottayam.json', import.meta.url);
const box = { s: 9.75322, w: 76.64809, n: 9.75758, e: 76.65372 };
const osm = JSON.parse(readFileSync(path, 'utf8'));
const lay = makeLayout(project(osm, box));
if (!lay) {
  console.log('null');
  process.exit(1);
}

const TILE = { 0: '.', 1: '.', 2: '.', 3: ':', 4: '#', 5: 'o', 6: '~', 8: ',', 10: '=' };
const grid = lay.ground.map(row => row.map(v => TILE[v] || '?'));
const put = (r, c) => {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = c;
};

for (const r of lay.real) put(r, 'B');
for (const l of lay.landmarks) put(l, 'L');
put(lay.fountain, 'F');
for (const p of lay.plots) put(p, 'H');
for (const p of lay.plots) grid[p.door.y][p.door.x] = 'D';
for (const d of lay.decor) if (d.kind === 'tree') grid[d.y][d.x] = 'T';

for (const row of grid) console.log(row.join(''));
for (const r of lay.real) console.log(`${r.name === null ? '-' : r.name} ${r.x} ${r.y} ${r.w} ${r.h}`);
console.log(`plots: ${lay.plots.length} real: ${lay.real.length}`);
