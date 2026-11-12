import { test } from 'node:test'
import assert from 'node:assert/strict'
import { roomLabel, clock, errText } from '../public/town/ui/room.js'

const now = 1000000

test('roomLabel: empty, focus, break and idle', () => {
  assert.equal(roomLabel({ n: 1, cnt: 0, phase: 'idle', end: 0 }, now), 'Empty')
  assert.equal(roomLabel({ n: 1, cnt: 2, phase: 'focus', end: now + 61000 }, now), '2 studying, 2 min left')
  assert.equal(roomLabel({ n: 1, cnt: 3, phase: 'break', end: now + 61000 }, now), '3 on a break')
  assert.equal(roomLabel({ n: 1, cnt: 1, phase: 'idle', end: 0 }, now), '1 waiting to start')
})

test('clock: formats remaining time as MM:SS', () => {
  assert.equal(clock(0), '00:00')
  assert.equal(clock(59000), '00:59')
  assert.equal(clock(600000), '10:00')
  assert.equal(clock(-5000), '00:00')
})

test('errText: known codes and fallback', () => {
  assert.equal(errText('full'), 'This room is full')
  assert.equal(errText('blocked'), 'You cannot join this room')
  assert.equal(errText('busy'), 'A round is already running')
  assert.equal(errText('quiet'), 'Chat opens when the round ends')
  assert.equal(errText('muted'), 'You cannot chat right now')
  assert.equal(errText('nope'), 'Something went wrong')
  assert.equal(errText('constructor'), 'Something went wrong')
})
