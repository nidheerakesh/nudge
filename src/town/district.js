import { TICK_MS, MAX_DISTRICT, MSG_RATE, MAX_VIOLATIONS, DIST_W, DIST_H, validateClient, speedOk, clampToDistrict, makePlayer, makeServer } from '../../public/town/shared/protocol.js'

const REFRESH_MS = 15000
const KNOCK_TTL = 60000
const KNOCK_WIN = 60000
const KNOCK_MAX = 3
const ACCESS_MS = 3600000
const MAX_FRAME = 2048

const send = (ws, o) => {
  try { ws.send(JSON.stringify(o)) } catch (e) {}
}

export class DistrictDO {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.m = new Map()
    this.gone = new WeakSet()
    this.moved = new Set()
    this.pend = new Map()
    this.kn = new Map()
    this.kid = 0
    this.last = 0
    this.now = () => Date.now()
  }

  all() {
    return this.ctx.getWebSockets().filter(w => !this.gone.has(w))
  }

  st(ws) {
    let s = this.m.get(ws)
    if (s) return s
    if (this.gone.has(ws)) return null
    let at = null
    try { at = ws.deserializeAttachment() } catch (e) {}
    if (!at || !at.p) return null
    s = { p: at.p, hidden: !!at.hidden, hello: !!at.hello, at: this.now(), w: 0, n: 0, v: 0 }
    this.m.set(ws, s)
    return s
  }

  save(ws, s) {
    try { ws.serializeAttachment({ p: s.p, hidden: s.hidden, hello: s.hello }) } catch (e) {}
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
    const uid = parseInt(req.headers.get('x-uid'), 10)
    let name = ''
    try { name = decodeURIComponent(req.headers.get('x-name') || '') } catch (e) {}
    this.dn = parseInt(req.headers.get('x-district'), 10) || 0
    if (!(uid > 0)) return new Response('unauthorized', { status: 401 })
    const pair = new WebSocketPair()
    await this.admit(pair[1], uid, name)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async load(uid) {
    const db = this.env.DB
    const t = this.now()
    const av = await db.prepare('SELECT skin,hair,hair_color,outfit,accessory FROM avatar WHERE user_id=?').bind(uid).first()
    const pr = await db.prepare("SELECT k,v FROM prefs WHERE user_id=? AND k IN ('show_in_town','share_subject')").bind(uid).all()
    const pf = {}
    for (const r of pr.results) pf[r.k] = r.v
    const res = { look: av, show: pf.show_in_town !== '0', act: 'away', vp: 0, m: 0, fed: false }
    const sa = await db.prepare('SELECT * FROM session_active WHERE user_id=? ORDER BY session_id DESC LIMIT 1').bind(uid).first()
    if (sa) {
      const age = t - sa.last_ping
      if (age < 90000 && !sa.ended) {
        let idle = age >= 60000 || sa.paused || sa.misses > 0
        if (!idle) idle = !!(await db.prepare('SELECT 1 AS x FROM checkins WHERE session_id=? AND answered IS NULL AND due<=?').bind(sa.session_id, t).first())
        res.act = idle ? 'idle' : 'active'
      }
      res.vp = sa.active_secs > 0 ? Math.round(sa.verified_secs * 100 / sa.active_secs) : 0
      res.m = Math.floor(sa.active_secs / 60)
      if (pf.share_subject === '1') {
        const c = await db.prepare('SELECT c.code AS code FROM sessions s JOIN tasks t ON t.id=s.task_id JOIN courses c ON c.id=t.course_id WHERE s.id=?').bind(sa.session_id).first()
        if (c && c.code) res.course = c.code
      }
    }
    const us = await db.prepare('SELECT fed_until FROM user_status WHERE user_id=?').bind(uid).first()
    res.fed = !!(us && us.fed_until > t)
    return res
  }

  async admit(ws, uid, name) {
    let d = null
    try { d = await this.load(uid) } catch (e) {}
    if (!d || !d.look) {
      this.ctx.acceptWebSocket(ws)
      send(ws, makeServer('err', { code: 'nojoin' }))
      try { ws.close(4004, 'nojoin') } catch (e) {}
      return
    }
    for (const o of this.all()) {
      const os = this.st(o)
      if (os && os.p.id === uid) this.drop(o, 4000, 'replaced', false)
    }
    if (this.all().length >= MAX_DISTRICT) {
      this.ctx.acceptWebSocket(ws)
      send(ws, makeServer('err', { code: 'full' }))
      try { ws.close(4001, 'full') } catch (e) {}
      return
    }
    const p = makePlayer({ id: uid, name, look: d.look, x: DIST_W / 2, y: DIST_H / 2, dir: 'd', a: 'idle', st: 'idle', left: 0, act: d.act, vp: d.vp, m: d.m, fed: d.fed, course: d.course, place: 'street' })
    const s = { p, hidden: !d.show, hello: false, at: this.now(), w: 0, n: 0, v: 0 }
    this.ctx.acceptWebSocket(ws)
    this.m.set(ws, s)
    this.save(ws, s)
    this.gone.delete(ws)
    const a = await this.ctx.storage.getAlarm()
    if (a == null) await this.ctx.storage.setAlarm(this.now() + TICK_MS)
  }

  bcast(o, skip) {
    const str = JSON.stringify(o)
    for (const w of this.all()) {
      const s = this.st(w)
      if (!s || !s.hello || w === skip) continue
      try { w.send(str) } catch (e) {}
    }
  }

  upsert(ws, s) {
    this.save(ws, s)
    if (!s.hidden && s.hello) this.bcast(makeServer('join', { p: s.p }), ws)
  }

  drop(ws, code, why, tell) {
    const s = this.st(ws)
    this.gone.add(ws)
    this.m.delete(ws)
    this.moved.delete(ws)
    try { ws.close(code, why) } catch (e) {}
    if (!s) return
    for (const [id, k] of this.pend) {
      if (k.from === ws) this.pend.delete(id)
      else if (k.owner === ws) {
        this.pend.delete(id)
        send(k.from, makeServer('result', { house: k.house, ok: false, why: 'away' }))
      }
    }
    if (tell !== false && s.hello && !s.hidden) this.bcast(makeServer('part', { id: s.p.id }), ws)
  }

  viol(ws, s) {
    s.v++
    if (s.v >= MAX_VIOLATIONS) this.drop(ws, 4008, 'violations')
  }

  async webSocketMessage(ws, data) {
    const s = this.st(ws)
    if (!s) {
      if (!this.gone.has(ws)) try { ws.close(4000, 'state') } catch (e) {}
      return
    }
    const t = this.now()
    if (t - s.w >= 1000) { s.w = t; s.n = 0 }
    if (++s.n > MSG_RATE) return this.viol(ws, s)
    if (typeof data !== 'string' || data.length > MAX_FRAME) return
    let raw = null
    try { raw = JSON.parse(data) } catch (e) { return }
    const msg = validateClient(raw)
    if (!msg) return
    if (msg.t === 'hello') return this.hello(ws, s)
    if (!s.hello) return
    const p = s.p
    switch (msg.t) {
      case 'pos': {
        if (!speedOk(p, msg, t - s.at)) return this.viol(ws, s)
        const c = clampToDistrict(msg.x, msg.y)
        p.x = c.x
        p.y = c.y
        p.dir = msg.dir
        p.a = msg.a
        s.at = t
        if (!s.hidden) this.moved.add(ws)
        break
      }
      case 'emote':
        if (!s.hidden) this.bcast(makeServer('emote', { id: p.id, k: msg.k }), ws)
        break
      case 'timer':
        p.st = msg.st
        p.left = msg.left
        this.upsert(ws, s)
        break
      case 'shop':
        p.place = msg.kind === null ? 'street' : msg.kind === 'hall' ? 'hall' : 'shop:' + msg.kind
        this.upsert(ws, s)
        break
      case 'enter':
        p.place = 'house'
        this.upsert(ws, s)
        break
      case 'leave':
        p.place = 'street'
        this.upsert(ws, s)
        break
      case 'knock':
        await this.knock(ws, s, msg.house)
        break
      case 'reply':
        await this.reply(ws, s, msg.id, msg.allow, raw.later === true)
        break
    }
  }

  hello(ws, s) {
    if (s.hello) return
    s.hello = true
    this.save(ws, s)
    const list = this.all().map(w => this.st(w)).filter(o => o && o.hello && !o.hidden).map(o => o.p)
    send(ws, makeServer('snap', { you: s.p.id, district: this.dn || 0, players: list }))
    if (!s.hidden) this.bcast(makeServer('join', { p: s.p }), ws)
  }

  async blocked(a, b) {
    const r = await this.env.DB.prepare('SELECT 1 AS x FROM user_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)').bind(a, b, b, a).first()
    return !!r
  }

  async knock(ws, s, house) {
    const t = this.now()
    const res = (ok, why) => send(ws, makeServer('result', { house, ok, why }))
    const me = s.p.id
    if (house === me) return
    for (const k of this.pend.values()) if (k.from === ws && k.house === house) return
    const ts = (this.kn.get(me) || []).filter(x => t - x < KNOCK_WIN)
    if (ts.length >= KNOCK_MAX) {
      this.kn.set(me, ts)
      return send(ws, makeServer('err', { code: 'rate' }))
    }
    ts.push(t)
    this.kn.set(me, ts)
    let ow = null
    for (const w of this.all()) {
      const o = this.st(w)
      if (o && o.hello && !o.hidden && o.p.id === house) ow = w
    }
    if (!ow) return res(false, 'away')
    if (await this.blocked(me, house)) return res(false, 'blocked')
    const h = await this.env.DB.prepare('SELECT door_mode FROM houses WHERE user_id=?').bind(house).first()
    if (!h) return res(false, 'away')
    if (h.door_mode === 'closed') return res(false, 'closed')
    if (h.door_mode === 'open') return res(true)
    if (!this.all().includes(ow) || !this.all().includes(ws)) return
    const id = ++this.kid
    this.pend.set(id, { id, from: ws, owner: ow, house, exp: this.now() + KNOCK_TTL })
    send(ow, makeServer('knock', { id, from: s.p }))
  }

  async reply(ws, s, id, allow, later) {
    const k = this.pend.get(id)
    if (!k || k.owner !== ws) return
    this.pend.delete(id)
    const ks = this.st(k.from)
    if (!ks) return
    if (!allow) return send(k.from, makeServer('result', { house: k.house, ok: false, why: later ? 'later' : 'declined' }))
    await this.env.DB.prepare('INSERT OR REPLACE INTO house_access(house_user,guest,expires) VALUES(?,?,?)').bind(k.house, ks.p.id, this.now() + ACCESS_MS).run()
    send(k.from, makeServer('result', { house: k.house, ok: true }))
  }

  flush() {
    if (!this.moved.size) return
    const list = []
    for (const w of this.moved) {
      const s = this.st(w)
      if (s) list.push({ id: s.p.id, x: s.p.x, y: s.p.y, dir: s.p.dir, a: s.p.a })
      if (s) this.save(w, s)
    }
    this.moved.clear()
    for (const w of this.all()) {
      const s = this.st(w)
      if (!s || !s.hello) continue
      const mine = list.filter(e => e.id !== s.p.id)
      if (mine.length) send(w, makeServer('pos', { list: mine }))
    }
  }

  expire() {
    const t = this.now()
    for (const [id, k] of this.pend) {
      if (k.exp > t) continue
      this.pend.delete(id)
      send(k.from, makeServer('result', { house: k.house, ok: false, why: 'away' }))
    }
  }

  async refresh() {
    for (const w of this.all()) {
      const s = this.st(w)
      if (!s) continue
      let d = null
      try { d = await this.load(s.p.id) } catch (e) { continue }
      if (!d || !this.m.has(w)) continue
      const p = s.p
      const ch = p.act !== d.act || p.vp !== d.vp || p.m !== d.m || p.fed !== d.fed || p.course !== d.course
      p.act = d.act
      p.vp = d.vp
      p.m = d.m
      p.fed = d.fed
      if (d.course) p.course = d.course
      else delete p.course
      if (ch) this.upsert(w, s)
    }
  }

  async alarm() {
    if (!this.all().length) return
    await this.ctx.storage.setAlarm(this.now() + TICK_MS)
    this.flush()
    this.expire()
    const t = this.now()
    if (t - this.last >= REFRESH_MS) {
      this.last = t
      await this.refresh()
    }
  }

  async webSocketClose(ws) {
    this.drop(ws, 1000, 'bye')
  }

  async webSocketError(ws) {
    this.drop(ws, 1011, 'error')
  }
}
