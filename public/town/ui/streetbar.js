import { CHAT_MAX, CHAT_RATE_MS, EMOTES } from '../shared/protocol.js'

export function canSend(last, now) {
  return now - last >= CHAT_RATE_MS
}

const cap = k => k.charAt(0).toUpperCase() + k.slice(1)

// Street chat bar. Plain text only: input and labels are set through the DOM API.
export function createStreetBar({ ui, send, onErr }) {
  const { h } = ui
  const note = h('div', { class: 'small', role: 'status', style: { minHeight: '20px' } })
  const input = h('input', { type: 'text', maxlength: String(CHAT_MAX), placeholder: 'Say something kind', 'aria-label': 'Say something on the street', autocomplete: 'off', style: { flex: '1 1 160px', minWidth: '0', minHeight: '44px', border: '2px solid var(--k-edge)', borderRadius: '999px', padding: '0 14px' } })
  let lastSent = 0
  let noteT = 0

  const say = msg => {
    note.textContent = msg
    clearTimeout(noteT)
    noteT = setTimeout(() => { note.textContent = '' }, 3000)
    if (onErr) onErr(msg)
  }

  const go = () => {
    const text = input.value.trim()
    if (!text) return
    const now = Date.now()
    if (!canSend(lastSent, now)) { say('Slow mode: wait a second'); return }
    if (send({ t: 'chat', text: text.slice(0, CHAT_MAX) })) {
      lastSent = now
      input.value = ''
    } else say('Not connected')
  }
  const emote = k => {
    if (!send({ t: 'emote', k })) say('Not connected')
  }

  input.addEventListener('keydown', e => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); go() }
  })
  input.addEventListener('keyup', e => { e.stopPropagation() })

  const btnStyle = { minHeight: '44px' }
  const emoteBtns = EMOTES.map(k => h('button', { class: 'k-btn', type: 'button', 'aria-label': 'Send ' + cap(k), style: btnStyle, onclick: () => emote(k) }, cap(k)))

  const el = h('div', {
    class: 'k-panel row', hidden: true,
    style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))', zIndex: '4', width: 'calc(100% - 16px)', maxWidth: '420px', padding: '8px', flexWrap: 'wrap', boxSizing: 'border-box' },
  },
  h('div', { class: 'row', style: { flexWrap: 'nowrap', width: '100%' } }, input,
    h('button', { class: 'k-btn pink', type: 'button', style: btnStyle, onclick: go }, 'Say')),
  h('div', { class: 'row', style: { width: '100%', flexWrap: 'wrap' } }, ...emoteBtns),
  note)

  return {
    el,
    show(v) { el.hidden = !v },
    destroy() { clearTimeout(noteT); el.remove() },
  }
}
