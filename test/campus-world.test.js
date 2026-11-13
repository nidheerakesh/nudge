import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as T from '../public/vendor/three.module.min.js'
import { buildWorld } from '../public/town/campus/world.js'

const real = new URL('../public/town/campus/kottayam.json', import.meta.url)

const sq = (x, z, s) => [[x, z], [x + s, z], [x + s, z + s], [x, z + s]]
const bld = (id, k, h, p) => ({ id, n: null, k, h, p, c: [p[0][0] + 5, p[0][1] + 5], door: [p[0][0] - 2, p[0][1] + 5] })

const L = [[300, 300], [330, 300], [330, 310], [310, 310], [310, 330], [300, 330]]

const geo = () => ({
  v: 1,
  w: 616,
  h: 484,
  m: 11,
  bld: [
    bld(1, 'academic', 14, sq(100, 100, 30)),
    bld(2, 'hostel', 13, sq(150, 100, 24).reverse()),
    bld(3, 'admin', 11, sq(200, 100, 20)),
    bld(4, 'dining', 6, sq(240, 100, 20)),
    bld(5, 'house', 6, sq(280, 100, 10)),
    bld(6, 'utility', 4, sq(300, 100, 8)),
    bld(7, 'gym', 8, sq(320, 100, 20)),
    bld(8, 'other', 7, sq(360, 100, 16)),
    bld(9, 'theatre', 1.2, sq(400, 100, 24)),
    bld(10, 'academic', 14, L)
  ],
  roads: [
    { k: 'secondary', w: 8, p: [[0, 200], [200, 210], [400, 190], [616, 200]] },
    { k: 'footway', w: 2, p: [[100, 50], [100, 400]] },
    { k: 'service', w: 4, p: [[50, 300], [250, 320]] },
    { k: 'track', w: 3, p: [[500, 300], [560, 400]] }
  ],
  water: [[[450, 250], [490, 250], [490, 280], [450, 280]]],
  pitch: [[[200, 350], [260, 350], [260, 390], [200, 390]]],
  park: [{ k: 'parking', p: sq(60, 60, 20) }, { k: 'quarry', p: sq(540, 40, 40) }],
  edge: [[20, 20], [600, 20], [600, 460], [20, 460]],
  plots: Array.from({ length: 24 }, (_, i) => ({ x: 20 + i * 20, z: 450, r: 0 })),
  spawn: [100, 200]
})

const trees = (n) => Array.from({ length: n }, (_, i) => ({ x: (i * 37) % 600, z: (i * 91) % 470, s: 0.8 + (i % 8) / 11, t: i % 3 }))
const mk = (g, tr = trees(30)) => buildWorld(T, g, { trees: tr, textures: false })

const meshes = (w) => {
  const a = []
  w.group.traverse((o) => o.isMesh && a.push(o))
  return a
}

const tris = (m) => {
  const g = m.geometry
  const n = (g.index ? g.index.count : g.attributes.position.count) / 3
  return n * (m.isInstancedMesh ? m.count : 1)
}

const nan = (w) => meshes(w).some((m) => Array.from(m.geometry.attributes.position.array).some(Number.isNaN))

test('builds and exposes the lights', () => {
  const w = mk(geo())
  assert.ok(w.group.isGroup)
  assert.ok(w.sun.isDirectionalLight)
  assert.ok(w.hemi.isHemisphereLight)
  assert.ok(w.sun.castShadow)
  assert.equal(w.sun.shadow.mapSize.x, 2048)
})

test('no NaN and nothing below ground', () => {
  const w = mk(geo())
  assert.equal(nan(w), false)
  w.group.updateMatrixWorld(true)
  assert.ok(new T.Box3().setFromObject(w.group).min.y > -0.5)
})

test('empty tree list and shadows off', () => {
  const w = buildWorld(T, geo(), { textures: false, shadows: false })
  assert.equal(w.sun.castShadow, false)
  assert.equal(nan(w), false)
})

test('wall height for a square building of 14 m', () => {
  const g = geo()
  g.bld = [bld(1, 'academic', 14, sq(100, 100, 30))]
  const w = mk(g)
  w.group.updateMatrixWorld(true)
  const ok = meshes(w).some((m) => {
    const b = new T.Box3().setFromObject(m)
    return b.max.y >= 14 && b.max.y < 16.5
  })
  assert.ok(ok)
})

test('roof sits over the walls', () => {
  const g = geo()
  g.bld = [bld(1, 'dining', 6, sq(100, 100, 30))]
  g.edge = null
  g.roads = []
  g.water = []
  g.pitch = []
  g.park = []
  const w = mk(g, [])
  const roof = meshes(w).find((m) => {
    const b = new T.Box3().setFromObject(m)
    return Math.abs(b.min.y - 6) < 1e-6 && Math.abs(b.max.y - 6) < 1e-6
  })
  assert.ok(roof)
  const b = new T.Box3().setFromObject(roof)
  assert.ok(Math.abs(b.min.x - 100) < 1e-6 && Math.abs(b.max.x - 130) < 1e-6)
  assert.ok(Math.abs(b.min.z - 100) < 1e-6 && Math.abs(b.max.z - 130) < 1e-6)
})

test('wall normals face outward for both windings', () => {
  for (const rev of [false, true]) {
    const g = geo()
    const p = sq(100, 100, 30)
    g.bld = [bld(1, 'dining', 6, rev ? p.slice().reverse() : p)]
    const w = mk(g)
    w.group.updateMatrixWorld(true)
    let found = false
    for (const m of meshes(w)) {
      const ps = m.geometry.attributes.position
      const ns = m.geometry.attributes.normal
      for (let i = 0; i < ps.count; i += 3) {
        const east = [0, 1, 2].every((j) => Math.abs(ps.getX(i + j) - 130) < 1e-6) && ps.getY(i) <= 6
        if (!east || ps.getZ(i) < 99) continue
        found = true
        for (let j = 0; j < 3; j++) assert.ok(ns.getX(i + j) > 0.9)
      }
    }
    assert.ok(found)
  }
})

test('theatre stays low and is not a box', () => {
  const g = geo()
  g.bld = [bld(9, 'theatre', 1.2, sq(400, 100, 24))]
  const w = mk(g)
  const m = meshes(w).filter((q) => new T.Box3().setFromObject(q).min.x >= 399)
  assert.ok(m.length)
  for (const q of m) assert.ok(new T.Box3().setFromObject(q).max.y <= 1.2 + 1e-6)
  assert.ok(m.some((q) => q.geometry.attributes.position.count > 100))
})

test('setHour', () => {
  const w = mk(geo())
  w.setHour(12)
  const i12 = w.sun.intensity
  const s12 = w.group.userData.sky
  w.setHour(18)
  w.setHour(2)
  assert.ok(i12 > w.sun.intensity)
  assert.ok(Number.isFinite(w.group.userData.sky))
  assert.ok(Number.isFinite(w.group.userData.fog))
  assert.notEqual(s12, w.group.userData.sky)
  for (let h = 0; h <= 24; h += 0.5) w.setHour(h)
})

test('update keeps the sun 180 m from its target', () => {
  const w = mk(geo())
  w.sun.target.position.set(50, 0, 60)
  w.update(1.5)
  const d = w.sun.position.distanceTo(w.sun.target.position)
  assert.ok(d > 170 && d < 190)
})

test('mesh count and dispose', () => {
  const w = mk(geo())
  assert.ok(meshes(w).length < 120)
  w.dispose()
})

test('real data', { skip: !existsSync(real) }, () => {
  const g = JSON.parse(readFileSync(real, 'utf8'))
  const w = mk(g, trees(600))
  const ms = meshes(w)
  const t = ms.reduce((a, m) => a + tris(m), 0)
  console.log('real data meshes', ms.length, 'triangles', t, 'draw calls approx', ms.length)
  assert.equal(nan(w), false)
  assert.ok(ms.length < 120)
  assert.ok(t < 250000)
  w.group.updateMatrixWorld(true)
  assert.ok(new T.Box3().setFromObject(w.group).min.y > -0.5)
  w.dispose()
})
