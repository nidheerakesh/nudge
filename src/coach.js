const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DAYRE = /^\d{4}-\d{2}-\d{2}$/;
const SYS = `You are Nudge, a friendly study coach for a student. Be concise and practical. Never claim to have changed anything, you can only suggest. When useful, append ONE fenced block like \`\`\`json {"actions":[...]} \`\`\` using only these action types: {"type":"add_task","title","due"?,"est"?,"course_id"?}, {"type":"add_topic","course_id","title"}, {"type":"plan_day","day"}. Dates are YYYY-MM-DD, est is minutes. Never invent course ids, use only ids from the context.`;

const plus = (day, n) => {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function context(data, today) {
  const L = [`Today: ${today}`];
  const cs = data.courses || [];
  L.push('Courses:');
  for (const c of cs) L.push(`- id ${c.id}: ${c.name}${c.code ? ' (' + c.code + ')' : ''}`);
  const end = plus(today, 30);
  const names = Object.fromEntries(cs.map((c) => [c.id, c.name]));
  L.push('Upcoming assessments (30 days):');
  const as = (data.assessments || []).filter((a) => a.date && a.date >= today && a.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  for (const a of as) L.push(`- ${a.date} ${a.kind} ${a.title} (${names[a.course_id] || 'course ' + a.course_id})`);
  L.push('Open tasks:');
  const ts = (data.tasks || []).filter((t) => !t.done_at).slice(0, 40);
  for (const t of ts) L.push(`- id ${t.id}: ${t.title}, due ${t.due || 'none'}, est ${t.est || 30}m, course ${t.course_id ?? 'none'}`);
  L.push('Focus minutes per day (last 14 days):');
  const mins = {};
  for (const s of data.sessions || []) {
    const d = (s.start_at || '').slice(0, 10);
    mins[d] = (mins[d] || 0) + (s.act_mins || 0);
  }
  for (let i = 13; i >= 0; i--) {
    const d = plus(today, -i);
    if (mins[d]) L.push(`- ${d}: ${mins[d]}`);
  }
  const mem = data.prefs && data.prefs.memory;
  if (mem) L.push('Memory: ' + String(mem).slice(0, 1000));
  return L.join('\n').slice(0, 6000);
}

const okTitle = (t) => typeof t === 'string' && t.length >= 1 && t.length <= 200;
const okDay = (d, today) => typeof d === 'string' && DAYRE.test(d) && d >= today;

export function validate(actions, data, today) {
  if (!Array.isArray(actions)) return [];
  const ids = new Set((data.courses || []).map((c) => c.id));
  const out = [];
  for (const a of actions) {
    if (out.length >= 8) break;
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'add_task') {
      if (!okTitle(a.title)) continue;
      const o = { type: 'add_task', title: a.title };
      if (a.due != null) {
        if (!okDay(a.due, today)) continue;
        o.due = a.due;
      }
      if (a.est != null) {
        if (!Number.isInteger(a.est) || a.est < 5 || a.est > 600) continue;
        o.est = a.est;
      }
      if (a.course_id != null) {
        if (!ids.has(a.course_id)) continue;
        o.course_id = a.course_id;
      }
      out.push(o);
    } else if (a.type === 'add_topic') {
      if (!ids.has(a.course_id) || !okTitle(a.title)) continue;
      out.push({ type: 'add_topic', course_id: a.course_id, title: a.title });
    } else if (a.type === 'plan_day') {
      if (okDay(a.day, today)) out.push({ type: 'plan_day', day: a.day });
    }
  }
  return out;
}

export async function ask(env, data, messages, today) {
  const sys = { role: 'system', content: SYS + '\n\n' + context(data, today) };
  const res = await env.AI.run(MODEL, { messages: [sys, ...messages], max_tokens: 700 });
  let text = String((res && (res.response ?? res.result?.response)) || '');
  let actions = [];
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  if (m) {
    text = text.replace(m[0], '');
    try {
      actions = validate(JSON.parse(m[1]).actions, data, today);
    } catch {}
  }
  return { reply: text.trim(), actions };
}
