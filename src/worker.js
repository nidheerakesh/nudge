const T = {
  courses: ['name', 'date', 'time', 'kind'],
  topics: ['course_id', 'title', 'done'],
  tasks: ['course_id', 'title', 'kind', 'due', 'done'],
  quizzes: ['course_id', 'title', 'date', 'done'],
  qt: ['quiz_id', 'topic_id'],
  dump: ['text', 'done'],
  rem: ['text', 'at', 'done'],
  habits: ['name'],
  hlog: ['habit_id', 'day'],
  log: ['day', 'kind', 'text', 'mins']
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
      const t = p[1];
      const cols = T[t];
      if (!cols) return json({ error: 'not found' }, 404);
      const id = p[2] ? Number(p[2]) : null;

      if (req.method === 'POST') {
        const b = await req.json();
        const rows = Array.isArray(b) ? b : [b];
        const sts = rows.map(r => {
          const k = cols.filter(c => r[c] !== undefined);
          const sql =
            'INSERT ' + (t === 'hlog' ? 'OR IGNORE ' : '') + 'INTO ' + t +
            '(' + k.join(',') + ') VALUES(' + k.map(() => '?').join(',') + ')';
          return db.prepare(sql).bind(...k.map(c => r[c]));
        });
        const rs = await db.batch(sts);
        return json({ id: rs[rs.length - 1].meta.last_row_id });
      }

      if (req.method === 'PATCH' && id) {
        const b = await req.json();
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
