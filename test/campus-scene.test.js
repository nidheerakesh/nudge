import { test } from 'node:test'
import assert from 'node:assert/strict'
import { landmarksOf, doorOf, dirOf } from '../public/town/campus/scene3d.js'
import { campusOf } from '../public/town/campus/index.js'

const b = (n, door) => ({ n, door, p: [], c: [0, 0], h: 5, k: 'other' })

test('campusOf picks the campus only for the IIIT Kottayam place', () => {
  assert.equal(campusOf({ place: { osm: 'way/1077351803' } }), 'kottayam')
  assert.equal(campusOf({ place: { osm: 'way/1' } }), null)
  assert.equal(campusOf({ place: null }), null)
  assert.equal(campusOf(null), null)
})

test('landmarksOf maps town services onto named campus buildings', () => {
  const geo = { bld: [b('Academic Block - 1', [1, 2]), b('Academic Block -2', [3, 4]), b('Admin Block', [5, 6]), b('Dining Hall', [7, 8]), b(null, [9, 9])] }
  assert.deepEqual(landmarksOf(geo).map(l => [l.kind, l.x, l.z]), [['hall', 1, 2], ['boutique', 3, 4], ['homestore', 5, 6], ['bakery', 7, 8]])
  assert.deepEqual(landmarksOf({ bld: [b(null, [0, 0])] }), [])
})

test('doorOf puts the door in front of the house, toward the road', () => {
  const d = doorOf({ x: 10, z: 10, r: 0 })
  assert.ok(Math.abs(d.x - 10) < 1e-9 && d.z > 15)
  const e = doorOf({ x: 10, z: 10, r: Math.PI / 2 })
  assert.ok(e.x > 15 && Math.abs(e.z - 10) < 1e-9)
})

test('dirOf gives the protocol direction from a world step', () => {
  assert.equal(dirOf(1, 0.2), 'r')
  assert.equal(dirOf(-1, 0.2), 'l')
  assert.equal(dirOf(0.1, 1), 'd')
  assert.equal(dirOf(0.1, -1), 'u')
})
