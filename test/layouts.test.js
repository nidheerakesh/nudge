import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { project, RPLOTS } from '../public/town/shared/layout.js'
import { districtTemplate } from '../public/town/shared/plots.js'
import { layoutOf, makeLayouts } from '../public/town/layouts.js'

const osm = JSON.parse(readFileSync(new URL('./fixtures/kottayam.json', import.meta.url), 'utf8'))
const feat = project(osm, { s: 9.75322, w: 76.64809, n: 9.75758, e: 76.65372 })
const place = { display: 'Kottayam', osm: 'node/1' }

test('layoutOf with no info falls back to the generic template', () => {
  const lay = layoutOf(null)
  assert.equal(lay.real, false)
  assert.equal(lay.place, null)
  assert.equal(lay.tpl.plots.length, districtTemplate().plots.length)
})

test('layoutOf with a feature builds a real layout and keeps the place', () => {
  const lay = layoutOf({ feat, place })
  assert.equal(lay.real, true)
  assert.deepEqual(lay.place, place)
  assert.equal(lay.tpl.plots.length, RPLOTS)
  assert.ok(lay.tpl.real.length >= 5)
})

test('layoutOf with no feature keeps the place but uses the generic template', () => {
  const lay = layoutOf({ place })
  assert.equal(lay.real, false)
  assert.deepEqual(lay.place, place)
  assert.equal(lay.tpl.plots.length, districtTemplate().plots.length)
})

test('load caches one promise per district', async () => {
  let calls = 0
  const { load } = makeLayouts(async () => { calls++; return { feat, place } })
  const a = load(3)
  const b = load(3)
  assert.equal(a, b)
  const res = await a
  assert.equal(res.real, true)
  assert.equal(calls, 1)
})

test('a failed fetch falls back and is retried on the next load', async () => {
  let calls = 0
  const { load } = makeLayouts(async () => {
    calls++
    if (calls === 1) throw new Error('offline')
    return { feat, place }
  })
  const first = await load(2)
  assert.equal(first.real, false)
  assert.equal(first.place, null)
  const second = await load(2)
  assert.equal(second.real, true)
  assert.equal(calls, 2)
})

test('the cached template is not mutated by layouts', () => {
  const before = JSON.stringify(districtTemplate())
  layoutOf({ feat, place })
  layoutOf(null)
  assert.equal(JSON.stringify(districtTemplate()), before)
})
