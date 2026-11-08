import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoff, makeQueue, makeInterp, connect } from '../public/town/net.js';

class FakeWS {
  static all = [];
  constructor(url) { this.url = url; this.sent = []; this.closed = false; FakeWS.all.push(this); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.closed = true; if (this.onclose) this.onclose(); }
  up() { if (this.onopen) this.onopen(); }
  down() { if (this.onclose) this.onclose(); }
  recv(o) { this.onmessage({ data: typeof o === 'string' ? o : JSON.stringify(o) }); }
}

function harness(handlers = {}) {
  FakeWS.all = [];
  const timers = [];
  const c = connect('ws://x', handlers, {
    WebSocket: FakeWS,
    setTimeout: (f, d) => { timers.push({ f, d }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; },
  });
  return { c, timers, ws: () => FakeWS.all[FakeWS.all.length - 1] };
}

test('backoff doubles from 0.5s and caps at 15s', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 50].map(backoff), [500, 1000, 2000, 4000, 8000, 15000, 15000, 15000]);
});

test('queue keeps only the newest pos', () => {
  const q = makeQueue();
  q.push({ t: 'pos', x: 1 });
  q.push({ t: 'chat', text: 'a' });
  q.push({ t: 'pos', x: 2 });
  const out = q.take();
  assert.deepEqual(out.map(m => m.t), ['chat', 'pos']);
  assert.equal(out[1].x, 2);
  assert.equal(q.size(), 0);
});

test('interpolation runs one tick behind', () => {
  const ip = makeInterp(125);
  assert.equal(ip.get(1, 0), null);
  ip.push(1, 0, 0, 1000);
  ip.push(1, 4, 8, 1125);
  assert.deepEqual(ip.get(1, 1125 + 62.5), { x: 2, y: 4 });
  assert.deepEqual(ip.get(1, 1125), { x: 0, y: 0 });
  assert.deepEqual(ip.get(1, 2000), { x: 4, y: 8 });
  assert.deepEqual(ip.get(1, 900), { x: 0, y: 0 });
  ip.push(1, 6, 8, 1250);
  assert.deepEqual(ip.get(1, 1250 + 62.5), { x: 5, y: 8 });
  ip.remove(1);
  assert.equal(ip.get(1, 1300), null);
});

test('hello on open and only validated frames are sent', () => {
  const { c, ws } = harness();
  ws().up();
  assert.deepEqual(ws().sent, [{ t: 'hello' }]);
  assert.equal(c.send({ t: 'pos', x: 3, y: 4, dir: 'd', a: 'walk', extra: 'zz' }), true);
  assert.deepEqual(ws().sent[1], { t: 'pos', x: 3, y: 4, dir: 'd', a: 'walk' });
  assert.equal(c.send({ t: 'pos', x: 'a', y: 4, dir: 'd', a: 'walk' }), false);
  assert.equal(c.send({ t: 'nope' }), false);
  assert.equal(c.send(null), false);
  assert.equal(c.send({ t: 'chat', text: '   ' }), false);
  assert.equal(ws().sent.length, 2);
});

test('reconnects with backoff, resets on success, flushes queue', () => {
  const seen = [];
  const { c, timers, ws } = harness({ retry: d => seen.push(d) });
  ws().down();
  assert.equal(timers[0].d, 500);
  timers[0].f();
  assert.equal(FakeWS.all.length, 2);
  ws().down();
  assert.equal(timers[1].d, 1000);
  timers[1].f();
  c.send({ t: 'pos', x: 1, y: 1, dir: 'd', a: 'walk' });
  c.send({ t: 'emote', k: 'wave' });
  c.send({ t: 'pos', x: 2, y: 2, dir: 'u', a: 'walk' });
  assert.equal(c.queued, 2);
  ws().up();
  assert.deepEqual(ws().sent.map(m => m.t), ['hello', 'emote', 'pos']);
  assert.equal(ws().sent[2].x, 2);
  ws().down();
  assert.equal(timers[2].d, 500);
  assert.deepEqual(seen, [500, 1000, 500]);
});

test('close stops reconnecting and refuses sends; bad server frames ignored', () => {
  const got = [];
  const { c, timers, ws } = harness({ message: m => got.push(m) });
  const w = ws();
  w.up();
  w.recv('not json');
  w.recv({ t: 'bogus' });
  w.recv({ t: 'part', id: 3 });
  assert.deepEqual(got, [{ t: 'part', id: 3 }]);
  c.close();
  assert.equal(w.closed, true);
  assert.equal(timers.length, 0);
  assert.equal(c.send({ t: 'hello' }), false);
});
