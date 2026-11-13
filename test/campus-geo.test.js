import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build, inside, ringDist } from '../scripts/campus-geo.mjs'

const LAT = 9.7554364
const LON = 76.649535
const osm = JSON.parse(readFileSync(new URL('./fixtures/kottayam.json', import.meta.url), 'utf8'))
const res = build(osm, LAT, LON)
const named = (n) => res.bld.find((b) => b.n === n)

function nums(v, out = []) {
  if (typeof v === 'number') out.push(v)
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => nums(x, out))
  return out
}

test('build is deterministic', () => {
  assert.deepEqual(build(osm, LAT, LON), build(osm, LAT, LON))
})

test('top level fields', () => {
  assert.equal(res.v, 1)
  assert.equal(res.w, 616)
  assert.equal(res.h, 594)
  assert.equal(res.m, 11)
  assert.equal(res.osm, 'way/1077351803')
})

test('named buildings have the right kind', () => {
  assert.equal(named('Admin Block').k, 'admin')
  assert.equal(named('Academic Block - 1').k, 'academic')
  assert.equal(named('Academic Block -2').k, 'academic')
  assert.equal(named('Manimala Hostel').k, 'hostel')
  assert.equal(named('Dining Hall').k, 'dining')
})

test('buildings have valid rings and heights', () => {
  assert.ok(res.bld.length >= 12)
  for (const b of res.bld) {
    assert.ok(b.p.length >= 3)
    assert.ok(b.h > 0)
    assert.notDeepEqual(b.p[0], b.p[b.p.length - 1])
  }
})

test('every door is outside its footprint and within 3 m of it', () => {
  for (const b of res.bld) {
    assert.equal(inside(b.door, b.p), false, b.n)
    assert.ok(ringDist(b.door, b.p) <= 3, b.n)
  }
})

test('there are 24 plots that clear buildings, water and each other', () => {
  assert.equal(res.plots.length, 24)
  const q = res.plots.map((p) => [p.x, p.z])
  for (const p of q) {
    for (const b of res.bld) {
      assert.equal(inside(p, b.p), false)
      assert.ok(ringDist(p, b.p) >= 8)
    }
    for (const w of res.water) assert.equal(inside(p, w), false)
  }
  for (let i = 0; i < q.length; i++) {
    for (let j = i + 1; j < q.length; j++) {
      assert.ok(Math.hypot(q[i][0] - q[j][0], q[i][1] - q[j][1]) >= 11)
    }
  }
})

test('spawn is free and inside the box', () => {
  const [x, z] = res.spawn
  assert.ok(x >= 0 && x <= 616)
  assert.ok(z >= 0 && z <= 594)
  for (const b of res.bld) assert.equal(inside(res.spawn, b.p), false)
})

test('every number has at most 2 decimals', () => {
  for (const v of nums(res)) assert.equal(Math.round(v * 100) / 100, v)
})

test('committed kottayam.json matches build output', () => {
  const file = JSON.parse(readFileSync(new URL('../public/town/campus/kottayam.json', import.meta.url), 'utf8'))
  assert.deepEqual(file, res)
})
