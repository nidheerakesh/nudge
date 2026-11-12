import { districtTemplate, W, H } from '/town/shared/plots.js';

const S = 8;
const GROUND = { 0: '#5E9E44', 1: '#68A94C', 2: '#54903C', 3: '#C9A27A', 4: '#D79A63', 5: '#E8D2A8', 6: '#4C8FD6', 7: '#B9C48A', 8: '#8FAE66', 9: '#9B6B3F', 10: '#9B6B3F' };
const NAMES = { boutique: 'Boutique', homestore: 'Home Store', bakery: 'Bakery', library: 'Library', townhall: 'Town Hall' };
const hit = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export function openFullMap(ctx) {
  const { h } = ctx.ui;
  const tpl = districtTemplate();
  const mine = () => (ctx.me && ctx.me.plot) || { district: 0, slot: -1 };
  let d = mine().district;
  let top = d;
  let info = { taken: [], owners: new Map() };
  let sel = -1;
  let busy = false;

  const cv = h('canvas', { width: String(W * S), height: String(H * S), role: 'img', 'aria-label': 'Full town map. Tap a plot to see it.', style: { width: '100%', display: 'block', imageRendering: 'pixelated', touchAction: 'manipulation', border: 'var(--lw, 2px) solid var(--ink)', borderRadius: '8px' } });
  const title = h('strong', { role: 'status', 'aria-live': 'polite' });
  const note = h('div', { class: 'col', role: 'status', 'aria-live': 'polite', style: { minHeight: '64px' } });
  const prev = h('button', { class: 'k-btn', type: 'button', style: { minHeight: '44px' }, onclick: () => go(d - 1) }, 'Prev');
  const next = h('button', { class: 'k-btn', type: 'button', style: { minHeight: '44px' }, onclick: () => go(d + 1) }, 'Next');

  function draw() {
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      g.fillStyle = GROUND[tpl.ground[y][x]] || GROUND[0];
      g.fillRect(x * S, y * S, S, S);
    }
    for (const t of tpl.decor) {
      if (t.kind !== 'tree') continue;
      g.fillStyle = '#3B7A34';
      g.beginPath();
      g.arc(t.x * S + S / 2, t.y * S + S / 2, S * 0.55, 0, 7);
      g.fill();
    }
    g.fillStyle = '#9CC7F0';
    g.fillRect(tpl.fountain.x * S, tpl.fountain.y * S, tpl.fountain.w * S, tpl.fountain.h * S);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 9px sans-serif';
    for (const l of tpl.landmarks) {
      g.fillStyle = '#7B6CF0';
      g.fillRect(l.x * S, l.y * S, l.w * S, l.h * S);
      g.strokeStyle = '#2A1F2D';
      g.lineWidth = 2;
      g.strokeRect(l.x * S, l.y * S, l.w * S, l.h * S);
      g.fillStyle = '#fff';
      g.fillText(NAMES[l.kind] || l.kind, (l.x + l.w / 2) * S, (l.y + l.h / 2) * S);
    }
    const m = mine();
    const tk = new Set(info.taken);
    for (const p of tpl.plots) {
      const isMine = m.district === d && m.slot === p.slot;
      const taken = tk.has(p.slot);
      g.fillStyle = isMine ? '#FFD84D' : taken ? '#E0507A' : 'rgba(150,235,140,0.85)';
      g.fillRect(p.x * S, p.y * S, p.w * S, p.h * S);
      g.strokeStyle = p.slot === sel ? '#fff' : '#2A1F2D';
      g.lineWidth = p.slot === sel ? 4 : 2;
      g.setLineDash(taken || isMine ? [] : [5, 3]);
      g.strokeRect(p.x * S, p.y * S, p.w * S, p.h * S);
      g.setLineDash([]);
      g.fillStyle = '#2A1F2D';
      g.font = '700 12px sans-serif';
      g.fillText(isMine ? 'You' : String(p.slot + 1), (p.x + p.w / 2) * S, (p.y + p.h / 2) * S);
    }
  }

  async function load() {
    title.textContent = 'District ' + (d + 1);
    prev.disabled = d <= 0;
    next.disabled = d + 1 > top + 1;
    info = { taken: [], owners: new Map() };
    try {
      const r = await ctx.get('/plots?district=' + d);
      info.taken = r.taken || [];
      for (const p of r.plots || []) info.owners.set(p.slot, p.owner);
      if (info.taken.length && d > top) top = d;
    } catch (e) { note.replaceChildren(h('span', { class: 'muted' }, 'Could not load this district.')); }
    next.disabled = d + 1 > top + 1;
    sel = -1;
    describe();
    draw();
  }

  function go(n) {
    if (busy || n < 0) return;
    d = n;
    load();
  }

  async function moveHere(slot) {
    const ok = await ctx.ui.confirmBox('Move your house to plot ' + (slot + 1) + ' in district ' + (d + 1) + '? Your furniture and style come with you.', { ok: 'Move house' });
    if (!ok || busy) return;
    busy = true;
    try {
      await ctx.post('/plot', { district: d, slot });
      await ctx.refresh();
      ctx.toast('Your house has a new home.');
      box.close();
      if (ctx.enter) await ctx.enter(d);
    } catch (e) {
      ctx.toast(e && e.code === 'taken' ? 'Someone just took that plot. Pick another.' : 'Could not move the house. Try again.');
      busy = false;
      load();
    }
  }

  function describe() {
    const m = mine();
    const kids = [];
    const b = (label, fn, cls) => h('button', { class: 'k-btn ' + (cls || ''), type: 'button', style: { minHeight: '44px' }, onclick: fn }, label);
    if (sel < 0) {
      kids.push(h('span', { class: 'muted' }, 'Tap a plot. Green dashed plots are free, pink are taken, yellow is yours.'));
      if (ctx.enter && d !== m.district) kids.push(b('Visit this district', () => { box.close(); ctx.enter(d); }));
    } else if (m.district === d && m.slot === sel) {
      kids.push(h('span', null, 'Plot ' + (sel + 1) + ' is your house.'));
    } else if (info.taken.includes(sel)) {
      const o = info.owners.get(sel);
      kids.push(h('span', null, 'Plot ' + (sel + 1) + (o ? ' belongs to ' + (o.name || 'a student') + '.' : ' is taken.')));
      if (ctx.enter && d !== m.district) kids.push(b('Visit this district', () => { box.close(); ctx.enter(d); }));
    } else {
      kids.push(h('span', null, 'Plot ' + (sel + 1) + ' is free.'));
      kids.push(b('Move my house here', () => moveHere(sel), 'pink'));
    }
    note.replaceChildren(...kids);
  }

  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const p = tpl.plots.find((q) => hit(q, x, y));
    sel = p ? p.slot : -1;
    describe();
    draw();
  });

  const body = h('div', { class: 'col', style: { gap: '8px' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, prev, title, next),
    cv, note);
  const box = ctx.ui.sheet('Town map', h('div', { class: 'k-panel col', style: { padding: '12px' } }, body));
  load();
  return box;
}
