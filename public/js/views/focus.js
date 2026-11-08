let rate = null;
let tick = 0;
let mins = 0;
let pick = '';
const vc = (f) => import('../../town/verifyclient.js').then(f).catch(() => {});

const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = n => String(n).padStart(2, '0');

function clock(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const hh = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (hh ? hh + ':' + p2(m) : p2(m)) + ':' + p2(s % 60);
}

function dayOf(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

function fmtDay(day) {
  const d = new Date(day + 'T12:00:00');
  return DN[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + MN[d.getMonth()];
}

export default function view(root, ctx) {
  const { S, ui, store } = ctx;
  const { h } = ui;
  clearInterval(tick);
  const wrap = h('div', { class: 'wrap col' });
  root.append(wrap);
  const t = store.timer();
  if (t) { vc(m => m.start(t.session_id, () => !!(store.timer() || {}).paused_at)); wrap.append(running(t)); }
  else {
    vc(m => m.stop());
    document.title = 'Nudge';
    if (rate) wrap.append(rating());
    wrap.append(idle());
  }
  wrap.append(...stats());

  function running(t) {
    const num = h('div', { style: { fontSize: '44px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' } });
    const sub = h('div', { class: 'small muted' });
    const R = 54, C = 2 * Math.PI * R;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('width', '180');
    svg.setAttribute('height', '180');
    svg.setAttribute('aria-hidden', 'true');
    const mk = (col, w) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', '60'); c.setAttribute('cy', '60'); c.setAttribute('r', R);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', col); c.setAttribute('stroke-width', w);
      svg.append(c);
      return c;
    };
    mk('var(--line)', 8);
    const arc = mk('var(--accent)', 8);
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('stroke-dasharray', C);
    arc.setAttribute('transform', 'rotate(-90 60 60)');
    const up = h('p', { class: 'small', style: { color: 'var(--warn)' } });
    const draw = () => {
      const cur = store.timer();
      if (!cur || !root.isConnected) { clearInterval(tick); return; }
      const rem = store.remainingMs(cur);
      const over = rem < 0;
      num.textContent = (over ? '+' : '') + clock(rem);
      num.style.color = over ? 'var(--warn)' : '';
      const frac = Math.min(1, store.elapsedMs(cur) / (cur.mins * 60000));
      arc.setAttribute('stroke-dashoffset', C * (1 - frac));
      arc.setAttribute('stroke', over ? 'var(--warn)' : 'var(--accent)');
      sub.textContent = cur.paused_at ? 'Paused' : 'Planned ' + ui.fmtMins(cur.mins);
      up.textContent = over ? 'Time is up. Wrap up when you are ready.' : '';
      document.title = (cur.paused_at ? 'Paused ' : '') + (over ? '+' : '') + clock(rem) + ' | Nudge';
    };
    draw();
    tick = setInterval(draw, 1000);
    const paused = !!t.paused_at;
    const fin = async k => {
      clearInterval(tick);
      document.title = 'Nudge';
      const row = await store.finishTimer(k);
      if (row) rate = row.id;
      ctx.refresh();
    };
    return h('div', { class: 'card col', style: { alignItems: 'center', textAlign: 'center' } },
      h('h2', null, t.title || 'Quick focus'),
      h('div', { style: { position: 'relative', width: '180px', height: '180px' } },
        svg,
        h('div', { style: { position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } }, num, sub)),
      up,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => paused ? store.resumeTimer() : store.pauseTimer() },
          ui.icon(paused ? 'play' : 'pause'), paused ? 'Resume' : 'Pause'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => fin('done') }, ui.icon('check'), 'Done'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => fin('stopped') }, ui.icon('stop'), 'Stop')));
  }

  function rating() {
    const id = rate;
    const hide = () => { rate = null; ctx.refresh(); };
    return h('div', { class: 'card col' },
      h('h3', null, 'How focused were you?'),
      h('div', { class: 'row' },
        ...[1, 2, 3, 4, 5].map(n => h('button', { class: 'btn', type: 'button', 'aria-label': 'Focus rating ' + n + ' of 5',
          onclick: async () => { rate = null; await store.rateSession(id, n); } }, String(n))),
        h('button', { class: 'btn ghost', type: 'button', onclick: hide }, 'Skip')));
  }

  function idle() {
    const day = store.today();
    const open = S.tasks.filter(x => !x.done_at);
    const blk = S.blocks.filter(b => b.day === day && b.kind === 'task' && !b.done && b.start >= store.nowHM())
      .sort((a, b) => a.start < b.start ? -1 : 1)[0]
      || S.blocks.filter(b => b.day === day && b.kind === 'task' && !b.done).sort((a, b) => a.start < b.start ? -1 : 1)[0];
    const dflt = Number(ctx.pref('focus_mins', 45)) || 45;
    const task = open.find(x => String(x.id) === pick);
    const len = () => mins || (task && task.est) || dflt;
    const go = o => store.startTimer(o).then(() => ctx.refresh());
    const box = h('div', { class: 'col' });
    const sel = h('select', { 'aria-label': 'Task', onchange: e => { pick = e.target.value; mins = 0; ctx.refresh(); } },
      h('option', { value: '' }, 'Pick a task'),
      ...open.map(x => h('option', { value: String(x.id), selected: String(x.id) === pick }, x.title)));
    const chipRow = ui.chips([15, 25, 45, 60, 90].map(v => ({ v, label: v + 'm' })), len(), v => { mins = v; ctx.refresh(); });
    box.append(...[
      h('h2', null, 'What do you want to focus on?'),
      blk ? h('div', { class: 'item row' },
        h('div', { class: 'grow' }, h('b', null, blk.title), h('div', { class: 'small muted' }, blk.start + ', ' + ui.fmtMins(blk.mins))),
        h('button', { class: 'btn primary', type: 'button', 'aria-label': 'Start ' + blk.title,
          onclick: () => go({ task_id: blk.task_id, block_id: blk.id, title: blk.title, mins: blk.mins }) }, ui.icon('play'), 'Start')) : null,
      open.length ? ui.field('Or pick a task', sel) : ui.empty('No open tasks. Add one, or just start a quick session.', h('a', { class: 'btn', href: '#/tasks' }, 'Go to tasks')),
      h('div', { class: 'small muted' }, 'Minutes'),
      chipRow,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => go(task
          ? { task_id: task.id, title: task.title, mins: len() }
          : { title: 'Quick focus', mins: len() }) }, ui.icon('play'), task ? 'Start focus' : 'Start without a task'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => go({ title: 'Quick focus', mins: 5 }) }, 'Just 5 minutes'))].filter(Boolean));
    return h('div', { class: 'card' }, box);
  }

  function stats() {
    const ss = S.sessions.filter(x => (x.end_kind === 'done' || x.end_kind === 'stopped') && x.act_mins > 0);
    const tk = new Map(S.tasks.map(x => [x.id, x]));
    const day = store.today();
    const byDay = {};
    for (const s of ss) { const d = dayOf(s.start_at); byDay[d] = (byDay[d] || 0) + s.act_mins; }
    const wd = (new Date().getDay() + 6) % 7;
    const mon = store.addDays(day, -wd);
    const week = DN.map((_, i) => byDay[store.addDays(mon, i)] || 0);
    const wsum = week.reduce((a, b) => a + b, 0);
    let streak = 0;
    let d = byDay[day] ? day : store.addDays(day, -1);
    while (byDay[d]) { streak++; d = store.addDays(d, -1); }
    const c30 = store.addDays(day, -30);
    const rated = ss.filter(s => s.rating && dayOf(s.start_at) >= c30);
    const avg = rated.length ? (rated.reduce((a, s) => a + s.rating, 0) / rated.length).toFixed(1) : null;
    const tile = (v, l) => h('div', { class: 'card stat', style: { flex: '1 1 140px' } }, h('b', null, v), h('span', null, l));
    const out = [];
    out.push(h('div', { class: 'row' },
      tile(ui.fmtMins(byDay[day] || 0) || '0m', 'Today'),
      tile(ui.fmtMins(wsum) || '0m', 'This week'),
      tile(streak + (streak === 1 ? ' day' : ' days'), 'Streak'),
      tile(avg ? avg + ' / 5' : 'No ratings yet', 'Average focus')));
    if (!ss.length) {
      out.push(h('div', { class: 'card' }, ui.empty('No focus sessions yet. Start one above and your stats show up here.')));
      return out;
    }
    const mx = Math.max(...week, 1);
    out.push(h('div', { class: 'card col' }, h('h3', null, 'This week'),
      h('div', { class: 'chart' }, ...week.map((v, i) => h('span', {
        title: DN[i] + ': ' + ui.fmtMins(v), style: { height: Math.max(2, v / mx * 100) + '%', opacity: store.addDays(mon, i) === day ? '1' : '0.55' } }))),
      h('div', { class: 'grid7 small muted', style: { textAlign: 'center' } },
        ...week.map((v, i) => h('div', { style: { fontWeight: store.addDays(mon, i) === day ? '700' : '400', color: store.addDays(mon, i) === day ? 'var(--fg)' : '' } },
          DN[i], h('div', null, v === mx && v > 0 ? ui.fmtMins(v) : ' '))))));
    const bc = new Map();
    for (const s of ss) {
      if (dayOf(s.start_at) < mon || dayOf(s.start_at) > store.addDays(mon, 6)) continue;
      const k = (tk.get(s.task_id) || {}).course_id || 0;
      bc.set(k, (bc.get(k) || 0) + s.act_mins);
    }
    const cr = [...bc].sort((a, b) => b[1] - a[1]);
    const cm = cr.length ? cr[0][1] : 1;
    out.push(h('div', { class: 'card col' }, h('h3', null, 'By course this week'),
      cr.length ? h('div', { class: 'list' }, ...cr.map(([id, m]) => {
        const c = S.courses.find(x => x.id === id);
        return h('div', { class: 'item col', style: { alignItems: 'stretch', gap: '4px' } },
          h('div', { class: 'row' },
            h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: (c && c.color) || 'var(--muted)' } }),
            h('span', { class: 'grow' }, c ? c.name : 'No course'), h('span', { class: 'small muted' }, ui.fmtMins(m))),
          h('div', { class: 'bar' }, h('span', { style: { width: (m / cm * 100) + '%' } })));
      })) : h('p', { class: 'small muted' }, 'Nothing logged this week yet.')));
    const hrs = {};
    const r30 = ss.filter(s => dayOf(s.start_at) >= c30);
    for (const s of r30) { const hh = new Date(s.start_at).getHours(); hrs[hh] = (hrs[hh] || 0) + s.act_mins; }
    const top = Object.entries(hrs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => Number(x[0]));
    out.push(h('div', { class: 'card col' }, h('h3', null, 'Best hours'),
      r30.length >= 5
        ? h('div', null, h('b', null, top.map(x => x + '-' + (x + 1)).join(', ')), h('div', { class: 'small muted' }, 'based on ' + r30.length + ' sessions'))
        : h('p', { class: 'small muted' }, 'Keep logging sessions to see patterns')));
    const ratios = [];
    for (const x of S.tasks) {
      if (!x.done_at || !x.est) continue;
      const m = ss.filter(s => s.task_id === x.id).reduce((a, s) => a + s.act_mins, 0);
      if (m > 0) ratios.push(m / x.est);
    }
    if (ratios.length >= 3) {
      const r = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      out.push(h('div', { class: 'card col' }, h('h3', null, 'Estimates'),
        h('p', null, 'Your tasks take about ' + r.toFixed(1) + 'x your estimate')));
    }
    const rec = ss.slice().sort((a, b) => a.start_at < b.start_at ? 1 : -1).slice(0, 10);
    out.push(h('div', { class: 'card col' }, h('h3', null, 'Recent sessions'),
      h('div', { class: 'list' }, ...rec.map(s => {
        const x = tk.get(s.task_id);
        return h('div', { class: 'item row' },
          h('div', { class: 'grow' }, h('div', null, x ? x.title : 'Quick focus'),
            h('div', { class: 'small muted' }, fmtDay(dayOf(s.start_at)) + ', ' + ui.fmtMins(s.act_mins) + (s.plan_mins ? ' of ' + ui.fmtMins(s.plan_mins) : ''))),
          s.rating ? h('span', { class: 'small muted', title: 'Focus rating' }, s.rating + '/5') : null,
          h('span', { class: 'badge' + (s.end_kind === 'done' ? ' ok' : '') }, s.end_kind));
      }))));
    return out;
  }
}
