import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { d1, v3 } from './d1shim.js'
import { HouseDO } from '../src/town/house.js'
import { ROOM_MAX } from '../public/town/shared/protocol.js'

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
  let alarm = null
  const ctx = {
    acceptWebSocket: w => socks.push(w),
    getWebSockets: () => socks.filter(w => w.closed === null),
    storage: {
      get: async k => store.get(k),
      put: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))) },
      setAlarm: async t => { alarm = t },
    },
  }
  const d = new HouseDO(ctx, { DB: db })
  let t = 5000000
  d.now = () => t
  const adv = ms => { t += ms }
  const join = async (uid, owner = false, hall = false, room = true) => {
    const ws = sock()
    await d.admit(ws, uid, 'u' + uid, owner, hall, room, false)
    return ws
  }
  const msg = (ws, o) => d.webSocketMessage(ws, JSON.stringify(o))
  const last = (ws, ty) => ws.out.filter(o => o.t === ty).pop()
  const live = (uid) => db.exec(`INSERT INTO session_active(session_id,user_id,started,last_ping,last_ok,ended) VALUES(${uid},${uid},0,${t},0,0)`)
  const ledger = async () => (await db.prepare("SELECT user_id,delta,reason,ref FROM coin_ledger").all()).results
  return { db, d, adv, join, msg, last, live, ledger, store, alarmAt: () => alarm, now: () => t }
}

test('room: round starts focus, everyone is told, second round is busy', async () => {
  const { join, msg, last, now, alarmAt } = await setup()
  const a = await join(1)
  const b = await join(2)
  await msg(a, { t: 'round', mins: 25 })
  const end = now() + 25 * 60000
  assert.deepEqual(last(a, 'round'), { t: 'round', phase: 'focus', end, mins: 25, by: 1 })
  assert.deepEqual(last(b, 'round'), { t: 'round', phase: 'focus', end, mins: 25, by: 1 })
  assert.equal(alarmAt(), end)
  await msg(b, { t: 'round', mins: 30 })
  assert.equal(last(b, 'err').code, 'busy')
})

test('room: round is ignored in a house', async () => {
  const { d, join, msg, last } = await setup()
  const h = sock()
  await d.admit(h, 1, 'u1', true, false, false, false)
  await msg(h, { t: 'round', mins: 25 })
  assert.equal(last(h, 'round'), undefined)
  assert.equal(last(h, 'err'), undefined)
})

test('room: chat is quiet during focus and open in break', async () => {
  const { join, msg, last, adv, alarmAt, now, d } = await setup()
  const a = await join(1)
  const b = await join(2)
  await msg(a, { t: 'round', mins: 25 })
  await msg(b, { t: 'chat', text: 'shh' })
  assert.equal(last(b, 'err').code, 'quiet')
  assert.equal(a.out.filter(o => o.t === 'chat').length, 0)
  adv(25 * 60000)
  assert.equal(alarmAt(), now())
  await d.alarm()
  adv(1000)
  await msg(b, { t: 'chat', text: 'done' })
  assert.equal(last(a, 'chat').text, 'done')
})

test('room: rewards live members after a 25 min focus, once each', async () => {
  const { join, msg, live, ledger, adv, d, now, last } = await setup()
  const a = await join(1)
  const b = await join(2)
  const c = await join(3)
  await msg(a, { t: 'round', mins: 25 })
  const end = now() + 25 * 60000
  adv(25 * 60000)
  live(1)
  live(2)
  await d.alarm()
  const rows = await ledger()
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(r => r.user_id).sort(), [1, 2])
  for (const r of rows) {
    assert.equal(r.delta, 10)
    assert.equal(r.reason, 'session')
    assert.equal(r.ref, 'room:' + end)
  }
  assert.equal(a.out.filter(o => o.t === 'round' && o.phase === 'bonus').length, 1)
  assert.equal(last(a, 'round').phase, 'break')
  assert.equal(last(b, 'round').phase, 'break')
  assert.equal(c.out.filter(o => o.t === 'round' && o.phase === 'bonus').length, 0)
})

test('room: no bonus with one member, or with a 10 min round', async () => {
  const { join, msg, live, ledger, adv, d } = await setup()
  const a = await join(1)
  await msg(a, { t: 'round', mins: 25 })
  adv(25 * 60000)
  live(1)
  await d.alarm()
  assert.equal((await ledger()).length, 0)
  adv(300000)
  await d.alarm()
  const b = await join(2)
  const c = await join(3)
  await msg(b, { t: 'round', mins: 10 })
  adv(10 * 60000)
  live(2)
  live(3)
  await d.alarm()
  assert.equal((await ledger()).length, 0)
  assert.equal(c.closed, null)
})

test('room: alarm in break returns to idle', async () => {
  const { join, msg, adv, d, last, now } = await setup()
  const a = await join(1)
  await msg(a, { t: 'round', mins: 10 })
  adv(10 * 60000)
  await d.alarm()
  adv(300000)
  await d.alarm()
  assert.deepEqual(last(a, 'round'), { t: 'round', phase: 'idle', end: 0, mins: 0, by: 0 })
  await msg(a, { t: 'round', mins: 10 })
  assert.equal(last(a, 'err'), undefined)
})

test('room: /count returns n, phase and end', async () => {
  const { join, msg, d, now } = await setup()
  const a = await join(1)
  await join(2)
  let r = await d.fetch(new Request('https://do/count'))
  assert.deepEqual(await r.json(), { n: 2, phase: 'idle', end: 0 })
  await msg(a, { t: 'round', mins: 20 })
  r = await d.fetch(new Request('https://do/count'))
  assert.deepEqual(await r.json(), { n: 2, phase: 'focus', end: now() + 20 * 60000 })
})

test('room: a ninth member is refused full', async () => {
  const { join, last } = await setup()
  for (let i = 1; i <= ROOM_MAX; i++) await join(i)
  const x = await join(20)
  assert.equal(last(x, 'err').code, 'full')
  assert.notEqual(x.closed, null)
})

test('room: members see place hall and no owner', async () => {
  const { join, last } = await setup()
  const a = await join(1)
  await join(2)
  const i = last(a, 'inside')
  assert.equal(i.house, 0)
  assert.equal(i.members.length, 2)
  assert.equal(i.members[0].place, 'hall')
})
