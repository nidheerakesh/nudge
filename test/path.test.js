import test from 'node:test'
import assert from 'node:assert/strict'
import { astar, walkableTile, smooth } from '../public/town/path.js'

const mk = (w, h, v = 0) => Array.from({ length: h }, () => new Array(w).fill(v))

test('open grid optimal length', () => {
  const g = mk(10, 10)
  const p = astar(g, 10, 10, { x: 0, y: 0 }, { x: 9, y: 9 })
  assert.equal(p.length, 19)
  assert.deepEqual(p[0], { x: 0, y: 0 })
  assert.deepEqual(p[p.length - 1], { x: 9, y: 9 })
  for (let i = 1; i < p.length; i++) {
    assert.equal(Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].y - p[i - 1].y), 1)
  }
})

test('around a wall', () => {
  const g = mk(7, 7)
  for (let y = 0; y < 6; y++) g[y][3] = 6
  const p = astar(g, 7, 7, { x: 0, y: 0 }, { x: 6, y: 0 })
  assert.ok(p)
  assert.equal(p.length, 6 + 6 + 6 + 1)
  assert.ok(p.every(c => walkableTile(g[c.y][c.x])))
})

test('unreachable', () => {
  const g = mk(5, 5)
  for (let y = 0; y < 5; y++) g[y][2] = 6
  assert.equal(astar(g, 5, 5, { x: 0, y: 0 }, { x: 4, y: 4 }), null)
})

test('start equals end', () => {
  const g = mk(3, 3)
  assert.deepEqual(astar(g, 3, 3, { x: 1, y: 1 }, { x: 1, y: 1 }), [{ x: 1, y: 1 }])
})

test('target in blocked tile goes to nearest neighbour', () => {
  const g = mk(5, 5)
  g[2][3] = 6
  const p = astar(g, 5, 5, { x: 0, y: 2 }, { x: 3, y: 2 })
  assert.deepEqual(p[p.length - 1], { x: 2, y: 2 })
})

test('smooth keeps corners only', () => {
  const p = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]
  assert.deepEqual(smooth(p), [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }])
})

test('200x200 best of 3 under 150ms', () => {
  const g = mk(200, 200)
  for (let y = 0; y < 199; y++) g[y][100] = 6
  let best = Infinity
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    const p = astar(g, 200, 200, { x: 0, y: 0 }, { x: 199, y: 0 })
    best = Math.min(best, performance.now() - t0)
    assert.ok(p)
  }
  assert.ok(best < 150, 'took ' + best)
})
