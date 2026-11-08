#!/usr/bin/env node
// Usage: node scripts/migrate-v2.mjs <v2-export.sql> --user 1 --today 2026-11-08 > out.sql
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, def) => {
  const i = args.indexOf(k);
  return i < 0 ? def : args[i + 1];
};
const file = args[0];
const U = Number(opt('--user'));
const TODAY = opt('--today', localDay());

if (!file || !Number.isInteger(U) || U < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) {
  console.error('usage: node scripts/migrate-v2.mjs <v2-export.sql> --user <id> [--today YYYY-MM-DD]');
  process.exit(1);
}

function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function load(path) {
  const text = readFileSync(path, 'utf8');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(text);
  } catch {
    const kept = text.split('\n').filter((l) => !/^PRAGMA/i.test(l) && !/sqlite_sequence/i.test(l));
    const fresh = new DatabaseSync(':memory:');
    fresh.exec(kept.join('\n'));
    return fresh;
  }
  return db;
}

const src = load(file);
const tabs = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
const rows = (t) => (tabs.has(t) ? src.prepare(`SELECT * FROM ${t}`).all() : []);
const has = (t, c) => tabs.has(t) && src.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);

const out = [];
const cnt = {};
const V3 = ['courses', 'assessments', 'topics', 'assess_topics', 'cards', 'tasks', 'blocks', 'sessions', 'habits', 'hlog', 'notes', 'prefs'];
const TITLE = { exam: 'Exam', quiz: 'Quiz', assignment: 'Assignment' };

const lit = (x) => {
  if (x === null || x === undefined) return 'NULL';
  if (typeof x === 'number') return String(x);
  return `'${String(x).replace(/'/g, "''")}'`;
};

function ins(t, o) {
  const ks = Object.keys(o);
  out.push(`INSERT INTO ${t}(${ks.join(', ')}) VALUES(${ks.map((k) => lit(o[k])).join(', ')});`);
  cnt[t] = (cnt[t] || 0) + 1;
}

const put = (t, o) => ins(t, { user_id: U, ...o });
const DAY = (s) => /^\d{4}-\d{2}-\d{2}/.test(s || '');
let aid = 0;
const addAssess = (o) => {
  const id = ++aid;
  put('assessments', { id, ...o });
  return id;
};

function stepsOf(gid) {
  if (!tabs.has('steps')) return [];
  const o = has('steps', 'sort') ? 'sort, id' : 'id';
  return src.prepare(`SELECT * FROM steps WHERE goal_id = ? ORDER BY ${o}`).all(gid);
}

function courses() {
  for (const c of rows('courses')) {
    put('courses', { id: c.id, name: c.name });
    if (!c.date) continue;
    const kind = c.kind === 'quiz' || c.kind === 'assignment' ? c.kind : 'exam';
    addAssess({ course_id: c.id, kind, title: TITLE[kind], date: c.date, time: c.time });
  }
}

function topics() {
  for (const t of rows('topics')) {
    put('topics', { id: t.id, course_id: t.course_id, title: t.title, status: t.done ? 'done' : 'todo', mins: t.mins || 45, sort: t.id });
  }
}

function quizzes() {
  const map = new Map();
  for (const q of rows('quizzes')) {
    map.set(q.id, addAssess({ course_id: q.course_id, kind: 'quiz', title: q.title, date: q.date }));
  }
  const seen = new Set();
  for (const q of rows('qt')) {
    const a = map.get(q.quiz_id);
    const k = `${a}:${q.topic_id}`;
    if (a === undefined || seen.has(k)) continue;
    seen.add(k);
    put('assess_topics', { assessment_id: a, topic_id: q.topic_id });
  }
}

function tasksAndReminders() {
  for (const t of rows('tasks')) {
    put('tasks', {
      id: t.id,
      title: t.title,
      course_id: t.course_id,
      due: t.due,
      est: t.est,
      priority: 2,
      done_at: t.done ? t.done_at || `${TODAY}T00:00:00Z` : null,
    });
  }
  for (const r of rows('rem')) {
    if (r.done) continue;
    if (DAY(r.at)) put('tasks', { title: r.text, due: r.at.slice(0, 10), priority: 2 });
    else put('notes', { title: 'Reminder', body: r.text ?? '' });
  }
}

function blocks() {
  for (const b of rows('blocks')) {
    if (b.day < TODAY || b.ref_kind === 'topic' || b.ref_kind === 'quiz') continue;
    put('blocks', {
      day: b.day,
      start: b.start,
      mins: b.mins || 30,
      kind: b.kind === 'fixed' || b.kind === 'break' ? b.kind : 'task',
      task_id: b.ref_kind === 'task' ? b.ref_id : null,
      title: b.title ?? '',
      done: b.done ? 1 : 0,
    });
  }
}

function sessions() {
  const ends = ['done', 'stopped', 'abandoned'];
  for (const s of rows('sessions')) {
    if (!s.start_at) continue;
    put('sessions', {
      task_id: s.ref_kind === 'task' ? s.ref_id : null,
      start_at: s.start_at,
      plan_mins: s.plan_mins,
      act_mins: s.act_mins,
      pauses: s.pauses || 0,
      end_kind: ends.includes(s.end_kind) ? s.end_kind : 'abandoned',
      rating: s.rating,
    });
  }
}

function habits() {
  for (const h of rows('habits')) put('habits', { id: h.id, name: h.name, per_week: 7 });
  for (const l of rows('hlog')) put('hlog', { habit_id: l.habit_id, day: l.day });
}

function notes() {
  for (const d of rows('dump')) if (!d.done) put('notes', { title: 'Inbox', body: d.text ?? '' });
  const areaName = new Map(rows('areas').map((a) => [a.id, a.name]));
  for (const n of rows('notes')) put('notes', { title: areaName.get(n.area_id) ?? null, body: n.text ?? '' });
  for (const g of rows('goals')) {
    const lines = stepsOf(g.id).map((s) => `- [${s.done ? 'x' : ' '}] ${s.title}`).join('\n');
    put('notes', { title: g.title, body: (g.why ? `${g.why}\n\n` : '') + lines });
  }
}

function prefs() {
  for (const p of rows('prefs')) if (p.k === 'theme' || p.k === 'memory') put('prefs', { k: p.k, v: p.v });
}

courses();
topics();
quizzes();
tasksAndReminders();
blocks();
sessions();
habits();
notes();
prefs();

process.stdout.write(out.join('\n') + '\n');
for (const t of V3) console.error(`${t}: ${cnt[t] || 0}`);
