import { kicon } from '/town/ui/icons.js';
import { byId, ids } from '/town/shared/catalog.js';
import { PRESETS, missingParts } from '/town/shared/presets.js';
import { drawAvatar, getAvatarFrame, playAnim } from '/town/avatar.js';
import { SKINS, HAIRS, HAIR_NAMES } from '/town/art/palette.js';
import loadAll from '/town/art/index.js';
import { getSprite } from '/town/art/pixel.js';

let art = null;
const ready = () => art || (art = loadAll().catch(() => null));
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const MSG = { coins: 'Not enough coins.', owned: 'You already own that.', not_owned: 'You do not own that yet.', item: 'That item is not available.', qty: 'Pick 1 to 10.', pantry: 'Nothing left to eat.', bounds: 'That does not fit.', max: 'Too many pieces (40 max).' };
export const oops = (ctx, e) => ctx.toast ? ctx.toast(MSG[e && e.code] || 'Something went wrong. Try again.') : ctx.ui.toast(MSG[e && e.code] || 'Something went wrong. Try again.');

export const bal = (ctx) => (ctx.me && ctx.me.balance) || 0;
export const owns = (ctx, id) => {
  const it = byId(id);
  return !!it && (it.price === 0 || (ctx.me.wardrobe || []).includes(id));
};
const tierName = (it) => (it.price === 0 ? 'free' : it.tier);

export function pill(ctx) {
  const { h } = ctx.ui;
  const el = h('span', { class: 'k-pill', role: 'status', 'aria-label': 'Coin balance', style: { fontSize: '14px', padding: '4px 12px' } });
  el.update = () => { el.textContent = bal(ctx) + ' coins'; };
  el.update();
  return el;
}

// Buys through the server, then re-reads the account. The server price and balance win.
export async function buy(ctx, id, qty) {
  const it = byId(id);
  if (!it) return false;
  const n = qty || 1;
  if (bal(ctx) < it.price * n) { oops(ctx, { code: 'coins' }); return false; }
  try {
    const body = it.kind === 'food' ? { item: id, qty: n } : { item: id };
    const r = await ctx.post('/api/town/buy', body);
    if (r && typeof r.balance === 'number') ctx.me.balance = r.balance;
    await ctx.refresh();
    if (ctx.onBalance) ctx.onBalance(ctx.me.balance);
    return true;
  } catch (e) {
    oops(ctx, e);
    try { await ctx.refresh(); } catch (e2) { /* ignore */ }
    return false;
  }
}

export function lookOf(ctx) {
  const a = ctx.me.avatar || {};
  return { skin: a.skin || 1, hair: a.hair || 1, hair_color: a.hair_color || 1, outfit: a.outfit || 'outfit:casual', accessory: a.accessory || null };
}

export function mini(look, scale = 3) {
  const cv = document.createElement('canvas');
  cv.width = 16 * scale;
  cv.height = 24 * scale;
  cv.setAttribute('aria-hidden', 'true');
  cv.style.imageRendering = 'pixelated';
  const g = cv.getContext('2d');
  const paint = () => { try { drawAvatar(g, look, { anim: 'idle', dir: 'd', frame: 0 }, cv.width / 2, cv.height, scale); } catch (e) { /* art not ready */ } };
  paint();
  ready().then(() => { g.clearRect(0, 0, cv.width, cv.height); paint(); });
  return cv;
}

// Live avatar preview with turn, walk, idle and pose buttons.
export function makePreview(ctx, look, o = {}) {
  const { h } = ctx.ui;
  const sc = o.scale || 6;
  const cv = h('canvas', { width: 16 * sc, height: 24 * sc, role: 'img', 'aria-label': 'Avatar preview', style: { imageRendering: 'pixelated', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--line)' } });
  const g = cv.getContext('2d');
  const st = { look, anim: 'idle', dir: 'd', t: 0, frame: 0 };
  const dirs = ['d', 'l', 'u', 'r'];
  let raf = 0, last = 0, on = true, seen = false, food = null;
  const draw = () => {
    g.clearRect(0, 0, cv.width, cv.height);
    try {
      drawAvatar(g, st.look, st, cv.width / 2, cv.height, sc);
      if (food && st.anim === 'break' && st.frame < 2) {
        let sp = null;
        try { sp = getSprite('food.' + food.split(':')[1]); } catch (e) { /* no sprite */ }
        if (sp) g.drawImage(sp, (st.frame ? 8 : 9) * sc, (st.frame ? 4 : 7) * sc, 10 * sc, 10 * sc);
      }
    } catch (e) { /* art not ready */ }
  };
  const tick = (ts) => {
    if (!on) return;
    if (cv.isConnected) seen = true;
    else if (seen) { on = false; return; }
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    playAnim(st, dt);
    draw();
    raf = requestAnimationFrame(tick);
  };
  const go = (anim) => {
    st.anim = anim;
    st.t = 0;
    st.frame = 0;
    if (reduced()) draw();
  };
  const btn = (label, fn) => h('button', { class: 'k-chip', type: 'button', 'aria-label': label, onclick: fn }, label);
  const bar = h('div', { class: 'row' },
    btn('Turn', () => { st.dir = dirs[(dirs.indexOf(st.dir) + 1) % 4]; if (st.anim === 'walk') st.anim = 'walk'; else if (st.anim !== 'idle') go('idle'); if (reduced()) draw(); }),
    btn('Walk', () => go('walk')),
    btn('Idle', () => go('idle')),
    btn('Study', () => go('sit_study')),
    btn('Break', () => go('break')),
    btn('Cheer', () => go('cheer')),
    btn('Knock', () => go('knock')));
  const el = h('div', { class: 'col', style: { alignItems: 'center' } }, cv, o.controls === false ? null : bar);
  ready().then(() => {
    draw();
    if (!reduced() && on && !raf) raf = requestAnimationFrame(tick);
  });
  draw();
  return {
    el,
    set(l) { st.look = l; draw(); },
    play: go,
    setFood(id) { food = id; },
    stop() { on = false; cancelAnimationFrame(raf); },
  };
}

// Item card used by every shop. opts: { active, use: {label, fn}, preview, note }
export function card(ctx, it, opts = {}) {
  const { h } = ctx.ui;
  const own = owns(ctx, it.id);
  const need = it.price - bal(ctx);
  const lock = !own && need > 0;
  const act = [];
  if (opts.preview) act.push(h('button', { class: 'k-btn', type: 'button', 'aria-label': 'Preview ' + it.name, onclick: opts.preview }, 'Preview'));
  if (own && opts.use) {
    act.push(h('button', { class: 'k-btn pink', type: 'button', 'aria-label': opts.use.label + ' ' + it.name, disabled: !!opts.active, onclick: opts.use.fn }, opts.active ? 'Wearing' : opts.use.label));
  } else if (!own) {
    act.push(h('button', { class: 'k-btn pink', type: 'button', 'aria-label': 'Buy ' + it.name + ' for ' + it.price + ' coins', disabled: lock, onclick: opts.buy }, 'Buy for ' + it.price));
  }
  return h('div', { class: 'k-panel col', style: { opacity: lock ? '.6' : '1', marginBottom: '0', alignItems: 'center', textAlign: 'center' } },
    opts.thumb || null,
    h('strong', null, it.name),
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('span', { class: 'badge' }, tierName(it)),
      own ? h('span', { class: 'badge ok' }, it.price === 0 ? 'Free' : 'Owned') : h('span', { class: 'k-pill' }, kicon('coin', 14), it.price + ' coins')),
    lock ? h('span', { class: 'small' }, 'Need ' + need + ' more coins') : null,
    opts.note || null,
    h('div', { class: 'row', style: { justifyContent: 'center' } }, act));
}

export const grid = (ctx, kids) => ctx.ui.h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '10px' } }, kids.filter(Boolean));

// Avatar panel used by the wardrobe and by the Boutique (mirror: true).
export function avatarPanel(ctx, o = {}) {
  const { h, chips } = ctx.ui;
  const tabs = o.tabs || ['presets', 'look', 'outfits', 'accessories'];
  const labels = { presets: 'Presets', look: 'Skin and hair', outfits: 'Outfits', accessories: 'Accessories' };
  let tab = tabs[0];
  let view = lookOf(ctx);
  let busy = false;
  const pv = makePreview(ctx, view);
  const pl = pill(ctx);
  const note = h('span', { class: 'small', role: 'status' });
  const body = h('div', { class: 'col' });
  const tabBar = h('div');
  const same = (a, b) => ['skin', 'hair', 'hair_color', 'outfit', 'accessory'].every((k) => (a[k] || null) === (b[k] || null));

  const setView = (l) => {
    view = { ...l };
    pv.set(view);
    note.textContent = same(view, lookOf(ctx)) ? '' : 'Previewing only. Not worn yet.';
  };
  const redraw = () => {
    pl.update();
    tabBar.replaceChildren(chips(tabs.map((t) => ({ v: t, label: labels[t] })), tab, (v) => { tab = v; redraw(); }));
    body.replaceChildren(...[tab === 'presets' ? presetsView() : tab === 'look' ? lookView() : tab === 'outfits' ? partsView('outfit') : partsView('acc')].filter(Boolean));
  };
  const run = async (fn) => {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { oops(ctx, e); try { await ctx.refresh(); } catch (e2) { /* ignore */ } }
    busy = false;
    setView(lookOf(ctx));
    redraw();
  };
  const wear = (patch) => run(async () => {
    await ctx.put('/api/town/avatar', patch);
    await ctx.refresh();
  });

  function presetsView() {
    const own = new Set(ctx.me.wardrobe || []);
    return grid(ctx, PRESETS.map((p) => {
      const look = { skin: p.skin, hair: p.hair, hair_color: p.hair_color, outfit: p.outfit, accessory: p.accessory };
      const m = missingParts(p, own);
      const lock = m.need.length > 0;
      const poor = lock && m.cost > bal(ctx);
      const btns = [h('button', { class: 'k-btn', type: 'button', 'aria-label': 'Preview ' + p.name, onclick: () => setView(look) }, 'Preview')];
      if (!lock) btns.push(h('button', { class: 'k-btn pink', type: 'button', 'aria-label': 'Wear ' + p.name, onclick: () => wear(look) }, 'Wear'));
      else if (!poor) {
        btns.push(h('button', { class: 'k-btn pink', type: 'button', 'aria-label': 'Buy ' + m.need.length + ' parts for ' + m.cost + ' coins', onclick: () => run(async () => {
          for (const id of m.need) if (!(await buy(ctx, id))) return;
        }) }, 'Buy ' + m.need.length + (m.need.length === 1 ? ' part' : ' parts') + ' for ' + m.cost + ' coins'));
      } else btns.push(h('button', { class: 'k-btn', type: 'button', disabled: true }, 'Locked'));
      return h('div', { class: 'k-panel col', style: { opacity: poor ? '.6' : '1', marginBottom: '0', alignItems: 'center', textAlign: 'center' } },
        mini(look), h('strong', null, p.name),
        lock ? h('span', { class: 'badge warn' }, 'Locked, ' + m.cost + ' coins') : h('span', { class: 'badge ok' }, 'Ready'),
        poor ? h('span', { class: 'small' }, 'Need ' + (m.cost - bal(ctx)) + ' more coins') : null,
        h('div', { class: 'row', style: { justifyContent: 'center' } }, btns));
    }));
  }

  function lookView() {
    const worn = lookOf(ctx);
    const sw = (c, on, label, fn) => h('button', { type: 'button', 'aria-label': label, 'aria-pressed': String(on), onclick: fn, style: { width: '44px', height: '44px', borderRadius: '50%', background: c, border: on ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' } });
    return h('div', { class: 'col' },
      h('strong', null, 'Skin'),
      h('div', { class: 'row' }, SKINS.map((s, i) => sw(s[0], worn.skin === i + 1, 'Skin ' + (i + 1), () => wear({ skin: i + 1 })))),
      h('strong', null, 'Hair style'),
      h('div', { class: 'row' }, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => h('button', { class: 'k-chip' + (worn.hair === n ? ' on' : ''), type: 'button', 'aria-pressed': String(worn.hair === n), 'aria-label': 'Hair style ' + n, style: { minHeight: '44px', minWidth: '44px' }, onclick: () => wear({ hair: n }) }, String(n)))),
      h('strong', null, 'Hair colour'),
      h('div', { class: 'row' }, HAIRS.map((c, i) => sw(c[1], worn.hair_color === i + 1, 'Hair colour ' + HAIR_NAMES[i], () => wear({ hair_color: i + 1 })))),
      h('span', { class: 'small' }, 'Skin and hair are free.'));
  }

  function partsView(kind) {
    const worn = lookOf(ctx);
    const list = ids(kind).map(byId);
    const cards = list.map((it) => {
      const field = kind === 'outfit' ? 'outfit' : 'accessory';
      const next = { ...view, [field]: it.id };
      return card(ctx, it, {
        thumb: mini(next),
        active: worn[field] === it.id,
        preview: () => setView(next),
        use: { label: 'Wear', fn: () => wear({ [field]: it.id }) },
        buy: () => run(async () => { await buy(ctx, it.id); }),
      });
    });
    if (kind === 'acc') {
      cards.unshift(h('div', { class: 'k-panel col', style: { marginBottom: '0', alignItems: 'center', textAlign: 'center' } },
        h('strong', null, 'None'),
        h('button', { class: 'k-btn', type: 'button', 'aria-label': 'Wear no accessory', disabled: !worn.accessory, onclick: () => wear({ accessory: null }) }, 'Take off')));
    }
    return grid(ctx, cards);
  }

  const el = h('div', { class: 'col' },
    o.mirror ? h('p', { class: 'small' }, 'Fitting mirror: preview anything before you buy it.') : null,
    pv.el,
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, pl, note),
    tabBar, body);
  redraw();
  return { el, stop: pv.stop };
}

export function openWardrobe(ctx) {
  return new Promise((res) => {
    const p = avatarPanel(ctx, {});
    ctx.ui.sheet('Wardrobe', h('div', { class: 'k-panel col', style: { padding: '12px' } }, p.el), { onClose: () => { p.stop(); res(); } });
  });
}
