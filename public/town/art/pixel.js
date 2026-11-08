import { GLOBAL, OUTLINE, WHITE, EYE, BLUSH, EXT, SKINS, HAIRS, SKIN_CH, HAIR_CH, OUTFIT } from './palette.js';

const sprites = {};
const anims = {};
const metas = {};
const cache = new Map();

const idx = (v, n) => Math.max(0, Math.min(n - 1, (v | 0) || 0));
const col = (c) => OUTFIT[c] || c;

export function recolorRows(rows, opts = {}) {
  const si = idx(opts.skin, SKINS.length);
  const hi = idx(opts.hair, HAIRS.length);
  const cs = (opts.colors || ['n', 'r', 'o']).map(col);
  const map = {
    1: SKIN_CH(si, 0), 2: SKIN_CH(si, 1), 3: SKIN_CH(si, 2),
    4: HAIR_CH(hi, 0), 5: HAIR_CH(hi, 1), 6: HAIR_CH(hi, 2),
    7: cs[0] || 'n', 8: cs[1] || cs[0] || 'r', 9: cs[2] || cs[0] || 'o',
    L: col(opts.legs) || cs[0] || SKIN_CH(si, 1),
  };
  return rows.map((row) => {
    let out = '';
    for (const ch of row) out += map[ch] || ch;
    return opts.flip ? [...out].reverse().join('') : out;
  });
}

const hexOf = (ch) => {
  if (ch === 'O') return OUTLINE;
  if (ch === 'W') return WHITE;
  if (ch === 'E') return EYE;
  if (ch === 'B') return BLUSH;
  return EXT[ch] || GLOBAL[ch] || null;
};

const mk = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export function decode(sprite, opts = {}, id = '?') {
  const rows = recolorRows(sprite.rows, opts);
  const cv = mk(sprite.w, sprite.h);
  const ctx = cv.getContext('2d');
  for (let y = 0; y < rows.length; y++) {
    let x = 0;
    for (const ch of rows[y]) {
      if (ch !== '.') {
        const c = hexOf(ch);
        if (!c) throw new Error(`sprite ${id}: unknown char '${ch}' at row ${y} col ${x}`);
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
      x++;
    }
  }
  return cv;
}

export function register(mod) {
  const m = mod && mod.default ? mod.default : mod;
  if (!m) return 0;
  Object.assign(sprites, m.sprites || {});
  Object.assign(anims, m.anims || {});
  Object.assign(metas, m.meta ? { [Object.keys(metas).length]: m.meta } : {});
  cache.clear();
  return Object.keys(m.sprites || {}).length;
}

export function has(id) {
  return Object.prototype.hasOwnProperty.call(sprites, id);
}

export function getSprite(id, opts = {}) {
  const key = id + '|' + JSON.stringify(opts);
  let cv = cache.get(key);
  if (cv) return cv;
  if (!has(id)) throw new Error(`sprite ${id}: not registered`);
  cv = decode(sprites[id], opts, id);
  cache.set(key, cv);
  return cv;
}

export function getAnim(id) {
  return anims[id] || null;
}

export const ids = () => Object.keys(sprites);
export const animIds = () => Object.keys(anims);
