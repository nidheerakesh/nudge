import test from 'node:test';
import assert from 'node:assert/strict';

const toasts = [];
const mk = () => ({ style: {}, children: [], className: '', setAttribute() {}, addEventListener() {}, append(...a) { this.children.push(...a); }, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
globalThis.window = { dispatchEvent() {} };
globalThis.document = { getElementById: () => null, createElement: () => mk(), createTextNode: t => ({ t }), body: Object.assign(mk(), { append(...a) { for (const n of a) if (n.className === 'toast') toasts.push(n); } }) };
globalThis.Node = class {};

const store = await import('../public/js/store.js');

let calls, srv;
function stub(fn) {
  globalThis.fetch = async (path, o) => {
    const body = o.body ? JSON.parse(o.body) : null;
    calls.push({ path, method: o.method, body });
    const r = fn(path, o.method, body);
    return { ok: r.status < 400, status: r.status, json: async () => r.json };
  };
}
const T = (id, o = {}) => ({ task_id: null, block_id: null, title: '', mins: 25, session_id: id, started: Date.now(), paused_at: null, paused_ms: 0, pauses: 0, ...o });

test('start sends prev null, pause sends prev session id', async () => {
  calls = []; store.reset();
  stub((p, m) => p === '/api/sessions' ? { status: 200, json: { rows: [{ id: 7 }] } } : { status: 200, json: { ok: true } });
  await store.startTimer({ mins: 25 });
  assert.equal(calls.find(c => c.path === '/api/timer').body.prev, null);
  await store.pauseTimer();
  const put = calls.filter(c => c.path === '/api/timer').pop();
  assert.equal(put.body.prev, 7);
  assert.equal(put.body.data.session_id, 7);
});

test('409 with data adopts the server timer', async () => {
  calls = []; store.reset();
  stub((p, m) => p === '/api/sessions' ? { status: 200, json: { rows: [{ id: 8 }] } } : p === '/api/timer' ? { status: 409, json: { error: 'busy', data: T(99) } } : { status: 200, json: { row: { id: 8 } } });
  await store.startTimer({ mins: 25 });
  assert.equal(store.timer().session_id, 99);
});

test('finish keeps timer when clear fails, drops it on success', async () => {
  store.reset();
  stub((p, m) => p === '/api/sessions' ? { status: 200, json: { rows: [{ id: 5 }] } } : { status: 200, json: { ok: true } });
  await store.startTimer({ mins: 25 });
  stub((p, m) => m === 'PUT' ? { status: 500, json: { error: 'x' } } : { status: 200, json: { row: { id: 5 } } });
  assert.equal(await store.finishTimer('stopped'), null);
  assert.equal(store.timer().session_id, 5);
  stub(() => ({ status: 200, json: { row: { id: 5 } } }));
  await store.finishTimer('stopped');
  assert.equal(store.timer(), null);
});

test('finish on closed session drops local timer', async () => {
  store.reset();
  stub((p, m) => p === '/api/sessions' ? { status: 200, json: { rows: [{ id: 6 }] } } : { status: 200, json: { ok: true } });
  await store.startTimer({ mins: 25 });
  stub((p, m) => m === 'PATCH' ? { status: 409, json: { error: 'closed' } } : { status: 200, json: { ok: true } });
  await store.finishTimer('done');
  assert.equal(store.timer(), null);
});

test('refreshAll is a no-op when not authed', async () => {
  calls = []; store.setAuthed(false);
  stub(() => ({ status: 401, json: { error: 'x' } }));
  await store.refreshAll();
  assert.equal(calls.length, 0);
});
