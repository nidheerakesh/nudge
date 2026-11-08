import { getSprite, getAnim, has } from './art/pixel.js';
import { SKINS, HAIRS, SKIN_CH } from './art/palette.js';
import oa from './art/outfits_a.js';
import ob from './art/outfits_b.js';

const W = 16;
const H = 24;
const OUTFITS = Object.assign({}, oa.meta.outfits, ob.meta.outfits);
const cache = new Map();
const DIRS = ['d', 'u', 'l'];
const POSES = ['sit_study', 'break', 'cheer', 'knock'];
const SHORTS_CUT = 21;
const SKIRT_CUT = 22;

const mk = (w, h) => {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
};

const clampI = (v, n) => Math.max(1, Math.min(n, (v | 0) || 1));
const nameOf = (id, def) => {
  const s = String(id || '');
  const n = s.includes(':') ? s.split(':')[1] : s;
  return n || def;
};

// Split 'walk.l' style names into base and optional direction.
function parseAnim(anim, dir) {
  let base = String(anim || 'idle');
  let d = dir;
  const m = /^(.*)\.([dulr])$/.exec(base);
  if (m) {
    base = m[1];
    if (!dir) d = m[2];
  }
  if (!DIRS.includes(d) && d !== 'r') d = 'd';
  return { base, d };
}

// Resolve (anim, dir, frame) to an anim frame record, the sprite direction and the flip flag.
function resolve(base, dir, frame) {
  const flip = dir === 'r';
  let d = flip ? 'l' : dir;
  let a;
  let f = frame | 0;
  if (base === 'walk') a = getAnim('walk.' + d);
  else if (base === 'idle') {
    if (d === 'd') a = getAnim('idle.d');
    else {
      a = getAnim('walk.' + d);
      f = 0;
    }
  } else if (POSES.includes(base)) {
    a = getAnim(base);
    d = base === 'knock' ? 'u' : 'd';
  }
  if (!a) {
    a = getAnim('idle.d');
    d = 'd';
  }
  const n = a.frames.length;
  return { fr: a.frames[((f % n) + n) % n], d, flip: flip && POSES.includes(base) ? false : flip };
}

const put = (ctx, id, x, y, o) => {
  if (has(id)) ctx.drawImage(getSprite(id, o), x, y);
};

function layers(ctx, look, fr, d, withBody) {
  const si = clampI(look.skin, SKINS.length) - 1;
  const hi = clampI(look.hair_color, HAIRS.length) - 1;
  const name = nameOf(look.outfit, 'casual');
  const of = OUTFITS[name] || OUTFITS.casual;
  const c = of.c || ['m', 'n', 'p'];
  const o = { skin: si, hair: hi, colors: c };
  const hx = fr.hx || 0;
  const hy = fr.hy || 0;
  const tx = fr.tx || 0;
  const ty = fr.ty || 0;
  const hs = 'hair.' + clampI(look.hair, 8) + '.' + d;
  const bt = of.bottom;
  const bid = fr.body || fr.sprite;
  if (withBody) {
    put(ctx, 'shadow', 2, 21, o);
    put(ctx, hs + '.back', hx, hy, o);
    const legs = getSprite(bid, { skin: si, hair: hi, colors: c, legs: c[1] || c[0] });
    if (bt === 'shorts' || bt === 'skirt') {
      ctx.drawImage(getSprite(bid, { skin: si, hair: hi, colors: c, legs: SKIN_CH(si, 1) }), 0, 0);
      const cut = bt === 'shorts' ? SHORTS_CUT : SKIRT_CUT;
      ctx.drawImage(legs, 0, 0, W, cut, 0, 0, W, cut);
    } else ctx.drawImage(legs, 0, 0);
    if (bt === 'skirt' || bt === 'dress' || bt === 'robe') put(ctx, of.top.replace('.top', '.bottom') + '.' + d, 0, 14, o);
    put(ctx, of.top + '.' + d, tx, 13 + ty, o);
  } else put(ctx, hs + '.back', hx, hy, o);
  put(ctx, 'head.' + d, 2 + hx, 3 + hy, o);
  put(ctx, hs + '.front', hx, hy, o);
  const acc = nameOf(look.accessory, '');
  if (acc) put(ctx, 'acc.' + acc + '.' + d, hx, hy, o);
  if (withBody && fr.prop) put(ctx, fr.prop.id, fr.prop.x, fr.prop.y, o);
}

export function getAvatarFrame(look, anim, dir, frame) {
  look = look || {};
  const p = parseAnim(anim, dir);
  const key = [look.skin, look.hair, look.hair_color, look.outfit, look.accessory, p.base, p.d, frame | 0].join('|');
  let cv = cache.get(key);
  if (cv) return cv;
  const r = resolve(p.base, p.d, frame);
  const tmp = mk(W, H);
  layers(tmp.getContext('2d'), look, r.fr, r.d, true);
  if (r.flip) {
    cv = mk(W, H);
    const ctx = cv.getContext('2d');
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tmp, 0, 0);
  } else cv = tmp;
  cache.set(key, cv);
  return cv;
}

// state = { anim, t, frame }; t in seconds. Returns the same state, advanced.
export function playAnim(state, dt) {
  const p = parseAnim(state.anim, state.dir);
  const r = resolve(p.base, p.d, 0);
  const a = p.base === 'walk' ? getAnim('walk.' + (r.d)) : p.base === 'idle' ? getAnim('idle.' + r.d) || getAnim('walk.' + r.d) : getAnim(p.base);
  if (!a) return state;
  const n = a.frames.length;
  state.t = (state.t || 0) + dt;
  const f = Math.floor(state.t * (a.fps || 1));
  if (a.loop === false) state.frame = Math.min(n - 1, f);
  else state.frame = f % n;
  return state;
}

// p = { moving, dir, st, desk, emote, emoteAt, knocking }
export function animFor(p, now) {
  const dir = p.dir || 'd';
  if (p.knocking) return 'knock';
  if (p.moving) return 'walk.' + dir;
  if (p.emote === 'cheer' && (p.emoteAt == null || (now || Date.now()) - p.emoteAt < 3000)) return 'cheer';
  if (p.st === 'break') return 'break';
  if (p.st === 'focus' && p.desk) return 'sit_study';
  return 'idle.' + (p.st === 'focus' ? 'd' : dir);
}

export function drawAvatar(ctx, look, state, x, y, scale = 1) {
  state = state || {};
  const cv = getAvatarFrame(look, state.anim || 'idle', state.dir, state.frame | 0);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, Math.round(x - (W / 2) * scale), Math.round(y - H * scale), W * scale, H * scale);
  ctx.imageSmoothingEnabled = prev;
}

const pcache = new Map();
export function portrait(look) {
  look = look || {};
  const key = [look.skin, look.hair, look.hair_color, look.accessory].join('|');
  let cv = pcache.get(key);
  if (cv) return cv;
  const r = resolve('idle', 'd', 0);
  const tmp = mk(W, H);
  layers(tmp.getContext('2d'), { ...look, outfit: 'outfit:casual' }, r.fr, 'd', false);
  cv = mk(32, 32);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, W, 14, 0, 2, 32, 28);
  pcache.set(key, cv);
  return cv;
}
