import { spiral, districtTemplate, W, H } from './shared/plots.js'

export { spiral }

const C = {
  bg: '#1A2352',
  cell: '#5E9E44',
  cellMe: '#7CC24E',
  road: '#D79A63',
  free: '#3E6B33',
  taken: '#E0507A',
  me: '#FFFFFF',
  meEdge: '#2A1F2D',
  edge: '#2A1F2D',
}

// Districts laid out along spiral(i); claimed plots drawn as dots; hitTest maps canvas px to a district index.
export function createMinimap({ canvas, count = 1, current = 0, claimed = null, onPick = null, layout = null } = {}) {
  const m = { count, current, player: null }
  let claims = claimed || {}
  let tpl = layout || districtTemplate()

  function bounds(n) {
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0
    for (let i = 0; i < n; i++) {
      const p = spiral(i)
      if (p.dx < x0) x0 = p.dx
      if (p.dx > x1) x1 = p.dx
      if (p.dy < y0) y0 = p.dy
      if (p.dy > y1) y1 = p.dy
    }
    return { x0, x1, y0, y1 }
  }

  function geometry() {
    const n = Math.max(1, m.count)
    const b = bounds(n)
    const cols = b.x1 - b.x0 + 1, rows = b.y1 - b.y0 + 1
    const gap = 2
    const cw = canvas ? canvas.width : 64, ch = canvas ? canvas.height : 64
    const size = Math.max(4, Math.floor(Math.min((cw - gap) / cols, (ch - gap) / rows)) - gap)
    const ox = Math.floor((cw - cols * (size + gap) + gap) / 2)
    const oy = Math.floor((ch - rows * (size + gap) + gap) / 2)
    return { b, size, gap, ox, oy, n }
  }

  function cellRect(g, i) {
    const p = spiral(i)
    return { x: g.ox + (p.dx - g.b.x0) * (g.size + g.gap), y: g.oy + (p.dy - g.b.y0) * (g.size + g.gap), s: g.size }
  }

  m.setCount = n => { m.count = Math.max(1, n | 0) }
  m.setCurrent = i => { m.current = i }
  m.setClaimed = c => { claims = c || {} }
  m.setPlayer = p => { m.player = p || null }
  m.setLayout = t => { tpl = t || districtTemplate() }

  // claimed: { [districtIndex]: [slot, ...] }
  m.hitTest = (x, y) => {
    const g = geometry()
    for (let i = 0; i < g.n; i++) {
      const r = cellRect(g, i)
      if (x >= r.x && y >= r.y && x < r.x + r.s && y < r.y + r.s) return i
    }
    return -1
  }

  m.draw = () => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const g = geometry()
    for (let i = 0; i < g.n; i++) {
      const r = cellRect(g, i)
      ctx.fillStyle = C.edge
      ctx.fillRect(r.x - 1, r.y - 1, r.s + 2, r.s + 2)
      ctx.fillStyle = i === m.current ? C.cellMe : C.cell
      ctx.fillRect(r.x, r.y, r.s, r.s)
      const sx = r.s / W, sy = r.s / H
      ctx.fillStyle = C.road
      ctx.fillRect(r.x + Math.floor(28 * sx), r.y, Math.max(1, Math.round(2 * sx)), r.s)
      ctx.fillRect(r.x, r.y + Math.floor(21 * sy), r.s, Math.max(1, Math.round(2 * sy)))
      const taken = new Set(claims[i] || [])
      const d = r.s >= 24 ? 2 : 1
      for (const p of tpl.plots) {
        ctx.fillStyle = taken.has(p.slot) ? C.taken : C.free
        ctx.fillRect(r.x + Math.floor((p.x + p.w / 2) * sx), r.y + Math.floor((p.y + p.h / 2) * sy), d, d)
      }
    }
    const pl = m.player
    if (pl && pl.district >= 0 && pl.district < g.n) {
      const r = cellRect(g, pl.district)
      const px = r.x + Math.floor(pl.x / W * r.s), py = r.y + Math.floor(pl.y / H * r.s)
      ctx.fillStyle = C.meEdge
      ctx.fillRect(px - 2, py - 2, 4, 4)
      ctx.fillStyle = C.me
      ctx.fillRect(px - 1, py - 1, 2, 2)
    }
  }

  let down = null
  if (canvas && onPick) {
    down = e => {
      const r = canvas.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width * canvas.width
      const y = (e.clientY - r.top) / r.height * canvas.height
      const i = m.hitTest(x, y)
      if (i >= 0) onPick(i)
    }
    canvas.addEventListener('pointerdown', down)
  }
  m.destroy = () => { if (down) canvas.removeEventListener('pointerdown', down) }

  return m
}
