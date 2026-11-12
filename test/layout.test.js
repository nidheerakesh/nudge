import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { project, makeLayout, RPLOTS } from '../public/town/shared/layout.js'
import { districtTemplate, W, H, WALK } from '../public/town/shared/plots.js'

const osm = JSON.parse(readFileSync(new URL('./fixtures/kottayam.json', import.meta.url), 'utf8'))
const box = { s: 9.75322, w: 76.64809, n: 9.75758, e: 76.65372 }
const feat = project(osm, box)
const empty = { v: 1, roads: [], water: [], parks: [], bld: [] }
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const polys = f => [...f.roads.map(r => r.p), ...f.water, ...f.parks, ...f.bld.map(b => b.p)]
const decs = v => (String(v).split('.')[1] || '').length

function cellsOf(r, skip) {
  const out = []
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (!(skip && skip.x === x && skip.y === y)) out.push([x, y])
  }
  return out
}

function solidOf(lay) {
  const s = new Set()
  const add = (r, skip) => { for (const [x, y] of cellsOf(r, skip)) s.add(x + ',' + y) }
  for (const l of lay.landmarks) add(l, l.door)
  add(lay.fountain)
  for (const p of lay.plots) add(p, p.door)
  for (const r of lay.real) add(r)
  for (const d of lay.decor) if (d.kind === 'tree') s.add(d.x + ',' + d.y)
  return s
}

function reached(lay) {
  const sol = solidOf(lay)
  const sp = { x: lay.fountain.x + 2, y: lay.fountain.y + 3 }
  const seen = new Set([sp.x + ',' + sp.y])
  const q = [sp]
  while (q.length) {
    const c = q.shift()
    for (const [i, j] of NB) {
      const x = c.x + i, y = c.y + j, k = x + ',' + y
      if (x < 0 || y < 0 || x >= W || y >= H || seen.has(k) || sol.has(k) || !WALK.has(lay.ground[y][x])) continue
      seen.add(k)
      q.push({ x, y })
    }
  }
  return seen
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('project reads the fixture into compact features', () => {
  assert.ok(feat.bld.length >= 10)
  assert.ok(feat.bld.some(b => b.n === 'Dining Hall'))
  assert.ok(feat.roads.length > 0)
  assert.ok(JSON.stringify(feat).length < 60000)
  for (const p of polys(feat)) for (const [x, y] of p) assert.ok(decs(x) <= 1 && decs(y) <= 1)
})

test('makeLayout gives 24 plots with slots, sizes and doors', () => {
  const lay = makeLayout(feat)
  assert.ok(lay)
  assert.equal(lay.plots.length, RPLOTS)
  assert.equal(RPLOTS, 24)
  lay.plots.forEach((p, i) => {
    assert.equal(p.slot, i)
    assert.equal(p.w, 6)
    assert.equal(p.h, 5)
    const door = p.face === 's' ? { x: p.x + 2, y: p.y + 4 } : { x: p.x + 2, y: p.y }
    assert.deepEqual(p.door, door)
  })
})

test('plots, landmarks, fountain and real buildings do not overlap', () => {
  const lay = makeLayout(feat)
  const rs = [...lay.plots, ...lay.landmarks, lay.fountain, ...lay.real]
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    assert.ok(!overlap(rs[i], rs[j]), `overlap ${i} ${j}`)
  }
})

test('no plot or real building cell is water', () => {
  const lay = makeLayout(feat)
  for (const r of [...lay.plots, ...lay.real]) {
    for (const [x, y] of cellsOf(r)) assert.notEqual(lay.ground[y][x], 6)
  }
})

test('every plot door and landmark door is reachable from the spawn', () => {
  const lay = makeLayout(feat)
  const seen = reached(lay)
  for (const d of [...lay.plots.map(p => p.door), ...lay.landmarks.map(l => l.door)]) {
    assert.ok(seen.has(d.x + ',' + d.y), `door ${d.x},${d.y}`)
  }
})

test('the fixture yields at least 5 real buildings, 3 of them named', () => {
  const real = makeLayout(feat).real
  assert.ok(real.length >= 5)
  assert.ok(real.filter(r => r.name !== null).length >= 3)
})

test('makeLayout is deterministic and leaves the cached template alone', () => {
  const before = JSON.stringify(districtTemplate())
  assert.deepStrictEqual(makeLayout(feat), makeLayout(feat))
  assert.equal(JSON.stringify(districtTemplate()), before)
})

test('an empty feature gives 24 reachable plots', () => {
  const lay = makeLayout(empty)
  assert.ok(lay)
  assert.equal(lay.plots.length, RPLOTS)
  const seen = reached(lay)
  for (const p of lay.plots) assert.ok(seen.has(p.door.x + ',' + p.door.y))
})

test('water covering the whole map gives null', () => {
  const water = [[[0, 0], [56, 0], [56, 44], [0, 44]]]
  assert.equal(makeLayout({ ...empty, water }), null)
})

test('makeLayout on the fixture takes under 300 ms', () => {
  const t0 = performance.now()
  makeLayout(feat)
  assert.ok(performance.now() - t0 < 300)
})
