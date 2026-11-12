import { MAX_HOUSE, MSG_RATE, MAX_VIOLATIONS, CHAT_RATE_MS, ROOM_MAX, ROUND_BREAK_MS, ROOM_BONUS, ROOM_BONUS_MIN, validateClient, makePlayer, makeServer } from '../../public/town/shared/protocol.js'
import { clean } from '../../public/town/shared/filter.js'

const HALL_MAX = 24
const HIST_MAX = 50
const MAX_FRAME = 2048

const send = (ws, o) => {
  try { ws.send(JSON.stringify(o)) } catch (e) {}
}

export class HouseDO {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.m = new Map()
    this.gone = new WeakSet()
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
    if (!at || !at.uid) return null
    s = { ...at, w: 0, n: 0, v: 0, lc: 0 }
    this.m.set(ws, s)
    return s
  }

  save(ws, s) {
    try { ws.serializeAttachment({ uid: s.uid, name: s.name, owner: s.owner, hall: s.hall, room: s.room, muted: s.muted, look: s.look, stt: s.stt, left: s.left }) } catch (e) {}
  }

  async round() {
    return (await this.ctx.storage.get('round')) || { phase: 'idle', end: 0, mins: 0, by: 0, ids: [] }
  }

  async fetch(req) {
    if (new URL(req.url).pathname === '/drop') {
      const gone = parseInt(req.headers.get('x-drop'), 10)
      for (const w of this.all()) {
        const o = this.st(w)
        if (o && o.uid === gone && !o.owner) this.drop(w, 4003, 'blocked')
      }
      return new Response('ok')
    }
    if (new URL(req.url).pathname === '/count') {
      const r = await this.round()
      return new Response(JSON.stringify({ n: this.all().length, phase: r.phase, end: r.end }), { headers: { 'content-type': 'application/json' } })
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
    const uid = parseInt(req.headers.get('x-uid'), 10)
    let name = ''
    try { name = decodeURIComponent(req.headers.get('x-name') || '') } catch (e) {}
    if (!(uid > 0)) return new Response('unauthorized', { status: 401 })
    const room = req.headers.get('x-room') === '1' || String(this.ctx.id && this.ctx.id.name || '').startsWith('room:')
    const hall = !room && (req.headers.get('x-hall') === '1' || String(this.ctx.id && this.ctx.id.name || '').startsWith('hall:'))
    const owner = !hall && !room && req.headers.get('x-owner') === '1'
    const muted = req.headers.get('x-muted') === '1'
    const pair = new WebSocketPair()
    await this.admit(pair[1], uid, name, owner, hall, room, muted)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async admit(ws, uid, name, owner, hall, room, muted) {
    const refuse = (code, c) => {
      this.ctx.acceptWebSocket(ws)
      send(ws, makeServer('err', { code }))
      try { ws.close(c, code) } catch (e) {}
    }
    const av = await this.env.DB.prepare('SELECT skin,hair,hair_color,outfit,accessory FROM avatar WHERE user_id=?').bind(uid).first()
    if (!av) return refuse('nojoin', 4004)
    for (const o of this.all()) {
      const os = this.st(o)
      if (os && os.uid === uid) this.drop(o, 4000, 'replaced', false)
    }
    const others = this.all().map(w => this.st(w)).filter(Boolean)
    if (others.length >= (room ? ROOM_MAX : hall ? HALL_MAX : MAX_HOUSE)) return refuse('full', 4001)
    if (hall || room) {
      for (const o of others) {
        const b = await this.env.DB.prepare('SELECT 1 AS x FROM user_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)').bind(uid, o.uid, o.uid, uid).first()
        if (b) return refuse('blocked', 4003)
      }
    }
    const s = { uid, name, owner: !!owner, hall: !!hall, room: !!room, muted: !!muted, look: av, stt: 'idle', left: 0, w: 0, n: 0, v: 0, lc: 0 }
    this.ctx.acceptWebSocket(ws)
    this.m.set(ws, s)
    this.save(ws, s)
    this.inside()
    if (!hall && !room) {
      const hist = (await this.ctx.storage.get('hist')) || []
      for (const c of hist) send(ws, makeServer('chat', c))
    }
    if (room) send(ws, makeServer('round', await this.round()))
  }

  inside() {
    const members = this.all().map(w => this.st(w)).filter(Boolean).map(s => makePlayer({ id: s.uid, name: s.name, look: s.look, st: s.stt, left: s.left, place: s.hall || s.room ? 'hall' : 'house' }))
    const ow = this.all().map(w => this.st(w)).find(s => s && s.owner)
    const o = makeServer('inside', { house: ow ? ow.uid : 0, members })
    for (const w of this.all()) send(w, o)
  }

  bcast(o) {
    for (const w of this.all()) send(w, o)
  }

  drop(ws, code, why, tell) {
    const s = this.st(ws)
    this.gone.add(ws)
    this.m.delete(ws)
    try { ws.close(code, why) } catch (e) {}
    if (s && tell !== false) this.inside()
  }

  async webSocketMessage(ws, data) {
    const s = this.st(ws)
    if (!s) {
      if (!this.gone.has(ws)) try { ws.close(4000, 'state') } catch (e) {}
      return
    }
    const t = this.now()
    if (t - s.w >= 1000) { s.w = t; s.n = 0 }
    if (++s.n > MSG_RATE) {
      s.v++
      if (s.v >= MAX_VIOLATIONS) this.drop(ws, 4008, 'violations')
      return
    }
    if (typeof data !== 'string' || data.length > MAX_FRAME) return
    let raw = null
    try { raw = JSON.parse(data) } catch (e) { return }
    const msg = validateClient(raw)
    if (!msg) return
    switch (msg.t) {
      case 'emote':
        this.bcast(makeServer('emote', { id: s.uid, k: msg.k }))
        break
      case 'timer':
        s.stt = msg.st
        s.left = msg.left
        this.save(ws, s)
        this.inside()
        break
      case 'chat':
        if (s.muted) send(ws, makeServer('err', { code: 'muted' }))
        else await this.chat(ws, s, msg.text, t)
        break
      case 'round':
        if (s.room) await this.start(ws, s, msg.mins)
        break
      case 'mute':
        if (s.owner && !s.hall && msg.user !== s.uid) {
          const mu = (await this.ctx.storage.get('mute')) || []
          if (!mu.includes(msg.user)) mu.push(msg.user)
          await this.ctx.storage.put('mute', mu)
        }
        break
      case 'kick':
        await this.kick(s, msg.user)
        break
      case 'leave':
        this.drop(ws, 1000, 'leave')
        break
    }
  }

  async chat(ws, s, text, t) {
    if (s.hall) return
    if (s.room && (await this.round()).phase === 'focus') return send(ws, makeServer('err', { code: 'quiet' }))
    if (t - s.lc < CHAT_RATE_MS) return
    s.lc = t
    const mu = (await this.ctx.storage.get('mute')) || []
    if (mu.includes(s.uid)) return
    const c = { id: s.uid, name: s.name, text: clean(text), ts: t }
    const hist = (await this.ctx.storage.get('hist')) || []
    hist.push(c)
    while (hist.length > HIST_MAX) hist.shift()
    await this.ctx.storage.put('hist', hist)
    this.bcast(makeServer('chat', c))
  }

  async start(ws, s, mins) {
    const r = await this.round()
    if (r.phase !== 'idle') return send(ws, makeServer('err', { code: 'busy' }))
    const end = this.now() + mins * 60000
    const ids = this.all().map(w => this.st(w)).filter(Boolean).map(x => x.uid)
    const next = { phase: 'focus', end, mins, by: s.uid, ids }
    await this.ctx.storage.put('round', next)
    await this.ctx.storage.setAlarm(end)
    this.bcast(makeServer('round', next))
  }

  async bonus(r, now) {
    if (r.mins < ROOM_BONUS_MIN) return []
    const live = this.all().map(w => this.st(w)).filter(Boolean).map(x => x.uid)
    const got = r.ids.filter(id => live.includes(id))
    if (got.length < 2) return []
    const paid = []
    for (const uid of got) {
      const sa = await this.env.DB.prepare('SELECT 1 AS x FROM session_active WHERE user_id=? AND ended=0 AND last_ping>?').bind(uid, now - 180000).first()
      if (!sa) continue
      await this.env.DB.prepare("INSERT OR IGNORE INTO coin_ledger(user_id,delta,reason,ref) VALUES(?,?,'session',?)").bind(uid, ROOM_BONUS, 'room:' + r.end).run()
      paid.push(uid)
    }
    return paid
  }

  async alarm() {
    const r = await this.round()
    const now = this.now()
    if (r.phase === 'focus') {
      const paid = await this.bonus(r, now)
      for (const w of this.all()) {
        const o = this.st(w)
        if (o && paid.includes(o.uid)) send(w, makeServer('round', { phase: 'bonus', end: r.end, mins: r.mins, by: r.by, coins: ROOM_BONUS }))
      }
      const next = { phase: 'break', end: now + ROUND_BREAK_MS, mins: r.mins, by: r.by, ids: [] }
      await this.ctx.storage.put('round', next)
      await this.ctx.storage.setAlarm(next.end)
      this.bcast(makeServer('round', next))
    } else if (r.phase === 'break') {
      const next = { phase: 'idle', end: 0, mins: 0, by: 0, ids: [] }
      await this.ctx.storage.put('round', next)
      this.bcast(makeServer('round', next))
    }
  }

  async kick(s, user) {
    if (!s.owner || s.hall || user === s.uid) return
    for (const w of this.all()) {
      const o = this.st(w)
      if (o && o.uid === user && !o.owner) {
        this.drop(w, 4003, 'kicked')
      }
    }
    await this.env.DB.prepare('DELETE FROM house_access WHERE house_user=? AND guest=?').bind(s.uid, user).run()
  }

  async webSocketClose(ws) {
    this.drop(ws, 1000, 'bye')
  }

  async webSocketError(ws) {
    this.drop(ws, 1011, 'error')
  }
}
