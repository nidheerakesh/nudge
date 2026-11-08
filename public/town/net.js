import { TICK_MS, SERVER_TYPES, validateClient } from './shared/protocol.js'

export const BACKOFF_MIN = 500
export const BACKOFF_MAX = 15000

export function backoff(n) {
  const k = Math.max(0, Math.floor(n) || 0)
  return Math.min(BACKOFF_MAX, BACKOFF_MIN * Math.pow(2, Math.min(k, 16)))
}

// Outgoing queue used while the socket is down. A newer pos replaces any queued pos.
export function makeQueue(max = 50) {
  let list = []
  return {
    push(msg) {
      if (msg.t === 'pos') list = list.filter(m => m.t !== 'pos')
      list.push(msg)
      while (list.length > max) list.shift()
    },
    take() {
      const out = list
      list = []
      return out
    },
    size: () => list.length,
  }
}

// Keeps the last two server samples per player and answers for a time one tick behind.
export function makeInterp(delay = TICK_MS) {
  const m = new Map()
  return {
    push(id, x, y, now) {
      const e = m.get(id)
      if (!e) { m.set(id, { a: { x, y, t: now }, b: { x, y, t: now } }); return }
      if (now < e.b.t) return
      e.a = e.b
      e.b = { x, y, t: now }
    },
    get(id, now) {
      const e = m.get(id)
      if (!e) return null
      const rt = now - delay
      const { a, b } = e
      if (rt >= b.t || b.t === a.t) return { x: b.x, y: b.y }
      if (rt <= a.t) return { x: a.x, y: a.y }
      const k = (rt - a.t) / (b.t - a.t)
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    },
    remove(id) { m.delete(id) },
    clear() { m.clear() },
  }
}

export function connect(url, handlers = {}, opts = {}) {
  const WS = opts.WebSocket || globalThis.WebSocket
  const setT = opts.setTimeout || globalThis.setTimeout.bind(globalThis)
  const clearT = opts.clearTimeout || globalThis.clearTimeout.bind(globalThis)
  const queue = makeQueue()
  let ws = null
  let tries = 0
  let timer = null
  let closed = false
  let isOpen = false

  const raw = msg => {
    try { ws.send(JSON.stringify(msg)) } catch (e) { return false }
    return true
  }

  function open() {
    timer = null
    if (closed) return
    ws = new WS(url)
    const mine = ws
    mine.onopen = () => {
      if (mine !== ws) return
      isOpen = true
      tries = 0
      raw({ t: 'hello' })
      for (const m of queue.take()) raw(m)
      if (handlers.open) handlers.open()
    }
    mine.onmessage = ev => {
      if (mine !== ws) return
      let msg = null
      try { msg = JSON.parse(ev.data) } catch (e) { return }
      if (!msg || typeof msg !== 'object' || !SERVER_TYPES.includes(msg.t)) return
      if (handlers.message) handlers.message(msg)
    }
    mine.onerror = () => {}
    mine.onclose = () => {
      if (mine !== ws) return
      ws = null
      const was = isOpen
      isOpen = false
      if (handlers.close) handlers.close(was)
      if (closed) return
      const d = backoff(tries++)
      timer = setT(open, d)
      if (handlers.retry) handlers.retry(d)
    }
  }

  const api = {
    send(msg) {
      const v = validateClient(msg)
      if (!v) return false
      if (closed) return false
      if (isOpen && ws) return raw(v)
      queue.push(v)
      return true
    },
    close() {
      closed = true
      if (timer != null) clearT(timer)
      timer = null
      queue.take()
      const w = ws
      ws = null
      isOpen = false
      if (w) { try { w.close() } catch (e) {} }
    },
    get open() { return isOpen },
    get queued() { return queue.size() },
  }
  open()
  return api
}
