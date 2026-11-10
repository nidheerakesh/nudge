import test from 'node:test'
import assert from 'node:assert/strict'
import { fitScale, baseScale } from '../public/town/engine.js'

test('tiny hut fills view height with max integer scale', () => {
  const s = fitScale(860, 1050, 160, 128, 1)
  assert.ok(128 * s <= 1050)
  assert.ok(128 * (s + 1) > 1050 || s === 8)
  assert.equal(s, 8)
})

test('fitScale stays within 2..8', () => {
  assert.equal(fitScale(300, 200, 384, 256, 1), 2)
  assert.equal(fitScale(2000, 2000, 16, 16, 1), 8)
})

test('baseScale keeps old street rule', () => {
  assert.equal(baseScale(860, 1050), Math.min(6, Math.max(2, Math.floor(860 / 200))))
  assert.equal(baseScale(100, 100), 2)
  assert.equal(baseScale(5000, 5000), 6)
})
