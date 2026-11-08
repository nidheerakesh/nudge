import { addDays } from './srs.js';

const SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const pad = n => String(n).padStart(2, '0');

function weekdayOf(w) {
  const i = SHORT.indexOf(w);
  return i >= 0 ? i : FULL.indexOf(w);
}

function nextWeekday(today, weekday, target) {
  return addDays(today, ((target - weekday + 7) % 7) || 7);
}

function dmDate(today, w) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(w);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  const y = Number(today.slice(0, 4));
  const md = pad(mm) + '-' + pad(dd);
  const d = y + '-' + md;
  return d < today ? (y + 1) + '-' + md : d;
}

function dueOf(w, today, weekday) {
  if (w === 'today' || w === 'tod') return today;
  if (w === 'tomorrow' || w === 'tmrw' || w === 'tmr') return addDays(today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  const i = weekdayOf(w);
  if (i >= 0) return nextWeekday(today, weekday, i);
  return dmDate(today, w);
}

function estOf(w) {
  const h = /^(\d+(?:\.\d+)?)h(\d+)?m?$/.exec(w);
  if (h) return Math.round(Number(h[1]) * 60 + Number(h[2] || 0));
  const m = /^(\d+)(?:m|min|mins)$/.exec(w);
  return m ? Number(m[1]) : null;
}

function prioOf(w) {
  const m = /^!([123])$/.exec(w);
  return m ? Number(m[1]) : null;
}

function apply(r, w, today, weekday) {
  const d = dueOf(w, today, weekday);
  const e = estOf(w);
  const p = prioOf(w);
  if (d) r.due = d;
  else if (e) r.est = e;
  else if (p) r.priority = p;
  return !!(d || e || p);
}

export function parseQuick(text, today, weekday) {
  const src = String(text || '').trim();
  const r = { title: null, due: null, est: null, priority: null };
  const rest = [];
  for (const w of src.split(/\s+/).filter(Boolean)) {
    if (!apply(r, w.toLowerCase(), today, weekday)) rest.push(w);
  }
  r.title = rest.join(' ') || src;
  return r;
}
