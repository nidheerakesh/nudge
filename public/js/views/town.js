import loadAll from '/town/art/index.js';
import { createEngine } from '/town/engine.js';
import { createTownScene } from '/town/scene.js';
import { createInteriorScene } from '/town/interior.js';
import { drawAvatar, portrait } from '/town/avatar.js';
import { createMinimap } from '/town/minimap.js';
import { connect } from '/town/net.js';
import { TICK_MS } from '/town/shared/protocol.js';
import { createTimerWidget } from '/town/ui/timerwidget.js';
import { createKnock, whyText } from '/town/ui/knock.js';
import { createChat } from '/town/ui/chat.js';
import { kicon } from '/town/ui/icons.js';

const PRESETS = [
  { skin: 1, hair: 1, hair_color: 1 }, { skin: 2, hair: 2, hair_color: 2 }, { skin: 3, hair: 3, hair_color: 3 },
  { skin: 4, hair: 4, hair_color: 4 }, { skin: 5, hair: 5, hair_color: 5 }, { skin: 6, hair: 6, hair_color: 6 },
  { skin: 1, hair: 7, hair_color: 7 }, { skin: 4, hair: 8, hair_color: 8 },
];
const SHOP_KINDS = ['boutique', 'homestore', 'bakery'];
const PRESENCE_MS = 5000;
const NS = 'http://www.w3.org/2000/svg';

let st = null;
let listening = false;

export default function view(root, ctx) {
  if (!listening) {
    listening = true;
    window.addEventListener('hashchange', () => {
      if (st && !location.hash.startsWith('#/town')) { st.destroy(); st = null; }
    });
  }
  if (st) {
    st.c = ctx;
    root.append(st.el);
    st.fit();
    return;
  }
  st = mount(ctx);
  root.append(st.el);
  st.fit();
  st.boot();
}

function mount(c0) {
  const S = { c: c0 };
  const { h } = c0.ui;
  const ui = c0.ui;
  const store = c0.store;
  const dead = () => st !== S || S.dying;

  let me = null;
  let engine = null;
  let canvas = null;
  let net = null;
  let hnet = null;
  let town = null;
  let inter = null;
  let mode = 'street';
  let district = 0;
  let plots = [];
  let pending = null;
  let pendT = 0;
  let wasMoving = false;
  let lastPos = null;
  let lastKey = null;
  let houseOwner = 0;
  let houseFails = 0;
  let houseLost = false;
  let timers = [];
  let offStore = null;
  let widget = null;
  let map = null;
  let mapCv = null;
  const seen = new Map();
  const names = new Map();

  const el = h('div', { class: 'town-frame', style: { position: 'relative', overflow: 'hidden', background: 'var(--bg)' } });
  const pills = h('div', { class: 'k-hud', style: { position: 'absolute', left: '8px', right: '8px', top: '8px', zIndex: '4', pointerEvents: 'none' } });
  const banner = h('div', { class: 'k-panel small', role: 'status', hidden: true, style: { position: 'absolute', left: '8px', right: '8px', top: '60px', zIndex: '3' } });
  S.el = el;

  const uid = () => (S.c.S.user && S.c.S.user.id) || (me && me.plot && me.plot.uid) || 0;
  const reduced = () => !!(engine && engine.reduced);

  // ---------- fetch wrappers ----------
  async function call(method, path, body) {
    const res = await fetch('/api/town' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || String(res.status));
      err.code = (data && data.error) || String(res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const tctx = {
    get me() { return me; },
    refresh: async () => { const m = await call('GET', '/me'); me = m; tctx.onBalance(m.balance, true); return m; },
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p, b) => call('DELETE', p, b),
    ui,
    get engine() { return engine; },
    get net() { return net; },
    toast: (m, o) => ui.toast(m, o),
    returnToStreet: () => returnToStreet(),
    onBalance: (n, quiet) => {
      if (me && typeof n === 'number') me.balance = n;
      coinNum.textContent = String(me ? me.balance : 0);
      coin.setAttribute('aria-label', 'Coins: ' + (me ? me.balance : 0));
    },
  };

  const coinNum = h('span', null, '');
  const coin = h('span', { class: 'k-pill', style: { pointerEvents: 'auto' }, role: 'status' }, kicon('coin'), coinNum);

  const pill = (label, fn, extra, icon) => h('button', {
    class: 'k-btn', type: 'button', 'aria-label': label, title: label, onclick: fn,
    style: { pointerEvents: 'auto', ...(extra || {}) },
  }, kicon(icon), h('span', { class: 'k-lbl' }, label));

  const say = (msg) => { banner.textContent = msg || ''; banner.hidden = !msg; };
  const showInTown = () => store.pref('show_in_town', '1') !== '0';

  // ---------- helpers ----------
  S.fit = () => {
    const r = el.getBoundingClientRect();
    const tb = document.getElementById('tabs');
    const t = tb ? tb.getBoundingClientRect() : null;
    const bar = t && t.width > t.height * 3 ? t.height : 0;
    el.style.height = Math.max(240, window.innerHeight - r.top - bar) + 'px';
    if (engine) engine.resize();
  };
  const onResize = () => S.fit();
  window.addEventListener('resize', onResize);

  const every = (fn, ms) => { timers.push(setInterval(fn, ms)); };

  const wsBase = () => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/town';

  const lazy = async (path, name, ...args) => {
    try {
      const mod = await import(path);
      if (typeof mod[name] !== 'function') throw new Error('missing');
      return await mod[name](tctx, ...args);
    } catch (e) {
      ui.toast('Coming soon');
      return null;
    }
  };

  // ---------- welcome ----------
  function welcome() {
    let pick = 0;
    const name = h('input', { type: 'text', maxlength: '24', placeholder: 'e.g. Cozy Corner', autocomplete: 'off' });
    const btns = PRESETS.map((p, i) => {
      const cv = document.createElement('canvas');
      cv.width = 32;
      cv.height = 32;
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'width:64px;height:64px;image-rendering:pixelated';
      try { cv.getContext('2d').drawImage(portrait({ ...p, accessory: null }), 0, 0); } catch (e) { /* no art */ }
      const b = h('button', {
        class: 'k-chip' + (i === pick ? ' on' : ''), type: 'button', 'aria-label': 'Look ' + (i + 1), 'aria-pressed': String(i === pick),
        style: { width: '72px', height: '72px' },
        onclick: () => {
          pick = i;
          btns.forEach((x, j) => {
            x.setAttribute('aria-pressed', String(j === i));
            x.classList.toggle('on', j === i);
          });
        },
      }, cv);
      return b;
    });
    const go = h('button', { class: 'k-btn pink', type: 'button', 'aria-label': 'Move in', onclick: async () => {
      go.disabled = true;
      try {
        await tctx.post('/join', {});
        try { await tctx.put('/avatar', PRESETS[pick]); } catch (e) { /* keep default look */ }
        const hn = name.value.trim();
        if (hn) { try { await tctx.put('/house', { name: hn }); } catch (e) { /* keep default name */ } }
        await tctx.refresh();
        if (dead()) return;
        el.replaceChildren();
        start();
      } catch (e) {
        go.disabled = false;
        ui.toast('Could not move in. Try again.');
      }
    } }, 'Move in');
    el.style.height = '';
    el.replaceChildren(h('div', { class: 'wrap col', style: { paddingTop: '16px', paddingBottom: '24px' } },
      h('h2', null, h('span', { class: 'k-title' }, 'Welcome to Nudge Town')),
      h('p', { class: 'muted' }, 'A cozy place to study alongside friends. Pick a look and name your house.'),
      h('div', { class: 'card col' },
        h('div', { role: 'group', 'aria-label': 'Choose a look', class: 'row' }, ...btns),
        ui.field('House name', name),
        go)));
    S.fit();
  }

  // ---------- street ----------
  function sceneMe(extra) {
    const a = me.avatar || {};
    return { id: uid(), name: a.name || '', look: a, st: 'idle', act: 'active', ...(extra || {}) };
  }

  // Scene calls draw(ctx, look, anim, t, x, y, o); drawAvatar takes (ctx, look, state, x, y).
  function sceneAvatar(ctx, look, anim, t, x, y, o) {
    o = o || {};
    const moving = !!o.moving;
    drawAvatar(ctx, look, { anim: moving ? 'walk' : 'idle', dir: moving ? o.dir : 'd', frame: moving ? Math.floor(t * 8) : 0 }, x, y);
  }

  function buildTown(spawn) {
    if (town) town.destroy();
    town = createTownScene({
      engine, district, plots, players: [...seen.values()], me: sceneMe(spawn), drawAvatar: sceneAvatar,
    });
    town.onDoor = onDoor;
    town.onLandmark = onLandmark;
    town.onPlayer = (id) => { const p = seen.get(id); if (p && p.name) ui.toast(p.name); };
    engine.setScene(town);
    lastKey = null;
    presence();
  }

  async function enterDistrict(n) {
    if (net) { net.close(); net = null; }
    seen.clear();
    district = n;
    try { plots = (await tctx.get('/plots?district=' + n)).plots || []; } catch (e) { plots = []; }
    if (dead()) return;
    for (const p of plots) if (p.owner) names.set(p.owner.id, p.owner.name);
    buildTown();
    if (map) { map.setCurrent(n); map.draw(); }
    connectDistrict();
  }

  function connectDistrict() {
    if (net) { net.close(); net = null; }
    if (!showInTown()) {
      say('You are hidden. Turn on "Show me in the town" in Settings to meet others.');
      return;
    }
    say('');
    const mine = net = connect(wsBase() + '/ws?district=' + district, {
      open: () => { if (dead() || net !== mine) return; say(''); lastKey = null; presence(); },
      close: (was) => { if (!dead() && net === mine && was) say('Reconnecting...'); },
      message: (m) => { if (!dead() && net === mine) onDistrictMsg(m); },
    });
  }

  function onDistrictMsg(m) {
    const self = uid();
    switch (m.t) {
      case 'snap':
        seen.clear();
        for (const p of m.players) if (p.id !== self) { seen.set(p.id, p); names.set(p.id, p.name); }
        if (town) town.setPlayers([...seen.values()]);
        break;
      case 'join':
        if (m.p.id === self) break;
        seen.set(m.p.id, m.p);
        names.set(m.p.id, m.p.name);
        if (town) { if (seen.has(m.p.id) && town.updatePlayer) town.addPlayer(m.p); }
        break;
      case 'part':
        seen.delete(m.id);
        if (town) town.removePlayer(m.id);
        break;
      case 'pos':
        for (const e of m.list) {
          const p = seen.get(e.id);
          if (p) { p.x = e.x; p.y = e.y; p.dir = e.dir; p.a = e.a; }
          if (town) town.updatePlayer(e.id, { x: e.x, y: e.y, dir: e.dir, a: e.a });
        }
        break;
      case 'emote':
        if (town) town.emote(m.id, m.k);
        break;
      case 'knock':
        knock.incoming(m, (id, allow) => { if (net) net.send({ t: 'reply', id, allow }); });
        break;
      case 'result':
        onResult(m);
        break;
      case 'err':
        if (m.code === 'nojoin') say('Move in first to join the town.');
        else if (m.code === 'full') say('This district is full right now. Try another one on the map.');
        else if (m.code === 'rate') { knock.done(); pending = null; ui.toast('Too many knocks. Try again in a minute.'); }
        break;
    }
  }

  // ---------- presence ----------
  function presence(fromStore) {
    const t = store.timer();
    let s = 'idle';
    let left = 0;
    if (t) {
      left = Math.max(0, Math.ceil(store.remainingMs(t) / 1000));
      s = t.paused_at ? 'break' : 'focus';
    }
    const changed = s !== lastKey;
    if (fromStore && !changed) return;
    if (!changed && s === 'idle') return;
    lastKey = s;
    const msg = { t: 'timer', st: s, left: Math.min(left, 86400) };
    if (net) net.send(msg);
    if (hnet) hnet.send(msg);
    if (town && mode === 'street') town.setMe({ st: s, left });
  }

  function sendPos() {
    if (mode !== 'street' || !town || !net) return;
    const p = town.player();
    if (!p.moving && !wasMoving) return;
    wasMoving = !!p.moving;
    const dir = ['d', 'u', 'l', 'r'].includes(p.dir) ? p.dir : 'd';
    const a = /^[a-z0-9_.]{1,32}$/.test(p.a || '') ? p.a : 'idle.d';
    const x = Math.min(60, Math.max(0, p.x));
    const y = Math.min(60, Math.max(0, p.y));
    net.send({ t: 'pos', x, y, dir, a });
  }

  // ---------- knock / house ----------
  const knock = createKnock({ ui, portrait, host: el });

  function onDoor(owner) {
    if (mode !== 'street') return;
    if (owner === uid()) { enterHouse(owner); return; }
    if (!net || !net.open) { ui.toast(showInTown() ? 'Still connecting' : 'Turn on "Show me in the town" to visit'); return; }
    if (pending) return;
    const plot = plots.find((p) => p.owner && p.owner.id === owner);
    const open = plot && plot.house && plot.house.door_mode === 'open';
    pending = { house: owner };
    clearTimeout(pendT);
    pendT = setTimeout(() => { if (pending && pending.house === owner) { pending = null; knock.done(); } }, 65000);
    if (town) town.knock(owner);
    if (!open) {
      knock.waiting(plot && plot.owner ? plot.owner.name : '', () => { pending = null; });
    }
    net.send({ t: 'knock', house: owner });
  }

  function onResult(m) {
    if (!pending || pending.house !== m.house) return;
    pending = null;
    clearTimeout(pendT);
    knock.done();
    if (m.ok) enterHouse(m.house);
    else knock.notice(m.why);
  }

  async function enterHouse(owner) {
    if (mode !== 'street') return;
    mode = 'house';
    houseOwner = owner;
    houseFails = 0;
    houseLost = false;
    if (town) lastPos = town.player();
    let info = null;
    try { info = await tctx.get('/house/' + owner); } catch (e) { info = null; }
    if (dead()) return;
    if (!info) { mode = 'street'; ui.toast(whyText('closed')); return; }
    if (info.owner && info.owner.name) names.set(owner, info.owner.name);
    openHouseNet(owner, info);
  }

  function openHouseNet(owner, info) {
    if (net) net.send({ t: 'enter', house: owner });
    chat.reset();
    chatPill.hidden = false;
    wardPill.hidden = true;
    const mine = hnet = connect(wsBase() + '/house/' + owner + '/ws', {
      open: () => { houseFails = 0; houseLost = false; lastKey = null; presence(); },
      close: (was) => {
        if (dead() || hnet !== mine || mode !== 'house') return;
        if (was) { houseLost = true; return; }
        houseFails++;
        if (houseLost || houseFails >= 2) {
          ui.toast(houseLost ? 'You were asked to leave' : 'Could not get into the house');
          returnToStreet();
        }
      },
      message: (m) => { if (!dead() && hnet === mine) onHouseMsg(m, info); },
    });
  }

  function onHouseMsg(m, info) {
    switch (m.t) {
      case 'inside':
        if (!inter) {
          inter = createInteriorScene({
            engine, house: info.house, items: info.items || [], members: m.members, me: sceneMe(),
            onExit: () => { returnToStreet(); },
          });
          engine.setScene(inter);
          say('');
        } else inter.setMembers(m.members);
        chat.setMembers(m.members);
        break;
      case 'chat':
        chat.push(m);
        break;
      case 'emote':
        chat.push({ id: m.id, name: names.get(m.id) || 'Someone', text: m.k === 'heart' ? 'sent a heart' : 'cheers!' });
        break;
      case 'err':
        if (m.code === 'full') ui.toast('The house is full right now');
        else if (m.code === 'blocked' || m.code === 'forbidden') ui.toast(whyText('blocked'));
        else chat.err(m.code);
        if (m.code === 'full' || m.code === 'blocked' || m.code === 'forbidden') returnToStreet();
        break;
    }
  }

  async function returnToStreet() {
    if (dead() || mode === 'street') return;
    const was = mode;
    mode = 'street';
    if (was === 'shop' && net) net.send({ t: 'shop', kind: null });
    if (hnet) {
      hnet.send({ t: 'leave' });
      hnet.close();
      hnet = null;
    }
    if (inter) { inter.destroy(); inter = null; }
    chat.close();
    chat.reset();
    chatPill.hidden = true;
    wardPill.hidden = false;
    if (net && was === 'house') net.send({ t: 'leave' });
    wasMoving = false;
    buildTown(lastPos ? { x: lastPos.x, y: lastPos.y } : undefined);
    try { await tctx.refresh(); } catch (e) { /* keep old balance */ }
  }

  // ---------- landmarks ----------
  async function onLandmark(kind) {
    if (mode !== 'street') return;
    const hall = kind === 'library' || kind === 'hall';
    if (!hall && !SHOP_KINDS.includes(kind)) return;
    mode = 'shop';
    if (net) net.send({ t: 'shop', kind: hall ? 'hall' : kind });
    wasMoving = false;
    let ok = true;
    try {
      const mod = hall ? await import('/town/hall.js') : await import('/town/shops.js');
      const fn = hall ? mod.openHallScene : mod.openShopScene;
      if (typeof fn !== 'function') throw new Error('missing');
      if (hall) await fn(tctx); else await fn(tctx, kind);
    } catch (e) {
      ok = false;
      ui.toast('Coming soon');
    }
    if (dead()) return;
    if (mode === 'shop' || !ok) {
      if (mode !== 'shop') mode = 'shop';
      returnToStreet();
    }
  }

  // ---------- chat ----------
  const chat = createChat({
    ui, host: el,
    selfId: uid,
    isOwner: () => houseOwner === uid(),
    send: (m) => (hnet ? hnet.send(m) : false),
    onReport: async (p) => {
      try { await tctx.post('/report', { user: p.id, reason: 'abuse', text: '' }); ui.toast('Thanks, we will take a look'); } catch (e) { ui.toast('Could not send the report'); }
    },
    onBlock: async (p) => {
      try {
        await tctx.post('/block', { user: p.id });
        if (me && !me.blocked.includes(p.id)) me.blocked.push(p.id);
        ui.toast(p.name + ' is blocked');
      } catch (e) { ui.toast('Could not block'); }
    },
  });

  // ---------- map ----------
  const mapBox = h('div', { class: 'k-panel', hidden: true, style: { position: 'absolute', left: '8px', top: '60px', zIndex: '4', padding: '8px' } });
  function toggleMap() {
    mapBox.hidden = !mapBox.hidden;
    if (!mapBox.hidden) {
      if (!mapCv) {
        mapCv = h('canvas', { width: '160', height: '160', role: 'img', 'aria-label': 'Town map. Tap a district to travel.', style: { width: '160px', height: '160px', display: 'block', touchAction: 'manipulation' } });
        const list = h('div', { class: 'row', style: { marginTop: '6px' } });
        const nav = (d) => h('button', { class: 'btn', type: 'button', 'aria-label': d.label, onclick: d.fn }, d.t);
        list.append(nav({ t: 'Prev', label: 'Previous district', fn: () => travel(Math.max(0, district - 1)) }), nav({ t: 'Next', label: 'Next district', fn: () => travel(district + 1) }));
        mapBox.append(mapCv, list);
        map = createMinimap({ canvas: mapCv, count: Math.max(9, district + 4), current: district, onPick: (i) => travel(i) });
      }
      map.setCurrent(district);
      map.draw();
    }
  }
  function travel(i) {
    if (mode !== 'street' || i === district) return;
    if (map) map.setCount(Math.max(map.count || 0, i + 2, 9));
    enterDistrict(i);
  }

  // ---------- settings ----------
  function settings() {
    const toggle = (label, key, help) => {
      const cb = h('input', { type: 'checkbox', id: 'tw_' + key, style: { width: '24px', height: '24px' } });
      cb.checked = key === 'show_in_town' ? showInTown() : store.pref(key, '0') === '1';
      cb.addEventListener('change', async () => {
        try {
          await store.setPrefs({ [key]: cb.checked ? '1' : '0' });
          if (me && key !== 'show_in_town') me[key] = cb.checked;
          if (key === 'show_in_town') {
            if (!cb.checked && mode === 'house') await returnToStreet();
            connectDistrict();
          }
        } catch (e) {
          cb.checked = !cb.checked;
          ui.toast('Could not save that');
        }
      });
      return h('div', { class: 'col' },
        h('label', { class: 'row', for: 'tw_' + key, style: { minHeight: '44px', flexWrap: 'nowrap' } }, cb, h('span', null, label)),
        h('span', { class: 'small' }, help));
    };
    const cur = (me.house && me.house.door_mode) || 'knock';
    const modes = [['knock', 'Knock'], ['open', 'Open'], ['closed', 'Closed']];
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Door mode' });
    const draw = (v) => {
      seg.replaceChildren(...modes.map(([k, l]) => h('button', {
        type: 'button', class: v === k ? 'on' : '', 'aria-pressed': String(v === k), 'aria-label': 'Door ' + l,
        onclick: async () => {
          try { await tctx.put('/house', { door_mode: k }); me.house.door_mode = k; draw(k); } catch (e) { ui.toast('Could not change the door'); }
        },
      }, l)));
    };
    draw(cur);
    const blocked = h('div', { class: 'list' });
    const drawBlocked = () => {
      const ids = me.blocked || [];
      blocked.replaceChildren(...(ids.length ? ids.map((id) => h('div', { class: 'item' },
        h('span', { class: 'grow' }, names.get(id) || 'Player ' + id),
        h('button', { class: 'btn', type: 'button', 'aria-label': 'Unblock ' + (names.get(id) || 'player ' + id), onclick: async () => {
          try { await tctx.del('/block/' + id); me.blocked = me.blocked.filter((x) => x !== id); drawBlocked(); } catch (e) { ui.toast('Could not unblock'); }
        } }, 'Unblock'))) : [h('div', { class: 'item muted' }, 'Nobody blocked')]));
    };
    drawBlocked();
    ui.sheet('Town settings', [
      toggle('Show me in the town', 'show_in_town', 'When off, nobody can see or knock on your door.'),
      toggle('Share my study stats', 'share_stats', 'Others can see how many minutes you studied and how focused you were.'),
      toggle('Share my subject', 'share_subject', 'Others can see the course code of what you are studying.'),
      h('div', { class: 'col' }, h('strong', null, 'Door'), seg),
      h('div', { class: 'col' }, h('strong', null, 'Blocked people'), blocked),
    ]);
  }

  // ---------- boot ----------
  const chatPill = pill('Chat', () => chat.toggle(), { display: '' }, 'chat');
  chatPill.hidden = true;
  const wardPill = pill('Wardrobe', () => lazy('/town/ui/wardrobe.js', 'openWardrobe'), null, 'shirt');
  const housePill = pill('House', () => lazy('/town/ui/housedit.js', 'openHouseEditor'), null, 'house');

  async function start() {
    tctx.onBalance(me.balance);
    pills.replaceChildren(coin, pill('Map', toggleMap, null, 'map'), chatPill, wardPill, housePill, pill('Guide', () => lazy('/town/ui/guide.js', 'openGuide'), null, 'heart'), pill('Settings', settings, null, 'gear'));
    canvas = h('canvas', {
      role: 'img', tabindex: '0',
      'aria-label': 'Nudge Town. Use the arrow keys or tap to walk around. Walk to a door to knock.',
      style: { display: 'block', width: '100%', height: '100%', touchAction: 'none' },
    });
    el.replaceChildren(canvas, pills, banner, mapBox);
    el.append(chat.el);
    widget = createTimerWidget({ ui, store });
    widget.el.style.cssText += ';position:absolute;right:8px;bottom:8px;z-index:4';
    el.append(widget.el);
    S.fit();
    engine = createEngine(canvas, {});
    engine.start();
    offStore = store.on(() => presence(true));
    every(sendPos, TICK_MS);
    every(() => { presence(); if (map && !mapBox.hidden && town) { const p = town.player(); map.setPlayer({ district, x: p.x, y: p.y }); map.draw(); } }, PRESENCE_MS);
    await enterDistrict(me.plot.district);
    let seen = true;
    try { seen = !!localStorage.getItem('town_guide'); localStorage.setItem('town_guide', '1'); } catch (e) { /* storage blocked */ }
    if (!seen && !dead()) lazy('/town/ui/guide.js', 'openGuide');
  }

  S.boot = async () => {
    el.replaceChildren(h('div', { class: 'wrap' }, h('p', { class: 'muted', role: 'status' }, 'Loading the town...')));
    try {
      me = await call('GET', '/me');
    } catch (e) {
      el.replaceChildren(h('div', { class: 'wrap' }, ui.empty('Could not load the town. Try again soon.')));
      return;
    }
    try { await loadAll(); } catch (e) { /* art is optional, drawing falls back to nothing */ }
    if (dead()) return;
    if (!me.joined) welcome();
    else start();
  };

  S.destroy = () => {
    S.dying = true;
    if (tctx.leaveScene) { try { tctx.leaveScene(); } catch (e) { /* scene already gone */ } }
    window.removeEventListener('resize', onResize);
    timers.forEach(clearInterval);
    timers = [];
    clearTimeout(pendT);
    if (offStore) offStore();
    if (widget) widget.destroy();
    if (hnet) { hnet.send({ t: 'leave' }); hnet.close(); hnet = null; }
    if (net) { net.close(); net = null; }
    if (inter) inter.destroy();
    if (town) town.destroy();
    if (map) map.destroy();
    chat.destroy();
    knock.destroy();
    if (engine) engine.destroy();
    el.remove();
  };

  void NS; void reduced;
  return S;
}
