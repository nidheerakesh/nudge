import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { boxOf } from '../src/town/places.js'

const LAT = 9.7554364
const LON = 76.649535
const BW = 616
const BH = 484
const OX = 132
const OZ = 55
const W = 616
const H = 594
const STEP = 4
const PLOT_N = 24
const SKIP = new Set(['proposed', 'construction', 'platform'])
const PLOT_K = new Set(['service', 'pedestrian', 'track', 'tertiary', 'residential', 'unclassified'])
const RW = { secondary: 7, tertiary: 6, service: 4.5, pedestrian: 3, track: 3, footway: 2, path: 2, steps: 2, cycleway: 2 }
const HT = { academic: 14, hostel: 13.5, admin: 11, dining: 6, theatre: 1.2, house: 6.5, utility: 4, gym: 6, other: 7 }

const r2 = (v) => Math.round(v * 100) / 100 || 0
const pt = (v) => [r2(v[0]), r2(v[1])]
const sum = (ps, i) => ps.reduce((s, p) => s + p[i], 0)
const avg = (ps) => [sum(ps, 0) / ps.length, sum(ps, 1) / ps.length]
const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const elen = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])
const inBox = ([x, z]) => x >= -200 && x <= W + 200 && z >= -200 && z <= H + 200
const nameOf = (t) => (t.name || '').trim()

function proj(box, lat, lon) {
  return pt([((lon - box.w) / (box.e - box.w)) * BW + OX, ((box.n - lat) / (box.n - box.s)) * BH + OZ])
}

function parse(osm, box) {
  const nd = new Map()
  for (const e of osm.elements) if (e.type === 'node') nd.set(e.id, proj(box, e.lat, e.lon))
  return osm.elements
    .filter((e) => e.type === 'way')
    .map((w) => {
      const ids = w.nodes
      const closed = ids.length > 1 && ids[0] === ids[ids.length - 1]
      const p = (closed ? ids.slice(0, -1) : ids).map((id) => nd.get(id)).filter(Boolean)
      return { id: w.id, tags: w.tags || {}, closed, p }
    })
    .filter((w) => w.p.some(inBox))
}

function kindOf(t) {
  const nm = nameOf(t)
  if (/academic/i.test(nm)) return 'academic'
  if (t.tourism === 'hostel' || /hostel/i.test(nm)) return 'hostel'
  if (/admin/i.test(nm)) return 'admin'
  if (t.amenity === 'fast_food' || /dining|canteen|mess/i.test(nm)) return 'dining'
  if (t.amenity === 'theatre') return 'theatre'
  if (t.leisure === 'fitness_centre') return 'gym'
  if (t.building === 'house' || t.building === 'residential') return 'house'
  if (t.building === 'service' || /substation/i.test(nm)) return 'utility'
  return 'other'
}

function bldOf(w) {
  const k = kindOf(w.tags)
  return { id: w.id, n: nameOf(w.tags) || null, k, h: HT[k], p: w.p, c: pt(avg(w.p)) }
}

const roadOk = (w) => w.tags.highway && !SKIP.has(w.tags.highway) && w.p.length >= 2
const widthOf = (k) => RW[k] ?? 5
const roadOf = (w) => ({ k: w.tags.highway, w: widthOf(w.tags.highway), p: w.p })

function parkK(t) {
  if (t.amenity === 'parking') return 'parking'
  if (t.landuse === 'quarry') return 'quarry'
  return null
}

const areas = (ws, f) => ws.filter((w) => w.closed && w.p.length >= 3 && f(w.tags))

export function inside(q, ring) {
  let res = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if ((zi > q[1]) !== (zj > q[1]) && q[0] < ((xj - xi) * (q[1] - zi)) / (zj - zi) + xi) res = !res
  }
  return res
}

function segDist(q, a, b) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz
  const t = l2 ? Math.min(1, Math.max(0, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2)) : 0
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dz)
}

export function pathDist(q, p) {
  let res = Infinity
  for (let i = 0; i + 1 < p.length; i++) res = Math.min(res, segDist(q, p[i], p[i + 1]))
  return res
}

export const ringDist = (q, ring) => pathDist(q, [...ring, ring[0]])

const edgesOf = (ring) => ring.map((a, i) => [a, ring[(i + 1) % ring.length]])

function outward(e, ring) {
  const [a, b] = e
  const l = elen(e)
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const n = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]
  const at = (s) => pt([m[0] + n[0] * s * 2, m[1] + n[1] * s * 2])
  return inside(at(1), ring) ? at(-1) : at(1)
}

const roadDist = (q, rds) => Math.min(...rds.map((r) => pathDist(q, r.p)))

function doorOf(ring, blds, rds) {
  const es = edgesOf(ring).filter((e) => elen(e) > 0)
  const long = es.filter((e) => elen(e) >= 3)
  const cs = (long.length ? long : es).map((e) => outward(e, ring))
  const free = cs.filter((c) => !blds.some((b) => inside(c, b.p)))
  return free.reduce((a, c) => (roadDist(c, rds) < roadDist(a, rds) ? c : a))
}

function samples(p) {
  const res = []
  let acc = 0
  let next = 0
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i]
    const b = p[i + 1]
    const l = elen([a, b])
    if (!l) continue
    const u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
    for (; next <= acc + l; next += STEP) {
      const t = next - acc
      res.push({ s: pt([a[0] + u[0] * t, a[1] + u[1] * t]), u })
    }
    acc += l
  }
  return res
}

function candsOf(rds) {
  const res = []
  for (const r of rds.filter((v) => PLOT_K.has(v.k))) {
    const d = r.w / 2 + 9
    for (const sm of samples(r.p)) {
      for (const n of [[-sm.u[1], sm.u[0]], [sm.u[1], -sm.u[0]]]) {
        const c = pt([sm.s[0] + n[0] * d, sm.s[1] + n[1] * d])
        res.push([c[0], c[1], r2(Math.atan2(sm.s[0] - c[0], sm.s[1] - c[1]))])
      }
    }
  }
  return res
}

function bad(c, cx) {
  if (c[0] < 12 || c[0] > W - 12 || c[1] < 12 || c[1] > H - 12) return true
  if (cx.blds.some((b) => inside(c, b) || ringDist(c, b) < 8)) return true
  if (cx.areas.some((a) => inside(c, a) || ringDist(c, a) < 6)) return true
  return cx.roads.some((r) => pathDist(c, r.p) < r.w / 2 + 6)
}

function pick(srt, g) {
  const res = []
  for (const c of srt) {
    if (res.every((q) => dd(q, c) >= g)) res.push(c)
    if (res.length === PLOT_N) break
  }
  return res
}

function pickPlots(cands, mc) {
  const srt = cands.slice().sort((a, b) => dd(a, mc) - dd(b, mc))
  let res = []
  for (const g of [16, 13, 11]) {
    res = pick(srt, g)
    if (res.length === PLOT_N) return res.map(([x, z, r]) => ({ x, z, r }))
  }
  throw new Error(`found ${res.length} plots, need ${PLOT_N}`)
}

function spawnOf(rds, blds) {
  const adm = blds.find((b) => /admin/i.test(b.n || '')) || blds[0]
  const pts = rds.filter((r) => r.w >= 3).flatMap((r) => samples(r.p).map((sm) => sm.s))
  const ok = pts.filter(([x, z]) => x >= 12 && x <= W - 12 && z >= 12 && z <= H - 12)
  return ok.reduce((a, s) => (dd(s, adm.door) < dd(a, adm.door) ? s : a))
}

export function build(osm, lat, lon) {
  const ws = parse(osm, boxOf(lat, lon))
  const bl0 = ws.filter((w) => w.tags.building && w.p.length >= 3).map(bldOf)
  const rds = ws.filter(roadOk).map(roadOf)
  const bld = bl0.map((b) => ({ ...b, door: doorOf(b.p, bl0, rds) }))
  const water = areas(ws, (t) => t.natural === 'water').map((w) => w.p)
  const pitch = areas(ws, (t) => t.leisure === 'pitch').map((w) => w.p)
  const park = areas(ws, (t) => parkK(t)).map((w) => ({ k: parkK(w.tags), p: w.p }))
  const ed = ws.find((w) => w.closed && w.tags.amenity === 'university' && !w.tags.building)
  const cx = { blds: bld.map((b) => b.p), areas: [...water, ...pitch, ...park.map((v) => v.p)], roads: rds }
  const plots = pickPlots(candsOf(rds).filter((c) => !bad(c, cx)), avg(bld.map((b) => b.c)))
  return {
    v: 1,
    osm: 'way/1077351803',
    name: 'IIIT Kottayam',
    w: W,
    h: H,
    m: 11,
    bld,
    roads: rds,
    water,
    pitch,
    park,
    edge: ed ? ed.p : null,
    plots,
    spawn: spawnOf(rds, bld),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const osm = JSON.parse(readFileSync(new URL('../test/fixtures/kottayam.json', import.meta.url), 'utf8'))
  const res = build(osm, LAT, LON)
  writeFileSync(new URL('../public/town/campus/kottayam.json', import.meta.url), JSON.stringify(res))
  console.log(`buildings ${res.bld.length} roads ${res.roads.length} water ${res.water.length} pitch ${res.pitch.length} park ${res.park.length} plots ${res.plots.length} spawn ${JSON.stringify(res.spawn)} edge ${res.edge ? 'yes' : 'no'}`)
}
