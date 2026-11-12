import { addDays } from './srs.js';
import { api } from './api.js';
import { toast } from './ui.js';

export { addDays };

const pad = n => String(n).padStart(2, '0');
const TABLES = ['courses', 'assessments', 'topics', 'assess_topics', 'cards', 'tasks', 'blocks', 'sessions', 'habits', 'hlog', 'notes'];
const CASCADE = ['courses', 'topics', 'tasks', 'habits', 'assessments'];
const TABS = ['today', 'tasks', 'study', 'focus', 'town', 'more'];

export const S = { user: null, prefs: {}, courses: [], assessments: [], topics: [], assess_topics: [], cards: [], tasks: [], blocks: [], sessions: [], habits: [], hlog: [], notes: [] };

const subs = new Set();
let tm = null;
let busy = 0;
let authed = false;
let gen = 0;

export function setAuthed(v) {
  authed = !!v;
}

export function reset() {
  gen++;
  tm = null;
  for (const k in S) S[k] = Array.isArray(S[k]) ? [] : k === 'prefs' ? {} : null;
}

export function on(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function emit() {
  for (const fn of [...subs]) fn();
}

export function today(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function nowHM(d = new Date()) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function parseHash(hash) {
  const [path, qs] = String(hash || '').replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const tab = TABS.includes(parts[0]) ? parts[0] : 'today';
  const params = {};
  if (parts[1]) params.sub = parts[1];
  if (parts[2]) params.id = parts[2];
  if (qs) for (const [k, v] of new URLSearchParams(qs)) params[k] = v;
  return { tab, params };
}

function syncLook(p) {
  if (!p || typeof document === 'undefined') return;
  const d = document.documentElement.dataset;
  if (SKINS.includes(p.skin) && p.skin !== d.skin) applySkin(p.skin);
  if (['light', 'dark', 'system'].includes(p.theme) && p.theme !== (d.theme || 'system')) applyTheme(p.theme);
}

export async function load() {
  busy++;
  const g = gen;
  try {
    const res = await api('/api/all');
    if (g !== gen) return;
    for (const k in res) S[k] = res[k];
    syncLook(res.prefs);
    emit();
  } finally { busy--; }
}

export async function add(table, obj) {
  const res = await api('/api/' + table, { method: 'POST', body: obj });
  S[table].push(...res.rows);
  emit();
  return res.rows;
}

export async function upd(table, id, patch) {
  const i = S[table].findIndex(r => r.id === id);
  const old = S[table][i];
  if (i >= 0) { S[table][i] = { ...old, ...patch }; emit(); }
  try {
    const res = await api('/api/' + table + '/' + id, { method: 'PATCH', body: patch });
    const j = S[table].findIndex(r => r.id === id);
    if (j >= 0) S[table][j] = res.row;
    emit();
    return res.row;
  } catch (e) {
    const j = S[table].findIndex(r => r.id === id);
    if (j >= 0 && old) S[table][j] = old;
    emit();
    throw e;
  }
}

export async function del(table, id) {
  await api('/api/' + table + '/' + id, { method: 'DELETE' });
  if (CASCADE.includes(table)) return load();
  S[table] = S[table].filter(r => r.id !== id);
  emit();
}

export function pref(k, def) {
  const v = S.prefs[k];
  return v === undefined || v === null ? def : v;
}

export function applyTheme(t) {
  if (typeof document === 'undefined') return;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('theme', t || 'system'); } catch (e) { /* ignore */ }
}

export const SKINS = ['bubblegum', 'matcha', 'peach', 'starlight'];

export function applySkin(s) {
  if (typeof document === 'undefined') return;
  const v = SKINS.includes(s) ? s : 'bubblegum';
  document.documentElement.dataset.skin = v;
  try { localStorage.setItem('skin', v); } catch (e) { /* ignore */ }
}

export async function setPrefs(obj) {
  await api('/api/prefs', { method: 'PUT', body: obj });
  for (const k in obj) S.prefs[k] = String(obj[k]);
  if ('theme' in obj) applyTheme(obj.theme);
  if ('skin' in obj) applySkin(obj.skin);
  emit();
}

export const timer = () => tm;

const sid = t => (t ? t.session_id : null);

export async function pullTimer() {
  const g = gen;
  const res = await api('/api/timer');
  if (g !== gen) return;
  const n = res.data || null;
  if (tm && n && sid(n) !== sid(tm)) toast('Timer is running on another device');
  tm = n;
  emit();
}

async function saveTimer(prev) {
  try {
    await api('/api/timer', { method: 'PUT', body: { data: tm, prev } });
    return true;
  } catch (e) {
    if (e.status !== 409) throw e;
    const d = (e.data && e.data.data) || null;
    tm = d;
    if (d) toast('Timer is running on another device');
    emit();
    return false;
  }
}

export function elapsedMs(t, now = Date.now()) {
  return (t.paused_at || now) - t.started - (t.paused_ms || 0);
}

export function remainingMs(t, now = Date.now()) {
  return t.mins * 60000 - elapsedMs(t, now);
}

export async function startTimer({ task_id, block_id, title, mins }) {
  if (tm) await finishTimer('stopped');
  if (tm) return;
  const [row] = await add('sessions', { task_id: task_id || null, start_at: new Date().toISOString(), plan_mins: mins, end_kind: 'open' });
  const prev = sid(tm);
  tm = { task_id: task_id || null, block_id: block_id || null, title: title || '', mins, session_id: row.id, started: Date.now(), paused_at: null, paused_ms: 0, pauses: 0 };
  if (!(await saveTimer(prev))) {
    upd('sessions', row.id, { act_mins: 0, pauses: 0, end_kind: 'stopped' }).catch(() => {});
    return;
  }
  emit();
}

export async function pauseTimer() {
  if (!tm || tm.paused_at) return;
  const prev = sid(tm);
  tm = { ...tm, paused_at: Date.now(), pauses: tm.pauses + 1 };
  emit();
  await saveTimer(prev);
}

export async function resumeTimer() {
  if (!tm || !tm.paused_at) return;
  const prev = sid(tm);
  tm = { ...tm, paused_ms: tm.paused_ms + Date.now() - tm.paused_at, paused_at: null };
  emit();
  await saveTimer(prev);
}

export async function finishTimer(end_kind) {
  const t = tm;
  if (!t) return null;
  const act = Math.max(0, Math.round(elapsedMs(t) / 60000));
  let row = null;
  try {
    try {
      row = await upd('sessions', t.session_id, { act_mins: act, pauses: t.pauses, end_kind });
      if (end_kind === 'done' && t.block_id) await upd('blocks', t.block_id, { done: 1 });
    } catch (e) {
      if (e.status !== 409) throw e;
    }
    let d = null;
    try {
      await api('/api/timer', { method: 'PUT', body: { data: null, prev: t.session_id } });
    } catch (e) {
      if (e.status !== 409) throw e;
      d = (e.data && e.data.data) || null;
    }
    tm = d;
    if (d) toast('Timer is running on another device');
  } catch (e) {
    toast('Could not stop the timer. Try again.');
    emit();
    return null;
  }
  emit();
  return row;
}

export const rateSession = (id, rating) => upd('sessions', id, { rating });

export async function refreshAll() {
  if (busy || !authed) return;
  try { await Promise.all([load(), pullTimer()]); } catch (e) { /* ignore */ }
}

export function startRefresh() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });
  setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 60000);
}

export { TABLES };
