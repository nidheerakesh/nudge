export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') typeof v === 'string' ? el.setAttribute('style', v) : Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const t of kids) {
    if (t == null || t === false) continue;
    if (Array.isArray(t)) add(el, t);
    else el.append(t instanceof Node ? t : document.createTextNode(String(t)));
  }
}

const layer = () => document.getElementById('layer') || document.body;
let uid = 0;
let tt = null;
const stack = [];

export function toast(msg, { action, onAction, ms = 4000 } = {}) {
  const old = layer().querySelector('.toast');
  if (old) old.remove();
  clearTimeout(tt);
  const el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, h('span', null, msg));
  const hide = () => { clearTimeout(tt); el.remove(); };
  if (action) el.append(h('button', { type: 'button', onclick: () => { if (onAction) onAction(); hide(); } }, action));
  layer().append(el);
  tt = setTimeout(hide, ms);
}

export function sheet(title, body, { onClose } = {}) {
  const prev = document.activeElement;
  const id = 'sh' + ++uid;
  const bg = h('div', { class: 'sheet-bg' });
  const x = h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Close' }, icon('plus'));
  x.firstChild.style.transform = 'rotate(45deg)';
  const box = h('div', { class: 'body' }, body);
  const el = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
    h('header', null, h('h2', { id }, title), x), box);
  let shut = false;
  const close = () => {
    if (shut) return;
    shut = true;
    const k = stack.indexOf(ctl);
    if (k >= 0) stack.splice(k, 1);
    document.removeEventListener('keydown', key, true);
    bg.remove();
    el.remove();
    if (prev && prev.focus) prev.focus();
    if (onClose) onClose();
  };
  function key(e) {
    if (stack[stack.length - 1] !== ctl) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled);
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (!el.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
    else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  bg.addEventListener('click', close);
  x.addEventListener('click', close);
  const ctl = { close };
  stack.push(ctl);
  document.addEventListener('keydown', key, true);
  layer().append(bg, el);
  const first = box.querySelector('input,select,textarea,button') || x;
  first.focus();
  return ctl;
}

export function closeAll() {
  for (const c of [...stack].reverse()) c.close();
  clearTimeout(tt);
  layer().querySelectorAll('.sheet,.sheet-bg,.toast').forEach(n => n.remove());
}

export function confirmBox(msg, { ok = 'OK', danger = false } = {}) {
  return new Promise(res => {
    let val = false;
    const done = v => { val = v; s.close(); };
    const s = sheet('Please confirm', [
      h('p', null, msg),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => done(true) }, ok)),
    ], { onClose: () => res(val) });
  });
}

export function field(label, input) {
  if (!input.id) input.id = 'f' + ++uid;
  return h('label', { class: 'col', for: input.id }, h('span', { class: 'small' }, label), input);
}

export function chips(opts, val, onPick) {
  return h('div', { class: 'row' }, opts.map(o =>
    h('button', { class: 'chip' + (o.v === val ? ' on' : ''), type: 'button', 'aria-pressed': String(o.v === val), onclick: () => onPick(o.v) }, o.label)));
}

const MA = [
  ['path', 'fur', 'M84 110c20 2 28-14 20-26-3-4-8-2-6 3 4 9-2 16-14 15z'],
  ['ellipse', 'fur', 'cx', 60, 'cy', 106, 'rx', 28, 'ry', 18],
  ['ellipse', 'fur', 'cx', 47, 'cy', 121, 'rx', 8, 'ry', 5],
  ['ellipse', 'fur', 'cx', 73, 'cy', 121, 'rx', 8, 'ry', 5],
  ['path', 'fur', 'M22 66c-2-16 2-28 6-36l2-12 16 12c8-2 20-2 28 0l16-12 2 12c4 8 8 20 6 36-2 20-18 28-38 28S24 86 22 66z'],
  ['path', 'ear', 'm33.5 26 1 7.5 6.5-2.8zM86.5 26l-1 7.5-6.5-2.8z'],
  ['path', 'line', 'M13 65l13 2.5M13 74l13-1.5M107 65l-13 2.5M107 74l-13-1.5'],
  ['ellipse', 'eye', 'cx', 45, 'cy', 64, 'rx', 4.6, 'ry', 5.6],
  ['ellipse', 'eye', 'cx', 75, 'cy', 64, 'rx', 4.6, 'ry', 5.6],
  ['circle', 'shine', 'cx', 46.6, 'cy', 61.8, 'r', 1.7],
  ['circle', 'shine', 'cx', 76.6, 'cy', 61.8, 'r', 1.7],
  ['ellipse', 'blush', 'cx', 35, 'cy', 74, 'rx', 6.5, 'ry', 3.6],
  ['ellipse', 'blush', 'cx', 85, 'cy', 74, 'rx', 6.5, 'ry', 3.6],
  ['path', 'eye', 'M56.5 70h7L60 73.5z'],
  ['path', 'line', 'M53.5 75.5q3.2 4 6.5 0 3.3 4 6.5 0'],
];
const MB = [
  ['path', 'berry', 'M43 31c-2-13 8-25 17-27 9 2 19 14 17 27z'],
  ['ellipse', 'seed', 'cx', 53, 'cy', 17, 'rx', 1.4, 'ry', 2],
  ['ellipse', 'seed', 'cx', 67, 'cy', 17, 'rx', 1.4, 'ry', 2],
  ['ellipse', 'seed', 'cx', 60, 'cy', 11, 'rx', 1.4, 'ry', 2],
  ['ellipse', 'seed', 'cx', 60, 'cy', 23, 'rx', 1.4, 'ry', 2],
  ['ellipse', 'seed', 'cx', 50.5, 'cy', 26, 'rx', 1.4, 'ry', 2],
  ['ellipse', 'seed', 'cx', 69.5, 'cy', 26, 'rx', 1.4, 'ry', 2],
  ['path', 'leaf', 'M37 33l8-6 4 5 6-6 5 6 5-6 6 6 4-5 8 6q-23 6-46 0z'],
];
const MS = {
  fur: 'fill:var(--surface,#fff);stroke:var(--ink,#3b2a35);stroke-width:3;stroke-linejoin:round',
  ear: 'fill:var(--pop,#ff6fa5)',
  line: 'fill:none;stroke:var(--ink,#3b2a35);stroke-width:3;stroke-linecap:round;stroke-linejoin:round',
  eye: 'fill:var(--ink,#3b2a35)',
  shine: 'fill:#fff',
  blush: 'fill:var(--pop,#ff6fa5);opacity:.45',
  berry: 'fill:var(--pop,#ff6fa5);stroke:var(--ink,#3b2a35);stroke-width:3;stroke-linejoin:round',
  seed: 'fill:#fff;opacity:.85',
  leaf: 'fill:var(--ok,#6cc08b);stroke:var(--ink,#3b2a35);stroke-width:3.2;stroke-linejoin:round',
};

function mpart(p, par) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', p[0]);
  if (p[0] === 'path') e.setAttribute('d', p[2]);
  else for (let i = 2; i < p.length; i += 2) e.setAttribute(p[i], p[i + 1]);
  e.setAttribute('style', MS[p[1]]);
  par.append(e);
}

export function mascot() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 120 128');
  s.setAttribute('class', 'mascot');
  s.setAttribute('aria-hidden', 'true');
  MA.forEach(p => mpart(p, s));
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', 'rotate(-9 60 30)');
  MB.forEach(p => mpart(p, g));
  s.append(g);
  return s;
}

export function empty(text, action) {
  return h('div', { class: 'card col', style: { alignItems: 'center', textAlign: 'center' } },
    mascot(), h('p', { class: 'muted' }, text), action || null);
}

export function fmtMins(n) {
  n = Math.round(n || 0);
  const a = Math.floor(n / 60), b = n % 60;
  if (!a) return b + 'm';
  return b ? a + 'h ' + b + 'm' : a + 'h';
}

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
};

export function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
  s.innerHTML = P[name] || '';
  return s;
}
