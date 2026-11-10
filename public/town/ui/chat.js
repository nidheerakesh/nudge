import { kicon } from './icons.js'
import { CHAT_MAX, CHAT_RATE_MS } from '../shared/protocol.js'

const MAX_LOG = 100

// House chat panel. Plain text only: every message is set through textContent.
export function createChat({ ui, host, selfId, isOwner, send, onReport, onBlock }) {
  const { h } = ui
  const log = h('div', { role: 'log', 'aria-live': 'polite', 'aria-label': 'House chat messages', class: 'col', style: { overflowY: 'auto', flex: '1 1 auto', minHeight: '80px', maxHeight: '28vh' } })
  const note = h('div', { class: 'small', role: 'status' })
  const members = h('div', { class: 'col' })
  const input = h('input', { type: 'text', maxlength: String(CHAT_MAX), placeholder: 'Say something kind', 'aria-label': 'Chat message', autocomplete: 'off', style: { flex: '1 1 auto', minHeight: '44px', minWidth: '0', border: '2px solid var(--k-edge)', borderRadius: '999px', padding: '0 14px' } })
  let lastSent = 0
  let noteT = 0
  let shut = true

  const say = msg => {
    note.textContent = msg
    clearTimeout(noteT)
    noteT = setTimeout(() => { note.textContent = '' }, 3000)
  }

  const go = () => {
    const text = input.value.trim()
    if (!text) return
    const now = Date.now()
    if (now - lastSent < CHAT_RATE_MS) { say('Slow mode: wait a second between messages'); return }
    if (send({ t: 'chat', text: text.slice(0, CHAT_MAX) })) {
      lastSent = now
      input.value = ''
    } else say('Not connected')
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); go() }
    else if (e.key === 'Escape') panel.close()
  })

  const iconBtn = (label, text, fn) => h('button', { class: 'k-btn icon', type: 'button', 'aria-label': label, title: label, onclick: fn }, text)

  const root = h('section', {
    'aria-label': 'House chat', hidden: true,
    class: 'k-panel col',
    style: { position: 'absolute', left: '8px', right: '8px', bottom: '8px', zIndex: '5', maxWidth: '420px', maxHeight: '60%', padding: '12px' },
  },
  h('div', { class: 'row' }, h('span', { class: 'k-title grow' }, 'House chat'),
    iconBtn('Close chat', kicon('close', 20), () => panel.close())),
  members, log, note,
  h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, input,
    iconBtn('Send cheer', kicon('party', 20), () => send({ t: 'emote', k: 'cheer' })),
    iconBtn('Send heart', kicon('heart', 20), () => send({ t: 'emote', k: 'heart' })),
    h('button', { class: 'k-btn pink', type: 'button', 'aria-label': 'Send message', onclick: go }, kicon('send', 20), 'Send')))
  host.append(root)

  const line = c => {
    const mine = c.id === selfId()
    const who = h('strong', null, mine ? 'You' : (c.name || 'Someone'))
    const body = h('span', null, ': ', String(c.text == null ? '' : c.text))
    return h('div', { style: { overflowWrap: 'anywhere' } }, who, body)
  }

  const panel = {
    el: root,
    get isOpen() { return !shut },
    open() { shut = false; root.hidden = false; input.focus() },
    close() { shut = true; root.hidden = true },
    toggle() { if (shut) panel.open(); else panel.close() },
    reset() {
      log.replaceChildren()
      members.replaceChildren()
      note.textContent = ''
    },
    push(c) {
      if (!c || typeof c !== 'object') return
      const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 24
      log.append(line(c))
      while (log.childNodes.length > MAX_LOG) log.firstChild.remove()
      if (stick) log.scrollTop = log.scrollHeight
    },
    err(code) {
      if (code === 'rate' || code === 'slow') say('Slow mode: wait a second between messages')
    },
    setMembers(list) {
      const me = selfId()
      members.replaceChildren(...(list || []).filter(p => p.id !== me).map(p => {
        const acts = h('div', { class: 'row', hidden: true })
        const add = (label, fn) => acts.append(h('button', { class: 'k-btn', type: 'button', 'aria-label': label + ' ' + p.name, onclick: fn }, label))
        if (isOwner()) {
          add('Mute', () => { send({ t: 'mute', user: p.id }); say(p.name + ' is muted') })
          add('Kick', async () => {
            if (await ui.confirmBox('Ask ' + p.name + ' to leave?', { ok: 'Kick', danger: true })) send({ t: 'kick', user: p.id })
          })
        }
        add('Report', async () => {
          if (await ui.confirmBox('Report ' + p.name + '?', { ok: 'Report', danger: true })) onReport(p)
        })
        add('Block', async () => {
          if (await ui.confirmBox('Block ' + p.name + '? You will not see each other in town.', { ok: 'Block', danger: true })) onBlock(p)
        })
        const tog = h('button', {
          class: 'k-btn icon', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Options for ' + p.name,
          onclick: () => { acts.hidden = !acts.hidden; tog.setAttribute('aria-expanded', String(!acts.hidden)) },
        }, kicon('more', 20))
        return h('div', { class: 'col' },
          h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('span', { class: 'grow' }, p.name || 'Someone'), tog), acts)
      }))
    },
    destroy() { clearTimeout(noteT); root.remove() },
  }
  return panel
}
