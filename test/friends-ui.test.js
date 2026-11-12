import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusText, inviteText } from '../public/town/ui/friends.js'

test('statusText covers the four cases', () => {
  assert.equal(statusText({ online: true, st: 'focus' }), 'Studying')
  assert.equal(statusText({ online: true, st: 'break' }), 'On a break')
  assert.equal(statusText({ online: true, st: 'idle' }), 'Online')
  assert.equal(statusText({ online: false, st: 'off' }), 'Offline')
})

test('inviteText for house and room invites', () => {
  assert.equal(inviteText({ from: { name: 'Ann' }, kind: 'house', ref: 'h:1' }), 'Ann invited you to their house')
  assert.equal(inviteText({ from: { name: 'Ann' }, kind: 'room', ref: 'room:3:2' }), 'Ann invited you to study room 2')
})
