import { kicon } from '/town/ui/icons.js';
import { byId, ids } from '/town/shared/catalog.js';
import { SIZES, furnInfo } from '/town/interior.js';
import { avatarPanel, buy, card, grid, oops, pill, bal, owns } from '/town/ui/wardrobe.js';

const TITLES = { boutique: 'Boutique', homestore: 'Home store', bakery: 'Bakery' };

function homestore(ctx) {
  const { h, chips } = ctx.ui;
  const tabs = [['furn', 'Furniture'], ['floor', 'Floors'], ['wallpaper', 'Wallpaper'], ['roof', 'Roofs'], ['wall', 'Walls'], ['door', 'Doors'], ['house', 'Builder']];
  let tab = 'furn';
  const pl = pill(ctx);
  const tabBar = h('div');
  const body = h('div', { class: 'col' });
  const redraw = () => {
    pl.update();
    tabBar.replaceChildren(chips(tabs.map(([v, label]) => ({ v, label })), tab, (v) => { tab = v; redraw(); }));
    body.replaceChildren(...[tab === 'house' ? builder() : list(tab)].filter(Boolean));
  };
  const doBuy = async (id) => { await buy(ctx, id); redraw(); };
  function list(kind) {
    return grid(ctx, ids(kind).map(byId).map((it) => card(ctx, it, {
      buy: () => doBuy(it.id),
      note: kind === 'furn' ? h('span', { class: 'small' }, (() => { const f = furnInfo(it.id); return f ? f.w + 'x' + f.h + (f.wall ? ', wall' : f.flat ? ', floor' : '') : ''; })()) : null,
    })));
  }
  function builder() {
    const cur = ctx.me.house ? ctx.me.house.size : 'house:hut';
    const curDim = SIZES[cur] || SIZES['house:hut'];
    const list = ids('house').map(byId);
    return h('div', { class: 'col' },
      h('p', { class: 'small' }, 'Builder counter: bigger houses have more room inside. Your furniture stays put.'),
      grid(ctx, list.map((it) => {
        const d = SIZES[it.id];
        const here = it.id === cur;
        const own = owns(ctx, it.id);
        const note = h('span', { class: 'small' }, 'Inside: ' + d[0] + 'x' + d[1] + (d[0] * d[1] > curDim[0] * curDim[1] ? ' (from ' + curDim[0] + 'x' + curDim[1] + ')' : ''));
        const c = card(ctx, it, {
          note: here ? h('div', { class: 'col', style: { alignItems: 'center' } }, note, h('span', { class: 'badge ok' }, 'Your house')) : note,
          buy: () => doBuy(it.id),
          use: own && !here ? { label: 'Move in', fn: async () => {
            try { await ctx.put('/house', { size: it.id }); await ctx.refresh(); ctx.toast('Your house is now ' + it.name + '.'); } catch (e) { oops(ctx, e); }
            redraw();
          } } : null,
          active: false,
        });
        return c;
      })),
      h('p', { class: 'small' }, 'Buy a size, then tap Move in to use it. A smaller size only works if everything fits.'));
  }
  const el = h('div', { class: 'col' }, h('div', { class: 'row' }, pl), tabBar, body);
  redraw();
  return el;
}

function bakery(ctx) {
  const { h } = ctx.ui;
  const pl = pill(ctx);
  const qty = {};
  const body = h('div');
  const redraw = () => {
    pl.update();
    body.replaceChildren(grid(ctx, ids('food').map(byId).map((it) => {
      const q = qty[it.id] || 1;
      const total = it.price * q;
      const lock = total > bal(ctx);
      const have = (ctx.me.pantry && ctx.me.pantry[it.id]) || 0;
      const step = (d) => { qty[it.id] = Math.max(1, Math.min(10, q + d)); redraw(); };
      const sb = (label, d, dis) => h('button', { class: 'k-btn', type: 'button', 'aria-label': label + ' ' + it.name, disabled: dis, style: { minWidth: '44px', minHeight: '44px' }, onclick: () => step(d) }, d < 0 ? '-' : '+');
      return h('div', { class: 'k-panel col', style: { marginBottom: '0', alignItems: 'center', textAlign: 'center', opacity: lock ? '.6' : '1' } },
        h('strong', null, it.name),
        h('span', { class: 'k-pill' }, kicon('coin', 14), it.price + ' coins each'),
        have ? h('span', { class: 'small' }, 'In pantry: ' + have) : null,
        h('div', { class: 'row', style: { justifyContent: 'center', alignItems: 'center' } }, sb('Less', -1, q <= 1), h('strong', { 'aria-live': 'polite', 'aria-label': 'Quantity ' + q }, String(q)), sb('More', 1, q >= 10)),
        lock ? h('span', { class: 'small' }, 'Need ' + (total - bal(ctx)) + ' more coins') : null,
        h('button', { class: 'k-btn pink', type: 'button', disabled: lock, 'aria-label': 'Buy ' + q + ' ' + it.name + ' for ' + total + ' coins', onclick: async () => {
          if (await buy(ctx, it.id, q)) ctx.toast('Bought ' + q + ' ' + it.name + '.');
          redraw();
        } }, 'Buy ' + q + ' for ' + total));
    })));
  };
  redraw();
  return h('div', { class: 'col' }, h('div', { class: 'row' }, pl), h('p', { class: 'small' }, 'Eat food from your pantry to stay well fed for 2 hours.'), body);
}

export function openShop(ctx, kind) {
  return new Promise((res) => {
    let stop = null;
    let el;
    if (kind === 'boutique') {
      const p = avatarPanel(ctx, { mirror: true, tabs: ['outfits', 'accessories', 'presets'] });
      stop = p.stop;
      el = p.el;
    } else if (kind === 'bakery') el = bakery(ctx);
    else el = homestore(ctx);
    ctx.ui.sheet(TITLES[kind] || 'Shop', h('div', { class: 'k-panel col', style: { padding: '12px' } }, el), { onClose: () => { if (stop) stop(); res(); } });
  });
}
