export const W = 56
export const H = 44
export const PLOTS = 40
export const PW = 6
export const PH = 5
export const SQ = { x: 20, y: 16, w: 16, h: 12 }
export const WALK = new Set([0, 1, 2, 3, 4, 5, 8, 9, 10])

const KINDS = ['boutique', 'homestore', 'bakery', 'library', 'townhall']
const LM = [
  ['boutique', 18, 14, 5, 4],
  ['homestore', 18, 26, 5, 4],
  ['bakery', 33, 14, 5, 4],
  ['library', 33, 26, 5, 4],
  ['townhall', 30, 8, 7, 5],
]

let cache = null

function hash(x, y) {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 7, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

const PLAZA = { cx: 27.5, cy: 21.5, rx: 8, ry: 6 }
const inPlaza = (x, y) => ((x - PLAZA.cx) / PLAZA.rx) ** 2 + ((y - PLAZA.cy) / PLAZA.ry) ** 2 <= 1
const riverX = y => (y <= 12 ? 0 : y === 13 ? 1 : y <= 28 ? 2 : y === 29 ? 1 : 0)
const PATHS = new Set([3, 4, 5, 9, 10])

function build() {
  const g = []
  for (let y = 0; y < H; y++) {
    const row = []
    for (let x = 0; x < W; x++) row.push(hash(x, y) % 7 === 0 ? 1 : hash(y, x) % 11 === 0 ? 2 : 0)
    g.push(row)
  }
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = t }

  const plots = []
  const add = (x, y, face) => {
    const door = face === 's' ? { x: x + 2, y: y + 4 } : { x: x + 2, y }
    plots.push({ slot: plots.length, x, y, w: PW, h: PH, door, face })
  }
  const WC = [4, 10, 16, 22]
  const EC = [30, 36, 42, 48]
  for (const x of WC.concat(EC)) add(x, 2, 's')
  for (const x of WC.concat([38, 44, 50])) add(x, 8, 'n')
  for (const x of [6, 12]) { add(x, 15, 's'); add(x, 24, 'n') }
  for (const x of [38, 44, 50]) add(x, 15, 's')
  for (const x of [38, 44]) add(x, 24, 'n')
  for (const x of WC.concat(EC)) add(x, 31, 's')
  for (const x of WC.concat(EC)) add(x, 37, 'n')

  const row = (y, x0, x1, t) => { for (let x = x0; x <= x1; x++) set(x, y, t) }
  row(7, 4, 53, 3); row(36, 4, 53, 3)
  row(20, 6, 17, 3); row(23, 6, 17, 3)
  row(20, 38, 55, 3); row(23, 38, 49, 3)
  for (const p of plots) set(p.door.x, p.door.y, 3)

  for (let y = 0; y <= 15; y++) { set(28, y, 4); set(29, y, 4) }
  for (let y = 28; y < H; y++) { set(28, y, 4); set(29, y, 4) }
  row(13, 28, 35, 4)
  row(21, 0, W - 1, 4); row(22, 0, W - 1, 4)
  row(30, 20, 35, 4)
  for (let y = 18; y <= 20; y++) { set(20, y, 4); set(35, y, 4) }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inPlaza(x, y)) set(x, y, 5)

  for (let y = 0; y < H; y++) {
    const x0 = riverX(y)
    const br = y === 21 || y === 22
    for (let x = x0; x < x0 + 3; x++) set(x, y, br ? 10 : 6)
    set(x0 - 1, y, br ? 9 : 7)
    set(x0 + 3, y, br ? 9 : 7)
  }
  const pond = []
  for (let y = 24; y <= 28; y++) for (let x = 50; x <= 55; x++) {
    const water = x >= 51 && x <= 54 && ((y >= 25 && y <= 27) || ((x === 52 || x === 53) && (y === 24 || y === 28)))
    if (water) { set(x, y, 6); pond.push({ x, y }) } else if (g[y][x] <= 2) set(x, y, 8)
  }

  const landmarks = LM.map(([kind, x, y, w, h]) => ({ kind, x, y, w, h, door: { x: x + (w === 7 ? 3 : 2), y: y + h - 1 } }))
  for (const l of landmarks) set(l.door.x, l.door.y, 4)
  const fountain = { x: 26, y: 21, w: 4, h: 3 }

  const lilies = []
  for (const y of [4, 9, 17, 25, 33, 39]) lilies.push({ x: riverX(y) + 1, y })
  lilies.push({ x: 52, y: 26 }, { x: 53, y: 25 })

  const inR = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
  const occ = new Set()
  const fill = (r, m = 0) => { for (let y = r.y - m; y < r.y + r.h + m; y++) for (let x = r.x - m; x < r.x + r.w + m; x++) occ.add(x + ',' + y) }
  for (const p of plots) fill(p)
  for (const l of landmarks) fill(l)
  fill(fountain)
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y][x] <= 2 && !occ.has(x + ',' + y)
  const nearPath = (x, y, r) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = x + i, yy = y + j
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && PATHS.has(g[yy][xx])) return true
    }
    return false
  }
  const shade = new Set()
  for (const r of plots.concat(landmarks)) {
    for (let y = r.y + r.h; y < r.y + r.h + 3; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) shade.add(x + ',' + y)
  }

  const decor = []
  const put = (kind, x, y, extra) => { decor.push({ kind, x, y, ...extra }); occ.add(x + ',' + y) }
  const ring = (deg, rr) => {
    const a = deg * Math.PI / 180
    return { x: Math.round(PLAZA.cx + PLAZA.rx * rr * Math.cos(a)), y: Math.round(PLAZA.cy + PLAZA.ry * rr * Math.sin(a)) }
  }
  for (let k = 0; k < 8; k++) {
    for (const rr of [1.12, 1.22, 1.32, 1.42]) {
      const t = ring(22.5 + 45 * k, rr)
      if (free(t.x, t.y)) { put('lamp', t.x, t.y); break }
    }
  }
  for (const deg of [45, 135, 225, 315]) {
    let done = false
    for (const rr of [1.1, 1.2, 1.3, 1.4, 1.5]) {
      const t = ring(deg, rr)
      for (const x of [t.x, t.x - 1]) {
        if (!done && free(x, t.y) && free(x + 1, t.y)) { put('bench', x, t.y); occ.add((x + 1) + ',' + t.y); done = true }
      }
      if (done) break
    }
  }
  const lampNear = (x, y) => decor.some(d => d.kind === 'lamp' && Math.abs(d.x - x) + Math.abs(d.y - y) < 6)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!free(x, y) || lampNear(x, y)) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => g[y + j] && g[y + j][x + i] === 4)) put('lamp', x, y)
  }
  for (const deg of [0, 90, 180, 270, 45, 135, 225, 315]) {
    for (const rr of [1.2, 1.35, 1.5, 1.7]) {
      const t = ring(deg + 11, rr)
      if (free(t.x, t.y) && free(t.x + 1, t.y)) { put('flowerbed', t.x, t.y); occ.add((t.x + 1) + ',' + t.y); break }
    }
  }
  for (const l of landmarks) {
    for (const dx of [0, l.w - 2]) {
      for (const dy of [0, 1]) {
        const x = l.x + dx, y = l.y + l.h + dy
        if (free(x, y) && free(x + 1, y) && Math.abs(x + 1 - l.door.x) + Math.abs(x - l.door.x) > 1) { put('flowerbed', x, y); occ.add((x + 1) + ',' + y); break }
      }
    }
  }

  const treeOk = (x, y) => free(x, y) && !nearPath(x, y, 1) && !shade.has(x + ',' + y)
  const trees = []
  const plant = (x, y, edge) => {
    const r = hash(x * 13 + 5, y * 17 + 3) % 100
    const treeKind = edge ? (r < 35 ? 'pine' : r < 70 ? 'cherry' : 'green') : (r < 45 ? 'cherry' : r < 80 ? 'green' : 'pine')
    put('tree', x, y, { treeKind })
    trees.push({ x, y })
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Math.min(x, y, W - 1 - x, H - 1 - y) < 2 && treeOk(x, y) && hash(x * 7 + 1, y * 3 + 9) % 100 < 62) plant(x, y, true)
  }
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (!treeOk(x, y) || hash(x * 7 + 3, y * 11 + 5) % 37 !== 0) continue
    const n = 3 + hash(x, y) % 5
    const cand = []
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) cand.push({ x: x + i, y: y + j, k: hash((x + i) * 5 + 1, (y + j) * 9 + 4) })
    cand.sort((a, b) => a.k - b.k)
    let c = 0
    for (const t of cand) { if (c < n && treeOk(t.x, t.y)) { plant(t.x, t.y, false); c++ } }
    if (c) {
      for (const t of cand) {
        if (free(t.x, t.y) && !nearPath(t.x, t.y, 0) && hash(t.x + 9, t.y * 3) % 7 === 0) put('bush', t.x, t.y)
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!free(x, y)) continue
    const h = hash(x * 3 + 1, y * 5 + 2)
    if (h % 31 === 1) put('bush', x, y)
    else if (h % 53 === 3) {
      put('flower', x, y)
      for (const [i, j] of [[1, 0], [0, 1], [-1, 0]]) if (free(x + i, y + j) && hash(x + i, y + j) % 2) put('flower', x + i, y + j)
    }
  }
  for (let x = 38; x <= 49; x++) if (free(x, 29)) put('fence', x, 29)
  for (let x = 4; x <= 21; x++) if (free(x, 29)) put('fence', x, 29)

  return {
    w: W, h: H, ground: g, plots, landmarks, fountain, square: { ...SQ }, decor, lilies,
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
