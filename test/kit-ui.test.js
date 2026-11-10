import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILES = ['knock', 'chat', 'timerwidget', 'wardrobe', 'shop', 'pantry', 'housedit']
const read = n => readFileSync(new URL('../public/town/ui/' + n + '.js', import.meta.url), 'utf8')

for (const n of FILES) {
  test(n + ': kawaii kit, no emoji', () => {
    const s = read(n)
    assert.doesNotMatch(s, /[\u{1F300}-\u{1FAFF}\u{2764}\u{22EF}]/u)
    assert.ok(s.includes('k-btn') || s.includes('k-panel'))
  })
}

test('chat: icon buttons keep aria-labels', () => {
  const s = read('chat')
  for (const l of ['Send cheer', 'Send heart', 'Close chat']) assert.ok(s.includes(l), l)
})
