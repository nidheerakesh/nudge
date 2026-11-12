import { suggest, freeGaps, toMin, toHM, endOf } from '/js/plan.js';
import { dueCards, addDays } from '/js/srs.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dl = s => { const d = new Date(s + 'T00:00:00Z'); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
const r5 = n => Math.ceil(n / 5) * 5;

let sel = null;
let prop = null;
const sigOf = (S, day) => JSON.stringify([S.tasks.filter(t => !t.done_at).map(t => t.id),
  S.blocks.filter(b => b.day === day).map(b => [b.id, b.start, b.mins])]);
let seen = false;
let saving = false;

export default function view(root, ctx) {
  const { S, ui, store } = ctx;
  const { h, icon } = ui;
  const tod = store.today();
  if (!sel) sel = tod;
  if (prop && (prop.day !== sel || prop.sig !== sigOf(S, sel))) prop = null;
  if (ctx.params.plan !== '1') seen = false;
  const day = sel;
  const open = S.tasks.filter(t => !t.done_at);
  const dayBlocks = () => S.blocks.filter(b => b.day === day);
  const go = d => { sel = d; prop = null; ctx.refresh(); };
  const fail = () => ui.toast('Something went wrong. Try again.');

  const freeSlot = mins => {
    const bl = dayBlocks();
    const s0 = toMin(ctx.pref('day_start', '08:00'));
    const e0 = toMin(ctx.pref('day_end', '22:00'));
    const from = day === tod ? Math.max(s0, r5(toMin(store.nowHM()))) : s0;
    const gaps = freeGaps(from, e0, bl.map(b => ({ s: toMin(b.start), e: endOf(b) })));
    const g = gaps.find(x => x.e - x.s >= mins) || gaps[0];
    if (g) return toHM(g.s);
    return toHM(Math.min(1380, bl.reduce((m, b) => Math.max(m, endOf(b)), from)));
  };

  // save a block edit, then push later undone blocks so they do not overlap
  const saveBlock = async (b, patch) => {
    const nb = { ...b, ...patch };
    await ctx.upd('blocks', b.id, patch);
    if (nb.done) return;
    let cur = endOf(nb);
    const later = dayBlocks().filter(x => x.id !== b.id && !x.done && toMin(x.start) >= toMin(nb.start))
      .sort((a, c) => toMin(a.start) - toMin(c.start));
    for (const x of later) {
      if (x.kind === 'fixed' || toMin(x.start) >= cur || cur + x.mins > 1440) break;
      await ctx.upd('blocks', x.id, { start: toHM(cur) });
      cur += x.mins;
    }
  };

  const toggle = async b => {
    const nd = b.done ? 0 : 1;
    try {
      await ctx.upd('blocks', b.id, { done: nd });
      if (!nd || b.kind !== 'task' || !b.task_id) return;
      const t = S.tasks.find(x => x.id === b.task_id);
      const rest = S.blocks.some(x => x.task_id === b.task_id && x.id !== b.id && !x.done);
      if (t && !t.done_at && !rest) {
        ui.toast('Mark task done too?', { action: 'Mark done', onAction: () => ctx.upd('tasks', t.id, { done_at: new Date().toISOString() }).catch(fail) });
      }
    } catch (e) { fail(); }
  };

  const startFocus = async b => {
    try {
      await store.startTimer({ task_id: b.task_id, block_id: b.id, title: b.title, mins: b.mins });
      ctx.nav('#/focus');
    } catch (e) { fail(); }
  };

  const editSheet = b => {
    const st = { title: b.title, start: b.start, mins: b.mins, kind: b.kind };
    const ti = h('input', { type: 'text', value: st.title, oninput: e => { st.title = e.target.value; } });
    const si = h('input', { type: 'time', value: st.start, oninput: e => { st.start = e.target.value; } });
    const mi = h('input', { type: 'number', min: 5, max: 600, step: 5, value: st.mins, oninput: e => { st.mins = Number(e.target.value); } });
    const box = h('div', { class: 'col' });
    const draw = () => {
      mi.value = st.mins;
      box.replaceChildren(
        ui.field('Title', ti), ui.field('Start', si),
        ui.chips([15, 25, 30, 45, 60, 90].map(n => ({ v: n, label: n + 'm' })), st.mins, v => { st.mins = v; draw(); }),
        ui.field('Minutes', mi),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { st.mins = Math.max(5, st.mins - 15); draw(); } }, '-15m'),
          h('button', { class: 'btn', type: 'button', onclick: () => { st.mins += 15; draw(); } }, '+15m')),
        h('div', { class: 'seg', role: 'group' }, ['task', 'fixed', 'break'].map(k =>
          h('button', { type: 'button', class: st.kind === k ? 'on' : '', 'aria-pressed': String(st.kind === k), onclick: () => { st.kind = k; draw(); } }, k[0].toUpperCase() + k.slice(1)))),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary grow', type: 'button', onclick: save }, 'Save'),
          h('button', { class: 'btn danger', type: 'button', onclick: rm }, 'Delete')));
    };
    const save = async () => {
      if (!st.title.trim() || !st.start || !(st.mins > 0)) { ui.toast('Add a title, start time and minutes'); return; }
      s.close();
      try { await saveBlock(b, { title: st.title.trim(), start: st.start, mins: Math.round(st.mins), kind: st.kind }); } catch (e) { fail(); }
    };
    const rm = async () => {
      s.close();
      try {
        await ctx.del('blocks', b.id);
        const { day: d, start, mins, kind, task_id, title, done } = b;
        ui.toast('Block deleted', { action: 'Undo', onAction: () => ctx.add('blocks', { day: d, start, mins, kind, task_id, title, done }).catch(fail) });
      } catch (e) { fail(); }
    };
    const s = ui.sheet('Edit block', box);
    draw();
  };

  const addSheet = () => {
    const st = { title: '', start: freeSlot(30), mins: 30, kind: 'task', task: '' };
    const ti = h('input', { type: 'text', oninput: e => { st.title = e.target.value; } });
    const si = h('input', { type: 'time', value: st.start, oninput: e => { st.start = e.target.value; } });
    const mi = h('input', { type: 'number', min: 5, max: 600, step: 5, value: st.mins, oninput: e => { st.mins = Number(e.target.value); } });
    const ts = h('select', { onchange: e => {
      st.task = e.target.value;
      const t = S.tasks.find(x => x.id === Number(st.task));
      if (t) { ti.value = t.title; st.title = t.title; mi.value = t.est || 30; st.mins = t.est || 30; }
    } }, h('option', { value: '' }, 'No task'), open.map(t => h('option', { value: t.id }, t.title)));
    const kinds = h('div', { class: 'seg', role: 'group' });
    const dk = () => kinds.replaceChildren(...['task', 'fixed', 'break'].map(k =>
      h('button', { type: 'button', class: st.kind === k ? 'on' : '', 'aria-pressed': String(st.kind === k), onclick: () => { st.kind = k; dk(); } }, k[0].toUpperCase() + k.slice(1))));
    dk();
    const ok = async () => {
      if (!st.title.trim() || !st.start || !(st.mins > 0)) { ui.toast('Add a title, start time and minutes'); return; }
      s.close();
      try {
        await ctx.add('blocks', { day, start: st.start, mins: Math.round(st.mins), kind: st.kind, task_id: st.task && st.kind === 'task' ? Number(st.task) : null, title: st.title.trim() });
      } catch (e) { fail(); }
    };
    const s = ui.sheet('Add block', h('div', { class: 'col' }, ui.field('Task (optional)', ts), ui.field('Title', ti), ui.field('Start', si), ui.field('Minutes', mi), kinds,
      h('button', { class: 'btn primary', type: 'button', onclick: ok }, 'Add block')));
  };

  const plan = () => {
    if (!open.length) { ui.toast('Add tasks first, then plan your day'); return; }
    const res = suggest({ day, tasks: S.tasks, blocks: S.blocks, prefs: S.prefs, now: { day: tod, hm: store.nowHM() } });
    prop = { day, sig: sigOf(S, day), ...res };
    ctx.refresh();
  };
  const accept = async () => {
    if (!prop || saving) return;
    const bl = prop.blocks;
    saving = true;
    try {
      const rows = await ctx.add('blocks', bl);
      prop = null;
      ui.toast('Plan saved', { action: 'Undo', onAction: () => Promise.all(rows.map(r => ctx.del('blocks', r.id))).catch(fail) });
    } catch (e) { fail(); }
    saving = false;
  };
  if (ctx.params.plan === '1' && !seen) {
    seen = true;
    setTimeout(plan, 0);
  }

  const blockEl = b => {
    const ghost = !b.id;
    const cls = 'block' + (ghost ? ' ghost' : '') + (b.kind === 'fixed' ? ' fixed' : '') + (b.kind === 'break' ? ' break' : '') + (b.done ? ' done' : '');
    const info = h('div', { class: 'grow' },
      h('div', { class: 'small muted' }, b.start + ' - ' + toHM(endOf(b)) + ' (' + ui.fmtMins(b.mins) + ')' + (ghost ? ' proposed' : '')),
      h('div', { class: 'title' }, b.title));
    if (ghost) return h('div', { class: cls }, h('div', { class: 'row' }, info));
    return h('div', { class: cls, tabindex: 0, onkeydown: e => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const n = toMin(b.start) + (e.key === 'ArrowUp' ? -15 : 15);
      if (n < 0 || n + b.mins > 1440) return;
      saveBlock(b, { start: toHM(n) }).catch(fail);
    } }, h('div', { class: 'row' },
      h('button', { class: 'check' + (b.done ? ' on' : ''), type: 'button', 'aria-label': (b.done ? 'Mark not done: ' : 'Mark done: ') + b.title, onclick: () => toggle(b) }, icon('check')),
      info,
      b.kind === 'task' && !b.done ? h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Start focus: ' + b.title, onclick: () => startFocus(b) }, icon('play')) : null,
      h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Edit block: ' + b.title, onclick: () => editSheet(b) }, icon('edit'))));
  };

  // header
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const nm = S.user && S.user.name ? ', ' + S.user.name : '';
  const nd = open.filter(t => t.due && t.due <= tod).length;
  const nc = dueCards(S.cards, tod).length;
  const head = h('div', { class: 'col' },
    h('h2', null, greet + nm),
    h('div', { class: 'muted' }, dl(tod)),
    h('div', { class: 'small muted' }, nd + (nd === 1 ? ' task' : ' tasks') + ' due today, ',
      nc ? h('a', { href: '#/study/review' }, nc + (nc === 1 ? ' card' : ' cards') + ' to review') : '0 cards to review'));

  // now card
  const nowM = toMin(store.nowHM());
  const nb = S.blocks.filter(b => b.day === tod && !b.done && b.kind !== 'break'
    && ((toMin(b.start) <= nowM && endOf(b) > nowM) || (toMin(b.start) > nowM && toMin(b.start) - nowM <= 60)))
    .sort((a, b) => toMin(a.start) - toMin(b.start))[0];
  let now = null;
  if (store.timer()) {
    now = h('div', { class: 'card row' }, h('strong', { class: 'grow' }, 'Focus running'), h('a', { class: 'btn primary', href: '#/focus' }, 'Open timer'));
  } else if (nb) {
    now = h('div', { class: 'card col' },
      h('div', { class: 'small muted' }, toMin(nb.start) <= nowM ? 'Now' : 'Up next'),
      h('h3', null, nb.title),
      h('div', { class: 'small muted' }, nb.start + ' - ' + toHM(endOf(nb))),
      h('div', { class: 'row' },
        nb.kind === 'task' ? h('button', { class: 'btn primary', type: 'button', onclick: () => startFocus(nb) }, icon('play'), ' Start focus') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => toggle(nb) }, 'Done')));
  }

  // timeline
  const nav = h('div', { class: 'row' },
    h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Previous day', onclick: () => go(addDays(day, -1)) }, h('span', { style: { display: 'inline-block', transform: 'rotate(180deg)' } }, icon('chevron'))),
    h('strong', { class: 'grow', style: { textAlign: 'center' } }, (day === tod ? 'Today, ' : '') + dl(day)),
    day === tod ? null : h('button', { class: 'btn ghost', type: 'button', onclick: () => go(tod) }, 'Today'),
    h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Next day', onclick: () => go(addDays(day, 1)) }, icon('chevron')));
  const items = [...dayBlocks(), ...(prop ? prop.blocks : [])].sort((a, b) => toMin(a.start) - toMin(b.start));
  const tl = items.length ? h('div', { class: 'timeline' }, items.map(blockEl))
    : ui.empty('Nothing planned for this day.', h('button', { class: 'btn primary', type: 'button', onclick: plan }, 'Plan my day'));
  const bar = prop ? h('div', { class: 'card row', style: { position: 'sticky', bottom: '76px', zIndex: 5 } },
    h('strong', { class: 'grow' }, prop.blocks.length + (prop.blocks.length === 1 ? ' block proposed' : ' blocks proposed')),
    h('button', { class: 'btn', type: 'button', onclick: () => { prop = null; ctx.refresh(); } }, 'Discard'),
    prop.blocks.length ? h('button', { class: 'btn primary', type: 'button', onclick: accept }, 'Accept') : null) : null;
  const nofit = prop && prop.unplaced.length
    ? h('p', { class: 'small muted' }, 'Did not fit: ' + prop.unplaced.map(u => u.title + ' (' + ui.fmtMins(u.mins) + ')').join(', ')) : null;

  // unscheduled
  const lim = addDays(day, 2);
  const un = open.filter(t => t.due && t.due <= lim && !S.blocks.some(b => b.task_id === t.id && !b.done && b.day >= day))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id));
  const sched = async t => {
    const mins = t.est || 30;
    try { await ctx.add('blocks', { day, start: freeSlot(mins), mins, kind: 'task', task_id: t.id, title: t.title }); } catch (e) { fail(); }
  };
  const unEl = un.length ? h('div', { class: 'col' }, h('h3', null, 'Unscheduled'),
    h('div', { class: 'list card', style: { padding: 0 } }, un.map(t => h('div', { class: 'item' },
      h('button', { class: 'check', type: 'button', 'aria-label': 'Mark done: ' + t.title, onclick: () => ctx.upd('tasks', t.id, { done_at: new Date().toISOString() }).catch(fail) }, icon('check')),
      h('span', { class: 'grow' }, t.title),
      h('span', { class: 'badge' + (t.due < tod ? ' warn' : '') }, t.due < tod ? 'Overdue' : dl(t.due)),
      h('span', { class: 'small muted' }, ui.fmtMins(t.est || 30)),
      h('button', { class: 'btn', type: 'button', onclick: () => sched(t) }, 'Schedule'))))) : null;

  // habits
  const hs = S.habits.filter(x => !x.archived);
  const tg = async x => {
    const lg = S.hlog.find(l => l.habit_id === x.id && l.day === tod);
    try { if (lg) await ctx.del('hlog', lg.id); else await ctx.add('hlog', { habit_id: x.id, day: tod }); } catch (e) { fail(); }
  };
  const hb = hs.length ? h('div', { class: 'col' },
    h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Habits'), h('a', { class: 'small', href: '#/more/habits' }, 'Manage')),
    h('div', { class: 'row', style: { alignItems: 'flex-start' } }, hs.map(x => {
      const on = S.hlog.some(l => l.habit_id === x.id && l.day === tod);
      return h('div', { class: 'col', style: { alignItems: 'center', width: '64px', textAlign: 'center' } },
        h('button', { class: 'check' + (on ? ' on' : ''), type: 'button', 'aria-label': x.name + (on ? ' (done today)' : ''), 'aria-pressed': String(on), onclick: () => tg(x) }, icon('check')),
        h('span', { class: 'small' }, x.name));
    }))) : null;

  root.append(h('div', { class: 'wrap col' }, head, now, nav, tl, nofit, bar,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: addSheet }, icon('plus'), ' Add block'),
      h('button', { class: 'btn primary', type: 'button', onclick: plan }, icon('sparkle'), ' Plan my day')),
    unEl, hb));
}
