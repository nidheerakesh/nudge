import { h } from '../js/ui.js';

const EVERY = 30000;
let sid = 0;
let timer = null;
let card = null;
let tick = null;
let getPaused = () => false;

function layer() {
  return document.getElementById('layer') || document.body;
}

async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) return null;
  return r.json();
}

function hide() {
  clearInterval(tick);
  tick = null;
  if (card) card.remove();
  card = null;
}

function show(check) {
  if (card && card.dataset.id === String(check.id)) return;
  hide();
  const R = 20;
  const C = 2 * Math.PI * R;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', '48');
  svg.setAttribute('height', '48');
  svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(ns, 'circle');
  for (const [k, v] of [['cx', 24], ['cy', 24], ['r', R], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', 4], ['stroke-dasharray', C], ['transform', 'rotate(-90 24 24)']]) ring.setAttribute(k, v);
  svg.append(ring);
  const secs = h('span', { class: 'small' });
  const btn = h('button', { class: 'btn primary', type: 'button', style: { flex: '1', minHeight: '56px', fontSize: '16px' }, onclick: answer }, 'Still studying? Tap to confirm');
  card = h('div', {
    class: 'card row', 'aria-live': 'polite', role: 'status', 'data-id': String(check.id),
    style: { position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '88px', zIndex: '60', maxWidth: 'calc(100vw - 32px)', alignItems: 'center', gap: '12px', boxShadow: '0 4px 14px rgba(0,0,0,.25)' },
  }, h('div', { style: { position: 'relative', width: '48px', height: '48px', flex: 'none' } }, svg, h('div', { style: { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, secs)), btn);
  layer().append(card);
  const draw = () => {
    const left = Math.max(0, check.expires - Date.now());
    secs.textContent = String(Math.ceil(left / 1000));
    ring.setAttribute('stroke-dashoffset', C * (1 - left / Math.max(1, check.expires - check.due)));
    if (left <= 0) hide();
  };
  draw();
  tick = setInterval(draw, 500);
  async function answer() {
    btn.disabled = true;
    hide();
    await post('/api/focus/checkin', { id: check.id }).catch(() => null);
  }
}

async function ping() {
  if (!sid) return;
  const res = await post('/api/focus/ping', { session_id: sid, paused: !!getPaused() }).catch(() => null);
  if (res && res.check) show(res.check);
}

function vis() {
  if (document.visibilityState === 'visible') ping();
}

export function start(id, paused) {
  if (sid === id && timer) return;
  stop();
  sid = id;
  if (typeof paused === 'function') getPaused = paused;
  document.addEventListener('visibilitychange', vis);
  timer = setInterval(ping, EVERY);
  ping();
}

export function stop() {
  clearInterval(timer);
  timer = null;
  sid = 0;
  getPaused = () => false;
  document.removeEventListener('visibilitychange', vis);
  hide();
}
