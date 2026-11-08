import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { d1, v3 } from './d1shim.js'
import { DistrictDO } from '../src/town/district.js'
import { TICK_MS, MAX_DISTRICT } from '../public/town/shared/protocol.js'

function mkdb() {
  const db = d1()
  v3(db)
  db.exec(readFileSync(new URL('../migrations/v3/0002_town.sql', import.meta.url), 'utf8'))
  return db
}

function sock() {
  const ws = { out: [], closed: null, att: null }
  ws.send = s => ws.out.push(JSON.parse(s))
  ws.close = (c, r) => { ws.closed = c }
  ws.serializeAttachment = a => { ws.att = JSON.parse(JSON.stringify(a)) }
  ws.deserializeAttachment = () => ws.att
  return ws
}

function mkctx() {
  const socks = []
  let alarm = null
  return {
    socks,
    acceptWebSocket: w => socks.push(w),
    getWebSockets: () => socks.filter(w => w.closed === null),
    storage: { getAlarm: async () => alarm, setAlarm: async t => { alarm = t }, get alarm() { return alarm } },
  }
}

async function setup() {
  const db = mkdb()
  for (let i = 1; i <= 50; i++) {
    db.exec(`INSERT INTO avatar(user_id,name) VALUES(${i},'u${i}')`)
  }
  const ctx = mkctx()
  const d = new DistrictDO(ctx, { DB: db })
  let t = 1000000
  d.now = () => t
  const adv = ms => { t += ms }
  const join = async (uid, hello = true) => {
    const ws = sock()
    await d.admit(ws, uid, 'u' + uid)
    if (hello) await d.webSocketMessage(ws, JSON.stringify({ t: 'hello' }))
    return ws
  }
  const msg = (ws, o) => d.webSocketMessage(ws, typeof o === 'string' ? o : JSON.stringify(o))
  const last = (ws, ty) => ws.out.filter(o => o.t === ty).pop()
  return { db, ctx, d, adv, join, msg, last }
}

test('hello sends snap and broadcasts join; close broadcasts part', async () => {
  const { join, last, d } = await setup()
  const a = await join(1)
  const snap = last(a, 'snap')
  assert.equal(snap.you, 1)
  assert.equal(snap.players.length, 1)
  const b = await join(2)
  assert.equal(last(a, 'join').p.id, 2)
  assert.equal(last(b, 'snap').players.length, 2)
  b.closed = 1000
  await d.webSocketClose(b)
  assert.equal(last(a, 'part').id, 2)
})

test('full district refuses with err full', async () => {
  const { join, last } = await setup()
  for (let i = 1; i <= MAX_DISTRICT; i++) await join(i)
  const x = await join(41, false)
  assert.equal(last(x, 'err').code, 'full')
  assert.notEqual(x.closed, null)
})

test('user without avatar is refused', async () => {
  const { d, last } = await setup()
  const ws = sock()
  await d.admit(ws, 999, 'x')
  assert.equal(last(ws, 'err').code, 'nojoin')
})

test('malformed frames are ignored', async () => {
  const { join, msg } = await setup()
  const a = await join(1)
  await msg(a, 'not json')
  await msg(a, { t: 'pos', x: 'a' })
  await msg(a, { t: 'nope' })
  await msg(a, '[1]')
  assert.equal(a.closed, null)
})

test('speed violation rejects pos and closes after 3', async () => {
  const { join, msg, d, adv } = await setup()
  const a = await join(1)
  adv(100)
  await msg(a, { t: 'pos', x: 50, y: 40, dir: 'd', a: 'walk' })
  assert.equal(d.st(a).p.x, 28)
  await msg(a, { t: 'pos', x: 50, y: 40, dir: 'd', a: 'walk' })
  assert.equal(a.closed, null)
  await msg(a, { t: 'pos', x: 50, y: 40, dir: 'd', a: 'walk' })
  assert.equal(a.closed, 4008)
})

test('pos within speed is accepted and clamped', async () => {
  const { join, msg, d, adv } = await setup()
  const a = await join(1)
  adv(1000)
  await msg(a, { t: 'pos', x: 30, y: 22, dir: 'l', a: 'walk.l' })
  assert.equal(d.st(a).p.x, 30)
  assert.equal(d.st(a).p.dir, 'l')
})

test('rate limit closes a flooder after 3 violations', async () => {
  const { join, msg } = await setup()
  const a = await join(1)
  for (let i = 0; i < 40; i++) await msg(a, { t: 'emote', k: 'wave' })
  assert.equal(a.closed, 4008)
})

test('pos messages are batched into one broadcast per tick', async () => {
  const { join, msg, d, adv } = await setup()
  const a = await join(1)
  const b = await join(2)
  for (let i = 1; i <= 10; i++) {
    adv(100)
    await msg(a, { t: 'pos', x: 28 + i * 0.1, y: 22, dir: 'd', a: 'walk' })
  }
  const before = b.out.filter(o => o.t === 'pos').length
  assert.equal(before, 0)
  await d.alarm()
  const ps = b.out.filter(o => o.t === 'pos')
  assert.equal(ps.length, 1)
  assert.equal(ps[0].list.length, 1)
  assert.equal(ps[0].list[0].x, 29)
  assert.equal(a.out.filter(o => o.t === 'pos').length, 0)
  await d.alarm()
  assert.equal(b.out.filter(o => o.t === 'pos').length, 1)
})

test('alarm is only kept while sockets exist', async () => {
  const { join, ctx, d } = await setup()
  const a = await join(1)
  assert.ok(ctx.storage.alarm)
  a.closed = 1000
  await d.webSocketClose(a)
  const was = ctx.storage.alarm
  await d.alarm()
  assert.equal(ctx.storage.alarm, was)
})

test('emote is relayed, timer and shop update the player', async () => {
  const { join, msg, last, d } = await setup()
  const a = await join(1)
  const b = await join(2)
  await msg(a, { t: 'emote', k: 'cheer' })
  assert.deepEqual(last(b, 'emote'), { t: 'emote', id: 1, k: 'cheer' })
  await msg(a, { t: 'timer', st: 'focus', left: 600 })
  assert.equal(last(b, 'join').p.st, 'focus')
  assert.equal(last(b, 'join').p.left, 600)
  await msg(a, { t: 'shop', kind: 'bakery' })
  assert.equal(last(b, 'join').p.place, 'shop:bakery')
  await msg(a, { t: 'shop', kind: null })
  assert.equal(d.st(a).p.place, 'street')
})

test('payloads never carry titles, notes or course unless shared', async () => {
  const { join, db, d, adv, last } = await setup()
  db.exec("INSERT INTO courses(id,user_id,name,code) VALUES(1,1,'Secret Course','CS101')")
  db.exec("INSERT INTO tasks(id,user_id,title,notes,course_id) VALUES(1,1,'Secret Title','Secret Note',1)")
  db.exec("INSERT INTO sessions(id,user_id,task_id,start_at) VALUES(1,1,1,'2026-01-01T00:00:00Z')")
  db.exec(`INSERT INTO session_active(session_id,user_id,started,last_ping,active_secs,verified_secs,last_ok) VALUES(1,1,0,1000000,600,300,0)`)
  db.exec("INSERT INTO user_status(user_id,fed_until) VALUES(1,9999999)")
  const a = await join(1)
  const b = await join(2)
  const p = last(b, 'snap').players.find(x => x.id === 1)
  assert.equal(p.act, 'active')
  assert.equal(p.vp, 50)
  assert.equal(p.m, 10)
  assert.equal(p.fed, true)
  assert.equal(p.course, undefined)
  db.exec("INSERT INTO prefs(user_id,k,v) VALUES(1,'share_subject','1')")
  adv(20000)
  db.exec('UPDATE session_active SET last_ping=1020000')
  await d.alarm()
  assert.equal(last(b, 'join').p.course, 'CS101')
  const all = JSON.stringify([a.out, b.out])
  assert.ok(!all.includes('Secret'))
  db.exec("UPDATE prefs SET v='0'")
  adv(20000)
  await d.alarm()
  assert.equal(last(b, 'join').p.course, undefined)
})

test('refresh broadcasts act change to away', async () => {
  const { join, db, d, adv, last } = await setup()
  db.exec(`INSERT INTO session_active(session_id,user_id,started,last_ping,active_secs,verified_secs,last_ok) VALUES(1,1,0,1000000,60,60,0)`)
  await join(1)
  const b = await join(2)
  adv(100000)
  await d.alarm()
  assert.equal(last(b, 'join').p.act, 'away')
})

test('show_in_town=0 hides the player', async () => {
  const { join, db, last } = await setup()
  db.exec("INSERT INTO prefs(user_id,k,v) VALUES(1,'show_in_town','0')")
  await join(1)
  const b = await join(2)
  assert.equal(last(b, 'snap').players.length, 1)
  assert.equal(b.out.filter(o => o.t === 'join').length, 0)
})

async function knockSetup(mode) {
  const s = await setup()
  s.db.exec(`INSERT INTO houses(user_id,plot_id,door_mode) VALUES(1,1,'${mode}')`)
  s.owner = await s.join(1)
  s.guest = await s.join(2)
  return s
}
const res = (ws) => ws.out.filter(o => o.t === 'result')
const acc = (db) => db.prepare('SELECT * FROM house_access').all()

test('knock: open replies ok without a row', async () => {
  const s = await knockSetup('open')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  assert.deepEqual(res(s.guest), [{ t: 'result', house: 1, ok: true }])
  assert.equal((await acc(s.db)).results.length, 0)
})

test('knock: closed', async () => {
  const s = await knockSetup('closed')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  assert.equal(res(s.guest)[0].why, 'closed')
})

test('knock: away when owner not connected', async () => {
  const s = await setup()
  s.db.exec("INSERT INTO houses(user_id,plot_id) VALUES(1,1)")
  const g = await s.join(2)
  await s.msg(g, { t: 'knock', house: 1 })
  assert.equal(res(g)[0].why, 'away')
})

test('knock: blocked either way', async () => {
  const s = await knockSetup('knock')
  s.db.exec('INSERT INTO user_blocks(blocker,blocked) VALUES(1,2)')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  assert.equal(res(s.guest)[0].why, 'blocked')
  const s2 = await knockSetup('knock')
  s2.db.exec('INSERT INTO user_blocks(blocker,blocked) VALUES(2,1)')
  await s2.msg(s2.guest, { t: 'knock', house: 1 })
  assert.equal(res(s2.guest)[0].why, 'blocked')
})

test('knock: allow writes house_access for an hour', async () => {
  const s = await knockSetup('knock')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  const k = s.owner.out.find(o => o.t === 'knock')
  assert.equal(k.from.id, 2)
  assert.equal(res(s.guest).length, 0)
  await s.msg(s.owner, { t: 'reply', id: k.id, allow: true })
  assert.deepEqual(res(s.guest), [{ t: 'result', house: 1, ok: true }])
  const rows = (await acc(s.db)).results
  assert.equal(rows.length, 1)
  assert.equal(rows[0].guest, 2)
  assert.equal(rows[0].expires, 1000000 + 3600000)
})

test('knock: declined and later write nothing', async () => {
  const s = await knockSetup('knock')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  const k = s.owner.out.find(o => o.t === 'knock')
  await s.msg(s.owner, { t: 'reply', id: k.id, allow: false })
  assert.equal(res(s.guest)[0].why, 'declined')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  const k2 = s.owner.out.filter(o => o.t === 'knock')[1]
  await s.msg(s.owner, { t: 'reply', id: k2.id, allow: false, later: true })
  assert.equal(res(s.guest)[1].why, 'later')
  assert.equal((await acc(s.db)).results.length, 0)
})

test('knock: only the owner can answer', async () => {
  const s = await knockSetup('knock')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  const k = s.owner.out.find(o => o.t === 'knock')
  await s.msg(s.guest, { t: 'reply', id: k.id, allow: true })
  assert.equal(res(s.guest).length, 0)
  assert.equal((await acc(s.db)).results.length, 0)
})

test('knock: pending expires after 60s with away', async () => {
  const s = await knockSetup('knock')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  s.adv(30000)
  await s.d.alarm()
  assert.equal(res(s.guest).length, 0)
  s.adv(31000)
  await s.d.alarm()
  assert.equal(res(s.guest)[0].why, 'away')
  const k = s.owner.out.find(o => o.t === 'knock')
  await s.msg(s.owner, { t: 'reply', id: k.id, allow: true })
  assert.equal((await acc(s.db)).results.length, 0)
})

test('knock: one pending per house and 3 per minute', async () => {
  const s = await knockSetup('knock')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  await s.msg(s.guest, { t: 'knock', house: 1 })
  assert.equal(s.owner.out.filter(o => o.t === 'knock').length, 1)
  for (const h of [3, 4, 5]) s.db.exec(`INSERT INTO houses(user_id,plot_id) VALUES(${h},${h})`)
  await s.join(3)
  await s.join(4)
  await s.join(5)
  await s.msg(s.guest, { t: 'knock', house: 3 })
  await s.msg(s.guest, { t: 'knock', house: 4 })
  await s.msg(s.guest, { t: 'knock', house: 5 })
  assert.equal(s.guest.out.filter(o => o.t === 'err' && o.code === 'rate').length, 1)
  s.adv(61000)
  await s.msg(s.guest, { t: 'knock', house: 5 })
  assert.equal(s.guest.out.filter(o => o.t === 'err').length, 1)
})

test('knock: owner disconnect gives away', async () => {
  const s = await knockSetup('knock')
  await s.msg(s.guest, { t: 'knock', house: 1 })
  s.owner.closed = 1000
  await s.d.webSocketClose(s.owner)
  assert.equal(res(s.guest)[0].why, 'away')
})

test('TICK_MS is the alarm period', async () => {
  const { join, ctx, d } = await setup()
  await join(1)
  await d.alarm()
  assert.equal(ctx.storage.alarm, 1000000 + TICK_MS)
})
