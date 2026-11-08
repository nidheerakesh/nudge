import { TILE, drawSprite, moveController } from './engine.js'
import { astar } from './path.js'
import { has, getSprite, getAnim } from './art/pixel.js'
import { makeInterp } from './net.js'
import { avatarCell } from './interior.js'

const NPC = { boutique: 'boutique', homestore: 'home', bakery: 'bakery' }
const NAMES = { boutique: 'Boutique', homestore: 'Home Store', bakery: 'Bakery' }
const EMOTE_TXT = { cheer: '!', heart: '<3', wave: 'hi', zzz: 'zzz', think: '...', ok: 'ok' }
const RING = { active: '#2e9d57', idle: '#e0a030', away: '#8b8f93' }

// ---- shared helpers (also used by hall.js) ----
export const spriteOf = id => (has(id) ? getSprite(id, {}) : null)

export async function loadPanel(names, fn) {
  for (const n of names) {
    try {
      const m = await import('./ui/' + n + '.js')
      if (typeof m[fn] === 'function') return m[fn]
    } catch (e) { /* panel module not merged yet */ }
  }
  return null
}

export function layer() {
  return document.getElementById('layer') || document.body
}

export function bar(ui, kids) {
  const el = ui.h('div', { style: { position: 'fixed', left: '0', right: '0', bottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', zIndex: '20', pointerEvents: 'none' } }, kids.filter(Boolean))
  for (const c of el.children) c.style.pointerEvents = 'auto'
  return el
}

export function btn(ui, label, onclick, cls) {
  return ui.h('button', { class: 'btn ' + (cls || ''), type: 'button', 'aria-label': label, style: { minHeight: '44px', minWidth: '44px' }, onclick }, label)
}

// Generic walkable tile room. cfg: { engine, W, H, bg, blocked:Set('x:y'), props:[{id,x,y}], seats:Map, door:[x0,x1], me, minY, extra }
export function createRoom(cfg) {
  const { engine, W, H } = cfg
  const blocked = cfg.blocked || new Set()
  const seats = cfg.seats || new Map()
  const minY = cfg.minY || 1
  const door = cfg.door || [Math.floor(W / 2) - 1, Math.floor(W / 2)]
  const interp = makeInterp()
  const others = new Map()
  const emotes = new Map()
  const grid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y < minY || blocked.has(x + ':' + y) ? 1 : 0)))
  const still = () => !!(engine && engine.reduced)
  const mine = { look: (cfg.me && cfg.me.look) || {}, name: (cfg.me && cfg.me.name) || '', a: 'idle', seat: null, eat: null, ring: null, vp: null, fed: false }
  const scene = { size: { w: W, h: H }, onExit: null, onTile: null, onSeat: null, onStand: null, onTap: null, onPos: null, others, mine }
  let clock = 0
  let sent = 0
  let lastTile = ''
  let wait = false
  let noSeat = null

  const canMove = (nx, ny) => !(nx < 0.3 || nx > W - 0.3 || ny < minY + 0.05 || ny > H - 0.02 || blocked.has(Math.floor(nx) + ':' + Math.floor(ny)))
  const mc = moveController({ speed: 3.5, x: cfg.start ? cfg.start[0] : Math.floor(W / 2) + 0.5, y: cfg.start ? cfg.start[1] : H - 1.5, canMove })
  scene.player = mc

  function sitAt(x, y) {
    const s = seats.get(x + ':' + y)
    if (!s) return false
    mine.seat = { x, y, s }
    mc.x = x + 0.5
    mc.y = y + 0.5
    mc.facing = s.face || 'd'
    mc.cancel()
    const d = engine && engine.input ? engine.input.dir() : { x: 0, y: 0 }
    wait = !!(d.x || d.y)
    mine.a = s.pose || 'idle'
    if (scene.onSeat) scene.onSeat(s, x, y)
    return true
  }
  function stand() {
    if (!mine.seat) return
    noSeat = mine.seat.x + ':' + mine.seat.y
    const s = mine.seat.s
    mine.seat = null
    mine.eat = null
    mine.a = 'idle'
    if (scene.onStand) scene.onStand(s)
  }
  scene.stand = stand
  scene.sitting = () => !!mine.seat

  scene.update = dt => {
    clock += dt * 1000
    const d = engine && engine.input ? engine.input.dir() : { x: 0, y: 0 }
    const moving = !!(d.x || d.y)
    if (mine.seat) {
      if (!moving) wait = false
      if (moving && !wait) stand()
    }
    if (!mine.seat) {
      mc.update(dt, d)
      mine.a = mc.isMoving ? 'walk' : 'idle'
      const tx = Math.floor(mc.x), ty = Math.floor(mc.y)
      if (noSeat && noSeat !== tx + ':' + ty) noSeat = null
      if (!noSeat && seats.has(tx + ':' + ty)) sitAt(tx, ty)
      const k = tx + ':' + ty
      if (!mine.seat && k !== lastTile) {
        lastTile = k
        if (scene.onTile) scene.onTile(tx, ty)
      }
      if (ty === H - 1 && tx >= door[0] && tx <= door[1] && scene.onExit) scene.onExit()
    }
    if (scene.onPos && clock - sent >= 125) {
      sent = clock
      scene.onPos(mc.x, mc.y, mc.facing, mine.eat ? 'break' : mine.a)
    }
    for (const [id, e] of emotes) if (clock - e.t > 3000) emotes.delete(id)
  }

  scene.setMembers = ps => {
    others.clear()
    interp.clear()
    for (const p of ps || []) scene.member(p)
  }
  scene.member = p => {
    if (!p || p.id == null) return
    others.set(p.id, { ...(others.get(p.id) || {}), ...p })
    if (p.x != null) interp.push(p.id, p.x, p.y, clock)
  }
  scene.drop = id => { others.delete(id); interp.remove(id); emotes.delete(id) }
  scene.emote = (id, k) => emotes.set(id, { k, t: clock })
  scene.tileOf = () => ({ x: Math.floor(mc.x), y: Math.floor(mc.y) })

  scene.walkTo = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false
    if (mine.seat) stand()
    const from = scene.tileOf()
    if (from.x === x && from.y === y) {
      if (seats.has(x + ':' + y)) { noSeat = null; sitAt(x, y) }
      return true
    }
    noSeat = null
    const p = astar(grid, W, H, from, { x, y }, v => v === 0)
    if (p && p.length) { mc.setPath(p.slice(1)); return true }
    return false
  }
  scene.tap = (x, y) => {
    if (scene.onTap && scene.onTap(x, y) === true) return
    scene.walkTo(x, y)
  }
  if (engine && engine.onTap) engine.onTap((x, y) => scene.tap(x, y))
  if (engine && engine.camera && engine.camera.follow) {
    engine.camera.follow({ get x() { return mc.x * TILE }, get y() { return mc.y * TILE - 12 } })
  }

  function person(ctx, draws, who, x, y, t) {
    const seated = who.seat
    const dir = who.dir || 'd'
    const a = who.eat ? 'break' : who.a === 'walk' ? 'walk' : who.a === 'sit_study' ? 'sit_study' : 'idle'
    const cv = avatarCell(who.look, dir, a, t, still())
    const fy = a === 'sit_study' ? y + 0.5 : y
    draws.push({ y: fy * TILE + (a === 'sit_study' ? 1 : 0), fn: () => {
      if (who.ring) {
        ctx.fillStyle = RING[who.ring] || RING.away
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        ctx.ellipse(Math.round(x * TILE), Math.round(fy * TILE) - 1, 8, 3, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      drawSprite(ctx, cv, x * TILE, fy * TILE)
      if (who.eat) {
        const pr = spriteOf('prop.' + who.eat)
        if (pr) drawSprite(ctx, pr, x * TILE + (dir === 'l' ? -4 : 4), fy * TILE - 12)
      }
      if (who.fed) {
        const f = spriteOf('fx.fed')
        if (f) drawSprite(ctx, f, x * TILE + 7, fy * TILE - 25)
      }
      if (who.vp != null && (seated || a === 'sit_study')) {
        const bx = Math.round(x * TILE) - 7, by = Math.round(fy * TILE) - 28
        ctx.fillStyle = 'rgba(42,31,45,0.8)'
        ctx.fillRect(bx, by, 14, 3)
        ctx.fillStyle = '#6fcf97'
        ctx.fillRect(bx + 1, by + 1, Math.round(12 * Math.max(0, Math.min(100, who.vp)) / 100), 1)
      }
      if (who.name) {
        ctx.font = '7px monospace'
        ctx.textAlign = 'center'
        const w = Math.ceil(ctx.measureText(who.name).width) + 4
        ctx.fillStyle = 'rgba(42,31,45,0.75)'
        ctx.fillRect(Math.round(x * TILE - w / 2), Math.round(fy * TILE - 40), w, 9)
        ctx.fillStyle = '#fff'
        ctx.fillText(who.name, Math.round(x * TILE), Math.round(fy * TILE - 33))
      }
    } })
  }

  scene.draw = (ctx, cam, t) => {
    ctx.save()
    ctx.translate(-cam.x, -cam.y)
    const bg = spriteOf(cfg.bg)
    if (bg) ctx.drawImage(bg, 0, 0)
    else { ctx.fillStyle = '#3b3340'; ctx.fillRect(0, 0, W * TILE, H * TILE) }
    const draws = []
    for (const p of cfg.props || []) {
      const cv = typeof p.id === 'function' ? p.id(t) : spriteOf(p.id)
      if (cv) draws.push({ y: p.sort != null ? p.sort : p.y, fn: () => drawSprite(ctx, cv, p.x, p.y) })
    }
    for (const [id, p] of others) {
      const q = interp.get(id, clock) || { x: p.x, y: p.y }
      if (q.x == null) continue
      person(ctx, draws, { look: p.look, name: p.name, dir: p.dir, a: p.a, ring: cfg.rings ? p.act || 'away' : null, vp: p.vp, fed: p.fed, eat: p.a === 'break' ? p.food : null }, q.x, q.y, t)
    }
    const m = mine
    if (m.seat) person(ctx, draws, { ...m, dir: m.seat.s.face || 'd', a: m.eat ? 'break' : m.a, seat: true }, m.seat.x + 0.5, m.seat.y + 0.5, t)
    else person(ctx, draws, { ...m, dir: mc.facing }, mc.x, mc.y, t)
    if (cfg.extra) cfg.extra(ctx, draws, t, clock)
    draws.sort((a, b) => a.y - b.y)
    for (const d of draws) d.fn()
    if (emotes.size && engine) {
      for (const [id, e] of emotes) {
        const p = others.get(id)
        if (!p || p.x == null) continue
        ctx.font = '7px monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = '#fff'
        ctx.fillText(EMOTE_TXT[e.k] || e.k, Math.round(p.x * TILE), Math.round(p.y * TILE - 44))
      }
    }
    ctx.restore()
  }
  scene.destroy = () => { if (engine && engine.onTap) engine.onTap(null) }
  return scene
}

// ---- shops ----
const SPOTS = {
  // blocked floor cells and wall display areas per shop (tile coords, room is 20x14, wall = rows 0..4)
  boutique: { block: ['2:7', '2:8', '7:7', '7:8', '12:7', '12:8', '5:10', '5:11', '10:10', '10:11', '16:8', '16:9'], mirror: [13, 13] },
  homestore: { block: ['3:8', '9:8', '15:9', '2:11', '6:11', '13:11', '18:11'] },
  bakery: { block: ['2:7', '7:7', '2:10', '7:10', '3:4', '4:4', '5:4', '6:4', '3:5', '4:5', '5:5', '6:5'] },
}
const COUNTER = [16, 19]

function seatsFor(kind) {
  const m = new Map()
  if (kind !== 'bakery') return m
  for (const [tx, ty] of [[2, 7], [7, 7], [2, 10], [7, 10]]) {
    m.set((tx - 1) + ':' + ty, { face: 'r', pose: 'idle', table: tx + ':' + ty })
    m.set((tx + 1) + ':' + ty, { face: 'l', pose: 'idle', table: tx + ':' + ty })
  }
  return m
}

export function createShopScene({ engine, kind, me, onExit, onCounter, onMirror }) {
  const sp = SPOTS[kind] || SPOTS.boutique
  const blocked = new Set(sp.block)
  for (let x = COUNTER[0]; x <= COUNTER[1]; x++) blocked.add(x + ':5')
  if (kind === 'bakery') for (const x of [13, 14]) blocked.add(x + ':5')
  const npc = NPC[kind]
  let near = false
  const room = createRoom({
    engine, W: 20, H: 14, bg: 'shop.' + npc + '.room', blocked, minY: 5, door: [9, 10], start: [10, 12.5],
    seats: seatsFor(kind), me,
    props: [{
      id: t => {
        const wave = near && !(engine && engine.reduced)
        const a = getAnim('npc.' + npc + (wave ? '.wave' : '.idle'))
        const still = !!(engine && engine.reduced)
        if (!a) return spriteOf('npc.' + npc)
        return spriteOf(a.frames[still ? 0 : Math.floor(t * a.fps) % a.frames.length])
      },
      x: 18 * TILE, y: 5 * TILE - 2,
    }],
  })
  room.onExit = onExit
  const atCounter = (x, y) => x >= COUNTER[0] - 1 && x <= COUNTER[1] && y === 6
  room.onTile = (x, y) => {
    near = atCounter(x, y)
    if (near && onCounter) onCounter()
    else if (sp.mirror && x >= sp.mirror[0] - 1 && x <= sp.mirror[1] + 1 && y === 5 && onMirror) onMirror()
  }
  room.onTap = (x, y) => {
    const wall = y < 5
    const keeper = x >= COUNTER[0] && x <= COUNTER[1] && y <= 6
    const disp = sp.block.includes(x + ':' + y)
    if (sp.mirror && wall && x >= sp.mirror[0] && x <= sp.mirror[1] && y >= 3) { room.walkTo(sp.mirror[0], 5); if (onMirror) onMirror(); return true }
    if (keeper) { room.walkTo(COUNTER[0] + 1, 6); if (onCounter) onCounter(); return true }
    if (wall || disp) { room.walkTo(Math.min(19, x), Math.max(6, Math.min(y + 1, 6))); if (onCounter) onCounter(); return true }
    return false
  }
  return room
}

// Reads a pantry in either {id: qty} or [{item|id, qty|n}] form.
export function pantryMap(p) {
  const m = {}
  if (Array.isArray(p)) for (const e of p) m[e.item || e.id] = Number(e.qty != null ? e.qty : e.n) || 0
  else if (p && typeof p === 'object') for (const k in p) m[k] = Number(p[k]) || 0
  return m
}

export async function openShopScene(ctx, kind) {
  const { engine, ui } = ctx
  if (!NPC[kind]) return
  let busy = false
  let latch = false
  let left = false
  let overlay = null
  let unsub = null
  const send = m => { try { if (ctx.net && ctx.net.send) ctx.net.send(m) } catch (e) { /* offline */ } }

  async function panel(names, fn, arg) {
    if (busy) return
    busy = true
    try {
      const f = await loadPanel(names, fn)
      if (!f) { ctx.toast('This counter is not open yet') ; return }
      await (arg === undefined ? f(ctx) : f(ctx, arg))
    } catch (e) {
      ctx.toast('Could not open that, try again')
    } finally {
      busy = false
      latch = true
    }
  }
  const opener = (names, fn, arg) => () => { if (!busy && !latch) panel(names, fn, arg) }

  const fedNow = () => !!(ctx.me && ctx.me.fed_until && Number(ctx.me.fed_until) > Date.now())
  const scene = createShopScene({
    engine, kind, me: { look: ctx.me && ctx.me.avatar, name: ctx.me && ctx.me.avatar && ctx.me.avatar.name },
    onExit: () => leave(),
    onCounter: opener(['shop'], 'openShop', kind),
    onMirror: kind === 'boutique' ? opener(['wardrobe'], 'openWardrobe') : null,
  })
  scene.mine.fed = fedNow()
  const prevTile = scene.onTile
  scene.onTile = (x, y) => { latch = false; prevTile(x, y) }

  async function eatFlow() {
    if (busy) return
    busy = true
    const before = pantryMap(ctx.me && ctx.me.pantry)
    const fed0 = Number((ctx.me && ctx.me.fed_until) || 0)
    try {
      const f = await loadPanel(['pantry'], 'openPantry')
      if (!f) { ctx.toast('Pantry is not open yet'); return }
      await f(ctx)
      const me = await ctx.refresh()
      const after = pantryMap(me && me.pantry)
      const fed1 = Number((me && me.fed_until) || 0)
      const food = Object.keys(before).find(k => (after[k] || 0) < before[k])
      if (food && fed1 > fed0 && scene.sitting()) {
        scene.mine.eat = String(food).split(':')[1] || null
        scene.mine.food = scene.mine.eat
        scene.mine.fed = fed1 > Date.now()
        setTimeout(() => { scene.mine.eat = null }, 3500)
      }
    } catch (e) {
      ctx.toast('Could not eat that, try again')
    } finally {
      busy = false
    }
  }
  scene.onSeat = () => {
    if (overlay) overlay.remove()
    overlay = bar(ui, [btn(ui, 'Pantry', eatFlow, 'primary')])
    layer().append(overlay)
  }
  scene.onStand = () => { if (overlay) { overlay.remove(); overlay = null } }
  scene.onPos = (x, y, dir, a) => send({ t: 'pos', x: Math.max(0, Math.min(60, x)), y: Math.max(0, Math.min(60, y)), dir: dir === 'r' || dir === 'l' || dir === 'u' ? dir : 'd', a: String(a).replace(/[^a-z0-9_.]/g, '') || 'idle' })

  const place = 'shop:' + kind
  const here = p => p && (p.place === place || (kind === 'homestore' && p.place === 'shop:home'))
  const mine = ctx.me && ctx.me.id
  function onMsg(m) {
    if (!m) return
    if (m.t === 'snap') scene.setMembers((m.players || []).filter(p => here(p) && p.id !== (m.you != null ? m.you : mine)))
    else if (m.t === 'join' && here(m.p)) scene.member(m.p)
    else if (m.t === 'part') scene.drop(m.id)
    else if (m.t === 'pos') for (const e of m.list || []) { if (scene.others.has(e.id)) scene.member(e) }
  }
  if (ctx.net && typeof ctx.net.on === 'function') unsub = ctx.net.on(onMsg)

  let done
  const closed = new Promise(r => { done = r })
  function leave() {
    if (left) return
    left = true
    if (overlay) overlay.remove()
    overlay = null
    if (typeof unsub === 'function') unsub()
    send({ t: 'shop', kind: null })
    scene.destroy()
    Promise.resolve(ctx.returnToStreet()).finally(done)
  }

  engine.setScene(scene)
  if (engine.camera && engine.camera.snap) engine.camera.snap()
  send({ t: 'shop', kind })
  if (engine.start && !engine.fps) engine.start()
  await closed
}

export { NAMES }
