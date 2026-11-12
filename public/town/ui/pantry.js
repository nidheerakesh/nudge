import { byId } from '/town/shared/catalog.js';
import { lookOf, makePreview, oops } from '/town/ui/wardrobe.js';

const FED_MS = 2 * 60 * 60 * 1000;

function left(ctx) {
  const t = ctx.me.fed_until ? new Date(ctx.me.fed_until).getTime() : 0;
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : 0;
}

export function openPantry(ctx) {
  return new Promise((res) => {
    const { h, empty } = ctx.ui;
    const pv = makePreview(ctx, lookOf(ctx), { scale: 5, controls: false });
    const status = h('div', { role: 'status', 'aria-live': 'polite' });
    const list = h('div', { class: 'col' });
    let busy = false;
    let timer = 0;
    const fmt = (ms) => {
      const m = Math.ceil(ms / 60000);
      return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min';
    };
    const tickStatus = () => {
      const ms = left(ctx);
      status.replaceChildren(ms > 0
        ? h('span', { class: 'badge ok' }, 'Well fed, ' + fmt(Math.min(ms, FED_MS)) + ' left')
        : h('span', { class: 'badge' }, 'Hungry. Eat something to get the well-fed boost.'));
    };
    const redraw = () => {
      tickStatus();
      const rows = Object.entries(ctx.me.pantry || {}).filter(([id, q]) => q > 0 && byId(id));
      if (!rows.length) { list.replaceChildren(empty ? empty('Your pantry is empty. Visit the bakery.') : h('p', { class: 'muted' }, 'Your pantry is empty. Visit the bakery.')); return; }
      list.replaceChildren(...rows.map(([id, q]) => {
        const it = byId(id);
        return h('div', { class: 'k-panel row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' } },
          h('div', { class: 'col' }, h('strong', null, it.name), h('span', { class: 'small' }, 'x' + q)),
          h('button', { class: 'k-btn pink', type: 'button', disabled: busy, 'aria-label': 'Eat ' + it.name, style: { minHeight: '44px' }, onclick: () => eat(id) }, 'Eat'));
      }));
    };
    async function eat(id) {
      if (busy) return;
      busy = true;
      redraw();
      try {
        const r = await ctx.post('/eat', { item: id });
        if (r && r.fed_until) ctx.me.fed_until = r.fed_until;
        pv.setFood(id);
        pv.play('break');
        await ctx.refresh();
        ctx.toast('Yum! Well fed for 2 hours.');
      } catch (e) {
        oops(ctx, e);
        try { await ctx.refresh(); } catch (e2) { /* ignore */ }
      }
      busy = false;
      redraw();
    }
    redraw();
    timer = setInterval(tickStatus, 30000);
    ctx.ui.sheet('Pantry', h('div', { class: 'k-panel col', style: { padding: '12px' } }, h('div', { class: 'row', style: { justifyContent: 'center' } }, pv.el), status, list), {
      onClose: () => { clearInterval(timer); pv.stop(); res(); },
    });
  });
}
