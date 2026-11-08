import { MAX_HOUSE, MSG_RATE, MAX_VIOLATIONS, CHAT_RATE_MS, validateClient, makePlayer, makeServer } from '../../public/town/shared/protocol.js'

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
    try { ws.serializeAttachment({ uid: s.uid, name: s.name, owner: s.owner, hall: s.hall, look: s.look, stt: s.stt, left: s.left }) } catch (e) {}
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
    const uid = parseInt(req.headers.get('x-uid'), 10)
    let name = ''
    try { name = decodeURIComponent(req.headers.get('x-name') || '') } catch (e) {}
    if (!(uid > 0)) return new Response('unauthorized', { status: 401 })
    const hall = req.headers.get('x-hall') === '1' || String(this.ctx.id && this.ctx.id.name || '').startsWith('hall:')
    const owner = !hall && req.headers.get('x-owner') === '1'
    const pair = new WebSocketPair()
    await this.admit(pair[1], uid, name, owner, hall)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async admit(ws, uid, name, owner, hall) {
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
    if (others.length >= (hall ? HALL_MAX : MAX_HOUSE)) return refuse('full', 4001)
    if (hall) {
      for (const o of others) {
        const b = await this.env.DB.prepare('SELECT 1 AS x FROM user_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)').bind(uid, o.uid, o.uid, uid).first()
        if (b) return refuse('blocked', 4003)
      }
    }
    const s = { uid, name, owner: !!owner, hall: !!hall, look: av, stt: 'idle', left: 0, w: 0, n: 0, v: 0, lc: 0 }
    this.ctx.acceptWebSocket(ws)
    this.m.set(ws, s)
    this.save(ws, s)
    this.inside()
    if (!hall) {
      const hist = (await this.ctx.storage.get('hist')) || []
      for (const c of hist) send(ws, makeServer('chat', c))
    }
  }

  inside() {
    const members = this.all().map(w => this.st(w)).filter(Boolean).map(s => makePlayer({ id: s.uid, name: s.name, look: s.look, st: s.stt, left: s.left, place: s.hall ? 'hall' : 'house' }))
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
        await this.chat(s, msg.text, t)
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

  async chat(s, text, t) {
    if (s.hall) return
    if (t - s.lc < CHAT_RATE_MS) return
    s.lc = t
    const mu = (await this.ctx.storage.get('mute')) || []
    if (mu.includes(s.uid)) return
    const c = { id: s.uid, name: s.name, text, ts: t }
    const hist = (await this.ctx.storage.get('hist')) || []
    hist.push(c)
    while (hist.length > HIST_MAX) hist.shift()
    await this.ctx.storage.put('hist', hist)
    this.bcast(makeServer('chat', c))
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
