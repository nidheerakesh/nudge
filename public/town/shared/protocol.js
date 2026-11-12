export const TICK_MS = 125
export const MAX_SPEED = 6
export const MAX_DISTRICT = 40
export const MAX_HOUSE = 12
export const CHAT_MAX = 200
export const CHAT_RATE_MS = 1000
export const MSG_RATE = 30
export const MAX_VIOLATIONS = 3
export const DIST_W = 56
export const DIST_H = 44
export const COORD_MAX = 60
export const ROOM_MAX = 8
export const ROUND_BREAK_MS = 300000
export const ROOM_BONUS = 10
export const ROOM_BONUS_MIN = 25

export const DIRS = ['d', 'u', 'l', 'r']
export const EMOTES = ['cheer', 'heart', 'wave', 'zzz', 'think', 'ok']
export const SHOPS = ['boutique', 'homestore', 'bakery', 'hall']
export const TIMER_STATES = ['focus', 'break', 'idle']
export const ACTS = ['active', 'idle', 'away']
export const PLACES = ['street', 'house', 'hall']
export const CLIENT_TYPES = ['hello', 'pos', 'emote', 'knock', 'reply', 'enter', 'shop', 'leave', 'chat', 'timer', 'mute', 'kick', 'round']
export const SERVER_TYPES = ['snap', 'join', 'part', 'pos', 'emote', 'knock', 'result', 'inside', 'chat', 'err', 'round']
export const WHY = ['closed', 'away', 'declined', 'blocked', 'later']

const isNum = v => typeof v === 'number' && Number.isFinite(v)
const isId = v => Number.isSafeInteger(v) && v > 0
const inCoord = v => isNum(v) && v >= 0 && v <= COORD_MAX
const ANIM = /^[a-z0-9_.]{1,32}$/

export function cleanText(s) {
  if (typeof s !== 'string' || s.length > 2000) return null
  let t = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 32 || (c >= 127 && c <= 159) || c === 0x2028 || c === 0x2029) continue
    t += s[i]
  }
  t = t.trim()
  if (!t || t.length > CHAT_MAX) return null
  return t
}

export function validateClient(msg) {
  try {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null
    const t = msg.t
    if (typeof t !== 'string' || !CLIENT_TYPES.includes(t)) return null
    switch (t) {
      case 'hello':
      case 'leave':
        return { t }
      case 'pos':
        if (!inCoord(msg.x) || !inCoord(msg.y) || !DIRS.includes(msg.dir)) return null
        if (typeof msg.a !== 'string' || !ANIM.test(msg.a)) return null
        return { t, x: msg.x, y: msg.y, dir: msg.dir, a: msg.a }
      case 'emote':
        return EMOTES.includes(msg.k) ? { t, k: msg.k } : null
      case 'knock':
      case 'enter':
        return isId(msg.house) ? { t, house: msg.house } : null
      case 'reply':
        return isId(msg.id) && typeof msg.allow === 'boolean' ? { t, id: msg.id, allow: msg.allow } : null
      case 'shop':
        if (msg.kind === null || msg.kind === undefined) return { t, kind: null }
        return SHOPS.includes(msg.kind) ? { t, kind: msg.kind } : null
      case 'chat': {
        const text = cleanText(msg.text)
        return text ? { t, text } : null
      }
      case 'timer': {
        if (!TIMER_STATES.includes(msg.st)) return null
        if (!isNum(msg.left) || msg.left < 0 || msg.left > 86400) return null
        const res = { t, st: msg.st, left: Math.floor(msg.left) }
        if (msg.m !== undefined) {
          if (!isNum(msg.m) || msg.m < 0 || msg.m > 1440) return null
          res.m = Math.floor(msg.m)
        }
        if (msg.paused !== undefined) {
          if (typeof msg.paused !== 'boolean') return null
          res.paused = msg.paused
        }
        return res
      }
      case 'mute':
      case 'kick':
        return isId(msg.user) ? { t, user: msg.user } : null
      case 'round':
        return Number.isSafeInteger(msg.mins) && msg.mins >= 10 && msg.mins <= 90 ? { t, mins: msg.mins } : null
    }
    return null
  } catch (e) {
    return null
  }
}

export function speedOk(prev, next, dtMs) {
  if (!prev || !next || !isNum(prev.x) || !isNum(prev.y) || !isNum(next.x) || !isNum(next.y) || !isNum(dtMs)) return false
  const dt = Math.min(Math.max(dtMs, 0), 2000) / 1000
  const d = Math.hypot(next.x - prev.x, next.y - prev.y)
  return d <= MAX_SPEED * 1.5 * dt + 0.25
}

export function clampToDistrict(x, y) {
  const cl = (v, mx) => (isNum(v) ? Math.min(Math.max(v, 0), mx) : 0)
  return { x: cl(x, DIST_W - 0.01), y: cl(y, DIST_H - 0.01) }
}

const r2 = v => Math.round(v * 100) / 100

export function makePlayer(p) {
  const o = p || {}
  const look = o.look || {}
  const res = {
    id: o.id,
    name: String(o.name == null ? '' : o.name),
    look: { skin: look.skin, hair: look.hair, hair_color: look.hair_color, outfit: look.outfit, accessory: look.accessory == null ? null : look.accessory },
    x: r2(isNum(o.x) ? o.x : 0),
    y: r2(isNum(o.y) ? o.y : 0),
    dir: DIRS.includes(o.dir) ? o.dir : 'd',
    a: typeof o.a === 'string' ? o.a : 'idle',
    st: TIMER_STATES.includes(o.st) ? o.st : 'idle',
    left: isNum(o.left) ? Math.max(0, Math.floor(o.left)) : 0,
    act: ACTS.includes(o.act) ? o.act : 'away',
    vp: isNum(o.vp) ? Math.min(100, Math.max(0, Math.round(o.vp))) : 0,
    m: isNum(o.m) ? Math.max(0, Math.floor(o.m)) : 0,
    fed: !!o.fed,
    place: typeof o.place === 'string' ? o.place : 'street',
  }
  if (typeof o.course === 'string' && o.course) res.course = o.course
  return res
}

export function makeServer(type, d) {
  const o = d || {}
  switch (type) {
    case 'snap':
      return { t: 'snap', you: o.you, district: o.district, players: (o.players || []).map(makePlayer) }
    case 'join':
      return { t: 'join', p: makePlayer(o.p) }
    case 'part':
      return { t: 'part', id: o.id }
    case 'pos':
      return { t: 'pos', list: (o.list || []).map(e => ({ id: e.id, x: r2(e.x), y: r2(e.y), dir: e.dir, a: e.a })) }
    case 'emote':
      return { t: 'emote', id: o.id, k: o.k }
    case 'knock':
      return { t: 'knock', id: o.id, from: makePlayer(o.from) }
    case 'result': {
      const res = { t: 'result', house: o.house, ok: !!o.ok }
      if (!o.ok && WHY.includes(o.why)) res.why = o.why
      return res
    }
    case 'inside':
      return { t: 'inside', house: o.house, members: (o.members || []).map(makePlayer) }
    case 'chat':
      return { t: 'chat', id: o.id, name: String(o.name == null ? '' : o.name), text: o.text, ts: o.ts }
    case 'err':
      return { t: 'err', code: o.code }
    case 'round': {
      const res = { t: 'round', phase: o.phase, end: o.end, mins: o.mins, by: o.by }
      if (o.coins) res.coins = o.coins
      return res
    }
  }
  return null
}
