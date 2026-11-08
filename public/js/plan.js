const MIN_GAP = 5;
const MIN_TAIL = 10;

export function toMin(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function toHM(n) {
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}

export function endOf(b) {
  return toMin(b.start) + b.mins;
}

export function freeGaps(startMin, endMin, busy) {
  const out = [];
  let cur = startMin;
  for (const b of busy.slice().sort((a, b) => a.s - b.s)) {
    if (cur >= endMin) break;
    if (b.s > cur) out.push({ s: cur, e: Math.min(b.s, endMin) });
    cur = Math.max(cur, b.e);
  }
  if (cur < endMin) out.push({ s: cur, e: endMin });
  return out.filter(g => g.e - g.s >= MIN_GAP);
}

function num(v, def) {
  return v === undefined || v === null || v === '' ? def : Number(v);
}

function roundUp5(m) {
  return Math.ceil(m / 5) * 5;
}

function chunksOf(rem, focus) {
  const out = [];
  let left = rem;
  while (left > focus) {
    out.push(focus);
    left -= focus;
  }
  out.push(left);
  if (out.length > 1 && left < MIN_TAIL) {
    out.pop();
    out[out.length - 1] += left;
  }
  return out;
}

function remaining(t, day, blocks) {
  const spent = blocks
    .filter(b => b.kind === 'task' && b.task_id === t.id && b.day >= day)
    .reduce((a, b) => a + b.mins, 0);
  return (t.est || 30) - spent;
}

function byOrder(a, b) {
  const da = a.due || '';
  const db = b.due || '';
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
  }
  return (a.priority || 2) - (b.priority || 2) || a.id - b.id;
}

function placeChunk(st, t, mins) {
  const gap = freeGaps(st.from, st.dayEnd, st.busy).find(g => g.e - g.s >= mins);
  if (!gap) return false;
  const s = gap.s;
  const e = s + mins;
  st.busy.push({ s, e });
  st.out.push({ day: st.day, start: toHM(s), mins, kind: 'task', task_id: t.id, title: t.title });
  if (gap.e - e >= st.brk + 5) {
    st.busy.push({ s: e, e: e + st.brk });
    st.out.push({ day: st.day, start: toHM(e), mins: st.brk, kind: 'break', task_id: null, title: 'Break' });
  }
  return true;
}

function placeTask(st, t, rem) {
  const chunks = chunksOf(rem, st.focus);
  let i = 0;
  while (i < chunks.length && placeChunk(st, t, chunks[i])) i++;
  for (; i < chunks.length; i++) {
    st.unplaced.push({ task_id: t.id, title: t.title, mins: chunks[i] });
  }
}

function keepBreaks(out) {
  const starts = out.filter(b => b.kind === 'task').map(b => toMin(b.start));
  return out.filter(b => b.kind !== 'break' || starts.includes(endOf(b)));
}

export function suggest({ day, tasks, blocks, prefs = {}, now }) {
  if (now && day < now.day) return { blocks: [], unplaced: [] };
  const dayStart = toMin(prefs.day_start || '08:00');
  const st = {
    day,
    from: dayStart,
    dayEnd: toMin(prefs.day_end || '22:00'),
    focus: Math.max(1, num(prefs.focus_mins, 45)),
    brk: num(prefs.break_mins, 10),
    busy: blocks
      .filter(b => b.day === day)
      .map(b => ({ s: toMin(b.start), e: toMin(b.start) + b.mins })),
    out: [],
    unplaced: []
  };
  if (now && now.day === day) st.from = Math.max(dayStart, roundUp5(toMin(now.hm)));
  for (const t of tasks.filter(x => !x.done_at).sort(byOrder)) {
    const rem = remaining(t, day, blocks);
    if (rem > 0) placeTask(st, t, rem);
  }
  const out = keepBreaks(st.out).sort((a, b) => toMin(a.start) - toMin(b.start));
  return { blocks: out, unplaced: st.unplaced };
}
