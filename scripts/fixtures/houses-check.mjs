import mod, { composeHouse, houseSize, doorTile } from '../../public/town/art/houses.js';

const S = ['hut', 'small', 'medium', 'large', 'manor'];
const R = ['red', 'thatch', 'blue', 'purple'];
const W = ['plaster', 'wood', 'brick'];
const D = ['wood', 'green', 'blue', 'pink'];
let n = 0;
for (const s of S) for (const r of R) for (const w of W) for (const d of D) {
  for (const o of [{}, { night: true, doorOpen: true }]) {
    const sz = houseSize('house:' + s);
    const W_ = sz.w * 16, H_ = sz.h * 16 + 16;
    const dt = doorTile('house:' + s);
    if (dt.y !== sz.h - 1) throw new Error('door row ' + s);
    const p = composeHouse({ size: 'house:' + s, roof: 'roof:' + r, wall: 'wall:' + w, door: 'door:' + d }, o);
    if (!p.length) throw new Error('empty');
    for (const q of p) {
      const sp = mod.sprites[q.sprite];
      if (!sp) throw new Error('missing sprite ' + q.sprite);
      if (q.x < 0 || q.y < 0 || q.x + sp.w > W_ || q.y + sp.h > H_) throw new Error(`out of bounds ${q.sprite} ${s}`);
    }
  }
  n++;
}
if (n !== 240) throw new Error('combos ' + n);
console.log('ok: ' + n + ' combinations');
