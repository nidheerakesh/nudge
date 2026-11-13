import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as T from '../public/vendor/three.module.min.js'
import { SKINS, HAIRS } from '../public/town/art/palette.js'
import { colorsOf, makeFigure, makeLabel, fitText } from '../public/town/campus/people.js'

const HEX = /^#[0-9A-Fa-f]{6}$/
const look = { skin: 1, hair: 1, hair_color: 1, outfit: 'casual', accessory: '' }

const descendants = (g) => {
  const out = []
  g.traverse((o) => {
    if (o !== g) out.push(o)
  })
  return out
}

const headOf = (g) => {
  let h = null
  g.traverse((o) => {
    if (o.isMesh && o.geometry.parameters && o.geometry.parameters.radius === 0.2) h = o
  })
  return h
}

test('colorsOf: null look gives four hex strings', () => {
  const c = colorsOf(null)
  for (const k of ['skin', 'hair', 'top', 'bottom']) assert.match(c[k], HEX)
})

test('colorsOf: same outfit name gives same top and bottom', () => {
  const a = colorsOf({ outfit: 'set:hoodie' })
  const b = colorsOf({ outfit: 'hoodie' })
  assert.equal(a.top, b.top)
  assert.equal(a.bottom, b.bottom)
})

test('colorsOf: skin index 2 gives SKINS[1][0]', () => {
  assert.equal(colorsOf({ skin: 2 }).skin, SKINS[1][0])
})

test('colorsOf: out of range indexes are clamped', () => {
  const hi = colorsOf({ skin: 99, hair_color: 99 })
  assert.equal(hi.skin, SKINS[SKINS.length - 1][0])
  assert.equal(hi.hair, HAIRS[HAIRS.length - 1][1])
  const lo = colorsOf({ skin: 0, hair_color: -3 })
  assert.equal(lo.skin, SKINS[0][0])
  assert.equal(lo.hair, HAIRS[0][1])
})

test('makeFigure: group is a Group standing on the floor, about 1.7 tall', () => {
  const f = makeFigure(T, look)
  assert.equal(f.group.isGroup, true)
  const b = new T.Box3().setFromObject(f.group)
  assert.ok(b.min.y > -0.01 && b.min.y < 0.01, `min.y ${b.min.y}`)
  assert.ok(b.max.y > 1.6 && b.max.y < 1.85, `max.y ${b.max.y}`)
  f.dispose()
})

test('makeFigure: pose while moving rotates some descendant', () => {
  const f = makeFigure(T, look)
  f.pose(0.2, true)
  assert.ok(descendants(f.group).some((o) => o.rotation.x !== 0))
  f.dispose()
})

test('makeFigure: pose while still eases every rotation.x to near zero', () => {
  const f = makeFigure(T, look)
  f.pose(0.2, true)
  for (let i = 0; i < 60; i++) f.pose(0.2 + i * 0.016, false)
  for (const o of descendants(f.group)) assert.ok(Math.abs(o.rotation.x) < 0.01, `rotation.x ${o.rotation.x}`)
  f.dispose()
})

test('makeFigure: setLook recolours the head to the new skin', () => {
  const f = makeFigure(T, look)
  f.setLook({ skin: 3 })
  const head = headOf(f.group)
  assert.equal(head.material.color.getHexString(), new T.Color(SKINS[2][0]).getHexString())
  f.dispose()
})

test('makeFigure: dispose does not throw', () => {
  const f = makeFigure(T, look)
  assert.doesNotThrow(() => f.dispose())
})

test('fitText: long text is cut to 64 characters ending in ...', () => {
  const s = fitText('x'.repeat(100))
  assert.equal(s.length, 64)
  assert.equal(s, 'x'.repeat(61) + '...')
})

test('fitText: trims spaces and null gives empty string', () => {
  assert.equal(fitText('  hi  '), 'hi')
  assert.equal(fitText(null), '')
  assert.equal(fitText(undefined), '')
})

test('makeLabel: in Node returns a sprite and no-op set and dispose', () => {
  const l = makeLabel(T, 'hello')
  assert.equal(l.sprite.isSprite, true)
  assert.doesNotThrow(() => l.set('hi'))
  assert.doesNotThrow(() => l.dispose())
})
