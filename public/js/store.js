import { addDays } from './srs.js';
import { api } from './api.js';

export { addDays };

const pad = n => String(n).padStart(2, '0');
const TABLES = ['courses', 'assessments', 'topics', 'assess_topics', 'cards', 'tasks', 'blocks', 'sessions', 'habits', 'hlog', 'notes'];
const CASCADE = ['courses', 'topics', 'tasks', 'habits', 'assessments'];
const TABS = ['today', 'tasks', 'study', 'focus', 'more'];

export const S = { user: null, prefs: {}, courses: [], assessments: [], topics: [], assess_topics: [], cards: [], tasks: [], blocks: [], sessions: [], habits: [], hlog: [], notes: [] };

const subs = new Set();
let tm = null;
let busy = 0;

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

export async function load() {
  busy++;
  try {
    const res = await api('/api/all');
    for (const k in res) S[k] = res[k];
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

export async function setPrefs(obj) {
  await api('/api/prefs', { method: 'PUT', body: obj });
  for (const k in obj) S.prefs[k] = String(obj[k]);
  if ('theme' in obj) applyTheme(obj.theme);
  emit();
}

export const timer = () => tm;

export async function pullTimer() {
  const res = await api('/api/timer');
  tm = res.data || null;
  emit();
}

const saveTimer = () => api('/api/timer', { method: 'PUT', body: { data: tm } });

export function elapsedMs(t, now = Date.now()) {
  return (t.paused_at || now) - t.started - (t.paused_ms || 0);
}

export function remainingMs(t, now = Date.now()) {
  return t.mins * 60000 - elapsedMs(t, now);
}

export async function startTimer({ task_id, block_id, title, mins }) {
  if (tm) await finishTimer('stopped');
  const [row] = await add('sessions', { task_id: task_id || null, start_at: new Date().toISOString(), plan_mins: mins, end_kind: 'open' });
  tm = { task_id: task_id || null, block_id: block_id || null, title: title || '', mins, session_id: row.id, started: Date.now(), paused_at: null, paused_ms: 0, pauses: 0 };
  await saveTimer();
  emit();
}

export async function pauseTimer() {
  if (!tm || tm.paused_at) return;
  tm = { ...tm, paused_at: Date.now(), pauses: tm.pauses + 1 };
  emit();
  await saveTimer();
}

export async function resumeTimer() {
  if (!tm || !tm.paused_at) return;
  tm = { ...tm, paused_ms: tm.paused_ms + Date.now() - tm.paused_at, paused_at: null };
  emit();
  await saveTimer();
}

export async function finishTimer(end_kind) {
  const t = tm;
  if (!t) return null;
  const act = Math.max(0, Math.round(elapsedMs(t) / 60000));
  tm = null;
  const row = await upd('sessions', t.session_id, { act_mins: act, pauses: t.pauses, end_kind });
  if (end_kind === 'done' && t.block_id) await upd('blocks', t.block_id, { done: 1 });
  await saveTimer();
  emit();
  return row;
}

export const rateSession = (id, rating) => upd('sessions', id, { rating });

export async function refreshAll() {
  if (busy) return;
  try { await Promise.all([load(), pullTimer()]); } catch (e) { /* ignore */ }
}

export function startRefresh() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });
  setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 60000);
}

export { TABLES };
