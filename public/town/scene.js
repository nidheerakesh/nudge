import { TILE, moveController, sortByY } from './engine.js'
import { getSprite, getAnim, has } from './art/pixel.js'
import { composeHouse, doorTile, HOUSE_ROOF_ROWS } from './art/houses.js'
import fx from './art/fx.js'
import { SKIN_BASE } from './art/palette.js'
import { districtTemplate, WALK, W, H } from './shared/plots.js'
import { astar } from './path.js'
import { createWeather } from './weather.js'

const T = TILE
const PHASES = fx.meta.phases
const SKY = fx.meta.sky
const LABELS = { boutique: 'BOUTIQUE', homestore: 'HOME STORE', bakery: 'BAKERY', library: 'LIBRARY', townhall: 'TOWN HALL' }
const ACT_COLOR = { active: '#5AC47A', idle: '#F2C14E', away: '#9AA3B2' }
const HAIRS = ['#7A4A2B', '#2A1F2D', '#A8442A', '#E8892B', '#F0CC66', '#F28BB0', '#A98BE0', '#5B8DE0']
const TREES = ['tree.cherry', 'tree.green', 'tree.autumn', 'tree.pine']
const OFFMAP = '#1F5A4A'

// bottom-centre anchor: sprite bottom = footprint bottom, centred on the footprint
export function staticRect(foot, spriteW, spriteH) {
  const key = (foot.y + foot.h) * TILE
  return { x: (foot.x + foot.w / 2) * TILE - spriteW / 2, y: key - spriteH, key }
}

export function spawnTile(tpl) {
  const f = tpl.fountain
  return { x: f.x + Math.floor(f.w / 2), y: f.y + f.h }
}

// solid tiles from the static map: landmarks/fountain (minus doors), trunks, lamps, benches, bushes, fences
export function baseSolid(tpl) {
  const solid = new Uint8Array(W * H)
  const block = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) solid[y * W + x] = 1 }
  for (const d of tpl.decor) {
    if (d.kind === 'flower' || d.kind === 'flowerbed') continue
    block(d.x, d.y)
    if (d.kind === 'bench') block(d.x + 1, d.y)
  }
  for (const l of tpl.landmarks) {
    for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) {
      if (x === l.door.x && y === l.door.y) continue
      block(x, y)
    }
  }
  const f = tpl.fountain
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) block(x, y)
  for (const r of tpl.real || []) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) block(x, y)
  }
  return solid
}

// plain pixel building for a real place: wall, roof band, windows, door
function buildingCv(w, h) {
  const cv = mkCanvas(w, h)
  const g = cv.getContext('2d')
  const roof = Math.round(h * 0.4)
  const dx = Math.floor(w / 2) - 3, dy = h - 9
  g.fillStyle = '#E9DCC3'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#B5654A'
  g.fillRect(0, 0, w, roof)
  g.fillStyle = '#7FB2D9'
  for (let y = roof + 3; y + 5 <= h - 2; y += 6) for (let x = 3; x + 4 <= w - 3; x += 6) {
    if (x < dx + 6 && x + 4 > dx && y + 5 > dy) continue
    g.fillRect(x, y, 4, 5)
  }
  g.fillStyle = '#6B4226'
  g.fillRect(dx, dy, 6, 9)
  g.strokeStyle = '#2A1F2D'
  g.lineWidth = 1
  g.strokeRect(0.5, 0.5, w - 1, h - 1)
  return cv
}

// 3x5 pixel font, 5 rows of 3 bits per glyph
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '.': '000000000000010', '-': '000000111000000', '?': '110001010000010', '!': '010010010000010',
  "'": '010010000000000', _: '000000000000111',
}

const spr = (id, opts) => (has(id) ? getSprite(id, opts) : null)
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

function hash(a, b = 0) {
  let h = Math.imul(a + 1, 73856093) ^ Math.imul(b + 7, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function strHash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function mkCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const textCache = new Map()
function textCv(text, fg, bg, edge, max = 14) {
  const s = String(text == null ? '' : text).toUpperCase().slice(0, max)
  const key = s + '|' + fg + '|' + bg + '|' + edge
  let cv = textCache.get(key)
  if (cv) return cv
  const chars = [...s]
  let tw = 0
  for (const c of chars) tw += c === ' ' ? 2 : 4
  tw = Math.max(0, tw - 1)
  cv = mkCanvas(tw + 6, 9)
  const g = cv.getContext('2d')
  g.fillStyle = edge
  g.fillRect(0, 0, cv.width, cv.height)
  g.fillStyle = bg
  g.fillRect(1, 1, cv.width - 2, cv.height - 2)
  g.fillStyle = fg
  let x = 3
  for (const c of chars) {
    if (c === ' ') { x += 2; continue }
    const bits = FONT[c] || FONT['?']
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + (i % 3), 2 + Math.floor(i / 3), 1, 1)
    x += 4
  }
  if (textCache.size > 400) textCache.clear()
  textCache.set(key, cv)
  return cv
}

const ringCache = new Map()
function actRing(color) {
  let cv = ringCache.get(color)
  if (cv) return cv
  cv = mkCanvas(22, 10)
  const g = cv.getContext('2d')
  g.fillStyle = color
  for (let a = 0; a < 64; a++) {
    const r = (a / 64) * Math.PI * 2
    g.fillRect(Math.round(10.5 + Math.cos(r) * 10), Math.round(4.5 + Math.sin(r) * 4), 1, 1)
  }
  ringCache.set(color, cv)
  return cv
}

let glowCv = null
function glow() {
  if (glowCv) return glowCv
  glowCv = mkCanvas(48, 48)
  const g = glowCv.getContext('2d')
  const gr = g.createRadialGradient(24, 24, 1, 24, 24, 24)
  gr.addColorStop(0, 'rgba(255,214,120,0.9)')
  gr.addColorStop(1, 'rgba(255,214,120,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 48, 48)
  return glowCv
}

const rgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const mixc = (a, b, f) => {
  const x = rgb(a), y = rgb(b)
  return `rgb(${Math.round(x[0] + (y[0] - x[0]) * f)},${Math.round(x[1] + (y[1] - x[1]) * f)},${Math.round(x[2] + (y[2] - x[2]) * f)})`
}

const STOPS = (() => {
  const s = []
  for (const k of ['day', 'sunset', 'dusk', 'night']) {
    const [a, b] = PHASES[k]
    const len = ((b - a + 24) % 24) || 24
    const m = Math.min(0.5, len / 2)
    for (const off of [-24, 0, 24]) {
      s.push({ h: a + m + off, k })
      s.push({ h: a + len - m + off, k })
    }
  }
  return s.sort((p, q) => p.h - q.h)
})()

function skyAt(h) {
  const x = ((h % 24) + 24) % 24
  let i = 0
  while (i < STOPS.length - 2 && STOPS[i + 1].h <= x) i++
  const a = STOPS[i], b = STOPS[i + 1]
  const f = b.h === a.h ? 0 : clamp((x - a.h) / (b.h - a.h))
  const A = SKY[a.k], B = SKY[b.k]
  return {
    top: mixc(A.top, B.top, f),
    bottom: mixc(A.bottom, B.bottom, f),
    tint: mixc(A.tint, B.tint, f),
    strength: A.strength + (B.strength - A.strength) * f,
  }
}

function placeholderAvatar(ctx, look, anim, t, x, y, o) {
  const l = look || {}
  const skin = SKIN_BASE[((l.skin | 0) % SKIN_BASE.length + SKIN_BASE.length) % SKIN_BASE.length]
  const hair = HAIRS[((l.hair_color | 0) % HAIRS.length + HAIRS.length) % HAIRS.length]
  const body = `hsl(${strHash(String(l.outfit == null ? 'x' : l.outfit)) % 360},55%,58%)`
  const walk = /^walk/.test(anim)
  const step = walk ? Math.floor(t * 8) % 2 : 0
  ctx.fillStyle = '#2A1F2D'
  ctx.fillRect(x - 4, y - 6, 3, 6 - step)
  ctx.fillRect(x + 1, y - 6, 3, 5 + step)
  ctx.fillRect(x - 5, y - 16, 10, 11)
  ctx.fillStyle = body
  ctx.fillRect(x - 4, y - 15, 8, 9)
  ctx.fillStyle = '#2A1F2D'
  ctx.fillRect(x - 5, y - 24, 10, 9)
  ctx.fillStyle = skin
  ctx.fillRect(x - 4, y - 23, 8, 7)
  ctx.fillStyle = hair
  ctx.fillRect(x - 4, y - 23, 8, anim.endsWith('.u') ? 7 : 3)
  if (!anim.endsWith('.u')) {
    ctx.fillStyle = '#2A1F2D'
    const ex = anim.endsWith('.l') ? (o.flip ? 1 : -2) : -2
    ctx.fillRect(x + ex, y - 19, 1, 2)
    if (!anim.endsWith('.l')) ctx.fillRect(x + 1, y - 19, 1, 2)
  }
}

function buildHouse(look, night) {
  const parts = composeHouse(look, { night })
  let w = 0, h = 0
  for (const p of parts) {
    const s = spr(p.sprite)
    if (!s) continue
    w = Math.max(w, p.x + s.width)
    h = Math.max(h, p.y + s.height)
  }
  const cv = mkCanvas(w, h)
  const g = cv.getContext('2d')
  for (const p of parts) {
    const s = spr(p.sprite)
    if (s) g.drawImage(s, p.x, p.y)
  }
  return cv
}

export function wrapSay(text) {
  const s = String(text == null ? '' : text).trim()
  let rest = s.length > 60 ? s.slice(0, 57) + '...' : s
  const out = []
  while (rest && out.length < 2) {
    if (rest.length <= 30) { out.push(rest); rest = ''; break }
    let cut = rest.lastIndexOf(' ', 30)
    if (cut <= 0) cut = 30
    out.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) out[out.length - 1] = out[out.length - 1].slice(0, 27) + '...'
  return out
}

const sayCache = new Map()
function sayCv(lines) {
  const key = lines.join('|')
  let cv = sayCache.get(key)
  if (cv) return cv
  const rows = lines.map(l => textCv(l, '#2A1F2D', '#FFFFFF', '#FFFFFF', 30))
  const w = Math.max(...rows.map(r => r.width)) + 4
  const h = rows.length * 9 + 4
  cv = mkCanvas(w, h)
  const g = cv.getContext('2d')
  g.fillStyle = '#FFFFFF'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#2A1F2D'
  g.fillRect(1, 0, w - 2, 1)
  g.fillRect(1, h - 1, w - 2, 1)
  g.fillRect(0, 1, 1, h - 2)
  g.fillRect(w - 1, 1, 1, h - 2)
  rows.forEach((r, i) => g.drawImage(r, 2, 2 + i * 9))
  if (sayCache.size > 200) sayCache.clear()
  sayCache.set(key, cv)
  return cv
}

export function createTownScene({ engine, district = 0, layout = null, plots = [], players = [], me = {}, drawAvatar = null } = {}) {
  const tpl = layout || districtTemplate()
  const ground = tpl.ground
  const solid = new Uint8Array(W * H)
  const SPAWN = (() => { const t = spawnTile(tpl); return { x: t.x + 0.5, y: t.y + 0.5 } })()
  const doorAt = new Map()
  const footAt = new Map()
  const draw = drawAvatar || placeholderAvatar
  const houseCache = new Map()
  const weather = createWeather({ engine })

  let statics = []
  let flats = []
  let lamps = []
  let houses = []
  let hourSet = null
  let hour = 12
  let sky = skyAt(12)
  let lit = 0
  let clock = 0
  let hourT = 0
  let tapStamp = 0
  const bells = new Map()
  const others = new Map()
  const selfId = me && me.id

  const scene = {
    size: { w: W, h: H },
    district,
    onDoor: null,
    onPlayer: null,
    onLandmark: null,
    weather,
  }

  const key = (x, y) => y * W + x
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H
  const blockedTile = (x, y) => !inb(x, y) || !WALK.has(ground[y][x]) || solid[key(x, y)] === 1

  // ----- ground prerender -----
  const groundCv = mkCanvas(W * T, H * T)
  const water = []
  const gtile = id => {
    if (id === 10) return spr('tile.10.h')
    return spr(`tile.${id}`)
  }
  ;(function paintGround() {
    const g = groundCv.getContext('2d')
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = ground[y][x]
      let s
      if (id === 7) {
        const at = (dx, dy) => inb(x + dx, y + dy) && ground[y + dy][x + dx] === 6
        const side = at(1, 0) ? 'w' : at(-1, 0) ? 'e' : at(0, 1) ? 'n' : at(0, -1) ? 's' : 'n'
        s = spr(`tile.7.${side}`)
      } else if (id === 6) {
        s = spr('tile.6.0')
        water.push({ x, y })
      } else s = gtile(id)
      if (s) g.drawImage(s, x * T, y * T)
    }
  })()

  // ----- static scene objects -----
  function addStatic(o) {
    statics.push(o)
  }

  function sprObj(id, foot, extra = {}) {
    const s = spr(id)
    if (!s) return null
    const r = staticRect(foot, s.width, s.height)
    return { y: r.key, x0: r.x, x1: r.x + s.width, y0: r.y, y1: r.key, id, px: r.x + s.width / 2, py: r.key, ...extra }
  }

  function plaque(text, px, py, fg = '#2A1F2D', bg = '#F6DDB8') {
    const cv = textCv(text, fg, bg, '#2A1F2D')
    return (ctx, ox, oy) => ctx.drawImage(cv, Math.round(px - cv.width / 2 + ox), Math.round(py - cv.height + oy))
  }

  function buildStatics() {
    statics = []
    flats = []
    lamps = []
    houses = []
    solid.set(baseSolid(tpl))
    doorAt.clear()
    footAt.clear()
    const block = (x, y) => { if (inb(x, y)) solid[key(x, y)] = 1 }

    for (const d of tpl.decor) {
      const h = hash(d.x, d.y)
      let id
      let flat = false
      let foot = { x: d.x, y: d.y, w: 1, h: 1 }
      let extra = {}
      if (d.kind === 'tree') {
        const k = d.treeKind || TREES[h % TREES.length].slice(5)
        id = `tree.${k}.${(h >> 3) & 1}`
        extra = { anim: `tree.${k}`, animOff: h & 1 }
      } else if (d.kind === 'bush') id = `bush.${h % 3}`
      else if (d.kind === 'flower') { id = `flowers.${h % 3}`; flat = true }
      else if (d.kind === 'flowerbed') { id = 'flowerbed'; flat = true; foot = { x: d.x, y: d.y, w: 2, h: 1 } }
      else if (d.kind === 'fence') id = d.y === 0 || d.y === H - 1 ? 'fence.h' : 'fence.v'
      else if (d.kind === 'bench') { id = 'bench.h'; foot = { x: d.x, y: d.y, w: 2, h: 1 } }
      else if (d.kind === 'lamp') id = 'lamp.day'
      else continue
      const o = sprObj(id, foot, extra)
      if (!o) continue
      if (d.kind === 'lamp') {
        o.lamp = true
        lamps.push(o)
      }
      if (flat) flats.push(o)
      else addStatic(o)
    }

    for (const l of tpl.landmarks) {
      const o = sprObj(`landmark.${l.kind}`, l, { night: `landmark.${l.kind}.night`, kind: l.kind })
      const target = { type: 'landmark', kind: l.kind, door: l.door }
      doorAt.set(key(l.door.x, l.door.y), target)
      for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) footAt.set(key(x, y), target)
      if (o) {
        o.label = plaque(LABELS[l.kind] || l.kind, o.px, o.y0 + 13)
        addStatic(o)
      }
    }

    {
      const f = tpl.fountain
      const o = sprObj('fountain.0', f, { anim: 'fountain' })
      if (o) addStatic(o)
    }

    for (const r of tpl.real || []) {
      const cv = buildingCv(r.w * T, r.h * T)
      const bot = (r.y + r.h) * T, px = (r.x + r.w / 2) * T
      const o = {
        y: bot, x0: r.x * T, x1: (r.x + r.w) * T, y0: r.y * T, y1: bot, px, py: bot,
        paint: (ctx, ox, oy) => ctx.drawImage(cv, Math.round(r.x * T + ox), Math.round(r.y * T + oy)),
      }
      if (r.name) o.label = plaque(r.name, px, r.y * T - 2)
      addStatic(o)
    }

    const bySlot = new Map()
    for (const p of plots) if (p && p.owner && p.house) bySlot.set(p.slot, p)
    for (const pt of tpl.plots) {
      const rec = bySlot.get(pt.slot)
      if (!rec) {
        const sx = pt.x + 3, sy = pt.y + 2
        const o = sprObj('signpost', { x: sx, y: sy, w: 1, h: 1 })
        if (o) {
          o.label = plaque('FOR SALE', o.px, o.y0 - 2 + 0, '#FFFFFF', '#C0504D')
          addStatic(o)
          block(sx, sy)
        }
        continue
      }
      const look = rec.house
      const dt = doorTile(look.size)
      const lk = JSON.stringify([look.size, look.roof, look.wall, look.door])
      let hc = houseCache.get(lk)
      if (!hc) {
        hc = { day: buildHouse(look, false), night: buildHouse(look, true) }
        houseCache.set(lk, hc)
      }
      const cols = hc.day.width / T, rows = hc.day.height / T
      const sizeH = rows - HOUSE_ROOF_ROWS
      const x0 = pt.door.x - dt.x
      const bottom = pt.y + 4
      const top = bottom + 1 - rows
      const doorTileXY = { x: x0 + dt.x, y: bottom }
      for (let y = bottom + 1 - sizeH; y <= bottom; y++) for (let x = x0; x < x0 + cols; x++) {
        if (x === doorTileXY.x && y === doorTileXY.y) continue
        block(x, y)
      }
      const isDoor = (x, y) => (x === doorTileXY.x && y === doorTileXY.y) || (x === pt.door.x && y === pt.door.y)
      for (let y = pt.y; y < pt.y + pt.h; y++) for (let x = pt.x; x < pt.x + pt.w; x++) {
        if (isDoor(x, y)) continue
        block(x, y)
        if (x > pt.x && x < pt.x + pt.w - 1 && y > pt.y && y < pt.y + pt.h - 1) continue
        const f = sprObj(y === pt.y || y === pt.y + pt.h - 1 ? 'fence.h' : 'fence.v', { x, y, w: 1, h: 1 })
        if (f) addStatic(f)
      }
      const target = { type: 'house', owner: rec.owner.id, door: doorTileXY }
      doorAt.set(key(doorTileXY.x, doorTileXY.y), target)
      doorAt.set(key(pt.door.x, pt.door.y), { type: 'house', owner: rec.owner.id, door: pt.door })
      for (let y = bottom + 1 - sizeH; y <= bottom; y++) for (let x = x0; x < x0 + cols; x++) footAt.set(key(x, y), target)
      const o = {
        y: (bottom + 1) * T, x0: x0 * T, x1: (x0 + cols) * T, y0: top * T - 12, y1: (bottom + 1) * T,
        house: hc, hx: x0 * T, hy: top * T, cols, owner: rec.owner, door: doorTileXY, slot: pt.slot,
        chimney: cols >= 2 ? { x: x0 * T + cols * T - 22, y: top * T + 6 } : null,
        label: plaque((rec.house && rec.house.name) || rec.owner.name || '', (x0 + cols / 2) * T, top * T - 2),
      }
      houses.push(o)
      addStatic(o)
    }
    sortByY(statics)
  }

  // ----- sky / clock -----
  function liveHour() {
    const d = new Date()
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
  }

  function applyHour(h) {
    hour = ((h % 24) + 24) % 24
    sky = skyAt(hour)
    lit = clamp((sky.strength - 0.12) / 0.3)
  }

  scene.setHour = h => {
    hourSet = typeof h === 'number' && Number.isFinite(h) ? h : null
    applyHour(hourSet == null ? liveHour() : hourSet)
  }
  scene.getHour = () => hour
  scene.setWeather = k => weather.setKind(k)

  // ----- players -----
  function norm(p) {
    return {
      id: p.id, name: p.name || '', look: p.look || {},
      x: p.x, y: p.y, tx: p.x, ty: p.y, dir: p.dir || 'd', a: p.a || 'idle',
      st: p.st || 'idle', left: p.left || 0, m: p.m || 0, act: p.act || 'active', fed: !!p.fed,
      moving: false, emote: null,
    }
  }

  function setPlayers(list) {
    const seen = new Set()
    for (const p of list || []) {
      if (!p || p.id == null || p.id === selfId) continue
      seen.add(p.id)
      const cur = others.get(p.id)
      if (!cur) others.set(p.id, norm(p))
      else scene.updatePlayer(p.id, p)
    }
    for (const id of [...others.keys()]) if (!seen.has(id)) others.delete(id)
  }
  scene.setPlayers = setPlayers
  scene.addPlayer = p => { if (p && p.id != null && p.id !== selfId) others.set(p.id, norm(p)) }
  scene.removePlayer = id => { others.delete(id) }
  scene.updatePlayer = (id, patch) => {
    const p = others.get(id)
    if (!p || !patch) return
    for (const k of ['name', 'look', 'dir', 'a', 'st', 'left', 'm', 'act', 'fed']) if (patch[k] !== undefined) p[k] = patch[k]
    if (typeof patch.x === 'number') p.tx = patch.x
    if (typeof patch.y === 'number') p.ty = patch.y
  }
  scene.emote = (id, k, ms = 2600) => {
    const p = id === selfId ? mine : others.get(id)
    if (p) p.emote = { k, until: clock + ms / 1000 }
  }
  scene.say = (id, text) => {
    const p = id === selfId ? mine : others.get(id)
    if (!p) return
    const lines = wrapSay(text)
    p.say = lines.length ? { lines, until: clock + 5 } : null
  }
  scene.knock = (ownerId, ms = 2500) => { bells.set(ownerId, clock + ms / 1000) }
  scene.setPlots = list => {
    plots = list || []
    buildStatics()
    rebuildGrid()
  }

  // ----- local player -----
  let grid = []
  function rebuildGrid() {
    grid = []
    for (let y = 0; y < H; y++) {
      const row = []
      for (let x = 0; x < W; x++) row.push(blockedTile(x, y) ? 6 : ground[y][x])
      grid.push(row)
    }
  }

  buildStatics()
  rebuildGrid()

  const mine = {
    id: selfId, name: me.name || '', look: me.look || {}, st: me.st || 'idle', act: me.act || 'active',
    left: me.left || 0, m: me.m || 0, fed: !!me.fed, emote: null, a: 'idle.d', moving: false,
  }
  const ctl = moveController({
    speed: 4,
    x: typeof me.x === 'number' ? me.x : SPAWN.x,
    y: typeof me.y === 'number' ? me.y : SPAWN.y,
    canMove: (nx, ny) => {
      for (const [dx, dy] of [[-0.3, 0], [0.3, 0], [-0.3, -0.25], [0.3, -0.25]]) {
        if (blockedTile(Math.floor(nx + dx), Math.floor(ny + dy))) return false
      }
      return true
    },
  })
  scene.me = mine
  scene.controller = ctl
  scene.player = () => ({ x: ctl.x, y: ctl.y, dir: ctl.facing, moving: ctl.isMoving, a: mine.a })
  scene.setMe = patch => {
    for (const k of ['name', 'look', 'st', 'act', 'left', 'm', 'fed']) if (patch && patch[k] !== undefined) mine[k] = patch[k]
  }

  let lastTile = key(Math.floor(ctl.x), Math.floor(ctl.y))

  function fire(target) {
    if (!target) return
    if (target.type === 'house') { if (scene.onDoor) scene.onDoor(target.owner) }
    else if (target.type === 'landmark') { if (scene.onLandmark) scene.onLandmark(target.kind) }
  }

  function onTap(tx, ty, p) {
    tapStamp = clock
    let best = null, bd = 100
    for (const o of others.values()) {
      const dx = p.px - o.x * T, dy = p.py - (o.y * T - 10)
      const d = dx * dx + dy * dy
      if (Math.abs(dx) < 9 && Math.abs(dy) < 14 && d < bd) { bd = d; best = o }
    }
    if (best) { if (scene.onPlayer) scene.onPlayer(best.id); return }
    if (!inb(tx, ty)) return
    const foot = footAt.get(key(tx, ty)) || doorAt.get(key(tx, ty))
    const from = { x: Math.floor(ctl.x), y: Math.floor(ctl.y) }
    if (foot) {
      if (from.x === foot.door.x && from.y === foot.door.y) { fire(foot); return }
      const path = astar(grid, W, H, from, foot.door)
      if (path) ctl.setPath(path)
      return
    }
    const path = astar(grid, W, H, from, { x: tx, y: ty })
    if (path) ctl.setPath(path)
  }
  if (engine && engine.onTap) engine.onTap(onTap)

  // ----- update -----
  scene.update = dt => {
    clock += dt
    const dir = engine && engine.input ? engine.input.dir() : null
    ctl.update(dt, dir)
    const k = key(Math.floor(ctl.x), Math.floor(ctl.y))
    if (k !== lastTile) {
      lastTile = k
      fire(doorAt.get(k))
    }
    const f = ctl.facing
    mine.moving = ctl.isMoving
    mine.dir = f
    mine.a = ctl.isMoving ? `walk.${f === 'r' ? 'l' : f}` : 'idle.d'
    const lerp = Math.min(1, dt * 10)
    for (const o of others.values()) {
      const dx = o.tx - o.x, dy = o.ty - o.y
      o.moving = Math.abs(dx) + Math.abs(dy) > 0.03
      if (Math.abs(dx) + Math.abs(dy) > 8) { o.x = o.tx; o.y = o.ty } else { o.x += dx * lerp; o.y += dy * lerp }
      if (o.emote && o.emote.until < clock) o.emote = null
      if (o.say && o.say.until < clock) o.say = null
    }
    if (mine.emote && mine.emote.until < clock) mine.emote = null
    if (mine.say && mine.say.until < clock) mine.say = null
    hourT += dt
    if (hourSet == null && hourT > 1) {
      hourT = 0
      applyHour(liveHour())
    }
  }

  // ----- ambient life -----
  const flowers = tpl.decor.filter(d => d.kind === 'flower').slice(0, 5)
  const POND = { x: 2 * T, w: 3 * T, y0: 13 * T, y1: 28 * T }

  function anim(id, t, off = 0) {
    const a = getAnim(id)
    if (!a) return null
    return spr(a.frames[(Math.floor(t * a.fps) + off) % a.frames.length])
  }

  function ambientDyn(t, out) {
    const night = lit > 0.5
    for (let i = 0; i < 2; i++) {
      const ph = i * 3.1
      const sx = Math.sin(t * 0.35 + ph), sy = Math.sin(t * 0.17 + ph * 2)
      const px = POND.x + POND.w / 2 + sx * 8
      let py = (i === 0 ? 16.5 + sy * 2.2 : 25.5 + sy * 1.5) * T
      if (py > 19.5 * T && py < 23.5 * T) py = 19.5 * T
      const right = Math.cos(t * 0.35 + ph) > 0
      const id = `duck.swim.${right ? 'r' : 'l'}.${Math.floor(t * 2 + i) % 2}`
      const s = spr(id)
      if (s) out.push({ y: py, ambient: true, draw: (ctx, ox, oy) => ctx.drawImage(s, Math.round(px - s.width / 2 + ox), Math.round(py - s.height + oy)) })
    }
    const P = 24
    const c = t % P
    const A = 34 * T, B = 31 * T, cy = 25.5 * T
    let cx = A, id = 'cat.sit', flip = false
    if (c >= 8 && c < 12) { cx = A + (B - A) * ((c - 8) / 4); id = anim('cat.walk.l', t) ? null : 'cat.sit' }
    else if (c >= 12 && c < 20) { cx = B; id = 'cat.sleep.' + (Math.floor(t * 1) % 2) }
    else if (c >= 20) { cx = B + (A - B) * ((c - 20) / 4); flip = true; id = null }
    let s
    if (id === null) s = anim('cat.walk.l', t)
    else s = spr(night && id === 'cat.sit' ? 'cat.sleep.0' : id)
    if (s) out.push({ y: cy, ambient: true, draw: (ctx, ox, oy) => drawFlip(ctx, s, cx + ox, cy + oy, flip) })
  }

  function drawFlip(ctx, s, x, y, flip) {
    const px = Math.round(x - s.width / 2), py = Math.round(y - s.height)
    if (!flip) { ctx.drawImage(s, px, py); return }
    ctx.save()
    ctx.translate(px + s.width, py)
    ctx.scale(-1, 1)
    ctx.drawImage(s, 0, 0)
    ctx.restore()
  }

  function ambientSky(ctx, ox, oy, t) {
    for (let i = 0; i < 3; i++) {
      const sp = 14 + i * 5
      const span = W * T + 240
      const x = ((i * 301 + t * sp) % span) - 120
      const y = 60 + i * 150 + Math.sin(t * 1.3 + i) * 6
      const s = anim('bird', t, i)
      if (s) ctx.drawImage(s, Math.round(x + ox), Math.round(y + oy))
    }
    for (let i = 0; i < flowers.length; i++) {
      const f = flowers[i]
      const x = (f.x + 0.5) * T + Math.sin(t * 0.8 + i * 2) * 14
      const y = (f.y + 0.5) * T - 8 + Math.cos(t * 1.1 + i) * 6
      const s = anim('butterfly', t * 1.6, i)
      if (s) ctx.drawImage(s, Math.round(x + ox - 4), Math.round(y + oy - 4))
    }
  }

  // ----- draw -----
  function drawHouse(ctx, h, ox, oy, S) {
    const x = Math.round(h.hx + ox), y = Math.round(h.hy + oy)
    ctx.drawImage(h.house.day, x, y)
    if (S.lit > 0.02) {
      ctx.globalAlpha = S.lit
      ctx.drawImage(h.house.night, x, y)
      ctx.globalAlpha = 1
    }
    if (h.chimney && !S.red) {
      const s = anim('smoke', S.t, h.slot)
      if (s) ctx.drawImage(s, Math.round(h.chimney.x + ox - 4), Math.round(h.chimney.y + oy - 10))
    }
    const rung = (bells.get(h.owner.id) || 0) > clock
    const b = spr(rung ? 'bell.ring' : 'bell')
    if (b) ctx.drawImage(b, Math.round(h.door.x * T + 4 + ox), Math.round(h.door.y * T - 6 + oy))
    h.label(ctx, ox, oy)
  }

  function drawStatic(ctx, o, ox, oy, S) {
    if (o.house) { drawHouse(ctx, o, ox, oy, S); return }
    if (o.paint) { o.paint(ctx, ox, oy); if (o.label) o.label(ctx, ox, oy); return }
    let id = o.id
    if (o.lamp) id = S.lit > 0.5 ? 'lamp.night' : 'lamp.day'
    if (o.anim) {
      const a = getAnim(o.anim)
      if (a) id = a.frames[S.red ? 0 : (Math.floor(S.t * a.fps) + (o.animOff || 0)) % a.frames.length]
    }
    const s = spr(id)
    if (!s) return
    const x = Math.round(o.px - s.width / 2 + ox), y = Math.round(o.py - s.height + oy)
    ctx.drawImage(s, x, y)
    if (o.night && S.lit > 0.02) {
      const n = spr(o.night)
      if (n) {
        ctx.globalAlpha = S.lit
        ctx.drawImage(n, x, y)
        ctx.globalAlpha = 1
      }
    }
    if (o.label) o.label(ctx, ox, oy)
  }

  function drawPlayer(ctx, p, ox, oy, S) {
    const x = Math.round(p.x * T + ox), y = Math.round(p.y * T + oy)
    const sh = spr('shadow')
    if (sh) ctx.drawImage(sh, Math.round(x - sh.width / 2), Math.round(y - sh.height / 2))
    if (p.st === 'focus') ctx.drawImage(actRing(ACT_COLOR[p.act] || ACT_COLOR.active), x - 11, y - 5)
    const dir = p.dir === 'r' ? 'l' : p.dir
    const anim = p.moving ? `walk.${dir}` : 'idle.d'
    draw(ctx, p.look, anim, S.t, x, y, { flip: p.dir === 'r', dir: p.dir, moving: p.moving })
  }

  function drawTags(ctx, p, ox, oy, S) {
    const x = Math.round(p.x * T + ox), y = Math.round(p.y * T + oy)
    let top = y - 26
    if (p.name) {
      const cv = textCv(p.name, '#FFFFFF', '#2A1F2D', '#2A1F2D')
      ctx.drawImage(cv, Math.round(x - cv.width / 2), top - cv.height)
      top -= cv.height + 1
    }
    if (p.say) {
      const b = sayCv(p.say.lines)
      ctx.drawImage(b, Math.round(x - b.width / 2), top - b.height - 1)
      top -= b.height + 1
    }
    if (p.st === 'focus') {
      const frac = p.m > 0 ? clamp(1 - p.left / (p.m * 60)) : 1
      const r = spr(`ring.${Math.round(frac * 8)}`)
      if (r) ctx.drawImage(r, x - 12, y - 22)
    }
    if (p.fed) {
      const f = spr('fx.fed')
      if (f) ctx.drawImage(f, x + 5, top - 6)
    }
    if (p.emote) {
      const s = anim(`bubble.${p.emote.k}`, S.t)
      if (s) ctx.drawImage(s, Math.round(x - s.width / 2), top - s.height - 1)
    }
  }

  scene.draw = (ctx, cam, t) => {
    const S = { t, lit, red: !!(engine && engine.reduced) }
    const ox = -cam.x, oy = -cam.y
    ctx.imageSmoothingEnabled = false

    ctx.fillStyle = OFFMAP
    ctx.fillRect(0, 0, cam.w, cam.h)

    ctx.drawImage(groundCv, ox, oy)
    if (!S.red && water.length) {
      const a = getAnim('water')
      if (a) {
        const s = spr(a.frames[Math.floor(t * a.fps) % a.frames.length])
        if (s) {
          for (const w of water) {
            const x = w.x * T + ox, y = w.y * T + oy
            if (x > -T && y > -T && x < cam.w && y < cam.h) ctx.drawImage(s, x, y)
          }
        }
      }
    }

    for (const l of tpl.lilies) {
      const x = l.x * T + ox, y = l.y * T + oy
      if (x < -T || y < -T || x > cam.w || y > cam.h) continue
      const s = spr(`lilypad.${(l.x + l.y + (S.red ? 0 : Math.floor(t * 0.6))) & 1}`)
      if (s) ctx.drawImage(s, Math.round(x), Math.round(y))
    }
    const br = spr('bridge.stone')
    if (br) ctx.drawImage(br, Math.round(24 + ox), Math.round(23 * T - br.height + oy))
    for (const o of flats) {
      if (o.x1 + ox > 0 && o.x0 + ox < cam.w && o.y1 + oy > 0 && o.y0 + oy < cam.h) drawStatic(ctx, o, ox, oy, S)
    }

    const list = []
    for (const o of statics) {
      if (o.x1 + ox > 0 && o.x0 + ox < cam.w && o.y1 + oy > 0 && o.y0 + oy < cam.h + 24) list.push(o)
    }
    const dyn = []
    for (const p of others.values()) dyn.push(p)
    dyn.push(mine)
    mine.x = ctl.x
    mine.y = ctl.y
    mine.dir = ctl.facing
    mine.moving = ctl.isMoving
    const shown = []
    for (const p of dyn) {
      const px = p.x * T + ox, py = p.y * T + oy
      if (px < -20 || px > cam.w + 20 || py < -12 || py > cam.h + 40) continue
      shown.push(p)
      list.push({ y: p.y * T, player: p })
    }
    if (!S.red) ambientDyn(t, list)
    sortByY(list)
    for (const o of list) {
      if (o.player) drawPlayer(ctx, o.player, ox, oy, S)
      else if (o.ambient) o.draw(ctx, ox, oy)
      else drawStatic(ctx, o, ox, oy, S)
    }
    if (!S.red) ambientSky(ctx, ox, oy, t)

    if (sky.strength > 0.001) {
      ctx.globalCompositeOperation = 'multiply'
      ctx.globalAlpha = sky.strength
      ctx.fillStyle = sky.tint
      ctx.fillRect(0, 0, cam.w, cam.h)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    if (lit > 0.05) {
      const g = glow()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = lit * 0.55
      for (const l of lamps) {
        const x = l.px + ox, y = l.py + oy
        if (x > -24 && x < cam.w + 24 && y > -10 && y < cam.h + 40) ctx.drawImage(g, Math.round(x - 24), Math.round(y - 40))
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    weather.draw(ctx, cam, t)

    for (const p of shown) drawTags(ctx, p, ox, oy, S)
  }

  scene.setPlayers(players)
  scene.setHour(null)
  if (engine && engine.camera) {
    engine.camera.follow({ get x() { return ctl.x * T }, get y() { return ctl.y * T - 6 } })
  }

  scene.destroy = () => {
    if (engine && engine.onTap) engine.onTap(null)
    if (engine && engine.camera) engine.camera.follow(null)
  }

  return scene
}

export { textCv as _textCanvas }
