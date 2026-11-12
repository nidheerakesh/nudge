import * as ui from './ui.js';
import * as store from './store.js';
import { api } from './api.js';
import { parseQuick } from './parse.js';

const { h, icon } = ui;
const { S } = store;
const TABS = [
  ['today', 'Today', 'sun'],
  ['tasks', 'Tasks', 'list'],
  ['study', 'Study', 'book'],
  ['focus', 'Focus', 'clock'],
  ['town', 'Town', 'sparkle'],
  ['more', 'More', 'more'],
];
const $ = id => document.getElementById(id);
let authed = false;
let authUp = false;
let cur = { tab: 'today', params: {} };
let raf = 0;
let pend = false;
let onboarded = false;
let tick = 0;

const nav = hash => { location.hash = hash; };
const refresh = () => render();

const ctx = () => ({
  S, params: cur.params, nav, add: store.add, upd: store.upd, del: store.del, pref: store.pref,
  setPrefs: store.setPrefs, load: store.load, refresh, ui, store,
});

function chrome(on) {
  $('tabs').style.display = on ? '' : 'none';
  $('fab').style.display = on ? '' : 'none';
  $('top').style.display = on ? '' : 'none';
}

function fmtClock(ms) {
  const s = Math.max(0, Math.round(Math.abs(ms) / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function renderTabs() {
  const el = $('tabs');
  el.className = 'tabs';
  el.replaceChildren(...TABS.map(([k, label, ic]) =>
    h('button', { class: 'tab' + (k === cur.tab ? ' on' : ''), type: 'button', 'aria-current': k === cur.tab ? 'page' : null, onclick: () => nav('#/' + k) },
      icon(ic), h('span', null, label))));
}

function renderTop() {
  const el = $('top');
  const t = store.timer();
  const title = TABS.find(x => x[0] === cur.tab)[1];
  const pill = t ? h('a', { class: 'badge', href: '#/focus', id: 'pill' }, 'Focus ', h('span', null, fmtClock(store.remainingMs(t)))) : null;
  el.replaceChildren(...[h('h1', { class: 'grow' }, title), pill].filter(Boolean));
  clearInterval(tick);
  if (t) {
    tick = setInterval(() => {
      const n = store.timer();
      const s = document.querySelector('#pill span');
      if (!n) { clearInterval(tick); return; }
      if (s) s.textContent = fmtClock(store.remainingMs(n));
    }, 1000);
  }
}

function typing() {
  const a = document.activeElement;
  return a && $('view').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}

async function render() {
  if (!authed) return;
  cur = store.parseHash(location.hash);
  if (!onboarded && S.courses.length === 0 && store.pref('onboarded') !== '1' && cur.tab !== 'more') {
    onboarded = true;
    if (cur.tab !== 'study' || !cur.params.onboard) { nav('#/study?onboard=1'); return; }
  }
  onboarded = true;
  chrome(true);
  renderTabs();
  renderTop();
  const root = $('view');
  const y = window.scrollY;
  const tab = cur.tab;
  let mod = null;
  try { mod = await import('/js/views/' + tab + '.js'); } catch (e) { mod = null; }
  if (tab !== cur.tab || !authed) return;
  root.replaceChildren();
  try {
    if (!mod) root.append(h('div', { class: 'wrap' }, ui.empty('This screen is coming soon')));
    else mod.default(root, ctx());
  } catch (e) {
    root.append(h('div', { class: 'wrap' }, ui.empty('Something went wrong on this screen')));
    console.error(e);
  }
  window.scrollTo(0, y);
}

function queue() {
  if (!authed) return;
  if (typing()) { pend = true; return; }
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(render);
}

document.addEventListener('focusout', () => {
  if (!pend) return;
  setTimeout(() => { if (!typing()) { pend = false; queue(); } }, 0);
});

function authScreen() {
  if (authUp) return;
  authUp = true;
  authed = false;
  store.setAuthed(false);
  ui.closeAll();
  clearInterval(tick);
  cancelAnimationFrame(raf);
  pend = false;
  onboarded = false;
  cur = { tab: 'today', params: {} };
  store.reset();
  document.title = 'Nudge';
  chrome(false);
  const root = $('view');
  let mode = 'login';
  const err = h('p', { class: 'small', role: 'alert', style: { color: 'var(--danger)' } });
  const draw = () => {
    const up = mode === 'signup';
    const em = h('input', { type: 'email', autocomplete: 'email', required: true });
    const pw = h('input', { type: 'password', autocomplete: up ? 'new-password' : 'current-password', required: true });
    const nm = h('input', { type: 'text', autocomplete: 'name' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, up ? 'Create account' : 'Log in');
    const form = h('form', { class: 'col', onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        const body = { email: em.value, password: pw.value };
        if (up) body.name = nm.value;
        await api(up ? '/api/auth/signup' : '/api/auth/login', { method: 'POST', body });
        await start();
      } catch (x) {
        err.textContent = authMsg(x);
        btn.disabled = false;
      }
    } }, ui.field('Email', em), ui.field('Password', pw), up ? ui.field('Name', nm) : null, err, btn);
    const seg = h('div', { class: 'seg', role: 'group' },
      ...[['login', 'Log in'], ['signup', 'Sign up']].map(([k, l]) =>
        h('button', { type: 'button', class: mode === k ? 'on' : '', 'aria-pressed': String(mode === k), onclick: () => { mode = k; err.textContent = ''; draw(); } }, l)));
    root.replaceChildren(h('div', { class: 'wrap col', style: { paddingTop: '48px' } },
      h('h1', null, 'Nudge'), h('p', { class: 'muted' }, 'Plan your day, study smarter, one step at a time.'),
      seg, h('div', { class: 'card col' }, form)));
    em.focus();
  };
  draw();
}

function authMsg(x) {
  const c = x.message;
  if (c === 'exists') return 'An account with this email already exists';
  if (c === 'weak_password') return 'Use at least 8 characters';
  if (c === 'invalid_email') return 'Enter a valid email address';
  if (c === 'invalid') return 'Wrong email or password';
  if (c === 'locked') return 'Too many attempts. Try again in ' + Math.max(1, Math.ceil(((x.data && x.data.retry) || 60) / 60)) + ' minutes.';
  return 'Something went wrong. Try again.';
}

function quickAdd() {
  if (!authed || document.querySelector('.sheet')) return;
  const inp = h('input', { type: 'text', placeholder: 'e.g. Read chapter 3 tmrw 45m !1', autocomplete: 'off' });
  const prev = h('div', { class: 'row small muted' });
  const sel = h('select', null, h('option', { value: '' }, 'No course'),
    S.courses.filter(c => !c.archived).map(c => h('option', { value: c.id }, c.name)));
  const parse = () => parseQuick(inp.value, store.today(), new Date().getDay());
  const upPrev = () => {
    const p = parse();
    if (!inp.value.trim()) { prev.replaceChildren(); return; }
    prev.replaceChildren(...[h('strong', null, p.title),
      p.due ? h('span', { class: 'badge' }, p.due) : null,
      p.est ? h('span', { class: 'badge' }, ui.fmtMins(p.est)) : null,
      p.priority ? h('span', { class: 'badge' + (p.priority === 1 ? ' warn' : '') }, '!' + p.priority) : null].filter(Boolean));
  };
  const go = async () => {
    const p = parse();
    if (!inp.value.trim()) return;
    s.close();
    try {
      const [row] = await store.add('tasks', { title: p.title, due: p.due, est: p.est, priority: p.priority || 2, course_id: sel.value ? Number(sel.value) : null });
      ui.toast('Task added', { action: 'Undo', onAction: () => store.del('tasks', row.id).catch(() => {}) });
    } catch (e) { ui.toast('Could not add task'); }
  };
  inp.addEventListener('input', upPrev);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  const s = ui.sheet('Quick add', h('div', { class: 'col' }, inp, prev, ui.field('Course', sel),
    h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Add')));
}

async function start() {
  await Promise.all([api('/api/me').then(r => { S.user = r.user; }), store.load()]);
  await store.pullTimer().catch(() => {});
  authed = true;
  authUp = false;
  store.setAuthed(true);
  if (!location.hash || location.hash === '#/' || location.hash.startsWith('#/auth')) location.hash = '#/today';
  render();
}

async function boot() {
  try {
    store.applyTheme(localStorage.getItem('theme') || 'system');
    store.applySkin(localStorage.getItem('skin'));
  } catch (e) { /* ignore */ }
  window.addEventListener('nudge:auth', authScreen);
  window.addEventListener('hashchange', queue);
  store.on(queue);
  $('fab').addEventListener('click', quickAdd);
  document.addEventListener('keydown', e => {
    if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || (a && a.isContentEditable)) return;
    e.preventDefault();
    quickAdd();
  });
  store.startRefresh();
  try {
    await start();
  } catch (e) {
    if (e.status === 401) authScreen();
    else $('view').replaceChildren(h('div', { class: 'wrap' }, ui.empty('Could not reach the server. Reload to retry.')));
  }
}

boot();
