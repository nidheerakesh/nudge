import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  inPoly,
  segDist,
  ringDist,
  lineDist,
  bbox,
  makeCollider,
  scatter,
} from '../public/town/campus/geom.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

const sq = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]

const geo = {
  v: 1,
  name: 'test',
  w: 100,
  h: 100,
  m: 11,
  bld: [
    { id: 1, n: null, k: 'other', h: 10, p: sq(40, 40, 60, 60), c: [50, 50], door: [50, 38] },
    { id: 2, n: null, k: 'theatre', h: 10, p: sq(10, 70, 20, 80), c: [15, 75], door: [15, 68] },
  ],
  roads: [{ k: 'residential', w: 4, p: [[0, 50], [35, 50]] }],
  water: [sq(70, 10, 90, 30)],
  pitch: [sq(60, 80, 90, 95)],
  park: [{ k: 'parking', p: sq(5, 85, 30, 95) }],
  edge: null,
  plots: [
    { x: 85, z: 55, r: 0 },
    { x: 90, z: 60, r: 0 },
  ],
  spawn: [5, 5],
}

test('inPoly inside and outside', () => {
  const p = sq(0, 0, 10, 10)
  assert.equal(inPoly(p, 5, 5), true)
  assert.equal(inPoly(p, 15, 5), false)
  assert.equal(inPoly(p, -1, -1), false)
})

test('inPoly concave L shape', () => {
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]
  assert.equal(inPoly(L, 2, 2), true)
  assert.equal(inPoly(L, 2, 8), true)
  assert.equal(inPoly(L, 7, 7), false)
  assert.equal(inPoly(L, 20, 2), false)
})

test('segDist perpendicular, beyond end, zero length', () => {
  near(segDist(5, 3, 0, 0, 10, 0), 3)
  near(segDist(13, 4, 0, 0, 10, 0), 5)
  near(segDist(4, 5, 1, 1, 1, 1), 5)
})

test('ringDist includes the closing edge', () => {
  const tri = [[0, 0], [10, 0], [0, 10]]
  near(ringDist(tri, -2, 5), 2)
})

test('lineDist does not include the closing edge', () => {
  const tri = [[0, 0], [10, 0], [0, 10]]
  near(lineDist(tri, -2, 5), 7 / Math.SQRT2)
  near(lineDist([[3, 3]], 6, 7), 5)
})

test('bbox of a ring', () => {
  assert.deepEqual(bbox([[1, 5], [7, -2], [3, 9]]), { x0: 1, z0: -2, x1: 7, z1: 9 })
})

test('blocked', () => {
  const c = makeCollider(geo)
  assert.equal(c.blocked(50, 50, 0), true)
  assert.equal(c.blocked(39.7, 50, 0.5), true)
  assert.equal(c.blocked(38, 50, 0.5), false)
  assert.equal(c.blocked(15, 75, 0.5), false)
  assert.equal(c.blocked(80, 20, 0.5), true)
  assert.equal(c.blocked(-5, 50, 0.5), true)
  assert.equal(c.blocked(120, 50, 0.5), true)
})

test('blocked with extra circle', () => {
  const c = makeCollider(geo, [{ x: 30, z: 30, r: 2 }])
  assert.equal(c.blocked(31, 30, 0.5), true)
  assert.equal(c.blocked(36, 30, 0.5), false)
})

test('move slides along a wall', () => {
  const c = makeCollider(geo)
  const res = c.move(30, 45, 15, 2, 0.5)
  assert.equal(res.x, 30)
  assert.equal(res.z, 47)
})

test('move in open ground moves fully', () => {
  const c = makeCollider(geo)
  assert.deepEqual(c.move(20, 20, 1, 1, 0.5), { x: 21, z: 21 })
})

test('move boxed in returns the same point', () => {
  const c = makeCollider(geo, [{ x: 30, z: 30, r: 5 }])
  assert.deepEqual(c.move(30, 30, 0.5, 0.5, 0.5), { x: 30, z: 30 })
})

test('scatter is deterministic per seed', () => {
  const a = scatter(geo, 200, 1)
  assert.deepEqual(scatter(geo, 200, 1), a)
  assert.notDeepEqual(scatter(geo, 200, 2), a)
})

test('scatter respects exclusions and spacing', () => {
  const out = scatter(geo, 200, 1)
  const bld = geo.bld.filter((b) => b.k !== 'theatre')
  for (const t of out) {
    assert.ok(t.s >= 0.8 && t.s <= 1.5)
    assert.ok([0, 1, 2].includes(t.t))
    assert.equal(bld.some((b) => inPoly(b.p, t.x, t.z)), false)
    assert.ok(bld.every((b) => ringDist(b.p, t.x, t.z) > 4))
    assert.equal(inPoly(geo.water[0], t.x, t.z), false)
    assert.ok(geo.roads.every((r) => lineDist(r.p, t.x, t.z) >= r.w / 2 + 2.5))
  }
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const d = Math.hypot(out[i].x - out[j].x, out[i].z - out[j].z)
      assert.ok(d >= 3.5, `trees ${i} and ${j} are ${d} apart`)
    }
  }
})

test('scatter length and count', () => {
  assert.ok(scatter(geo, 200, 1).length <= 200)
  assert.ok(scatter(geo, 200, 1).length >= 50)
  assert.ok(scatter(geo, 5, 1).length <= 5)
})
