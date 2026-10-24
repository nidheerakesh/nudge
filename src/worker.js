const T = {
  courses: ['name', 'date', 'time', 'kind'],
  topics: ['course_id', 'title', 'done'],
  tasks: ['course_id', 'title', 'kind', 'due', 'done', 'area_id'],
  quizzes: ['course_id', 'title', 'date', 'done'],
  qt: ['quiz_id', 'topic_id'],
  dump: ['text', 'done'],
  rem: ['text', 'at', 'done'],
  habits: ['name', 'area_id'],
  hlog: ['habit_id', 'day'],
  log: ['day', 'kind', 'text', 'mins'],
  areas: ['name', 'color', 'sort'],
  goals: ['area_id', 'title', 'why', 'done'],
  steps: ['goal_id', 'title', 'done', 'sort'],
  today: ['day', 'ref_kind', 'ref_id', 'title', 'sort', 'done'],
  routines: ['name', 'part'],
  rsteps: ['routine_id', 'title', 'sort'],
  rlog: ['rstep_id', 'day'],
  notes: ['area_id', 'text']
};

const M = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const ask = async (env, sys, u) => {
  const r = await env.AI.run(M, { messages: [{ role: 'system', content: sys }, { role: 'user', content: u }] });
  if (r && Array.isArray(r.response)) return r.response;
  const x = typeof (r && r.response) === 'object' ? JSON.stringify(r.response) : String((r && r.response) || '');
  const a = x.indexOf('['), z = x.lastIndexOf(']');
  if (a >= 0 && z > a) {
    try {
      const v = JSON.parse(x.slice(a, z + 1));
      if (Array.isArray(v)) return v;
    } catch (e) {}
  }
  return x.split('\n').map(l => l.replace(/^[\s\-*\d.)]+/, '').trim()).filter(Boolean);
};

const isD = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const ad = (d, k) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

const SYS = td => 'You are Nudge, a calm study planner for a student. Today is ' + td + '. ' +
  'You get their data as JSON: courses are exams (date = exam day, last = last day revision may be scheduled), topics per course in syllabus order [id,title,done], open tasks [id,title,course_id,due], quizzes, and today (max 3 priorities). ' +
  'Rule: a task with a course_id must be due no later than that course\'s "last" day. Never schedule before today. "First half" of a course means the first ceil(n/2) topics in listed order. ' +
  'Reply with ONLY a JSON object {"reply": string, "actions": [...]} and nothing else. reply is short, friendly, plain text. ' +
  'actions are proposals the user confirms, use [] when nothing should change. Allowed: ' +
  '{"op":"move_task","id":N,"due":"YYYY-MM-DD"}, {"op":"done_task","id":N}, {"op":"add_task","title":S,"course_id":N|null,"due":"YYYY-MM-DD"}, ' +
  '{"op":"delete_task","id":N}, {"op":"add_quiz","course_id":N,"title":S,"date":"YYYY-MM-DD","topic_ids":[N]}, {"op":"replan_course","course_id":N}, {"op":"add_today","title":S}. ' +
  'Use only ids from the data. For a quiz, add it and move the Revise tasks for its topics to days before the quiz.';

const chat = async (b, env, db) => {
  const td = isD(b.day) ? b.day : new Date().toISOString().slice(0, 10);
  const ms = (Array.isArray(b.messages) ? b.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!ms.length || ms[ms.length - 1].role !== 'user') return json({ error: 'messages' }, 400);
  const rs = await db.batch([
    db.prepare('SELECT id, name, date, kind FROM courses ORDER BY id'),
    db.prepare('SELECT id, course_id, title, done FROM topics ORDER BY id'),
    db.prepare('SELECT id, title, course_id, due FROM tasks WHERE done=0 ORDER BY due IS NULL, due, id LIMIT 200'),
    db.prepare('SELECT id, course_id, title, date, done FROM quizzes ORDER BY id'),
    db.prepare('SELECT title, done FROM today WHERE day=? ORDER BY sort, id').bind(td)
  ]);
  const [cs, tp, tk, qz, tdy] = rs.map(r => r.results);
  const C = new Map(cs.map(c => [c.id, c])), K = new Map(tk.map(t => [t.id, t])), TP = new Map(tp.map(t => [t.id, t]));
  const ctx = {
    courses: cs.map(c => ({ id: c.id, name: c.name, exam: c.date, last: c.date ? ad(c.date, -1) : null })),
    topics: Object.fromEntries(cs.map(c => [c.id, tp.filter(t => t.course_id === c.id).map(t => [t.id, t.title, t.done])])),
    tasks: tk.map(t => [t.id, t.title, t.course_id, t.due]),
    quizzes: qz.filter(q => !q.done).map(q => ({ id: q.id, course_id: q.course_id, title: q.title, date: q.date })),
    today: tdy.map(t => t.title + (t.done ? ' (done)' : ''))
  };
  const r = await env.AI.run(M, { messages: [{ role: 'system', content: SYS(td) + '\nData: ' + JSON.stringify(ctx) }, ...ms], max_tokens: 1500 });
  const x = typeof (r && r.response) === 'object' ? JSON.stringify(r.response) : String((r && r.response) || '');
  let o = null;
  const a = x.indexOf('{'), z = x.lastIndexOf('}');
  if (a >= 0 && z > a) try { o = JSON.parse(x.slice(a, z + 1)); } catch (e) {}
  if (!o || typeof o !== 'object' || Array.isArray(o)) o = { reply: x.trim(), actions: [] };
  const rp = String(o.reply || '').trim();
  if (!rp && !Array.isArray(o.actions)) throw new Error('empty');
  const nt = [], out = [];
  const nm = t => '"' + t.title + '"';
  const cap = (cid, d, lab) => {
    const c = C.get(cid);
    if (!c || !c.date) return d;
    const l = ad(c.date, -1);
    if (d <= l) return d;
    if (l < td) { nt.push(lab + ' kept on today, but the ' + c.name + ' exam is today or past.'); return td; }
    nt.push(lab + ' moved to ' + l + ', the day before the ' + c.name + ' exam.');
    return l;
  };
  const okD = (d, lab) => { if (isD(d) && d >= td) return true; nt.push('Dropped ' + lab + ': date ' + (d || 'missing') + ' is not today or later.'); return false; };
  let ntd = tdy.length;
  for (const v of (Array.isArray(o.actions) ? o.actions : []).slice(0, 30)) {
    if (!v || typeof v !== 'object') continue;
    const op = v.op, id = Number(v.id), t = K.get(id);
    if (op === 'move_task' || op === 'done_task' || op === 'delete_task') {
      if (!t) { nt.push('Dropped a change to unknown task ' + v.id + '.'); continue; }
      if (op !== 'move_task') { out.push({ op, id }); continue; }
      if (!okD(v.due, 'moving ' + nm(t))) continue;
      const d = cap(t.course_id, v.due, nm(t));
      if (d !== t.due) out.push({ op, id, due: d });
    } else if (op === 'add_task') {
      const ti = String(v.title || '').trim().slice(0, 200), cid = v.course_id == null || v.course_id === '' ? null : Number(v.course_id);
      if (!ti) continue;
      if (cid !== null && !C.has(cid)) { nt.push('Dropped "' + ti + '": unknown course.'); continue; }
      let d = v.due == null || v.due === '' ? null : v.due;
      if (d !== null) { if (!okD(d, '"' + ti + '"')) continue; d = cap(cid, d, '"' + ti + '"'); }
      out.push({ op, title: ti, course_id: cid, due: d });
    } else if (op === 'add_quiz') {
      const cid = Number(v.course_id), ti = String(v.title || '').trim().slice(0, 200);
      if (!C.has(cid) || !ti) { nt.push('Dropped a quiz with an unknown course or no title.'); continue; }
      if (!okD(v.date, 'quiz "' + ti + '"')) continue;
      if (qz.some(q => q.course_id === cid && (q.date === v.date || q.title.toLowerCase() === ti.toLowerCase()))) { nt.push('Skipped quiz "' + ti + '": that quiz already exists.'); continue; }
      const ids = [...new Set((Array.isArray(v.topic_ids) ? v.topic_ids : []).map(Number))].filter(i => TP.has(i) && TP.get(i).course_id === cid);
      out.push({ op, course_id: cid, title: ti, date: v.date, topic_ids: ids });
    } else if (op === 'replan_course') {
      const c = C.get(Number(v.course_id));
      if (!c || !c.date) { nt.push('Dropped a replan for a course without an exam date.'); continue; }
      if (ad(c.date, -1) < td) nt.push('The ' + c.name + ' exam is today or past, so its revision stays on today.');
      out.push({ op, course_id: c.id });
    } else if (op === 'add_today') {
      const ti = String(v.title || '').trim().slice(0, 200);
      if (!ti) continue;
      if (ntd >= 3) { nt.push('Today already has 3 priorities, so "' + ti + '" was left out.'); continue; }
      ntd++;
      out.push({ op, title: ti });
    } else nt.push('Dropped an unsupported action.');
  }
  return json({ reply: (rp || 'Here is what I suggest.') + (nt.length ? '\n\nNote: ' + nt.join(' ') : ''), actions: out });
};

const ai = async (p, req, env, db) => {
  const b = (await req.json().catch(() => ({}))) || {};
  try {
    if (p[2] === 'chat') return await chat(b, env, db);
    if (p[2] === 'breakdown') {
      if (!b || !b.title) return json({ error: 'title' }, 400);
      const v = await ask(
        env,
        'Break the task into 3 to 7 tiny concrete steps, each under 10 words. The first step must take under 5 minutes. Reply with only a JSON array of strings.',
        String(b.title)
      );
      const st = v.map(x => (typeof x === 'string' ? x : x && (x.step || x.title)) || '').map(x => String(x).trim()).filter(Boolean).slice(0, 7);
      if (!st.length) return json({ error: 'empty' }, 502);
      return json({ steps: st });
    }
    if (p[2] === 'plan') {
      const rs = await db.batch([
        db.prepare('SELECT id, title, due FROM tasks WHERE done=0 ORDER BY due IS NULL, due, id LIMIT 40'),
        db.prepare('SELECT s.id, s.title, g.title AS goal FROM steps s JOIN goals g ON g.id=s.goal_id WHERE s.done=0 AND g.done=0 ORDER BY s.sort, s.id LIMIT 40'),
        db.prepare('SELECT id, text FROM dump WHERE done=0 ORDER BY id LIMIT 40')
      ]);
      const c = {};
      const ls = [];
      rs[0].results.forEach(r => { c['task:' + r.id] = r.title; ls.push({ ref_kind: 'task', ref_id: r.id, title: r.title, due: r.due }); });
      rs[1].results.forEach(r => { c['step:' + r.id] = r.title; ls.push({ ref_kind: 'step', ref_id: r.id, title: r.title, goal: r.goal }); });
      rs[2].results.forEach(r => { c['dump:' + r.id] = r.text; ls.push({ ref_kind: 'dump', ref_id: r.id, title: r.text }); });
      if (!ls.length) return json({ picks: [] });
      const v = await ask(
        env,
        'You help a student pick at most 3 things to do today. Reply with only a JSON array of objects {"ref_kind","ref_id","why"} where why is under 12 words. Use only items from the list.',
        'Today: ' + String(b.day || '') + '\nItems:\n' + JSON.stringify(ls)
      );
      const seen = new Set();
      const pk = [];
      for (const x of v) {
        if (!x || typeof x !== 'object') continue;
        const k = x.ref_kind + ':' + Number(x.ref_id);
        if (!(k in c) || seen.has(k)) continue;
        seen.add(k);
        pk.push({ ref_kind: x.ref_kind, ref_id: Number(x.ref_id), title: c[k], why: String(x.why || '') });
        if (pk.length === 3) break;
      }
      return json({ picks: pk });
    }
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 502);
  }
  return json({ error: 'not found' }, 404);
};

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname.split('/').filter(Boolean);
    if (p[0] !== 'api') return env.ASSETS.fetch(req);
    if (env.PIN && req.headers.get('x-pin') !== env.PIN) return json({ error: 'pin' }, 401);
    const db = env.DB;
    try {
      if (req.method === 'GET' && p[1] === 'all') {
        const names = Object.keys(T);
        const rs = await db.batch(names.map(t => db.prepare('SELECT * FROM ' + t + ' ORDER BY id')));
        const out = {};
        names.forEach((t, i) => (out[t] = rs[i].results));
        return json(out);
      }
      if (req.method === 'POST' && p[1] === 'ai') return await ai(p, req, env, db);
      const t = p[1];
      const cols = Object.hasOwn(T, t) ? T[t] : null;
      if (!cols) return json({ error: 'not found' }, 404);
      const id = p[2] ? Number(p[2]) : null;

      if (req.method === 'POST') {
        const b = await req.json();
        const rows = Array.isArray(b) ? b : [b];
        if (!rows.length || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) return json({ error: 'row' }, 400);
        const sts = rows.map(r => {
          const k = cols.filter(c => r[c] !== undefined);
          const sql =
            'INSERT ' + (t === 'hlog' || t === 'rlog' ? 'OR IGNORE ' : '') + 'INTO ' + t +
            '(' + k.join(',') + ') VALUES(' + k.map(() => '?').join(',') + ')';
          return db.prepare(sql).bind(...k.map(c => r[c]));
        });
        const rs = await db.batch(sts);
        return json({ id: rs[rs.length - 1].meta.last_row_id });
      }

      if (req.method === 'PATCH' && id) {
        const b = await req.json();
        if (!b || typeof b !== 'object') return json({ error: 'row' }, 400);
        const k = cols.filter(c => b[c] !== undefined);
        const st = [];
        if (k.length)
          st.push(
            db
              .prepare('UPDATE ' + t + ' SET ' + k.map(c => c + '=?').join(',') + ' WHERE id=?')
              .bind(...k.map(c => b[c]), id)
          );
        if (t === 'quizzes' && b.done === 1)
          st.push(
            db
              .prepare('UPDATE topics SET done=1 WHERE id IN (SELECT topic_id FROM qt WHERE quiz_id=?)')
              .bind(id)
          );
        if (st.length) await db.batch(st);
        return json({ ok: 1 });
      }

      if (req.method === 'DELETE') {
        if (t === 'hlog' && !id) {
          const hid = Number(url.searchParams.get('habit_id'));
          const day = url.searchParams.get('day');
          await db.prepare('DELETE FROM hlog WHERE habit_id=? AND day=?').bind(hid, day).run();
          return json({ ok: 1 });
        }
        if (t === 'rlog' && !id) {
          const rid = Number(url.searchParams.get('rstep_id'));
          const day = url.searchParams.get('day');
          await db.prepare('DELETE FROM rlog WHERE rstep_id=? AND day=?').bind(rid, day).run();
          return json({ ok: 1 });
        }
        if (!id) return json({ error: 'id' }, 400);
        const st = [];
        if (t === 'courses') {
          st.push(db.prepare('DELETE FROM qt WHERE quiz_id IN (SELECT id FROM quizzes WHERE course_id=?)').bind(id));
          st.push(db.prepare('DELETE FROM qt WHERE topic_id IN (SELECT id FROM topics WHERE course_id=?)').bind(id));
          st.push(db.prepare('DELETE FROM topics WHERE course_id=?').bind(id));
          st.push(db.prepare('DELETE FROM tasks WHERE course_id=?').bind(id));
          st.push(db.prepare('DELETE FROM quizzes WHERE course_id=?').bind(id));
        }
        if (t === 'topics') st.push(db.prepare('DELETE FROM qt WHERE topic_id=?').bind(id));
        if (t === 'quizzes') st.push(db.prepare('DELETE FROM qt WHERE quiz_id=?').bind(id));
        if (t === 'habits') st.push(db.prepare('DELETE FROM hlog WHERE habit_id=?').bind(id));
        if (t === 'goals') st.push(db.prepare('DELETE FROM steps WHERE goal_id=?').bind(id));
        if (t === 'routines') {
          st.push(db.prepare('DELETE FROM rlog WHERE rstep_id IN (SELECT id FROM rsteps WHERE routine_id=?)').bind(id));
          st.push(db.prepare('DELETE FROM rsteps WHERE routine_id=?').bind(id));
        }
        if (t === 'rsteps') st.push(db.prepare('DELETE FROM rlog WHERE rstep_id=?').bind(id));
        if (t === 'areas')
          ['tasks', 'habits', 'goals', 'notes'].forEach(x => st.push(db.prepare('UPDATE ' + x + ' SET area_id=NULL WHERE area_id=?').bind(id)));
        st.push(db.prepare('DELETE FROM ' + t + ' WHERE id=?').bind(id));
        await db.batch(st);
        return json({ ok: 1 });
      }
      return json({ error: 'bad request' }, 400);
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500);
    }
  }
};
