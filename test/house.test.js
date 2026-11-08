import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { d1, v3 } from './d1shim.js'
import { HouseDO } from '../src/town/house.js'
import { MAX_HOUSE } from '../public/town/shared/protocol.js'

function sock() {
  const ws = { out: [], closed: null, att: null }
  ws.send = s => ws.out.push(JSON.parse(s))
  ws.close = c => { ws.closed = c }
  ws.serializeAttachment = a => { ws.att = JSON.parse(JSON.stringify(a)) }
  ws.deserializeAttachment = () => ws.att
  return ws
}

async function setup() {
  const db = d1()
  v3(db)
  db.exec(readFileSync(new URL('../migrations/v3/0002_town.sql', import.meta.url), 'utf8'))
  for (let i = 1; i <= 40; i++) db.exec(`INSERT INTO avatar(user_id,name) VALUES(${i},'u${i}')`)
  const store = new Map()
  const socks = []
  const ctx = {
    acceptWebSocket: w => socks.push(w),
    getWebSockets: () => socks.filter(w => w.closed === null),
    storage: { get: async k => store.get(k), put: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))) } },
  }
  const d = new HouseDO(ctx, { DB: db })
  let t = 5000000
  d.now = () => t
  const adv = ms => { t += ms }
  const join = async (uid, owner = false, hall = false) => {
    const ws = sock()
    await d.admit(ws, uid, 'u' + uid, owner, hall)
    return ws
  }
  const msg = (ws, o) => d.webSocketMessage(ws, JSON.stringify(o))
  const last = (ws, ty) => ws.out.filter(o => o.t === ty).pop()
  return { db, d, adv, join, msg, last, store }
}

test('inside is sent on join and on every change', async () => {
  const { join, msg, last, d } = await setup()
  const a = await join(1, true)
  assert.equal(last(a, 'inside').members.length, 1)
  assert.equal(last(a, 'inside').house, 1)
  const b = await join(2)
  assert.equal(last(a, 'inside').members.length, 2)
  assert.equal(last(b, 'inside').members.length, 2)
  await msg(b, { t: 'timer', st: 'focus', left: 300 })
  const m = last(a, 'inside').members.find(x => x.id === 2)
  assert.equal(m.st, 'focus')
  assert.equal(m.left, 300)
  b.closed = 1000
  await d.webSocketClose(b)
  assert.equal(last(a, 'inside').members.length, 1)
})

test('house capacity', async () => {
  const { join, last } = await setup()
  for (let i = 1; i <= MAX_HOUSE; i++) await join(i)
  const x = await join(20)
  assert.equal(last(x, 'err').code, 'full')
  assert.notEqual(x.closed, null)
})

test('chat: strips controls, broadcasts, rate limits to 1 per second', async () => {
  const { join, msg, adv, last } = await setup()
  const a = await join(1, true)
  const b = await join(2)
  await msg(b, { t: 'chat', text: 'hi\u0007 there\n' })
  assert.equal(last(a, 'chat').text, 'hi there')
  assert.equal(last(a, 'chat').name, 'u2')
  await msg(b, { t: 'chat', text: 'second' })
  assert.equal(a.out.filter(o => o.t === 'chat').length, 1)
  adv(1000)
  await msg(b, { t: 'chat', text: 'third' })
  assert.equal(a.out.filter(o => o.t === 'chat').length, 2)
  await msg(a, { t: 'chat', text: 'x'.repeat(201) })
  assert.equal(a.out.filter(o => o.t === 'chat').length, 2)
})

test('chat history keeps 50 and replays on join', async () => {
  const { join, msg, adv, store } = await setup()
  const a = await join(1, true)
  for (let i = 0; i < 55; i++) {
    adv(1000)
    await msg(a, { t: 'chat', text: 'm' + i })
  }
  assert.equal(store.get('hist').length, 50)
  const b = await join(2)
  const h = b.out.filter(o => o.t === 'chat')
  assert.equal(h.length, 50)
  assert.equal(h[0].text, 'm5')
  assert.equal(h[49].text, 'm54')
})

test('only the owner can mute; muted chat is dropped silently', async () => {
  const { join, msg, adv, last } = await setup()
  const a = await join(1, true)
  const b = await join(2)
  const c = await join(3)
  await msg(b, { t: 'mute', user: 3 })
  adv(1000)
  await msg(c, { t: 'chat', text: 'still here' })
  assert.equal(last(a, 'chat').text, 'still here')
  await msg(a, { t: 'mute', user: 3 })
  adv(1000)
  await msg(c, { t: 'chat', text: 'muted now' })
  assert.equal(last(a, 'chat').text, 'still here')
  assert.equal(last(c, 'chat').text, 'still here')
  await msg(b, { t: 'chat', text: 'ok' })
  assert.equal(last(a, 'chat').text, 'ok')
})

test('only the owner can kick; kick removes house_access', async () => {
  const { join, msg, db, last } = await setup()
  db.exec('INSERT INTO house_access(house_user,guest,expires) VALUES(1,2,99999999999)')
  const a = await join(1, true)
  const b = await join(2)
  const c = await join(3)
  await msg(c, { t: 'kick', user: 2 })
  assert.equal(b.closed, null)
  assert.equal((await db.prepare('SELECT * FROM house_access').all()).results.length, 1)
  await msg(a, { t: 'kick', user: 2 })
  assert.equal(b.closed, 4003)
  assert.equal((await db.prepare('SELECT * FROM house_access').all()).results.length, 0)
  assert.equal(last(a, 'inside').members.length, 2)
  await msg(c, { t: 'kick', user: 1 })
  assert.equal(a.closed, null)
})

test('flooding closes the socket after 3 violations', async () => {
  const { join, msg } = await setup()
  const a = await join(1, true)
  for (let i = 0; i < 40; i++) await msg(a, { t: 'emote', k: 'wave' })
  assert.equal(a.closed, 4008)
})

test('malformed frames are ignored', async () => {
  const { join, d } = await setup()
  const a = await join(1, true)
  await d.webSocketMessage(a, 'garbage')
  await d.webSocketMessage(a, JSON.stringify({ t: 'chat', text: 5 }))
  assert.equal(a.closed, null)
})

test('hall: capacity 24, no chat, emotes ok, no kick or mute', async () => {
  const { join, msg, last } = await setup()
  const ws = []
  for (let i = 1; i <= 24; i++) ws.push(await join(i, true, true))
  const x = await join(30, false, true)
  assert.equal(last(x, 'err').code, 'full')
  await msg(ws[0], { t: 'chat', text: 'hello' })
  assert.equal(ws[1].out.filter(o => o.t === 'chat').length, 0)
  await msg(ws[0], { t: 'emote', k: 'zzz' })
  assert.equal(last(ws[1], 'emote').k, 'zzz')
  await msg(ws[0], { t: 'kick', user: 2 })
  assert.equal(ws[1].closed, null)
  await msg(ws[0], { t: 'mute', user: 2 })
})

test('hall: blocked pair cannot be together, the later one is refused', async () => {
  const { join, db, last } = await setup()
  db.exec('INSERT INTO user_blocks(blocker,blocked) VALUES(1,2)')
  const a = await join(1, false, true)
  const b = await join(2, false, true)
  assert.equal(last(b, 'err').code, 'blocked')
  assert.notEqual(b.closed, null)
  assert.equal(a.closed, null)
  const c = await join(3, false, true)
  assert.equal(last(c, 'inside').members.length, 2)
})

test('payloads carry only ids, names, looks and timer state', async () => {
  const { join, msg } = await setup()
  const a = await join(1, true)
  await msg(a, { t: 'timer', st: 'focus', left: 10, title: 'Secret' })
  assert.ok(!JSON.stringify(a.out).includes('Secret'))
})
