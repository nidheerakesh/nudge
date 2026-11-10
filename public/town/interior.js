import { TILE, drawSprite, moveController } from './engine.js'
import { astar } from './path.js'
import { has, getSprite, getAnim, decode } from './art/pixel.js'
import { makeInterp } from './net.js'
import body from './art/body.js'
import outA from './art/outfits_a.js'
import outB from './art/outfits_b.js'
import interiors from './art/interiors.js'

export const SIZES = { 'house:hut': [6, 5], 'house:small': [8, 6], 'house:medium': [10, 7], 'house:large': [12, 8], 'house:manor': [14, 9] }
export const MAX_ITEMS = 40

const FURN = interiors.meta.furniture
const OUTFITS = { ...outA.meta.outfits, ...outB.meta.outfits }
const FLAT = new Set(['rug', 'chair', 'cushion', 'books', 'catplush', 'petbed'])
const POSES = new Set(['sit_study', 'break', 'cheer', 'knock'])
const nm = id => String(id || '').split(':')[1] || ''

export const furnInfo = id => {
  const n = nm(id)
  const m = FURN[n]
  return id && String(id).startsWith('furn:') && m ? { name: n, w: m.w, h: m.h, wall: m.wall, flat: FLAT.has(n) } : null
}

export function isNight(d = new Date()) {
  const h = d.getHours()
  return h < 6 || h >= 19
}

const avCache = new Map()
function pick(id, o) {
  return has(id) ? getSprite(id, o) : null
}

function legs(id, bottom, o) {
  const spr = body.sprites[id]
  if (!spr) return null
  const cut = { pants: 99, shorts: 21, skirt: 22 }[bottom] || 0
  const rows = spr.rows.map((r, i) => (i >= 18 && i >= cut ? r.replaceAll('L', '2') : r))
  return decode({ w: spr.w, h: spr.h, rows }, o, id)
}

function frameOf(a, dir, t, still) {
  const d = dir === 'r' ? 'l' : dir
  const pick1 = (A, rate) => A.frames[still ? 0 : Math.floor(t * rate) % A.frames.length]
  if (POSES.has(a)) {
    const A = getAnim(a)
    if (!A) return null
    const pd = a === 'knock' ? 'u' : 'd'
    return { fr: pick1(A, A.fps), d: pd, flip: false }
  }
  if (a === 'walk') {
    const A = getAnim('walk.' + d)
    return A ? { fr: pick1(A, A.fps), d, flip: dir === 'r' } : null
  }
  if (d === 'd') {
    const A = getAnim('idle.d')
    return A ? { fr: pick1(A, A.fps), d, flip: false } : null
  }
  const A = getAnim('walk.' + d)
  return A ? { fr: A.frames[0], d, flip: dir === 'r' } : null
}

// Composes one 16x24 avatar cell. Cached by look, direction, pose and frame.
export function avatarCell(look, dir, a, t, still) {
  const f = frameOf(a, dir, t, still)
  if (!f) return null
  const l = look || {}
  const key = [l.skin, l.hair, l.hair_color, l.outfit, l.accessory, f.d, f.flip, f.fr.body, f.fr.hx, f.fr.hy, f.fr.tx, f.fr.ty, f.fr.prop && f.fr.prop.id + f.fr.prop.x].join('|')
  let cv = avCache.get(key)
  if (cv) return cv
  cv = document.createElement('canvas')
  cv.width = 16
  cv.height = 24
  const ctx = cv.getContext('2d')
  const of = OUTFITS[nm(l.outfit)] || OUTFITS.casual
  const o = { skin: (l.skin || 1) - 1, hair: (l.hair_color || 1) - 1, colors: of ? of.c : undefined, flip: f.flip }
  const hx = f.fr.hx || 0, hy = f.fr.hy || 0, tx = f.fr.tx || 0, ty = f.fr.ty || 0
  const put = (c, x, y) => { if (c) ctx.drawImage(c, x, y) }
  const hs = 'hair.' + (l.hair || 1) + '.' + f.d
  put(pick('shadow', o), 2, 21)
  put(pick(hs + '.back', o), hx, hy)
  put(legs(f.fr.body, of ? of.bottom : 'pants', o), 0, 0)
  if (of && ['skirt', 'dress', 'robe'].includes(of.bottom)) put(pick(of.top.replace('.top', '.bottom') + '.' + f.d, o), 0, 14)
  put(pick('head.' + f.d, o), 2 + hx, 3 + hy)
  if (of) put(pick(of.top + '.' + f.d, o), tx, 13 + ty)
  put(pick(hs + '.front', o), hx, hy)
  if (l.accessory) put(pick('acc.' + nm(l.accessory) + '.' + f.d, o), hx, hy)
  if (f.fr.prop) put(pick(f.fr.prop.id, o), f.flip ? 16 - 8 - f.fr.prop.x : f.fr.prop.x, f.fr.prop.y)
  avCache.set(key, cv)
  return cv
}

function tag(ctx, text, x, y) {
  if (!text) return
  ctx.font = '7px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const w = Math.ceil(ctx.measureText(text).width) + 4
  ctx.fillStyle = 'rgba(42,31,45,0.75)'
  ctx.fillRect(Math.round(x - w / 2), Math.round(y - 8), w, 9)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, Math.round(x), Math.round(y - 1))
}

export function createInteriorScene({ engine, house, items, members, me, onExit } = {}) {
  const hs = house || {}
  const [W, H] = SIZES[hs.size] || SIZES['house:hut']
  const doorX = Math.floor(W / 2)
  const norm = it => ({ item_id: it.item_id || it.item, x: it.x | 0, y: it.y | 0, flip: it.flip ? 1 : 0 })
  let list = (items || []).filter(it => furnInfo(it.item_id || it.item)).map(norm)
  let editing = false
  let sit = null
  let wait = false
  let noSit = null
  let clock = 0
  let grid = null
  const interp = makeInterp()
  let others = new Map()

  const mine = { look: (me && me.look) || {}, name: (me && me.name) || '', a: 'idle' }
  const scene = { size: { w: W, h: H }, fit: true, bg: '#4A2F2A', night: isNight(), onCell: null, onSit: null, onExit: onExit || null }
  const still = () => !!(engine && engine.reduced)

  const info = it => furnInfo(it.item_id)
  function fits(itemId, x, y) {
    const m = furnInfo(itemId)
    return m && x >= 0 && y >= (m.wall ? 0 : 1) && x + m.w <= W && (m.wall ? y === 0 : y + m.h <= H)
  }
  function covers(it, x, y) {
    const m = info(it)
    return x >= it.x && x < it.x + m.w && y >= it.y && y < it.y + (m.wall ? 1 : m.h)
  }
  const itemAt = (x, y, pred) => list.findIndex(it => covers(it, x, y) && (!pred || pred(info(it))))
  const blockedAt = (x, y) => itemAt(x, y, m => !m.wall && !m.flat) >= 0
  function rebuild() {
    grid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || blockedAt(x, y) ? 1 : 0)))
  }
  rebuild()

  function canMove(nx, ny) {
    if (nx < 0.3 || nx > W - 0.3 || ny < 1.05 || ny > H - 0.02) return false
    return !blockedAt(Math.floor(nx), Math.floor(ny))
  }
  const mc = moveController({ speed: 3.5, x: doorX + 0.5, y: H - 1.5, canMove })
  scene.player = mc

  function deskFor(cx, cy) {
    for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
      const i = itemAt(cx + dx, cy + dy, m => m.name === 'desk')
      if (i >= 0) return i
    }
    return -1
  }
  function chairFor(di) {
    const d = list[di]
    const m = info(d)
    let best = null
    for (let x = d.x - 1; x <= d.x + m.w; x++) for (let y = d.y - 1; y <= d.y + m.h; y++) {
      const edge = (x >= d.x && x < d.x + m.w) !== (y >= d.y && y < d.y + m.h)
      if (!edge || x < 0 || y < 1 || x >= W || y >= H) continue
      if (itemAt(x, y, c => c.name === 'chair') < 0) continue
      if (!best || (y === d.y - 1)) best = { x, y }
    }
    return best
  }
  function stand() {
    if (!sit) return
    noSit = sit.cx + ':' + sit.cy
    sit = null
    mine.a = 'idle'
  }
  function sitAt(cx, cy) {
    const di = deskFor(cx, cy)
    if (di < 0) return false
    sit = { cx, cy, desk: di }
    mc.x = cx + 0.5
    mc.y = cy + 0.5
    mc.facing = 'd'
    mc.cancel()
    wait = engine && engine.input ? !!(engine.input.dir().x || engine.input.dir().y) : false
    mine.a = 'sit_study'
    if (scene.onSit) scene.onSit(true)
    return true
  }
  scene.sitting = () => !!sit

  scene.update = dt => {
    clock += dt * 1000
    if (editing) return
    const d = engine && engine.input ? engine.input.dir() : { x: 0, y: 0 }
    const moving = !!(d.x || d.y)
    if (sit) {
      if (!moving) wait = false
      if (moving && !wait) { stand(); if (scene.onSit) scene.onSit(false) } else return
    }
    mc.update(dt, d)
    mine.a = mc.isMoving ? 'walk' : 'idle'
    const tx = Math.floor(mc.x), ty = Math.floor(mc.y)
    if (noSit && noSit !== tx + ':' + ty) noSit = null
    if (!sit && !noSit && itemAt(tx, ty, m => m.name === 'chair') >= 0) sitAt(tx, ty)
    if (!sit && tx === doorX && ty === H - 1 && scene.onExit) scene.onExit()
  }

  scene.setMembers = ps => {
    others = new Map()
    interp.clear()
    for (const p of ps || []) scene.member(p)
  }
  scene.member = p => {
    if (!p || p.id == null) return
    const e = others.get(p.id) || {}
    others.set(p.id, { ...e, ...p })
    interp.push(p.id, p.x, p.y, clock)
  }
  scene.drop = id => { others.delete(id); interp.remove(id) }
  scene.setMembers(members)

  scene.onTap = (x, y) => {
    if (editing) { if (scene.onCell) scene.onCell(x, y); return }
    if (x < 0 || y < 0 || x >= W || y >= H) return
    let to = { x, y }
    const di = itemAt(x, y, m => m.name === 'desk')
    if (di >= 0) {
      const c = chairFor(di)
      if (!c) return
      to = c
    }
    if (sit) { stand(); if (scene.onSit) scene.onSit(false) }
    const from = { x: Math.floor(mc.x), y: Math.floor(mc.y) }
    if (to.x === from.x && to.y === from.y) { if (di >= 0) sitAt(to.x, to.y); return }
    noSit = null
    const p = astar(grid, W, H, from, to, v => v === 0)
    if (p && p.length) mc.setPath(p.slice(1))
  }
  if (engine && engine.onTap) engine.onTap((x, y) => scene.onTap(x, y))
  if (engine && engine.camera && engine.camera.follow) {
    engine.camera.follow({ get x() { return mc.x * TILE }, get y() { return mc.y * TILE - 12 } })
  }

  // ---- edit mode ----
  scene.editMode = on => {
    editing = !!on
    if (editing) { stand(); mc.cancel(); mine.a = 'idle' }
    return editing
  }
  scene.items = () => list.map(it => ({ ...it }))
  scene.canPlace = (itemId, x, y, skip = -1) => {
    const m = furnInfo(itemId)
    if (!m) return { ok: false, why: 'item' }
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, why: 'bounds' }
    if (!fits(itemId, x, y)) return { ok: false, why: 'bounds' }
    if (list.length - (skip >= 0 ? 1 : 0) >= MAX_ITEMS) return { ok: false, why: 'max' }
    const hh = m.wall ? 1 : m.h
    for (let i = 0; i < list.length; i++) {
      if (i === skip) continue
      const o = list[i]
      const om = info(o)
      if (om.wall !== m.wall) continue
      const oh = om.wall ? 1 : om.h
      if (x < o.x + om.w && o.x < x + m.w && y < o.y + oh && o.y < y + hh) return { ok: false, why: 'overlap' }
    }
    if (!m.wall) {
      for (const [dx, dy] of [[doorX, H - 1], [doorX, H - 2]]) {
        if (dx >= x && dx < x + m.w && dy >= y && dy < y + m.h) return { ok: false, why: 'door' }
      }
    }
    return { ok: true }
  }
  scene.place = (itemId, x, y, flip) => {
    if (!editing) return { ok: false, why: 'mode' }
    const sx = Math.round(x), sy = Math.round(y)
    const r = scene.canPlace(itemId, sx, sy)
    if (!r.ok) return r
    list.push({ item_id: itemId, x: sx, y: sy, flip: flip ? 1 : 0 })
    rebuild()
    return { ok: true, index: list.length - 1 }
  }
  scene.remove = index => {
    if (!editing || !Number.isInteger(index) || index < 0 || index >= list.length) return null
    const [it] = list.splice(index, 1)
    rebuild()
    return { ...it }
  }
  scene.at = (x, y) => itemAt(x, y)

  // ---- drawing ----
  function tileSpr(id) { return pick(id, {}) }
  const floorId = 'floor.' + (nm(hs.floor) || 'wood')
  const wallId = 'wallpaper.' + (nm(hs.wallpaper) || 'cream')

  function glow(ctx, x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,214,120,' + a + ')')
    g.addColorStop(1, 'rgba(255,214,120,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  function spriteId(it, m, t) {
    const base = 'furn.' + m.name
    if (m.name === 'lamp' && scene.night) return 'furn.lamp.lit'
    if (m.name === 'petbed' && list.some(o => o.item_id === 'furn:catplush')) return 'furn.petbed.cat'
    if (m.name === 'desk' && sit && list[sit.desk] === it) return 'furn.desk.study'
    const A = getAnim(m.name)
    if (A && A.frames.length) return A.frames[still() ? 0 : Math.floor(t * A.fps) % A.frames.length]
    return base
  }

  scene.draw = (ctx, cam, t) => {
    ctx.save()
    ctx.translate(-cam.x, -cam.y)
    const fl = tileSpr(floorId), wl = tileSpr(wallId), tr = tileSpr('wall.trim')
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (fl) ctx.drawImage(fl, x * TILE, y * TILE)
    for (let x = 0; x < W; x++) {
      if (wl) ctx.drawImage(wl, x * TILE, 0)
      if (tr) ctx.drawImage(tr, x * TILE, 0)
    }
    const cl = tileSpr('wall.corner.l'), cr = tileSpr('wall.corner.r')
    if (cl) ctx.drawImage(cl, 0, 0)
    if (cr) ctx.drawImage(cr, (W - 1) * TILE, 0)
    // door mat
    ctx.fillStyle = '#4A2F2A'
    ctx.fillRect(doorX * TILE, (H - 1) * TILE, TILE, TILE)
    ctx.fillStyle = '#B26F45'
    ctx.fillRect(doorX * TILE + 2, (H - 1) * TILE + 2, TILE - 4, TILE - 4)
    ctx.fillStyle = '#F6DDB8'
    for (let i = 0; i < 4; i++) ctx.fillRect(doorX * TILE + 4 + i, (H - 1) * TILE + 5 + i, 8 - i * 2, 1)
    // window light by day
    if (!scene.night) {
      ctx.fillStyle = 'rgba(255,244,200,0.2)'
      for (const it of list) {
        const m = info(it)
        if (m.name !== 'window') continue
        const x0 = it.x * TILE
        ctx.beginPath()
        ctx.moveTo(x0 + 2, TILE)
        ctx.lineTo(x0 + TILE - 2, TILE)
        ctx.lineTo(x0 + TILE + 22, TILE * 4)
        ctx.lineTo(x0 + 18, TILE * 4)
        ctx.closePath()
        ctx.fill()
      }
    }
    // furniture and avatars sorted by feet y
    const draws = []
    list.forEach(it => {
      const m = info(it)
      const sid = spriteId(it, m, t)
      const cv = pick(sid, {})
      if (!cv) return
      if (m.wall) draws.push({ y: 0, fn: () => drawSprite(ctx, cv, (it.x + m.w / 2) * TILE, cv.height, { flip: !!it.flip }) })
      else draws.push({ y: m.name === 'rug' ? -1 : (it.y + m.h) * TILE, fn: () => drawSprite(ctx, cv, (it.x + m.w / 2) * TILE, (it.y + m.h) * TILE, { flip: !!it.flip }) })
    })
    const av = (look, name, x, y, dir, a, oy, key) => {
      const cv = avatarCell(look, dir, a, t, still())
      draws.push({ y: key == null ? y * TILE : key, fn: () => {
        drawSprite(ctx, cv, x * TILE, y * TILE + (oy || 0))
        tag(ctx, name, x * TILE, y * TILE + (oy || 0) - 25)
      } })
    }
    for (const [id, p] of others) {
      const q = interp.get(id, clock) || { x: p.x, y: p.y }
      av(p.look, p.name, q.x, q.y, p.dir || 'd', p.a === 'walk' ? 'walk' : p.a, 0)
    }
    if (sit) av(mine.look, mine.name, sit.cx + 0.5, sit.cy + 1, 'd', 'sit_study', 0, (sit.cy + 1) * TILE + 1)
    else av(mine.look, mine.name, mc.x, mc.y, mc.facing, mine.a, 0)
    draws.sort((a, b) => a.y - b.y)
    for (const d of draws) d.fn()
    if (scene.night) {
      ctx.fillStyle = 'rgba(26,35,82,0.32)'
      ctx.fillRect(0, 0, W * TILE, H * TILE)
      for (const it of list) {
        const m = info(it)
        if (m.name === 'lamp') glow(ctx, (it.x + 0.5) * TILE, (it.y + 0.5) * TILE, 36, 0.5)
        else if (m.name === 'candle') glow(ctx, (it.x + 0.5) * TILE, (it.y + 0.6) * TILE, 20, 0.45)
        else if (m.name === 'stringlights') glow(ctx, (it.x + 1) * TILE, TILE, 30, 0.35)
      }
    }
    if (editing) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= W; x++) { ctx.moveTo(x * TILE + 0.5, TILE); ctx.lineTo(x * TILE + 0.5, H * TILE) }
      for (let y = 1; y <= H; y++) { ctx.moveTo(0, y * TILE + 0.5); ctx.lineTo(W * TILE, y * TILE + 0.5) }
      ctx.stroke()
    }
    ctx.restore()
  }

  scene.destroy = () => {
    if (engine && engine.onTap) engine.onTap(null)
  }
  return scene
}

