import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../public/town/shared/protocol.js';

const ok = {
  hello: { t: 'hello' },
  pos: { t: 'pos', x: 10.5, y: 20, dir: 'l', a: 'walk' },
  emote: { t: 'emote', k: 'wave' },
  knock: { t: 'knock', house: 7 },
  reply: { t: 'reply', id: 3, allow: true },
  enter: { t: 'enter', house: 7 },
  shop: { t: 'shop', kind: 'bakery' },
  leave: { t: 'leave' },
  chat: { t: 'chat', text: '  hi there  ' },
  timer: { t: 'timer', st: 'focus', left: 1200 },
  mute: { t: 'mute', user: 4 },
  kick: { t: 'kick', user: 4 },
};

test('accepts a valid message of each type', () => {
  for (const [k, m] of Object.entries(ok)) {
    const r = P.validateClient(m);
    assert.ok(r, k);
    assert.equal(r.t, k);
  }
  assert.equal(P.validateClient(ok.chat).text, 'hi there');
  assert.deepEqual(P.validateClient({ t: 'shop', kind: null }), { t: 'shop', kind: null });
  assert.deepEqual(P.validateClient({ t: 'timer', st: 'break', left: 5.7, m: 12, paused: true }), { t: 'timer', st: 'break', left: 5, m: 12, paused: true });
});

test('rejects malformed input and never throws', () => {
  const bad = [
    null, undefined, 0, 1, 'x', true, [], [ok.pos], () => 1, {}, { t: 5 }, { t: 'nope' }, { t: '__proto__' },
    { ...ok.pos, x: NaN }, { ...ok.pos, y: Infinity }, { ...ok.pos, x: 1e12 }, { ...ok.pos, x: -1 }, { ...ok.pos, y: 61 },
    { ...ok.pos, x: '5' }, { ...ok.pos, dir: 'up' }, { ...ok.pos, dir: undefined }, { ...ok.pos, a: 5 }, { ...ok.pos, a: 'x'.repeat(40) },
    { ...ok.emote, k: 'dance' }, { t: 'emote' },
    { ...ok.knock, house: 0 }, { ...ok.knock, house: -2 }, { ...ok.knock, house: 1.5 }, { ...ok.knock, house: '7' }, { ...ok.knock, house: NaN },
    { ...ok.reply, allow: 'yes' }, { ...ok.reply, id: 0 },
    { ...ok.enter, house: null },
    { ...ok.shop, kind: 'casino' }, { ...ok.shop, kind: 5 },
    { t: 'chat', text: 'x'.repeat(201) }, { t: 'chat', text: '' }, { t: 'chat', text: '   ' }, { t: 'chat', text: '\u0000\u0007' }, { t: 'chat', text: 5 }, { t: 'chat' },
    { ...ok.timer, st: 'sleep' }, { ...ok.timer, left: -1 }, { ...ok.timer, left: NaN }, { ...ok.timer, left: 1e9 }, { ...ok.timer, m: 'a' }, { ...ok.timer, paused: 1 },
    { ...ok.mute, user: 0 }, { ...ok.kick, user: 'a' },
  ];
  for (const b of bad) assert.equal(P.validateClient(b), null, JSON.stringify(b));
  const evil = { get t() { throw new Error('boom'); } };
  assert.equal(P.validateClient(evil), null);
  assert.equal(P.validateClient(new Proxy({}, { get() { throw new Error('x'); } })), null);
});

test('chat strips control characters and keeps length at most 200', () => {
  assert.equal(P.validateClient({ t: 'chat', text: 'a\u0000b\nc\u007fd' }).text, 'abcd');
  assert.equal(P.validateClient({ t: 'chat', text: 'x'.repeat(200) }).text.length, 200);
});

test('output has only known fields', () => {
  const r = P.validateClient({ ...ok.pos, evil: 1, id: 99 });
  assert.deepEqual(Object.keys(r).sort(), ['a', 'dir', 't', 'x', 'y']);
});

test('constants', () => {
  assert.equal(P.TICK_MS, 125);
  assert.equal(P.MAX_SPEED, 6);
  assert.equal(P.MAX_DISTRICT, 40);
  assert.equal(P.MAX_HOUSE, 12);
  assert.equal(P.CHAT_MAX, 200);
});

test('speedOk', () => {
  assert.equal(P.speedOk({ x: 10, y: 10 }, { x: 10.5, y: 10 }, 125), true);
  assert.equal(P.speedOk({ x: 10, y: 10 }, { x: 11, y: 10 }, 125), true);
  assert.equal(P.speedOk({ x: 10, y: 10 }, { x: 40, y: 10 }, 125), false);
  assert.equal(P.speedOk({ x: 10, y: 10 }, { x: 40, y: 10 }, 60000), false);
  assert.equal(P.speedOk({ x: 10, y: 10 }, { x: 15, y: 10 }, 1000), true);
  assert.equal(P.speedOk({ x: 10, y: 10 }, { x: NaN, y: 10 }, 1000), false);
  assert.equal(P.speedOk(null, { x: 1, y: 1 }, 100), false);
});

test('clampToDistrict', () => {
  const a = P.clampToDistrict(-5, 100);
  assert.ok(a.x === 0 && a.y < 44 && a.y > 43);
  assert.deepEqual(P.clampToDistrict(10, 20), { x: 10, y: 20 });
  assert.deepEqual(P.clampToDistrict(NaN, 3), { x: 0, y: 3 });
  assert.ok(P.clampToDistrict(99, 0).x < 56);
});

test('makeServer builds every type', () => {
  const pl = { id: 1, name: 'A', look: { skin: 1, hair: 2, hair_color: 3, outfit: 'outfit:casual', accessory: null }, x: 1.234, y: 2, dir: 'd', a: 'idle', st: 'focus', left: 30, act: 'active', vp: 80, m: 5, fed: true, course: 'CS1', place: 'hall' };
  const s = P.makeServer('snap', { you: 1, district: 0, players: [pl] });
  assert.equal(s.t, 'snap');
  assert.equal(s.players[0].x, 1.23);
  assert.equal(s.players[0].course, 'CS1');
  assert.equal('course' in P.makeServer('join', { p: { ...pl, course: undefined } }).p, false);
  assert.deepEqual(P.makeServer('part', { id: 2 }), { t: 'part', id: 2 });
  assert.equal(P.makeServer('pos', { list: [{ id: 1, x: 1, y: 2, dir: 'l', a: 'walk' }] }).list.length, 1);
  assert.deepEqual(P.makeServer('emote', { id: 1, k: 'ok' }), { t: 'emote', id: 1, k: 'ok' });
  assert.equal(P.makeServer('knock', { id: 4, from: pl }).from.name, 'A');
  assert.deepEqual(P.makeServer('result', { house: 2, ok: false, why: 'closed' }), { t: 'result', house: 2, ok: false, why: 'closed' });
  assert.deepEqual(P.makeServer('result', { house: 2, ok: true }), { t: 'result', house: 2, ok: true });
  assert.equal(P.makeServer('inside', { house: 2, members: [pl] }).members.length, 1);
  assert.equal(P.makeServer('chat', { id: 1, name: 'A', text: 'hi', ts: 5 }).text, 'hi');
  assert.deepEqual(P.makeServer('err', { code: 'rate' }), { t: 'err', code: 'rate' });
  assert.equal(P.makeServer('bogus', {}), null);
  for (const t of P.SERVER_TYPES) assert.ok(P.makeServer(t, {}), t);
});

test('round accepts whole minutes 10 to 90 only', () => {
  for (const mins of [10, 25, 90]) assert.deepEqual(P.validateClient({ t: 'round', mins }), { t: 'round', mins });
  for (const mins of [9, 91, 25.5, '25', undefined]) assert.equal(P.validateClient({ t: 'round', mins }), null, String(mins));
  assert.equal(P.ROOM_MAX, 8);
  assert.equal(P.ROUND_BREAK_MS, 300000);
  assert.equal(P.ROOM_BONUS, 10);
  assert.equal(P.ROOM_BONUS_MIN, 25);
  assert.ok(P.CLIENT_TYPES.includes('round'));
  assert.ok(P.SERVER_TYPES.includes('round'));
});
