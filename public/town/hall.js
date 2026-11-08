import { TILE } from './engine.js'
import { connect } from './net.js'
import { createRoom, spriteOf, layer, bar, btn } from './shops.js'

const W = 24
const H = 16
const COLS = [1, 5, 9, 13, 17, 21]
const ROWS = [10, 13]
const CAP = 24
const EMOTES = ['cheer', 'heart', 'wave', 'zzz', 'think', 'ok']
const EMO_LABEL = { cheer: 'Cheer', heart: 'Heart', wave: 'Wave', zzz: 'Zzz', think: 'Think', ok: 'OK' }
const FULL_MSG = 'The hall is full, try again in a minute'

const chairs = []
const blocked = new Set()
const seats = new Map()
for (const cy of ROWS) {
  for (const cx of COLS) {
    chairs.push({ x: cx, y: cy })
    blocked.add(cx + ':' + (cy + 1))
    seats.set(cx + ':' + cy, { face: 'd', pose: 'sit_study' })
  }
}
const STANDING = []
for (let i = 0; i < 12; i++) STANDING.push({ x: 2 + i * 2, y: 12 })

export function wsUrl(district) {
  const p = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = typeof location !== 'undefined' ? location.host : ''
  return p + '//' + host + '/api/town/hall/ws?district=' + encodeURIComponent(district)
}

export function actOf(p) {
  if (p.act === 'active' || p.act === 'idle' || p.act === 'away') return p.act
  return p.st === 'focus' ? 'active' : p.st === 'break' ? 'idle' : 'away'
}

export function createHallScene({ engine, me, onExit, onBoard }) {
  const props = [{ id: 'hall.board', x: 160, y: 7 * TILE }]
  props.push({ id: 'hall.rug', x: 12 * TILE, y: 13 * TILE + 8, sort: 0 })
  for (const c of chairs) {
    props.push({ id: 'hall.chair', x: c.x * TILE + 8, y: (c.y) * TILE + 16 - 2, sort: c.y * TILE + 6 })
    props.push({ id: 'hall.desk', x: c.x * TILE + 8, y: (c.y + 2) * TILE, sort: (c.y + 2) * TILE })
  }
  const room = createRoom({
    engine, W, H, bg: 'hall.room', blocked, seats, minY: 10, door: [11, 12], start: [11.5, 13.5], rings: true, me, props,
  })
  room.onExit = onExit
  room.onTap = (x, y) => {
    if (x >= 9 && x <= 11 && y >= 4 && y <= 7) { if (onBoard) onBoard(); return true }
    return false
  }
  return room
}

export async function openHallScene(ctx) {
  const { engine, ui } = ctx
  const district = ctx.me && ctx.me.plot ? ctx.me.plot.district : 0
  let left = false
  let boardSheet = null
  let boardTimer = null
  let overlay = null
  let sock = null
  let members = []
  let done
  const closed = new Promise(r => { done = r })
  const toast = m => { try { ctx.toast(m) } catch (e) { /* no toast */ } }

  const scene = createHallScene({ engine, me: { look: ctx.me && ctx.me.avatar, name: '' }, onExit: () => leave(), onBoard: () => openBoard() })

  function layout() {
    const mySeat = scene.mine.seat ? scene.mine.seat.x + ':' + scene.mine.seat.y : null
    const free = chairs.filter(c => c.x + ':' + c.y !== mySeat)
    const list = members.slice().sort((a, b) => a.id - b.id)
    const out = list.map((p, i) => {
      const c = i < free.length ? free[i] : STANDING[(i - free.length) % STANDING.length]
      const seated = i < free.length
      return { ...p, x: c.x + 0.5, y: c.y + 0.5, dir: 'd', a: seated ? 'sit_study' : 'idle', act: actOf(p), vp: seated && p.vp ? p.vp : null }
    })
    scene.setMembers(out)
  }
  scene.onSeat = () => layout()
  const prevStand = scene.onStand
  scene.onStand = s => { if (prevStand) prevStand(s); layout() }

  async function startTimer() {
    try {
      const store = await import('/js/store.js')
      if (store.timer()) return
      const mins = Number(store.pref('focus_mins', 45)) || 45
      await store.startTimer({ title: 'Quick focus', mins })
      toast('Focus timer started')
    } catch (e) {
      toast('Could not start the timer, try again')
    } finally {
      refreshBar()
    }
  }

  async function refreshBar() {
    let hasTimer = true
    try {
      const store = await import('/js/store.js')
      hasTimer = !!store.timer()
    } catch (e) { hasTimer = true }
    if (left) return
    scene.mine.ring = hasTimer ? 'active' : null
    if (overlay) overlay.remove()
    const kids = EMOTES.map(k => btn(ui, EMO_LABEL[k], () => { if (sock) sock.send({ t: 'emote', k }) }, 'ghost'))
    if (!hasTimer) kids.unshift(btn(ui, 'Start a focus timer', startTimer, 'primary'))
    overlay = bar(ui, kids)
    layer().append(overlay)
  }

  async function fetchBoard() {
    const path = '/api/town/hall'
    if (typeof ctx.get === 'function') {
      try { return await ctx.get(path) } catch (e) { /* fall through to fetch */ }
    }
    const r = await fetch(path, { credentials: 'same-origin' })
    if (!r.ok) throw new Error('board')
    return r.json()
  }

  function boardBody(data, note) {
    const h = ui.h
    const list = data && Array.isArray(data.list) ? data.list : []
    const rows = list.map((e, i) => h('li', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between', padding: '6px 0' } }, [
      h('span', null, (i + 1) + '. ' + String(e.name == null ? '' : e.name) + (e.course ? ' (' + e.course + ')' : '')),
      h('b', null, Number(e.mins) + ' min'),
    ]))
    const kids = [h('p', { class: 'muted' }, 'Focus minutes today, for people who opted in.')]
    if (note) kids.push(h('p', { class: 'muted' }, note))
    kids.push(rows.length ? h('ol', { style: { listStyle: 'none', margin: '0', padding: '0' } }, rows) : h('p', { class: 'muted' }, 'Nobody is on the board yet.'))
    return kids
  }

  async function openBoard() {
    if (boardSheet) return
    const body = ui.h('div', null, [ui.h('p', { class: 'muted' }, 'Loading...')])
    const fill = async () => {
      let kids
      try { kids = boardBody(await fetchBoard()) } catch (e) { kids = boardBody(null, 'Could not load the board, retrying soon.') }
      body.replaceChildren(...kids.filter(Boolean))
    }
    boardSheet = ui.sheet('Study board', body, {
      onClose: () => {
        if (boardTimer) clearInterval(boardTimer)
        boardTimer = null
        boardSheet = null
      },
    })
    fill()
    boardTimer = setInterval(fill, 30000)
  }

  function leave() {
    if (left) return
    left = true
    if (boardSheet && boardSheet.close) boardSheet.close()
    if (boardTimer) clearInterval(boardTimer)
    if (overlay) overlay.remove()
    overlay = null
    if (sock) sock.close()
    sock = null
    scene.destroy()
    Promise.resolve(ctx.returnToStreet()).finally(done)
  }

  function refuse() {
    toast(FULL_MSG)
    left = true
    if (sock) sock.close()
    sock = null
    Promise.resolve(ctx.returnToStreet()).finally(done)
  }

  const joined = await new Promise(resolve => {
    let settled = false
    const fin = v => { if (!settled) { settled = true; resolve(v) } }
    setTimeout(() => fin(false), 8000)
    sock = connect(wsUrl(district), {
      message: m => {
        if (m.t === 'err') { fin(false); return }
        if (m.t === 'inside') {
          const ms = (m.members || []).filter(p => p.id !== (ctx.me && ctx.me.id))
          if (!settled && ms.length >= CAP) { fin(false); return }
          members = ms
          if (settled) layout()
          fin(true)
        } else if (m.t === 'emote') scene.emote(m.id, m.k)
      },
      close: () => { if (!settled) fin(false) },
    })
  })
  if (!joined) { refuse(); return closed }
  layout()
  scene.onPos = null
  engine.setScene(scene)
  if (engine.camera && engine.camera.snap) engine.camera.snap()
  if (engine.start && !engine.fps) engine.start()
  refreshBar()
  return closed
}
