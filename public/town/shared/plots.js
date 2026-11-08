export const W = 56
export const H = 44
export const PLOTS = 40
export const PW = 6
export const PH = 5
export const SQ = { x: 21, y: 16, w: 14, h: 12 }
export const WALK = new Set([0, 1, 2, 3, 4, 5, 8, 9, 10])

const KINDS = ['boutique', 'homestore', 'bakery', 'library', 'townhall']
const LM = [
  ['boutique', 21, 16, 3, 3],
  ['homestore', 24, 16, 3, 3],
  ['bakery', 29, 16, 3, 3],
  ['library', 32, 16, 3, 3],
  ['townhall', 22, 24, 4, 3],
]

let cache = null

function hash(x, y) {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 7, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function build() {
  const g = []
  for (let y = 0; y < H; y++) {
    const row = []
    for (let x = 0; x < W; x++) row.push(hash(x, y) % 7 === 0 ? 1 : hash(y, x) % 11 === 0 ? 2 : 0)
    g.push(row)
  }
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = t }
  const mx = x => W - 1 - x
  const my = y => H - 1 - y

  for (let y = 0; y < H; y++) for (let x = 27; x <= 28; x++) set(x, y, 4)
  for (let x = 0; x < W; x++) for (let y = 21; y <= 22; y++) set(x, y, 4)
  for (let y = SQ.y; y < SQ.y + SQ.h; y++) for (let x = SQ.x; x < SQ.x + SQ.w; x++) set(x, y, 5)

  for (let y = 13; y <= 27; y++) {
    set(13, y, 7); set(14, y, 6); set(15, y, 6); set(16, y, 7)
  }
  for (let x = 13; x <= 16; x++) { set(x, 28, 8); set(x, 12, 3) }
  for (let y = 21; y <= 22; y++) for (let x = 13; x <= 16; x++) set(x, y, 10)
  set(12, 21, 9); set(12, 22, 9); set(17, 21, 9); set(17, 22, 9)

  const q = []
  const xs = [1, 7, 13, 19]
  for (const x of xs) q.push({ x, y: 1, face: 's' })
  for (const x of xs) q.push({ x, y: 7, face: 'n' })
  q.push({ x: 1, y: 13, face: 'n' }, { x: 7, y: 13, face: 'n' })

  const plots = []
  const add = (x, y, face) => {
    const door = face === 's' ? { x: x + 2, y: y + 4 } : { x: x + 2, y }
    plots.push({ slot: plots.length, x, y, w: PW, h: PH, door, face })
  }
  for (const p of q) add(p.x, p.y, p.face)
  for (const p of q) {
    const x = mx(p.x + PW - 1)
    add(x, p.y, p.face)
    plots[plots.length - 1].door = { x: x + 2, y: p.face === 's' ? p.y + 4 : p.y }
  }
  for (const p of q) {
    const y = my(p.y + PH - 1)
    const f = p.face === 's' ? 'n' : 's'
    add(p.x, y, f)
    plots[plots.length - 1].door = { x: p.x + 2, y: f === 's' ? y + 4 : y }
  }
  for (const p of q) {
    const x = mx(p.x + PW - 1)
    const y = my(p.y + PH - 1)
    const f = p.face === 's' ? 'n' : 's'
    add(x, y, f)
    plots[plots.length - 1].door = { x: x + 2, y: f === 's' ? y + 4 : y }
  }

  for (let x = 1; x <= 26; x++) for (const y of [6, 12]) {
    set(x, y, 3); set(mx(x), y, 3); set(x, my(y), 3); set(mx(x), my(y), 3)
  }
  for (const p of plots) set(p.door.x, p.door.y, 3)
  set(12, 12, 3); set(mx(12), 12, 3)

  const landmarks = LM.map(([kind, x, y, w, h]) => ({ kind, x, y, w, h, door: { x: x + 1, y: y + h - 1 } }))
  const fountain = { x: 27, y: 21, w: 2, h: 2 }

  const inPlot = (x, y) => plots.some(p => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)
  const decor = []
  const lamp = (x, y) => { if (g[y][x] <= 2 && !inPlot(x, y)) decor.push({ kind: 'lamp', x, y }) }
  for (const [x, y] of [[26, 3], [26, 9], [29, 3], [29, 9], [26, 18], [29, 18]]) {
    lamp(x, y); lamp(x, my(y))
  }
  for (const [x, y] of [[25, 4], [30, 4], [25, 15], [30, 15]]) {
    if (g[y][x] <= 2 && !inPlot(x, y)) decor.push({ kind: 'bench', x, y })
    if (g[my(y)][x] <= 2 && !inPlot(x, my(y))) decor.push({ kind: 'bench', x, y: my(y) })
  }
  const taken = new Set(decor.map(d => d.x + ',' + d.y))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] > 2 || inPlot(x, y) || taken.has(x + ',' + y)) continue
    const h = hash(x * 3 + 1, y * 5 + 2)
    let kind = null
    if (h % 17 === 0) kind = 'tree'
    else if (h % 23 === 1) kind = 'bush'
    else if (h % 9 === 2) kind = 'flower'
    else if (h % 61 === 3 && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) kind = 'fence'
    if (kind) decor.push({ kind, x, y })
  }
  for (let x = 1; x <= 12; x++) for (const y of [0, H - 1]) if (g[y][x] <= 2) decor.push({ kind: 'fence', x, y })

  return {
    w: W, h: H, ground: g, plots, landmarks, fountain, square: { ...SQ }, decor,
    gates: { n: { x: 28, y: 0 }, e: { x: W - 1, y: 22 }, s: { x: 28, y: H - 1 }, w: { x: 0, y: 22 } },
  }
}

export function districtTemplate() {
  if (!cache) cache = build()
  return cache
}

export function spiral(i) {
  if (!(i > 0)) return { dx: 0, dy: 0 }
  let r = 1
  while ((2 * r + 1) * (2 * r + 1) <= i) r++
  const k = i - (2 * r - 1) * (2 * r - 1)
  if (k < 2 * r) return { dx: r, dy: -(r - 1) + k }
  const a = k - (2 * r - 1)
  if (a <= 2 * r) return { dx: r - a, dy: r }
  const b = a - 2 * r
  if (b <= 2 * r) return { dx: -r, dy: r - b }
  const c = b - 2 * r
  return { dx: -r + c, dy: -r }
}

export function nextSlot(taken) {
  for (let d = 0; ; d++) for (let s = 0; s < PLOTS; s++) if (!taken.has(d + ':' + s)) return { district: d, slot: s }
}

export function plotWorld(district, slot) {
  const t = districtTemplate()
  const p = t.plots[slot]
  if (!p) return null
  const { dx, dy } = spiral(district)
  const ox = dx * W
  const oy = dy * H
  return {
    district, slot, dx, dy, ox, oy,
    x: ox + p.x, y: oy + p.y, w: p.w, h: p.h,
    door: { x: ox + p.door.x, y: oy + p.door.y }, face: p.face,
  }
}

export { KINDS as LANDMARKS }
