import { api } from '/js/api.js';

const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pd = s => new Date(s + 'T12:00:00');
const fmtDay = s => { if (!s) return ''; const d = pd(s); return DN[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()]; };
const first = s => String(s || '').split('\n').find(x => x.trim()) || '';

let msgs = [];
let q = '';

function ago(s) {
  const t = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).getTime();
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  if (m < 1440) return Math.round(m / 60) + 'h ago';
  if (m < 43200) return Math.round(m / 1440) + 'd ago';
  return fmtDay(String(s).slice(0, 10));
}

export default function view(root, ctx) {
  const { ui } = ctx;
  const { h, icon } = ui;
  const oops = () => ui.toast('Something went wrong. Try again.');
  const sub = ctx.params.sub;
  const wrap = h('div', { class: 'wrap col' });
  root.append(wrap);
  const back = h('button', { class: 'btn ghost', type: 'button', onclick: () => ctx.nav('#/more') }, 'Back to More');
  const fns = { habits, notes, coach, settings };
  if (fns[sub]) { wrap.append(back); fns[sub](wrap); } else menu(wrap);

  function menu(el) {
    const items = [
      ['habits', 'book', 'Habits', 'Track what you do each week'],
      ['notes', 'edit', 'Notes', 'Quick notes, linked to courses'],
      ['coach', 'sparkle', 'Coach', 'Ask for plans and ideas'],
      ['settings', 'more', 'Settings', 'Account, theme and planner'],
    ];
    el.append(h('div', { class: 'card list' }, items.map(([k, ic, t, d]) =>
      h('button', { class: 'item btn ghost', type: 'button', onclick: () => ctx.nav('#/more/' + k), style: { justifyContent: 'flex-start', textAlign: 'left' } },
        icon(ic), h('span', { class: 'col grow' }, h('b', null, t), h('span', { class: 'muted small' }, d)), icon('chevron')))));
    const u = ctx.S.user;
    el.append(h('div', { class: 'card row' },
      h('span', { class: 'grow small muted' }, 'Signed in as ' + (u ? u.email : '')),
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (e) { /* ignore */ }
        location.hash = '';
        location.reload();
      } }, 'Log out')));
  }

  // habits
  function monday(s) {
    const d = pd(s);
    return ctx.store.addDays(s, -((d.getDay() + 6) % 7));
  }

  function habits(el) {
    const td = ctx.store.today();
    const mon = monday(td);
    const logs = new Set(ctx.S.hlog.map(r => r.habit_id + '|' + r.day));
    el.append(h('h2', null, 'Habits'));
    let pw = 7;
    const name = h('input', { type: 'text', placeholder: 'New habit, like "Read 20 pages"', 'aria-label': 'Habit name', maxlength: 80 });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Days per week' });
    const drawSeg = () => seg.replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map(n =>
      h('button', { type: 'button', class: n === pw ? 'on' : '', 'aria-pressed': String(n === pw), onclick: () => { pw = n; drawSeg(); } }, String(n))));
    drawSeg();
    const save = async e => {
      e.preventDefault();
      const t = name.value.trim();
      if (!t) return;
      try { await ctx.add('habits', { name: t, per_week: pw }); } catch (x) { oops(); }
    };
    el.append(h('form', { class: 'card col', onsubmit: save },
      ui.field('Habit', name), h('div', { class: 'col' }, h('span', { class: 'small' }, 'Days per week'), seg),
      h('button', { class: 'btn primary', type: 'submit' }, 'Add habit')));
    const act = ctx.S.habits.filter(x => !x.archived);
    const arc = ctx.S.habits.filter(x => x.archived);
    if (!act.length) el.append(ui.empty('No habits yet. Add your first one above.'));
    act.forEach(x => el.append(card(x)));
    if (arc.length) el.append(h('details', { class: 'card' }, h('summary', null, 'Archived (' + arc.length + ')'),
      h('div', { class: 'list' }, arc.map(x => h('div', { class: 'item row' },
        h('span', { class: 'grow' }, x.name),
        h('button', { class: 'btn', type: 'button', onclick: () => ctx.upd('habits', x.id, { archived: 0 }).catch(oops) }, 'Restore'),
        h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Edit ' + x.name, onclick: () => editHabit(x) }, icon('edit')))))));

    function toggle(x, day) {
      const row = ctx.S.hlog.find(r => r.habit_id === x.id && r.day === day);
      return (row ? ctx.del('hlog', row.id) : ctx.add('hlog', { habit_id: x.id, day })).catch(oops);
    }

    function card(x) {
      let cnt = 0;
      for (let i = 0; i < 7; i++) if (logs.has(x.id + '|' + ctx.store.addDays(mon, i))) cnt++;
      const grid = h('div', { class: 'col', style: { gap: '4px' } });
      for (let w = 0; w < 8; w++) {
        const ws = ctx.store.addDays(mon, -7 * w);
        const g = h('div', { class: 'grid7' });
        for (let i = 0; i < 7; i++) {
          const day = ctx.store.addDays(ws, i);
          const on = logs.has(x.id + '|' + day);
          g.append(h('button', {
            type: 'button', disabled: day > td, 'aria-label': fmtDay(day) + (on ? ', done' : ', not done'), 'aria-pressed': String(on),
            style: { padding: 0, cursor: 'pointer', background: on ? 'var(--accent)' : 'var(--card)', color: on ? 'var(--accent-fg)' : 'var(--text)', border: 'var(--lw) solid var(--ink)', textDecoration: day === td ? 'underline' : 'none', opacity: day > td ? '.35' : '1' },
            onclick: () => toggle(x, day),
          }, String(pd(day).getDate()), on ? icon('check') : null));
        }
        grid.append(g);
      }
      return h('div', { class: 'card col habit' },
        h('div', { class: 'row' }, h('b', { class: 'grow' }, x.name),
          h('span', { class: 'badge' + (cnt >= x.per_week ? ' ok' : '') }, cnt + '/' + x.per_week + ' this week'),
          h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Edit ' + x.name, onclick: () => editHabit(x) }, icon('edit'))),
        h('span', { class: 'small muted' }, 'Mon to Sun, newest week first'), grid);
    }
  }

  function editHabit(x) {
    let pw = x.per_week;
    const name = h('input', { type: 'text', value: x.name, maxlength: 80 });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Days per week' });
    const drawSeg = () => seg.replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map(n =>
      h('button', { type: 'button', class: n === pw ? 'on' : '', 'aria-pressed': String(n === pw), onclick: () => { pw = n; drawSeg(); } }, String(n))));
    drawSeg();
    const s = ui.sheet('Edit habit', [
      ui.field('Name', name), h('div', { class: 'col' }, h('span', { class: 'small' }, 'Days per week'), seg),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const t = name.value.trim();
          if (!t) return;
          try { await ctx.upd('habits', x.id, { name: t, per_week: pw }); } catch (e) { return oops(); }
          s.close();
        } }, 'Save'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { try { await ctx.upd('habits', x.id, { archived: x.archived ? 0 : 1 }); } catch (e) { return oops(); } s.close(); } }, x.archived ? 'Restore' : 'Archive'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (!await ui.confirmBox('Delete "' + x.name + '" and its history?', { ok: 'Delete', danger: true })) return;
          try { await ctx.del('habits', x.id); } catch (e) { return oops(); }
          s.close();
        } }, 'Delete')),
    ]);
  }

  // notes
  function notes(el) {
    el.append(h('h2', null, 'Notes'));
    const ta = h('textarea', { rows: 3, placeholder: 'Write anything...', 'aria-label': 'Quick note' });
    const save = async () => {
      const b = ta.value.trim();
      if (!b) return;
      try { await ctx.add('notes', { title: first(b).slice(0, 80), body: b }); } catch (e) { return oops(); }
      ta.value = '';
    };
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
    el.append(h('div', { class: 'card col' }, ta, h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save note'), h('span', { class: 'small muted' }, 'Ctrl+Enter also saves'))));
    const list = h('div', { class: 'list' });
    const draw = () => {
      const k = q.trim().toLowerCase();
      const rows = ctx.S.notes.filter(n => !k || ((n.title || '') + ' ' + n.body).toLowerCase().includes(k))
        .sort((a, b) => (b.pinned - a.pinned) || String(b.updated).localeCompare(String(a.updated)) || b.id - a.id);
      if (!rows.length) {
        list.replaceChildren(ui.empty(k ? 'No notes match your search.' : 'No notes yet. Write your first one above.',
          k ? h('button', { class: 'btn', type: 'button', onclick: () => { q = ''; srch.value = ''; draw(); } }, 'Clear search') : h('button', { class: 'btn primary', type: 'button', onclick: () => ta.focus() }, 'Write a note')));
        return;
      }
      list.replaceChildren(...rows.map(n => {
        const c = ctx.S.courses.find(x => x.id === n.course_id);
        return h('div', { class: 'item row' },
          h('button', { class: 'btn ghost grow', type: 'button', onclick: () => edit(n), style: { justifyContent: 'flex-start', textAlign: 'left' } },
            h('span', { class: 'col' }, h('b', null, n.title || first(n.body) || 'Untitled'),
              h('span', { class: 'row small muted' }, n.pinned ? h('span', { class: 'badge warn' }, 'Pinned') : null, c ? h('span', { class: 'badge' }, c.name) : null, ago(n.updated)))),
          h('button', { class: 'btn icon ghost', type: 'button', 'aria-pressed': String(!!n.pinned), 'aria-label': n.pinned ? 'Unpin note' : 'Pin note', style: { color: n.pinned ? 'var(--accent)' : 'var(--muted)' },
            onclick: () => ctx.upd('notes', n.id, { pinned: n.pinned ? 0 : 1 }).catch(oops) }, icon('sparkle')));
      }));
    };
    const srch = h('input', { type: 'search', placeholder: 'Search notes', 'aria-label': 'Search notes', value: q, oninput: e => { q = e.target.value; draw(); } });
    el.append(srch, list);
    draw();
  }

  function edit(n) {
    const title = h('input', { type: 'text', value: n.title || '' });
    const body = h('textarea', { rows: 12, style: { minHeight: '40vh' } });
    body.value = n.body || '';
    const sel = h('select', null, h('option', { value: '' }, 'No course'),
      ctx.S.courses.filter(c => !c.archived || c.id === n.course_id).map(c => h('option', { value: c.id, selected: c.id === n.course_id }, c.name)));
    const s = ui.sheet('Edit note', [
      ui.field('Title', title), ui.field('Note', body), ui.field('Course', sel),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          try { await ctx.upd('notes', n.id, { title: title.value.trim(), body: body.value, course_id: sel.value ? Number(sel.value) : null, updated: new Date().toISOString().slice(0, 19).replace('T', ' ') }); } catch (e) { return oops(); }
          s.close();
        } }, 'Save'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          const copy = { title: n.title, body: n.body, course_id: n.course_id, pinned: n.pinned };
          try { await ctx.del('notes', n.id); } catch (e) { return oops(); }
          s.close();
          ui.toast('Note deleted', { action: 'Undo', onAction: () => ctx.add('notes', copy).catch(oops) });
        } }, 'Delete')),
    ]);
  }

  // coach
  function coach(el) {
    el.append(h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Coach'),
      msgs.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { msgs = []; ctx.refresh(); } }, 'Clear') : null));
    const log = h('div', { class: 'col', 'aria-live': 'polite' });
    const ta = h('textarea', { rows: 2, placeholder: 'Ask your coach...', 'aria-label': 'Message' });
    const send = h('button', { class: 'btn primary', type: 'button' }, 'Send');
    let wait = null;
    const draw = () => {
      log.replaceChildren();
      if (!msgs.length) {
        log.append(ui.empty('Ask for a plan or an idea. Suggestions only apply when you tap Apply.'),
          h('div', { class: 'row' }, ['Plan my week for exams', 'What should I study today?', 'Break down my hardest task'].map(t =>
            h('button', { class: 'chip', type: 'button', onclick: () => go(t) }, t))));
      }
      msgs.forEach(m => log.append(bubble(m)));
      if (wait) log.append(h('div', { class: 'card muted' }, 'Thinking...'));
    };
    const bubble = m => {
      const me = m.role === 'user';
      const box = h('div', { class: 'col', style: { alignItems: me ? 'flex-end' : 'flex-start' } },
        h('div', { class: me ? 'card' : 'card', style: { whiteSpace: 'pre-wrap', maxWidth: '90%', background: me ? 'var(--accent)' : 'var(--card)', color: me ? 'var(--accent-fg)' : 'var(--fg)' } }, m.content));
      (m.actions || []).forEach(a => box.append(action(a, m)));
      return box;
    };
    const action = (a, m) => {
      let label = '';
      if (a.type === 'add_task') label = 'Add task: ' + [a.title, a.due ? fmtDay(a.due) : null, a.est ? ui.fmtMins(a.est) : null].filter(Boolean).join(', ');
      else if (a.type === 'add_topic') {
        const c = ctx.S.courses.find(x => x.id === a.course_id);
        label = 'Add topic to ' + (c ? c.name : 'a course') + ': ' + a.title;
      } else label = 'Plan ' + fmtDay(a.day);
      if (a.gone) return null;
      const apply = h('button', { class: 'btn primary', type: 'button', disabled: !!a.done, onclick: async () => {
        if (a.type === 'plan_day') { ctx.nav('#/today?plan=1'); return; }
        const body = a.type === 'add_task'
          ? { title: a.title, due: a.due || null, est: a.est || null, course_id: a.course_id || null }
          : { course_id: a.course_id, title: a.title };
        try {
          await ctx.add(a.type === 'add_task' ? 'tasks' : 'topics', body);
          a.done = 1;
          draw();
        } catch (e) { ui.toast('Could not add that'); }
      } }, a.done ? 'Added' : a.type === 'plan_day' ? 'Open planner' : 'Apply');
      return h('div', { class: 'card row', style: { maxWidth: '90%' } }, h('span', { class: 'grow small', style: { flexBasis: '100%' } }, label), apply,
        a.done ? null : h('button', { class: 'btn ghost', type: 'button', onclick: () => { a.gone = 1; draw(); } }, 'Dismiss'));
    };
    const go = async t => {
      t = (t || '').trim();
      if (!t || wait) return;
      ta.value = '';
      msgs.push({ role: 'user', content: t });
      wait = 1;
      draw();
      try {
        const res = await api('/api/coach', { method: 'POST', body: { messages: msgs.slice(-20).map(m => ({ role: m.role, content: m.content })) } });
        msgs.push({ role: 'assistant', content: res.reply || '', actions: res.actions || [] });
      } catch (e) {
        msgs.push({ role: 'assistant', content: 'The coach is unavailable right now.' });
      }
      wait = null;
      draw();
    };
    send.onclick = () => go(ta.value);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(ta.value); } });
    el.append(log, h('div', { class: 'col' }, ta, send));
    draw();
  }

  // settings
  function settings(el) {
    const u = ctx.S.user || {};
    const pf = ctx.pref;
    el.append(h('h2', null, 'Settings'));
    el.append(h('div', { class: 'card col' }, h('h3', null, 'Account'),
      h('div', null, u.name || 'No name set'), h('div', { class: 'muted small' }, u.email || ''),
      h('div', null, h('button', { class: 'btn', type: 'button', onclick: pwSheet }, 'Change password'))));
    const th = pf('theme', 'system');
    el.append(h('div', { class: 'card col' }, h('h3', null, 'Appearance'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' }, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) =>
        h('button', { type: 'button', class: v === th ? 'on' : '', 'aria-pressed': String(v === th), onclick: () => ctx.setPrefs({ theme: v }) }, l)))));
    const sk = pf('skin', 'bubblegum');
    el.lastChild.append(h('div', { class: 'col' }, h('h3', null, 'Skin'),
      h('div', { class: 'skins', role: 'group', 'aria-label': 'Skin' }, [['bubblegum', 'Bubblegum'], ['matcha', 'Matcha'], ['peach', 'Peach Soda'], ['starlight', 'Starlight']].map(([v, l]) =>
        h('div', { class: 'skin-opt' }, h('button', { type: 'button', class: 'skin-swatch' + (v === sk ? ' on' : ''), 'data-skin': v, 'aria-pressed': String(v === sk), 'aria-label': l + ' skin', onclick: () => ctx.setPrefs({ skin: v }) }),
          h('span', { class: 'skin-cap', 'aria-hidden': 'true' }, l))))));
    const tm = (k, d, label) => h('input', { type: 'time', value: pf(k, d), 'aria-label': label, onchange: e => { if (e.target.value) ctx.setPrefs({ [k]: e.target.value }); } });
    const fm = Number(pf('focus_mins', 45)), bm = Number(pf('break_mins', 10));
    el.append(h('div', { class: 'card col' }, h('h3', null, 'Day planner'),
      h('div', { class: 'row' }, ui.field('Day starts', tm('day_start', '08:00', 'Day start')), ui.field('Day ends', tm('day_end', '22:00', 'Day end'))),
      h('span', { class: 'small' }, 'Focus length'),
      ui.chips([25, 45, 60, 90].map(v => ({ v, label: v + 'm' })), fm, v => ctx.setPrefs({ focus_mins: v })),
      h('span', { class: 'small' }, 'Break length'),
      ui.chips([5, 10, 15].map(v => ({ v, label: v + 'm' })), bm, v => ctx.setPrefs({ break_mins: v }))));
    el.append(h('div', { class: 'card col' }, h('h3', null, 'Data'),
      h('div', null, h('button', { class: 'btn', type: 'button', onclick: exp }, 'Export my data'))));
    el.append(h('div', { class: 'card col' }, h('h3', null, 'Danger zone'),
      h('div', null, h('button', { class: 'btn danger', type: 'button', onclick: delSheet }, 'Delete account'))));
    el.append(h('p', { class: 'muted small' }, 'Nudge v3'));
  }

  async function exp() {
    try {
      const res = await api('/api/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'nudge-export.json' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { ui.toast('Export failed. Try again.'); }
  }

  function pwSheet() {
    const o = h('input', { type: 'password', autocomplete: 'current-password' });
    const n = h('input', { type: 'password', autocomplete: 'new-password' });
    const c = h('input', { type: 'password', autocomplete: 'new-password' });
    const err = h('p', { class: 'small', style: { color: 'var(--danger)' }, role: 'alert' });
    const s = ui.sheet('Change password', h('form', { class: 'col', onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      if (n.value !== c.value) { err.textContent = 'The new passwords do not match.'; return; }
      try {
        await api('/api/auth/password', { method: 'POST', body: { old: o.value, new: n.value } });
        s.close();
        ui.toast('Password changed');
      } catch (x) {
        const m = { weak_password: 'Use 8 or more characters.', invalid: 'Current password is wrong.' };
        err.textContent = m[x.message] || 'Could not change the password.';
      }
    } }, ui.field('Current password', o), ui.field('New password (8+ characters)', n), ui.field('Confirm new password', c), err,
    h('button', { class: 'btn primary', type: 'submit' }, 'Change password')));
  }

  function delSheet() {
    const p = h('input', { type: 'password', autocomplete: 'current-password' });
    const t = h('input', { type: 'text', autocomplete: 'off' });
    const err = h('p', { class: 'small', style: { color: 'var(--danger)' }, role: 'alert' });
    ui.sheet('Delete account', h('form', { class: 'col', onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      if (t.value !== 'DELETE') { err.textContent = 'Type DELETE to confirm.'; return; }
      try {
        await api('/api/auth/delete', { method: 'POST', body: { password: p.value } });
        location.hash = '';
        location.reload();
      } catch (x) { err.textContent = 'Wrong password, or something went wrong.'; }
    } }, h('p', null, 'This permanently deletes your account and all your data. It cannot be undone.'),
    ui.field('Your password', p), ui.field('Type DELETE to confirm', t), err,
    h('button', { class: 'btn danger', type: 'submit' }, 'Delete everything')));
  }
}
