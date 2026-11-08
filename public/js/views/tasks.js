import { parseQuick } from '/js/parse.js';
import { addDays } from '/js/srs.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dl = s => { const d = new Date(s + 'T00:00:00Z'); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
const ESTS = [15, 30, 45, 60, 90];

let q = '';
let cf = '';
let showDone = false;
let fcourse = '';
let again = false;

export default function view(root, ctx) {
  const { S, ui, store } = ctx;
  const { h, icon } = ui;
  const tod = store.today();
  const fail = () => ui.toast('Something went wrong. Try again.');
  const cname = id => { const c = S.courses.find(x => x.id === id); return c ? (c.code || c.name) : ''; };
  const courses = S.courses.filter(c => !c.archived);
  const copts = sel => [h('option', { value: '' }, 'No course'), courses.map(c => h('option', { value: c.id, selected: String(c.id) === String(sel) }, c.code ? c.code + ' ' + c.name : c.name))];

  const toggle = t => ctx.upd('tasks', t.id, { done_at: t.done_at ? null : new Date().toISOString() }).catch(fail);

  const editSheet = t => {
    const st = { title: t.title, due: t.due || '', est: t.est || null, course: t.course_id ? String(t.course_id) : '', priority: t.priority, notes: t.notes || '' };
    const ti = h('input', { type: 'text', value: st.title, oninput: e => { st.title = e.target.value; } });
    const di = h('input', { type: 'date', value: st.due, oninput: e => { st.due = e.target.value; } });
    const ei = h('input', { type: 'number', min: 5, max: 600, step: 5, value: st.est || '', oninput: e => { st.est = e.target.value ? Number(e.target.value) : null; draw(); } });
    const cs = h('select', { onchange: e => { st.course = e.target.value; } }, copts(st.course));
    const ni = h('textarea', { rows: 3, oninput: e => { st.notes = e.target.value; } }, st.notes);
    const box = h('div', { class: 'col' });
    const draw = () => {
      box.replaceChildren(ui.field('Title', ti), ui.field('Due', di),
        ui.chips(ESTS.map(n => ({ v: n, label: n + 'm' })), st.est, v => { st.est = v; ei.value = v; draw(); }),
        ui.field('Estimate (minutes)', ei), ui.field('Course', cs),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Priority' }, [[1, 'High'], [2, 'Normal'], [3, 'Low']].map(([v, l]) =>
          h('button', { type: 'button', class: st.priority === v ? 'on' : '', 'aria-pressed': String(st.priority === v), onclick: () => { st.priority = v; draw(); } }, l))),
        ui.field('Notes', ni),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary grow', type: 'button', onclick: save }, 'Save'),
          h('button', { class: 'btn danger', type: 'button', onclick: rm }, 'Delete')));
    };
    const save = async () => {
      if (!st.title.trim()) { ui.toast('Add a title'); return; }
      s.close();
      try {
        await ctx.upd('tasks', t.id, { title: st.title.trim(), due: st.due || null, est: st.est, course_id: st.course ? Number(st.course) : null, priority: st.priority, notes: st.notes.trim() || null });
      } catch (e) { fail(); }
    };
    const rm = async () => {
      s.close();
      try {
        await ctx.del('tasks', t.id);
        const { title, notes, course_id, topic_id, due, est, priority, done_at } = t;
        ui.toast('Task deleted', { action: 'Undo', onAction: () => ctx.add('tasks', { title, notes, course_id, topic_id, due, est, priority, done_at }).catch(fail) });
      } catch (e) { fail(); }
    };
    const s = ui.sheet('Edit task', box);
    draw();
  };

  // add form
  const f = { est: null, priority: 2 };
  const ti = h('input', { type: 'text', placeholder: 'Add a task, e.g. read ch3 tmrw 45m', 'aria-label': 'Task title', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }, oninput: () => prev() });
  const di = h('input', { type: 'date', 'aria-label': 'Due date' });
  const ei = h('input', { type: 'number', min: 5, max: 600, step: 5, placeholder: 'min', 'aria-label': 'Custom estimate in minutes', style: { width: '80px' }, oninput: e => { f.est = e.target.value ? Number(e.target.value) : null; drawEst(); } });
  const cs = h('select', { 'aria-label': 'Course', onchange: e => { fcourse = e.target.value; } }, copts(fcourse));
  const estEl = h('div', { class: 'row' });
  const prEl = h('div', { class: 'seg', role: 'group', 'aria-label': 'Priority' });
  const pv = h('div', { class: 'row small muted' });
  const drawEst = () => estEl.replaceChildren(ui.chips(ESTS.map(n => ({ v: n, label: n + 'm' })), f.est, v => { f.est = f.est === v ? null : v; ei.value = f.est || ''; drawEst(); }), ei);
  const drawPr = () => prEl.replaceChildren(...[[1, 'High'], [2, 'Normal'], [3, 'Low']].map(([v, l]) =>
    h('button', { type: 'button', class: f.priority === v ? 'on' : '', 'aria-pressed': String(f.priority === v), onclick: () => { f.priority = v; drawPr(); } }, l)));
  const parse = () => parseQuick(ti.value, tod, new Date().getDay());
  const prev = () => {
    pv.replaceChildren();
    if (!ti.value.trim()) return;
    const p = parse();
    if (p.due) pv.append(h('span', { class: 'badge' }, dl(p.due)));
    if (p.est) pv.append(h('span', { class: 'badge' }, ui.fmtMins(p.est)));
    if (p.priority) pv.append(h('span', { class: 'badge' }, ['', 'High', 'Normal', 'Low'][p.priority]));
  };
  const submit = async () => {
    if (!ti.value.trim()) { ui.toast('Type a task title first'); return; }
    const p = parse();
    const obj = { title: p.title, due: p.due || di.value || null, est: p.est || f.est || null, priority: p.priority || f.priority, course_id: fcourse ? Number(fcourse) : null };
    try {
      again = true;
      ti.value = '';
      prev();
      await ctx.add('tasks', obj);
      ti.blur();
    } catch (e) { again = false; ti.value = obj.title; prev(); fail(); }
  };
  drawEst();
  drawPr();
  const form = h('div', { class: 'card col' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, ti), h('button', { class: 'btn primary', type: 'button', onclick: submit }, icon('plus'), ' Add')),
    pv,
    h('div', { class: 'row' }, di, cs),
    estEl, prEl);

  // list
  const list = h('div', { class: 'col' });
  const item = t => {
    const c = cname(t.course_id);
    const line = [c, t.due ? (t.due < tod && !t.done_at ? 'Overdue ' : '') + dl(t.due) : '', t.est ? ui.fmtMins(t.est) : ''].filter(Boolean).join(' / ');
    return h('div', { class: 'item' },
      h('button', { class: 'check' + (t.done_at ? ' on' : ''), type: 'button', 'aria-label': (t.done_at ? 'Mark not done: ' : 'Mark done: ') + t.title, onclick: () => toggle(t) }, icon('check')),
      h('button', { class: 'grow ghost', type: 'button', style: { textAlign: 'left', background: 'none', border: 0, color: 'inherit', font: 'inherit', padding: 0, cursor: 'pointer' }, 'aria-label': 'Edit task: ' + t.title, onclick: () => editSheet(t) },
        h('div', { style: t.done_at ? { textDecoration: 'line-through', opacity: '.6' } : null }, t.title),
        line ? h('div', { class: 'small muted' }, line) : null),
      t.priority === 1 ? h('span', { class: 'badge warn', title: 'High priority' }, 'High') : null);
  };
  const draw = () => {
    const all = S.tasks;
    if (!all.length) {
      list.replaceChildren(ui.empty('Nothing here yet. Add your first task above.'));
      return;
    }
    const m = t => (!q || t.title.toLowerCase().includes(q.toLowerCase())) && (!cf || String(t.course_id) === cf);
    const open = all.filter(t => !t.done_at && m(t));
    const wk = addDays(tod, 7);
    const tm = addDays(tod, 1);
    const by = (a, b) => (a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : a.priority - b.priority || a.id - b.id;
    const groups = [
      ['Overdue', open.filter(t => t.due && t.due < tod)],
      ['Today', open.filter(t => t.due === tod)],
      ['Tomorrow', open.filter(t => t.due === tm)],
      ['This week', open.filter(t => t.due > tm && t.due <= wk)],
      ['Later', open.filter(t => t.due > wk)],
      ['No date', open.filter(t => !t.due)],
    ];
    if (showDone) groups.push(['Done', all.filter(t => t.done_at && m(t)).sort((a, b) => (a.done_at < b.done_at ? 1 : -1)).slice(0, 30)]);
    const els = groups.filter(g => g[1].length).map(([name, rows]) => h('div', { class: 'col' },
      h('h3', null, name + ' (' + rows.length + ')'),
      h('div', { class: 'list card', style: { padding: 0 } }, (name === 'Done' ? rows : rows.sort(by)).map(item))));
    list.replaceChildren(...(els.length ? els : [ui.empty('No tasks match.')]));
  };

  const si = h('input', { type: 'search', placeholder: 'Search tasks', 'aria-label': 'Search tasks', value: q, oninput: e => { q = e.target.value; draw(); } });
  const cfs = h('select', { 'aria-label': 'Filter by course', onchange: e => { cf = e.target.value; draw(); } },
    h('option', { value: '' }, 'All courses'), S.courses.map(c => h('option', { value: c.id, selected: String(c.id) === cf }, c.code || c.name)));
  const sd = h('button', { class: 'chip' + (showDone ? ' on' : ''), type: 'button', 'aria-pressed': String(showDone), onclick: e => {
    showDone = !showDone;
    e.currentTarget.className = 'chip' + (showDone ? ' on' : '');
    e.currentTarget.setAttribute('aria-pressed', String(showDone));
    draw();
  } }, 'Show done');
  draw();
  root.append(h('div', { class: 'wrap col' }, h('h2', null, 'Tasks'), form,
    h('div', { class: 'row' }, h('div', { class: 'grow' }, si), cfs, sd), list));
  if (again) { again = false; ti.focus(); }
}
