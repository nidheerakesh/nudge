import { GRADES, review, dueCards } from '/js/srs.js';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#8b5cf6', '#64748b'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NEXT = { todo: 'learning', learning: 'done', done: 'todo' };
const STAT = {
  todo: { ic: 'list', col: 'var(--muted)', label: 'To do' },
  learning: { ic: 'play', col: 'var(--warn)', label: 'Learning' },
  done: { ic: 'check', col: 'var(--ok)', label: 'Done' },
};
let rv = null;
let keyFn = null;
let filt = 'all';

const ms = d => { const [y, m, n] = d.split('-').map(Number); return Date.UTC(y, m - 1, n); };
const diff = (a, b) => Math.round((ms(a) - ms(b)) / 864e5);
const fmtDate = d => { const [y, m, n] = d.split('-').map(Number); return DAYS[new Date(Date.UTC(y, m - 1, n)).getUTCDay()] + ' ' + n + ' ' + MON[m - 1]; };
const cd = (d, t) => {
  const n = diff(d, t);
  if (n < 0) return n === -1 ? 'yesterday' : Math.abs(n) + ' days ago';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return 'in ' + n + ' days';
};

export default function view(root, ctx) {
  const { S, params, nav, add, upd, del, setPrefs, ui } = ctx;
  const { h, icon } = ui;
  const t = ctx.store.today();
  const wrap = h('div', { class: 'wrap col' });
  root.append(wrap);
  if (keyFn) { document.removeEventListener('keydown', keyFn); keyFn = null; }
  const sub = params.sub;
  if (sub !== 'review') rv = null;

  const err = () => ui.toast('Something went wrong. Try again.');
  const run = fn => async (...a) => { try { await fn(...a); } catch (e) { err(); } };
  const btn = (label, fn, cls = 'btn', attrs) => h('button', { class: cls, type: 'button', onclick: run(fn), ...attrs }, label);
  const back = (label, to) => h('div', { class: 'row' }, btn([icon('chevron'), label], () => nav(to), 'btn ghost'));
  const cname = c => c.code || c.name;
  const cTopics = id => S.topics.filter(x => x.course_id === id).sort((a, b) => a.sort - b.sort || a.id - b.id);
  const cAss = id => S.assessments.filter(x => x.course_id === id);
  const upcoming = id => cAss(id).filter(a => a.date && a.date >= t).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const dot = c => h('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: c.color || COLORS[0], display: 'inline-block', flex: 'none' } });
  const badge = (d, extra) => h('span', { class: 'badge' + (diff(d, t) <= 7 && diff(d, t) >= 0 ? ' warn' : '') }, cd(d, t), extra || null);
  const colorPick = (get, set) => {
    const box = h('div', { class: 'row' });
    const draw = () => box.replaceChildren(...COLORS.map(c => h('button', {
      class: 'chip' + (get() === c ? ' on' : ''), type: 'button', 'aria-label': 'Color ' + c, 'aria-pressed': String(get() === c),
      style: { background: c, width: '32px', height: '32px', padding: 0, borderRadius: '50%' },
      onclick: () => { set(c); draw(); },
    })));
    draw();
    return box;
  };

  // onboarding
  function onboard() {
    const rows = [{ name: '', code: '', date: '', topics: '' }];
    const box = h('div', { class: 'col' });
    const draw = () => box.replaceChildren(...rows.map((r, i) => {
      const bind = (k, el) => { el.value = r[k]; el.addEventListener('input', () => { r[k] = el.value; }); return el; };
      return h('div', { class: 'card col' },
        ui.field('Course name', bind('name', h('input', { type: 'text', placeholder: 'e.g. Calculus' }))),
        h('div', { class: 'row' },
          h('div', { class: 'grow' }, ui.field('Code (optional)', bind('code', h('input', { type: 'text' })))),
          h('div', { class: 'grow' }, ui.field('Next exam (optional)', bind('date', h('input', { type: 'date' }))))),
        ui.field('Topics, one per line (optional)', bind('topics', h('textarea', { rows: 4 }))),
        rows.length > 1 ? btn('Remove', () => { rows.splice(i, 1); draw(); }, 'btn ghost') : null);
    }));
    draw();
    const save = async () => {
      const ok = rows.filter(r => r.name.trim());
      if (!ok.length) { ui.toast('Add a course name first'); return; }
      const cs = await add('courses', ok.map((r, i) => ({ name: r.name.trim(), code: r.code.trim() || null, color: COLORS[i % COLORS.length] })));
      const as = [], ts = [];
      ok.forEach((r, i) => {
        if (r.date) as.push({ course_id: cs[i].id, kind: 'exam', title: 'Exam', date: r.date });
        r.topics.split('\n').map(s => s.trim()).filter(Boolean).forEach((s, j) => ts.push({ course_id: cs[i].id, title: s, sort: j }));
      });
      if (as.length) await add('assessments', as);
      if (ts.length) await add('topics', ts);
      await setPrefs({ onboarded: 1 });
      nav('#/study');
    };
    wrap.append(h('div', { class: 'card col' }, h('h2', null, 'Set up your study plan'),
      h('p', { class: 'muted' }, 'Add your courses, exam dates and topics. You can change everything later.')),
      box, btn('+ Another course', () => { rows.push({ name: '', code: '', date: '', topics: '' }); draw(); }, 'btn'),
      h('div', { class: 'row' }, btn('Save', save, 'btn primary'),
        btn('Skip for now', async () => { await setPrefs({ onboarded: 1 }); nav('#/today'); }, 'btn ghost')));
  }

  // course sheet
  function courseSheet(c) {
    let col = c ? c.color || COLORS[0] : COLORS[0];
    let arch = c ? !!c.archived : false;
    const nm = h('input', { type: 'text', value: c ? c.name : '' });
    const cod = h('input', { type: 'text', value: c && c.code ? c.code : '' });
    const archBtn = h('button', { class: 'chip' + (arch ? ' on' : ''), type: 'button', 'aria-pressed': String(arch), onclick: () => {
      arch = !arch; archBtn.className = 'chip' + (arch ? ' on' : ''); archBtn.setAttribute('aria-pressed', String(arch));
    } }, 'Archived');
    const go = run(async () => {
      if (!nm.value.trim()) { ui.toast('Add a course name'); return; }
      const o = { name: nm.value.trim(), code: cod.value.trim() || null, color: col, archived: arch ? 1 : 0 };
      s.close();
      if (c) await upd('courses', c.id, o); else await add('courses', o);
    });
    const rm = run(async () => {
      const ok = await ui.confirmBox('Delete this course? Its topics, assessments and flashcards are deleted too.', { ok: 'Delete', danger: true });
      if (!ok) return;
      s.close();
      await del('courses', c.id);
      nav('#/study');
    });
    const s = ui.sheet(c ? 'Edit course' : 'Add course', h('div', { class: 'col' },
      ui.field('Name', nm), ui.field('Code (optional)', cod),
      h('div', { class: 'col' }, h('span', { class: 'small' }, 'Color'), colorPick(() => col, v => { col = v; })),
      c ? archBtn : null,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Save'),
        c ? h('button', { class: 'btn danger', type: 'button', onclick: rm }, 'Delete course') : null)));
  }

  // list
  function list() {
    const live = S.courses.filter(c => !c.archived);
    const arch = S.courses.filter(c => c.archived);
    if (!S.courses.length) {
      wrap.append(ui.empty('No courses yet. Add your courses to track exams, topics and flashcards.',
        btn('Set up courses', () => nav('#/study?onboard=1'), 'btn primary')));
      return;
    }
    const byId = Object.fromEntries(S.courses.map(c => [c.id, c]));
    const nx = S.assessments.filter(a => a.date && a.date >= t && byId[a.course_id] && !byId[a.course_id].archived)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 3);
    if (nx.length) {
      wrap.append(h('div', { class: 'card col' }, h('h3', null, 'Next up'), h('div', { class: 'list' }, nx.map(a =>
        h('button', { class: 'item', type: 'button', style: { textAlign: 'left' }, onclick: () => nav('#/study/course/' + a.course_id) },
          dot(byId[a.course_id]),
          h('div', { class: 'grow' }, h('div', null, a.title), h('div', { class: 'small muted' }, byId[a.course_id].name + ' (' + fmtDate(a.date) + ')')),
          badge(a.date))))));
    }
    const due = dueCards(S.cards, t).length;
    if (due) {
      wrap.append(h('div', { class: 'card row' }, h('div', { class: 'grow' }, h('strong', null, due + (due === 1 ? ' card due' : ' cards due'))),
        btn('Review', () => nav('#/study/review'), 'btn primary')));
    }
    const card = c => {
      const ts = cTopics(c.id);
      const dn = ts.filter(x => x.status === 'done').length;
      const nu = upcoming(c.id)[0];
      return h('button', { class: 'card col', type: 'button', style: { textAlign: 'left', width: '100%' }, onclick: () => nav('#/study/course/' + c.id) },
        h('div', { class: 'row' }, dot(c), h('strong', { class: 'grow' }, c.name), c.code ? h('span', { class: 'small muted' }, c.code) : null),
        h('div', { class: 'bar' }, h('span', { style: { width: (ts.length ? Math.round(dn / ts.length * 100) : 0) + '%' } })),
        h('div', { class: 'row small muted' }, h('span', { class: 'grow' }, dn + '/' + ts.length + ' topics'),
          nu ? [h('span', null, nu.title), badge(nu.date)] : null));
    };
    wrap.append(...live.map(card));
    wrap.append(btn('+ Add course', () => courseSheet(null), 'btn'));
    if (arch.length) wrap.append(h('details', { class: 'card col' }, h('summary', null, 'Archived (' + arch.length + ')'),
      h('div', { class: 'col', style: { marginTop: '8px' } }, arch.map(card))));
  }

  // topic helpers
  const openTask = id => S.tasks.some(x => x.topic_id === id && !x.done_at);
  const linked = id => {
    const ids = S.assess_topics.filter(x => x.topic_id === id).map(x => x.assessment_id);
    return S.assessments.filter(a => ids.includes(a.id));
  };

  function taskSheet(c, tp) {
    const ln = linked(tp.id).filter(a => a.date && a.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
    const nu = ln || upcoming(c.id)[0];
    let est = tp.mins || 45;
    const num = h('input', { type: 'number', min: 5, max: 600, value: est });
    const due = h('input', { type: 'date', value: nu ? nu.date : '' });
    const box = h('div');
    const draw = () => box.replaceChildren(ui.chips([15, 30, 45, 60, 90, 120].map(v => ({ v, label: ui.fmtMins(v) })), est, v => { est = v; num.value = v; draw(); }));
    draw();
    num.addEventListener('input', () => { est = Number(num.value) || est; draw(); });
    const go = run(async () => {
      const e = Math.max(5, Math.round(Number(num.value) || est));
      s.close();
      const [row] = await add('tasks', { title: cname(c) + ': ' + tp.title, course_id: c.id, topic_id: tp.id, est: e, due: due.value || null });
      ui.toast('Added to tasks', { action: 'Undo', onAction: () => del('tasks', row.id).catch(err) });
    });
    const s = ui.sheet('How long will it take?', h('div', { class: 'col' }, box, ui.field('Minutes', num), ui.field('Due date', due),
      h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Add to tasks')));
  }

  function topicSheet(c, tp) {
    const ti = h('input', { type: 'text', value: tp.title });
    const mi = h('input', { type: 'number', min: 5, max: 600, value: tp.mins });
    const go = run(async () => {
      if (!ti.value.trim()) { ui.toast('Add a title'); return; }
      s.close();
      await upd('topics', tp.id, { title: ti.value.trim(), mins: Math.max(5, Math.round(Number(mi.value) || 45)) });
    });
    const rm = run(async () => {
      if (!(await ui.confirmBox('Delete this topic and its flashcards?', { ok: 'Delete', danger: true }))) return;
      s.close();
      await del('topics', tp.id);
    });
    const s = ui.sheet('Edit topic', h('div', { class: 'col' }, ui.field('Title', ti), ui.field('Minutes to study', mi),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Save'),
        h('button', { class: 'btn danger', type: 'button', onclick: rm }, 'Delete'))));
  }

  function bulkSheet(c) {
    const ta = h('textarea', { rows: 6, placeholder: 'One topic per line' });
    const go = run(async () => {
      const ls = ta.value.split('\n').map(x => x.trim()).filter(Boolean);
      if (!ls.length) { ui.toast('Type at least one topic'); return; }
      const mx = cTopics(c.id).reduce((m, x) => Math.max(m, x.sort), -1);
      s.close();
      await add('topics', ls.slice(0, 200).map((title, i) => ({ course_id: c.id, title, sort: mx + 1 + i })));
    });
    const s = ui.sheet('Add topics', h('div', { class: 'col' }, ui.field('Topics, one per line', ta),
      h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Add topics')));
  }

  function assSheet(c, a) {
    let kind = a ? a.kind : 'exam';
    const ti = h('input', { type: 'text', value: a ? a.title : '' });
    const da = h('input', { type: 'date', value: a && a.date ? a.date : '' });
    const tm = h('input', { type: 'time', value: a && a.time ? a.time : '' });
    const cur = a ? S.assess_topics.filter(x => x.assessment_id === a.id) : [];
    const ts = cTopics(c.id);
    const picks = new Set(cur.map(x => x.topic_id));
    const kb = h('div');
    const draw = () => kb.replaceChildren(h('div', { class: 'seg', role: 'group' }, ['exam', 'quiz', 'assignment'].map(k =>
      h('button', { type: 'button', class: kind === k ? 'on' : '', 'aria-pressed': String(kind === k), onclick: () => { kind = k; draw(); } }, k[0].toUpperCase() + k.slice(1)))));
    draw();
    const go = run(async () => {
      if (!ti.value.trim()) { ui.toast('Add a title'); return; }
      const o = { kind, title: ti.value.trim(), date: da.value || null, time: tm.value || null };
      s.close();
      let id = a && a.id;
      if (a) await upd('assessments', a.id, o);
      else id = (await add('assessments', { ...o, course_id: c.id }))[0].id;
      const ins = [...picks].filter(x => !cur.some(r => r.topic_id === x)).map(topic_id => ({ assessment_id: id, topic_id }));
      if (ins.length) await add('assess_topics', ins);
      for (const r of cur) if (!picks.has(r.topic_id)) await del('assess_topics', r.id);
    });
    const rm = run(async () => {
      if (!(await ui.confirmBox('Delete this assessment?', { ok: 'Delete', danger: true }))) return;
      s.close();
      await del('assessments', a.id);
    });
    const tl = ts.length ? h('div', { class: 'col' }, h('span', { class: 'small' }, 'Topics covered'), ts.map(tp =>
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: picks.has(tp.id), onchange: e => { e.target.checked ? picks.add(tp.id) : picks.delete(tp.id); } }), h('span', null, tp.title)))) : null;
    const s = ui.sheet(a ? 'Edit assessment' : 'Add assessment', h('div', { class: 'col' }, kb, ui.field('Title', ti),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, ui.field('Date', da)), h('div', { class: 'grow' }, ui.field('Time', tm))), tl,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Save'),
        a ? h('button', { class: 'btn danger', type: 'button', onclick: rm }, 'Delete') : null)));
  }

  function cardSheet(tp, cd0) {
    const f = h('textarea', { rows: 3 });
    const b = h('textarea', { rows: 3 });
    f.value = cd0 ? cd0.front : '';
    b.value = cd0 ? cd0.back : '';
    const go = run(async () => {
      if (!f.value.trim()) { ui.toast('Add the front of the card'); return; }
      s.close();
      if (cd0) await upd('cards', cd0.id, { front: f.value.trim(), back: b.value.trim() });
      else await add('cards', { topic_id: tp.id, front: f.value.trim(), back: b.value.trim(), due: t, ivl: 0, ease: 2.5, reps: 0 });
    });
    const s = ui.sheet(cd0 ? 'Edit card' : 'New card', h('div', { class: 'col' }, ui.field('Front', f), ui.field('Back', b),
      h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Save')));
  }

  function manageCards(tp) {
    const box = h('div', { class: 'list' });
    const draw = () => {
      const cs = S.cards.filter(x => x.topic_id === tp.id);
      box.replaceChildren(...(cs.length ? cs.map(x => h('div', { class: 'item row' },
        h('span', { class: 'grow' }, x.front),
        h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Edit card', onclick: () => { s.close(); cardSheet(tp, x); } }, icon('edit')),
        h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Delete card', onclick: run(async () => {
          const { id, ...rest } = x;
          await del('cards', id);
          draw();
          ui.toast('Card deleted', { action: 'Undo', onAction: () => add('cards', { ...rest, user_id: undefined }).catch(err) });
        }) }, icon('trash')))) : [h('p', { class: 'muted' }, 'No cards yet.')]));
    };
    draw();
    const s = ui.sheet('Cards: ' + tp.title, h('div', { class: 'col' }, box,
      h('button', { class: 'btn primary', type: 'button', onclick: () => { s.close(); cardSheet(tp, null); } }, '+ Card')));
  }

  function noteSheet(c, n) {
    const ti = h('input', { type: 'text', value: n && n.title ? n.title : '' });
    const bo = h('textarea', { rows: 6 });
    bo.value = n ? n.body : '';
    const go = run(async () => {
      if (!ti.value.trim() && !bo.value.trim()) { ui.toast('Write something first'); return; }
      const o = { title: ti.value.trim() || null, body: bo.value, updated: new Date().toISOString() };
      s.close();
      if (n) await upd('notes', n.id, o); else await add('notes', { ...o, course_id: c.id });
    });
    const rm = run(async () => {
      s.close();
      const { id, ...rest } = n;
      await del('notes', id);
      ui.toast('Note deleted', { action: 'Undo', onAction: () => add('notes', rest).catch(err) });
    });
    const s = ui.sheet(n ? 'Edit note' : 'New note', h('div', { class: 'col' }, ui.field('Title', ti), ui.field('Note', bo),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Save'),
        n ? h('button', { class: 'btn danger', type: 'button', onclick: rm }, 'Delete') : null)));
  }

  // course page
  function course() {
    const c = S.courses.find(x => x.id === Number(params.id));
    if (!c) {
      wrap.append(back('Study', '#/study'), ui.empty('This course was not found.', btn('Back to study', () => nav('#/study'), 'btn primary')));
      return;
    }
    wrap.append(back('Study', '#/study'),
      h('div', { class: 'row' }, dot(c), h('div', { class: 'grow' }, h('h2', null, c.name), c.code ? h('div', { class: 'small muted' }, c.code) : null),
        h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Edit course', onclick: () => courseSheet(c) }, icon('edit'))));
    // assessments
    const as = cAss(c.id).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    wrap.append(h('div', { class: 'card col' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Assessments'), btn('+ Add', () => assSheet(c, null), 'btn')),
      as.length ? h('div', { class: 'list' }, as.map(a => h('button', { class: 'item row', type: 'button', style: { textAlign: 'left' }, onclick: () => assSheet(c, a) },
        h('span', { class: 'badge' }, a.kind),
        h('div', { class: 'grow' }, h('div', null, a.title), h('div', { class: 'small muted' }, a.date ? fmtDate(a.date) + (a.time ? ' ' + a.time : '') : 'No date')),
        a.date && a.date >= t ? badge(a.date) : null)))
        : h('p', { class: 'muted' }, 'No exams, quizzes or assignments yet. Add one to see countdowns.')));
    // topics
    const all = cTopics(c.id);
    const shown = all.filter(x => filt === 'all' || x.status === filt);
    const fl = [['all', 'All'], ['todo', 'To do'], ['learning', 'Learning'], ['done', 'Done']];
    wrap.append(h('div', { class: 'card col' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Topics'), btn('+ Add topics', () => bulkSheet(c), 'btn')),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter topics' }, fl.map(([k, l]) =>
        h('button', { type: 'button', class: filt === k ? 'on' : '', 'aria-pressed': String(filt === k), onclick: () => { filt = k; ctx.refresh(); } }, l))),
      shown.length ? h('div', { class: 'list' }, shown.map(tp => {
        const st = STAT[tp.status];
        const ln = linked(tp.id);
        return h('div', { class: 'item row' },
          h('button', { class: 'check', type: 'button', 'aria-label': 'Status: ' + st.label + '. Tap to change.', title: st.label, style: { color: st.col }, onclick: run(() => upd('topics', tp.id, { status: NEXT[tp.status] })) }, icon(st.ic)),
          h('div', { class: 'grow' }, h('div', null, tp.title, ' ', h('span', { class: 'small muted' }, ui.fmtMins(tp.mins))),
            ln.length ? h('div', { class: 'small muted' }, 'linked to: ' + ln.map(a => a.title).join(', ')) : null),
          openTask(tp.id) ? h('span', { class: 'badge ok' }, 'In tasks') : btn('+ Task', () => taskSheet(c, tp), 'btn'),
          h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Edit topic ' + tp.title, onclick: () => topicSheet(c, tp) }, icon('edit')));
      })) : h('p', { class: 'muted' }, all.length ? 'Nothing in this filter.' : 'No topics yet. Add a few to start tracking progress.')));
    // flashcards
    const cc = S.cards.filter(x => all.some(y => y.id === x.topic_id));
    wrap.append(h('div', { class: 'card col' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Flashcards'),
      cc.length ? btn('Study this course', () => nav('#/study/review?course=' + c.id), 'btn primary') : null),
      all.length ? h('div', { class: 'list' }, all.map(tp => {
        const n = S.cards.filter(x => x.topic_id === tp.id).length;
        return h('div', { class: 'item row' }, h('span', { class: 'grow' }, tp.title, ' ', h('span', { class: 'small muted' }, n + (n === 1 ? ' card' : ' cards'))),
          n ? btn('Cards', () => manageCards(tp), 'btn ghost') : null, btn('+ Card', () => cardSheet(tp, null), 'btn'));
      })) : h('p', { class: 'muted' }, 'Add topics first, then make flashcards for them.')));
    // notes
    const ns = S.notes.filter(x => x.course_id === c.id);
    wrap.append(h('div', { class: 'card col' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Notes'), btn('+ Note', () => noteSheet(c, null), 'btn')),
      ns.length ? h('div', { class: 'list' }, ns.map(n => h('button', { class: 'item col', type: 'button', style: { textAlign: 'left', alignItems: 'flex-start' }, onclick: () => noteSheet(c, n) },
        h('strong', null, n.title || 'Untitled'), h('span', { class: 'small muted' }, (n.body || '').split('\n')[0]))))
        : h('p', { class: 'muted' }, 'No notes for this course yet.')));
  }

  // review
  function reviewView() {
    const cid = params.course ? Number(params.course) : null;
    const tcs = cid ? new Set(S.topics.filter(x => x.course_id === cid).map(x => x.id)) : null;
    const q = dueCards(S.cards, t).filter(x => !tcs || tcs.has(x.topic_id));
    if (!rv || rv.cid !== cid) rv = { cid, done: 0, shown: false };
    const to = cid ? '#/study/course/' + cid : '#/study';
    if (!q.length) {
      wrap.append(back('Study', to), h('div', { class: 'card col', style: { alignItems: 'center', textAlign: 'center' } },
        h('h2', null, 'All caught up'), h('p', { class: 'muted' }, rv.done ? 'You reviewed ' + rv.done + (rv.done === 1 ? ' card.' : ' cards.') : 'No cards are due right now.'),
        btn('Back to study', () => nav(to), 'btn primary')));
      return;
    }
    const cd1 = q[0];
    const tp = S.topics.find(x => x.id === cd1.topic_id);
    const co = tp && S.courses.find(x => x.id === tp.course_id);
    const grade = run(async g => {
      rv.shown = false;
      rv.done++;
      await upd('cards', cd1.id, review(cd1, g, t));
    });
    const show = () => { rv.shown = true; ctx.refresh(); };
    const pv = g => { const r = review(cd1, g, t).ivl; return r === 1 ? '1 day' : r + ' days'; };
    wrap.append(back('Study', to),
      h('div', { class: 'row small muted' }, h('span', { class: 'grow' }, (tp ? tp.title : '') + (co ? ' (' + co.name + ')' : '')), h('span', null, (rv.done + 1) + ' of ' + (rv.done + q.length))),
      h('div', { class: 'card col', style: { minHeight: '180px', justifyContent: 'center', textAlign: 'center' } },
        h('div', { style: { fontSize: '1.4rem', fontWeight: '600', whiteSpace: 'pre-wrap' } }, cd1.front),
        rv.shown ? h('div', { style: { whiteSpace: 'pre-wrap', borderTop: '1px solid var(--line)', paddingTop: '12px' } }, cd1.back || '(no answer written)') : null),
      rv.shown ? h('div', { class: 'row' }, GRADES.map((x, i) => h('button', { class: 'btn grow', type: 'button', style: { flexDirection: 'column' }, onclick: () => grade(x.g) },
        h('span', null, (i + 1) + ' ' + x.label), h('span', { class: 'small muted' }, pv(x.g)))))
        : btn('Show answer', show, 'btn primary'));
    keyFn = e => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.sheet')) return;
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      if (e.key === ' ' && !rv.shown) { e.preventDefault(); show(); }
      else if (rv.shown && e.key >= '1' && e.key <= '4') grade(GRADES[Number(e.key) - 1].g);
    };
    document.addEventListener('keydown', keyFn);
  }

  if (params.onboard === '1' && !S.courses.length) onboard();
  else if (sub === 'course') course();
  else if (sub === 'review') reviewView();
  else list();
}
