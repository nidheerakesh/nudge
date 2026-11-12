import { W, H, PW, PH, WALK, districtTemplate } from './plots.js'

export const RPLOTS = 24
const PLAZA = { cx: 27.5, cy: 21.5, rx: 8, ry: 6 }
const KEEP = [{ x: 17, y: 13, w: 22, h: 18 }, { x: 27, y: 7, w: 12, h: 6 }]
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const ROAD = new Set([3, 4])
const TREES = ['pine', 'cherry', 'green']
const CAP = { roads: 200, bld: 60, water: 20, parks: 20 }
const SKIP = new Set(['proposed', 'construction', 'platform'])
const FOOT = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track', 'service'])
const WATER = ['natural=water', 'waterway=riverbank', 'landuse=reservoir', 'landuse=basin']
const PARK = ['leisure=park', 'leisure=garden', 'leisure=pitch', 'leisure=playground', 'landuse=grass', 'landuse=forest', 'landuse=meadow', 'landuse=recreation_ground', 'natural=wood']

const round = v => Math.round(v * 10) / 10
const key = (x, y) => x + ',' + y
const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H
const inR = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
const inKeep = (x, y) => KEEP.some(r => inR(x, y, r))
const inPlaza = (x, y) => ((x - PLAZA.cx) / PLAZA.rx) ** 2 + ((y - PLAZA.cy) / PLAZA.ry) ** 2 <= 1
const inMap = ([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H
const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)))
const label = s => {
  const t = typeof s === 'string' ? s.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 24) : ''
  return t || null
}
const hit = (t, list) => list.some(s => { const [k, v] = s.split('='); return t[k] === v })
const wet = (g, x, y) => g[y][x] === 6 || g[y][x] === 10
const frontOf = (x, y, face) => ({ x: x + 2, y: face === 's' ? y + PH : y - 1 })

function hash(x, y) {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 7, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

const grass = (x, y) => (hash(x, y) % 7 === 0 ? 1 : hash(y, x) % 11 === 0 ? 2 : 0)

function inPoly(p, x, y) {
  let c = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c
  }
  return c
}

function thin(p) {
  if (p.length <= 120) return p
  const k = Math.ceil(p.length / 119)
  const out = p.filter((_, i) => i % k === 0 && i < p.length - 1)
  out.push(p[p.length - 1])
  return out
}

function cat(t) {
  if (t.building !== undefined) return 'bld'
  if (t.highway) return SKIP.has(t.highway) ? null : 'roads'
  if (hit(t, WATER)) return 'water'
  if (hit(t, PARK)) return 'parks'
  return null
}

export function project(osm, box) {
  const nodes = new Map()
  for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, e)
  const pt = q => [round((q.lon - box.w) / (box.e - box.w) * W), round((box.n - q.lat) / (box.n - box.s) * H)]
  const out = { v: 1, roads: [], water: [], parks: [], bld: [] }
  for (const e of osm.elements) {
    if (e.type !== 'way' || !e.tags) continue
    const src = Array.isArray(e.geometry) ? e.geometry.filter(Boolean) : (e.nodes || []).map(id => nodes.get(id)).filter(Boolean)
    if (src.length < 2) continue
    const q = src.map(pt)
    const c = cat(e.tags)
    if (!c || !q.some(inMap) || out[c].length >= CAP[c]) continue
    const p = thin(q)
    if (c === 'roads') out.roads.push({ k: FOOT.has(e.tags.highway) ? 3 : 4, p })
    else if (c === 'bld') out.bld.push({ n: label(e.tags.name), p })
    else out[c].push(p)
  }
  return out
}

function base(c) {
  const g = []
  for (let y = 0; y < H; y++) {
    const row = []
    for (let x = 0; x < W; x++) row.push(inPlaza(x, y) ? 5 : grass(x, y))
    g.push(row)
  }
  for (const l of c.landmarks) g[l.door.y][l.door.x] = 4
  return g
}

function water(g, polys) {
  for (const p of polys) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inKeep(x, y) && inPoly(p, x + 0.5, y + 0.5)) g[y][x] = 6
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] <= 2 && NB.some(([i, j]) => ok(x + i, y + j) && g[y + j][x + i] === 6)) g[y][x] = 8
  }
}

function paint(g, x, y, k) {
  if (!ok(x, y) || inKeep(x, y)) return
  const v = g[y][x]
  if (v === 6) g[y][x] = 10
  else if (v !== 10 && (v !== 4 || k === 4)) g[y][x] = k
}

function line(a, b, fn) {
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y)
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1
  let e = dx + dy, x = a.x, y = a.y
  for (;;) {
    fn(x, y)
    if (x === b.x && y === b.y) return
    const e2 = 2 * e
    if (e2 >= dy) { e += dy; x += sx }
    if (e2 <= dx) { e += dx; y += sy }
  }
}

function roads(g, list) {
  for (const r of list) {
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = { x: Math.round(r.p[i][0]), y: Math.round(r.p[i][1]) }
      const b = { x: Math.round(r.p[i + 1][0]), y: Math.round(r.p[i + 1][1]) }
      const vert = Math.abs(b.y - a.y) > Math.abs(b.x - a.x)
      line(a, b, (x, y) => {
        paint(g, x, y, r.k)
        if (r.k === 4) paint(g, vert ? x + 1 : x, vert ? y : y + 1, 4)
      })
    }
  }
}

function join(g, c) {
  const skip = (x, y) => inPlaza(x, y) || inR(x, y, c.fountain) || c.landmarks.some(l => inR(x, y, l))
  const put = (x, y) => {
    if (!ok(x, y) || skip(x, y)) return
    g[y][x] = g[y][x] === 6 || g[y][x] === 10 ? 10 : 4
  }
  for (let x = 0; x < W; x++) { put(x, 21); put(x, 22) }
  for (let y = 0; y < H; y++) { put(28, y); put(29, y) }
}

function rects(bld) {
  const rs = []
  for (const b of bld) {
    const xs = b.p.map(q => q[0]), ys = b.p.map(q => q[1])
    const minX = Math.min(...xs), minY = Math.min(...ys)
    rs.push({
      name: b.n, x: Math.round(minX), y: Math.round(minY),
      w: cl(Math.max(...xs) - minX, 2, 7), h: cl(Math.max(...ys) - minY, 2, 5),
    })
  }
  return rs.sort((a, b) => (!!b.name - !!a.name) || b.w * b.h - a.w * a.h || a.x - b.x || a.y - b.y)
}

const near = (a, b) => a.x < b.x + b.w + 1 && b.x < a.x + a.w + 1 && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1

function okRect(r, g, real) {
  if (r.x < 1 || r.y < 1 || r.x + r.w > W - 1 || r.y + r.h > H - 1) return false
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (inKeep(x, y) || wet(g, x, y)) return false
  }
  return !real.some(a => near(r, a))
}

function pick(rs, g, m) {
  const real = []
  for (const r of rs) {
    if (real.length >= m) break
    if (okRect(r, g, real)) real.push(r)
  }
  return real
}

function occupy(g, real) {
  const occ = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inKeep(x, y) || wet(g, x, y)) occ[y * W + x] = 1
  }
  for (const r of real) {
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (ok(x, y)) occ[y * W + x] = 1
    }
  }
  return occ
}

function fits(st, x, y, face) {
  if (x < 1 || x > W - PW - 1 || y < 1 || y > H - PH - 1) return false
  const f = frontOf(x, y, face)
  if (st.occ[f.y * W + f.x]) return false
  for (let j = y; j < y + PH; j++) for (let i = x; i < x + PW; i++) {
    if (st.occ[j * W + i] || st.front.has(key(i, j))) return false
  }
  return true
}

function put(st, x, y, face) {
  const f = frontOf(x, y, face)
  const door = face === 's' ? { x: x + 2, y: y + 4 } : { x: x + 2, y }
  for (let j = y; j < y + PH; j++) for (let i = x; i < x + PW; i++) {
    st.occ[j * W + i] = 1
    st.g[j][i] = grass(i, j)
  }
  st.front.add(key(f.x, f.y))
  st.g[door.y][door.x] = 3
  if (st.g[f.y][f.x] <= 2) st.g[f.y][f.x] = 3
  st.plots.push({ slot: st.plots.length, x, y, w: PW, h: PH, door, face })
}

function scan(st, roadOnly) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const face of ['s', 'n']) {
    if (st.plots.length >= RPLOTS) return
    if (!fits(st, x, y, face)) continue
    if (roadOnly && !ROAD.has(st.g[frontOf(x, y, face).y][x + 2])) continue
    put(st, x, y, face)
  }
}

function place(g, real, passA) {
  const st = { g, occ: occupy(g, real), front: new Set(), plots: [] }
  if (passA) scan(st, true)
  scan(st, false)
  return st.plots.length === RPLOTS ? st : null
}

function tile(v) {
  return v === 6 ? 10 : (v <= 2 || !WALK.has(v)) ? 3 : v
}

function solidSet(c, plots, real, trees) {
  const s = new Set()
  const add = (r, skip) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (!(skip && skip.x === x && skip.y === y)) s.add(key(x, y))
    }
  }
  for (const l of c.landmarks) add(l, l.door)
  add(c.fountain)
  for (const p of plots) add(p, p.door)
  for (const r of real) add(r)
  for (const d of trees) s.add(key(d.x, d.y))
  return s
}

function reach(g, sol, sp) {
  const seen = new Set([key(sp.x, sp.y)])
  const q = [sp]
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]
    for (const [dx, dy] of NB) {
      const x = cur.x + dx, y = cur.y + dy, k = key(x, y)
      if (!ok(x, y) || seen.has(k) || sol.has(k) || !WALK.has(g[y][x])) continue
      seen.add(k)
      q.push({ x, y })
    }
  }
  return seen
}

function route(sol, seen, d) {
  const prev = new Map([[key(d.x, d.y), null]])
  const q = [d]
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]
    for (const [dx, dy] of NB) {
      const x = cur.x + dx, y = cur.y + dy, k = key(x, y)
      if (!ok(x, y) || prev.has(k) || sol.has(k)) continue
      if (seen.has(k)) {
        const out = []
        for (let c = cur; c; c = prev.get(key(c.x, c.y))) out.push(c)
        return out
      }
      prev.set(k, cur)
      q.push({ x, y })
    }
  }
  return null
}

function carve(g, sol, doors, f) {
  const sp = { x: f.x + 2, y: f.y + 3 }
  let seen = reach(g, sol, sp)
  for (const d of doors) {
    if (seen.has(key(d.x, d.y))) continue
    const path = route(sol, seen, d)
    if (!path) return false
    for (const { x, y } of path) g[y][x] = tile(g[y][x])
    seen = reach(g, sol, sp)
  }
  return true
}

const nearRoad = (g, x, y) => {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    if (ok(x + i, y + j) && ROAD.has(g[y + j][x + i])) return true
  }
  return false
}

function decorate(st, feat) {
  const decor = []
  const g = st.g
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (st.occ[y * W + x] || g[y][x] > 2 || st.front.has(key(x, y)) || nearRoad(g, x, y)) continue
    if (feat.parks.some(p => inPoly(p, x + 0.5, y + 0.5))) {
      if (hash(x * 3, y * 5) % 5 === 0) decor.push({ kind: 'tree', x, y, treeKind: TREES[hash(x, y) % 3] })
    } else if (hash(x * 7, y * 3) % 37 === 0) {
      decor.push({ kind: 'tree', x, y, treeKind: TREES[hash(x, y) % 3] })
    } else if (hash(x * 5, y * 11) % 23 === 0) {
      decor.push({ kind: 'flower', x, y })
    }
  }
  return decor
}

function finish(c, st, real, feat) {
  const g = st.g
  const doors = [...st.plots.map(p => p.door), ...c.landmarks.map(l => l.door)]
  if (!carve(g, solidSet(c, st.plots, real, []), doors, c.fountain)) return null
  let decor = decorate(st, feat)
  const before = g.map(r => r.slice())
  const trees = decor.filter(d => d.kind === 'tree')
  if (!carve(g, solidSet(c, st.plots, real, trees), doors, c.fountain)) {
    g.forEach((r, y) => { g[y] = before[y] })
    decor = decor.filter(d => d.kind !== 'tree')
    if (!carve(g, solidSet(c, st.plots, real, []), doors, c.fountain)) return null
  }
  return {
    v: 1, w: W, h: H, ground: g, plots: st.plots, landmarks: c.landmarks, fountain: c.fountain,
    square: c.square, decor, lilies: [], gates: c.gates, real,
  }
}

export function makeLayout(feat) {
  const t = districtTemplate()
  const c = JSON.parse(JSON.stringify({ landmarks: t.landmarks, fountain: t.fountain, square: t.square, gates: t.gates }))
  const g0 = base(c)
  water(g0, feat.water)
  roads(g0, feat.roads)
  join(g0, c)
  const rs = rects(feat.bld)
  for (let m = 12; m >= 0; m--) {
    const real = pick(rs, g0, m)
    for (const passA of [true, false]) {
      const st = place(g0.map(r => r.slice()), real, passA)
      if (st) return finish(c, st, real, feat)
    }
  }
  return null
}
