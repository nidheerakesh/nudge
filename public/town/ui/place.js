const OSM = 'https://www.openstreetmap.org/copyright';

export function openPlace(ctx) {
  const { h } = ctx.ui;
  let res = [];
  let q = '';
  let sel = -1;
  let busy = false;

  const input = h('input', { class: 'k-btn', type: 'text', maxlength: '60', id: 'place-q', style: { minHeight: '44px', width: '100%' } });
  const label = h('label', { for: 'place-q', class: 'small' }, 'Campus or city');
  const go = h('button', { class: 'k-btn', type: 'button', style: { minHeight: '44px' }, onclick: () => search() }, 'Search');
  const status = h('div', { class: 'small', role: 'status', 'aria-live': 'polite', style: { minHeight: '20px' } });
  const list = h('div', { class: 'list col' });
  const move = h('button', { class: 'k-btn pink', type: 'button', style: { minHeight: '44px' }, disabled: true, onclick: () => moveHere() }, 'Move here');
  const credit = h('div', { class: 'small' }, 'Map data © ', h('a', { href: OSM, target: '_blank', rel: 'noopener' }, 'OpenStreetMap contributors'));

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });

  function draw() {
    const kids = res.map((p, i) => h('button', { class: 'item', type: 'button', 'aria-pressed': String(i === sel), style: { minHeight: '44px', textAlign: 'left' }, onclick: () => pick(i) },
      h('strong', null, p.name), h('div', { class: 'small' }, p.display)));
    list.replaceChildren(...kids);
    move.disabled = sel < 0 || busy;
  }

  function pick(i) {
    sel = i;
    draw();
  }

  function busyOn(text) {
    busy = true;
    go.disabled = true;
    move.disabled = true;
    status.textContent = text;
  }

  function busyOff() {
    busy = false;
    go.disabled = false;
    move.disabled = sel < 0;
  }

  async function search() {
    if (busy) return;
    const v = input.value.trim();
    if (v.length < 3) {
      status.textContent = 'Type at least 3 letters';
      return;
    }
    q = v;
    sel = -1;
    res = [];
    draw();
    busyOn('Searching...');
    try {
      const r = await ctx.get('/places?q=' + encodeURIComponent(q));
      res = r.places || [];
      status.textContent = res.length ? '' : 'No places found. Try a fuller name.';
    } catch (e) {
      status.textContent = e && e.code === 'slow' ? 'Please wait a second and try again' : 'Search is not available right now';
    }
    busyOff();
    draw();
  }

  async function moveHere() {
    if (busy || sel < 0) return;
    const p = res[sel];
    busyOn('Building the town, this can take a few seconds');
    try {
      const r = await ctx.post('/place', { q, osm: p.osm });
      await ctx.refresh();
      ctx.toast('Moved to ' + p.name);
      box.close();
      await ctx.enter(r.plot.district);
    } catch (e) {
      const c = e && e.code;
      status.textContent = c === 'full' ? 'That town is full right now' : c === 'map' ? 'Could not load the map for this place. Try again later.' : 'Could not move right now';
      busyOff();
      draw();
    }
  }

  const body = h('div', { class: 'col', style: { gap: '8px' } },
    h('p', { style: { margin: '0' } }, 'Search for your campus or city. Your house moves to a town built from its real streets.'),
    label, input, go, status, list, move, credit);
  const box = ctx.ui.sheet('Choose a real place', h('div', { class: 'k-panel col', style: { padding: '12px' } }, body));
  return box;
}
