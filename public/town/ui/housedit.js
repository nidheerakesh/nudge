import { byId, ids } from '/town/shared/catalog.js';
import { MAX_ITEMS, furnInfo, createInteriorScene } from '/town/interior.js';
import { composeHouse } from '/town/art/houses.js';
import { getSprite } from '/town/art/pixel.js';
import loadAll from '/town/art/index.js';
import { lookOf, oops, owns } from '/town/ui/wardrobe.js';

const STYLE = [['roof', 'Roof'], ['wall', 'Walls'], ['door', 'Door'], ['floor', 'Floor'], ['wallpaper', 'Wallpaper']];
const MODES = [{ v: 'knock', label: 'Knock' }, { v: 'open', label: 'Open' }, { v: 'closed', label: 'Closed' }];

function drawHouse(cv, look) {
  const g = cv.getContext('2d');
  const parts = [];
  try {
    for (const p of composeHouse(look, {})) parts.push({ p, s: getSprite(p.sprite) });
  } catch (e) { return; }
  let w = 0, hh = 0;
  for (const { p, s } of parts) { w = Math.max(w, p.x + s.width); hh = Math.max(hh, p.y + s.height); }
  const k = Math.max(1, Math.floor(Math.min(220 / (w || 1), 180 / (hh || 1))));
  cv.width = Math.max(1, w * k);
  cv.height = Math.max(1, hh * k);
  g.imageSmoothingEnabled = false;
  for (const { p, s } of parts) g.drawImage(s, p.x * k, p.y * k, s.width * k, s.height * k);
}

function styleSheet(ctx) {
  return new Promise((res) => {
    const { h, chips, field } = ctx.ui;
    const hs = ctx.me.house || {};
    const sel = { roof: hs.roof, wall: hs.wall, door: hs.door, floor: hs.floor, wallpaper: hs.wallpaper };
    let mode = hs.door_mode || 'knock';
    const name = h('input', { type: 'text', maxlength: '24', value: hs.name || '', 'aria-label': 'House name', style: { minHeight: '44px' } });
    const cv = h('canvas', { width: 10, height: 10, role: 'img', 'aria-label': 'House preview', style: { imageRendering: 'pixelated', maxWidth: '100%' } });
    const paint = () => drawHouse(cv, { size: hs.size, roof: sel.roof, wall: sel.wall, door: sel.door });
    const rows = h('div', { class: 'col' });
    const modeBox = h('div');
    let busy = false;
    const draw = () => {
      rows.replaceChildren(...STYLE.map(([k, label]) => {
        const opts = ids(k).filter((id) => owns(ctx, id) || id === sel[k]).map((id) => ({ v: id, label: byId(id).name }));
        return h('div', { class: 'col' }, h('strong', null, label), chips(opts, sel[k], (v) => { sel[k] = v; draw(); paint(); }));
      }));
      modeBox.replaceChildren(chips(MODES, mode, (v) => { mode = v; draw(); }));
    };
    const save = h('button', { class: 'k-btn pink', type: 'button', style: { minHeight: '44px' }, onclick: async () => {
      if (busy) return;
      busy = true;
      try {
        await ctx.put('/house', { ...sel, name: name.value.trim().slice(0, 24), door_mode: mode });
        await ctx.refresh();
        ctx.toast('House saved.');
        box.close();
      } catch (e) { oops(ctx, e); }
      busy = false;
    } }, 'Save');
    draw();
    loadAll().catch(() => null).then(paint);
    const body = h('div', { class: 'col' },
      h('div', { class: 'row', style: { justifyContent: 'center' } }, cv),
      field ? field('House name', name) : name,
      rows,
      h('strong', null, 'Door'), modeBox,
      save);
    const box = ctx.ui.sheet('Style your house', h('div', { class: 'k-panel col', style: { padding: '12px' } }, body), { onClose: res });
  });
}

// Furnish: the interior scene runs on the engine canvas with a non-modal tray at the bottom.
function furnish(ctx) {
  return new Promise((res) => {
    const { h } = ctx.ui;
    const hs = ctx.me.house || {};
    const meInfo = { name: (ctx.me.avatar && ctx.me.avatar.name) || '', look: lookOf(ctx) };
    const mk = (items) => createInteriorScene({ engine: ctx.engine, house: hs, items, members: [], me: meInfo });
    const scene = mk(hs.items || []);
    scene.editMode(true);
    ctx.engine.setScene(scene);
    const key = (l) => JSON.stringify(l.map((i) => [i.item_id, i.x, i.y, i.flip]));
    let saved = key(scene.items());
    let pick = null;      // inventory id waiting to be placed
    let sel = -1;         // selected placed piece
    let moving = false;
    let busy = false;
    const dirty = () => key(scene.items()) !== saved;
    const info = h('div', { class: 'small', role: 'status', 'aria-live': 'polite' });
    const inv = h('div', { class: 'row', style: { overflowX: 'auto', flexWrap: 'nowrap' } });
    const tools = h('div', { class: 'row' });
    const say = (t) => { info.textContent = t; };
    const whyText = { bounds: 'That does not fit there.', overlap: 'Something is already there.', door: 'Keep the doorway clear.', max: 'Limit is ' + MAX_ITEMS + ' pieces.', dup: 'Another piece uses that tile.' };
    const free = (id, x, y, skip) => {
      const r = scene.canPlace(id, x, y, skip);
      if (!r.ok) return r;
      if (scene.items().some((it, i) => i !== skip && it.x === x && it.y === y)) return { ok: false, why: 'dup' };
      return r;
    };
    const redraw = () => {
      const items = scene.items();
      const owned = ids('furn').filter((id) => owns(ctx, id));
      inv.replaceChildren(...owned.map((id) => h('button', { class: 'k-chip' + (pick === id ? ' on' : ''), type: 'button', 'aria-pressed': String(pick === id), 'aria-label': 'Place ' + byId(id).name, style: { minHeight: '44px', flex: '0 0 auto' }, onclick: () => { pick = pick === id ? null : id; sel = -1; moving = false; say(pick ? 'Tap a tile to place ' + byId(id).name + '.' : ''); redraw(); } }, byId(id).name)));
      const b = (label, fn, dis) => h('button', { class: 'k-btn', type: 'button', 'aria-label': label, disabled: !!dis, style: { minHeight: '44px' }, onclick: fn }, label);
      const cur = sel >= 0 ? items[sel] : null;
      tools.replaceChildren(...[
        h('span', { class: 'badge' }, items.length + '/' + MAX_ITEMS),
        cur ? b(moving ? 'Tap new tile' : 'Move', () => { moving = !moving; say(moving ? 'Tap a tile to move it there.' : ''); redraw(); }) : null,
        cur ? b('Flip', () => reflip(), false) : null,
        cur ? b('Delete', () => { scene.remove(sel); sel = -1; moving = false; say('Removed.'); redraw(); }) : null,
        h('button', { class: 'k-btn pink', type: 'button', disabled: busy || !dirty(), style: { minHeight: '44px' }, onclick: save }, 'Save'),
        b('Done', leave)].filter(Boolean));
    };
    function reflip() {
      const it = scene.items()[sel];
      if (!it) return;
      scene.remove(sel);
      const r = scene.place(it.item_id, it.x, it.y, it.flip ? 0 : 1);
      sel = r.ok ? r.index : (scene.place(it.item_id, it.x, it.y, it.flip), scene.items().length - 1);
      redraw();
    }
    scene.onCell = (x, y) => {
      const items = scene.items();
      if (pick) {
        const r = free(pick, x, y, -1);
        if (!r.ok) { say(whyText[r.why] || 'Cannot place that.'); return; }
        const p = scene.place(pick, x, y, 0);
        if (p.ok) { sel = p.index; say(byId(pick).name + ' placed.'); pick = null; }
        redraw();
        return;
      }
      if (moving && sel >= 0) {
        const it = items[sel];
        const r = free(it.item_id, x, y, sel);
        if (!r.ok) { say(whyText[r.why] || 'Cannot move it there.'); return; }
        scene.remove(sel);
        const p = scene.place(it.item_id, x, y, it.flip);
        sel = p.ok ? p.index : -1;
        moving = false;
        say('Moved.');
        redraw();
        return;
      }
      const i = scene.at(x, y);
      sel = i;
      moving = false;
      const f = i >= 0 ? furnInfo(items[i].item_id) : null;
      say(f ? f.name + ' selected.' : '');
      redraw();
    };
    async function save() {
      if (busy || !dirty()) return true;
      busy = true;
      redraw();
      let ok = false;
      try {
        await ctx.put('/house/items', { items: scene.items().map((i) => ({ item_id: i.item_id, x: i.x, y: i.y, flip: i.flip ? 1 : 0 })) });
        saved = key(scene.items());
        await ctx.refresh();
        say('Saved.');
        ok = true;
      } catch (e) { oops(ctx, e); }
      busy = false;
      redraw();
      return ok;
    }
    async function leave() {
      if (dirty()) {
        const yes = await ctx.ui.confirmBox('You have unsaved changes. Leave without saving?', { ok: 'Leave', danger: true });
        if (!yes) return;
      }
      scene.destroy();
      tray.remove();
      const fresh = mk((ctx.me.house && ctx.me.house.items) || []);
      ctx.engine.setScene(fresh);
      res();
    }
    const tray = h('div', { role: 'region', 'aria-label': 'Furniture editor', class: 'k-panel', style: { position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '40', background: 'var(--card, #fff)', borderTop: '1px solid var(--line)', padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: '8px' } },
      info, inv, tools);
    document.body.appendChild(tray);
    redraw();
    say('Pick a piece below, then tap a tile. Tap a placed piece to move, flip or delete it.');
  });
}

export async function openHouseEditor(ctx) {
  const { h } = ctx.ui;
  const choice = await new Promise((res) => {
    let pickd = null;
    const go = (m) => { pickd = m; box.close(); };
    const body = h('div', { class: 'col' },
      h('button', { class: 'k-btn pink', type: 'button', style: { minHeight: '44px' }, onclick: () => go('style') }, 'Style: roof, walls, door, name'),
      h('button', { class: 'k-btn pink', type: 'button', style: { minHeight: '44px' }, onclick: () => go('furnish') }, 'Furnish: place furniture inside'));
    const box = ctx.ui.sheet('Your house', h('div', { class: 'k-panel col', style: { padding: '12px' } }, body), { onClose: () => res(pickd) });
  });
  if (choice === 'style') await styleSheet(ctx);
  else if (choice === 'furnish') await furnish(ctx);
}
