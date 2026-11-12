import { connect } from '../net.js'
import { ROOM_MAX, CHAT_MAX } from '../shared/protocol.js'

const PHASE = { idle: 'Waiting to start', focus: 'Focus', break: 'Break' }
const ERR = {
  full: 'This room is full',
  blocked: 'You cannot join this room',
  busy: 'A round is already running',
  quiet: 'Chat opens when the round ends',
  muted: 'You cannot chat right now',
}
const MAX_LOG = 100
const pad = v => (v < 10 ? '0' : '') + v

export function roomLabel(r, now) {
  if (!r.cnt) return 'Empty'
  if (r.phase === 'focus') return r.cnt + ' studying, ' + Math.max(0, Math.ceil((r.end - now) / 60000)) + ' min left'
  if (r.phase === 'break') return r.cnt + ' on a break'
  return r.cnt + ' waiting to start'
}

export function clock(ms) {
  const s = ms > 0 ? Math.ceil(ms / 1000) : 0
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60)
}

export function errText(code) {
  return Object.hasOwn(ERR, code) ? ERR[code] : 'Something went wrong'
}

function roomUrl(n, district) {
  const p = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = typeof location !== 'undefined' ? location.host : ''
  return p + '//' + host + '/api/town/room/' + n + '/ws?district=' + encodeURIComponent(district)
}

export function openRooms(ctx) {
  const { h } = ctx.ui
  const district = Number.isInteger(ctx.district) ? ctx.district : ctx.me && ctx.me.plot ? ctx.me.plot.district : 0
  const body = h('div', { class: 'col', style: { gap: '8px' } })
  const note = h('p', { class: 'muted', role: 'status' })
  const rows = h('div', { class: 'list' })
  let sock = null
  let num = 0
  let phase = 'idle'
  let end = 0
  let members = []
  let listing = false
  let listT = null
  let tickT = null
  let closed = false

  const listView = h('div', { class: 'col', style: { gap: '8px' } },
    note, rows,
    h('button', { class: 'btn', type: 'button', style: { minHeight: '44px' }, onclick: () => loadRooms() }, 'Refresh'))

  const head = h('strong', { class: 'grow' })
  const who = h('div', { class: 'list' })
  const clockEl = h('div', { style: { fontSize: '2.5rem', fontWeight: '700', textAlign: 'center' } }, clock(0))
  const phaseEl = h('strong', { style: { textAlign: 'center' } })
  const focusNote = h('p', { class: 'small' }, 'Start your own focus timer too, so your time counts.')
  const startRow = h('div', { class: 'row' },
    ...[25, 50].map(m => h('button', { class: 'btn primary', type: 'button', style: { minHeight: '44px' }, onclick: () => { if (sock) sock.send({ t: 'round', mins: m }) } }, 'Start ' + m + ' min')))
  const log = h('div', { role: 'log', 'aria-live': 'polite', 'aria-label': 'Room chat messages', class: 'col', style: { overflowY: 'auto', flex: '1 1 auto', minHeight: '80px', maxHeight: '28vh' } })
  const input = h('input', { type: 'text', maxlength: String(CHAT_MAX), placeholder: 'Say something kind', 'aria-label': 'Chat message', autocomplete: 'off', style: { flex: '1 1 auto', minHeight: '44px', minWidth: '0' } })
  const sendBtn = h('button', { class: 'btn', type: 'button', style: { minHeight: '44px' }, onclick: () => sendChat() }, 'Send')
  const chatRow = h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, input, sendBtn)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      sendChat()
    }
  })
  const roomView = h('div', { class: 'col', style: { gap: '8px' } },
    h('div', { class: 'row', style: { alignItems: 'center' } }, head,
      h('button', { class: 'btn', type: 'button', style: { minHeight: '44px' }, onclick: () => showList() }, 'Leave room')),
    who, clockEl, phaseEl, startRow, focusNote, log, chatRow)

  function show(el) {
    body.replaceChildren(el)
  }

  function paint() {
    phaseEl.textContent = PHASE[phase] || PHASE.idle
    startRow.hidden = phase !== 'idle'
    focusNote.hidden = phase !== 'focus'
    input.disabled = phase === 'focus'
    sendBtn.disabled = phase === 'focus'
    input.placeholder = phase === 'focus' ? 'Chat opens on the break' : 'Say something kind'
    tick()
  }

  function tick() {
    clockEl.textContent = phase === 'idle' ? clock(0) : clock(end - Date.now())
  }

  function startTick() {
    stopTick()
    tick()
    tickT = setInterval(tick, 1000)
  }

  function stopTick() {
    clearInterval(tickT)
    tickT = null
  }

  function startList() {
    stopList()
    listT = setInterval(loadRooms, 15000)
  }

  function stopList() {
    clearInterval(listT)
    listT = null
  }

  function paintWho() {
    who.replaceChildren(...members.map(p => h('div', { class: 'item row' },
      h('span', { class: 'grow' }, p.name || 'Someone'),
      h('small', { class: 'muted' }, p.st === 'focus' ? 'focusing' : 'ready'))))
  }

  function addChat(m) {
    const bl = ctx.me && Array.isArray(ctx.me.blocked) ? ctx.me.blocked : []
    if (bl.includes(m.id)) return
    log.append(h('div', { style: { overflowWrap: 'anywhere' } },
      h('strong', null, m.name || 'Someone'),
      h('span', null, ': ', String(m.text == null ? '' : m.text))))
    while (log.childNodes.length > MAX_LOG) log.firstChild.remove()
    log.scrollTop = log.scrollHeight
  }

  function sendChat() {
    const text = input.value.trim()
    if (!text || !sock || phase === 'focus') return
    if (sock.send({ t: 'chat', text: text.slice(0, CHAT_MAX) })) input.value = ''
  }

  function onRound(m) {
    phase = m.phase || 'idle'
    end = m.end || 0
    if (phase === 'bonus') {
      phase = 'idle'
      ctx.toast('Round done together. +' + m.coins + ' coins')
      ctx.refresh().catch(() => {})
    }
    paint()
  }

  function onErr(code) {
    ctx.toast(errText(code))
    if (code === 'full' || code === 'blocked') showList()
  }

  function onMsg(m) {
    if (closed) return
    if (m.t === 'inside') {
      members = m.members || []
      paintWho()
    } else if (m.t === 'round') onRound(m)
    else if (m.t === 'chat') addChat(m)
    else if (m.t === 'err') onErr(m.code)
  }

  function leave() {
    if (sock) {
      sock.send({ t: 'leave' })
      sock.close()
    }
    sock = null
  }

  function join(n) {
    leave()
    listing = false
    stopList()
    num = n
    phase = 'idle'
    end = 0
    members = []
    head.textContent = 'Room ' + num
    log.replaceChildren()
    input.value = ''
    paintWho()
    paint()
    show(roomView)
    startTick()
    sock = connect(roomUrl(n, district), { message: onMsg })
  }

  function showList() {
    leave()
    stopTick()
    listing = true
    show(listView)
    loadRooms()
    startList()
  }

  function roomRow(r, now) {
    const b = h('button', { class: 'btn', type: 'button', 'aria-label': 'Join room ' + r.n, style: { minHeight: '44px' }, onclick: () => join(r.n) }, 'Join')
    b.disabled = r.cnt >= ROOM_MAX
    return h('div', { class: 'item row', style: { alignItems: 'center' } },
      h('div', { class: 'col grow' }, h('strong', null, 'Room ' + r.n), h('span', { class: 'small muted' }, roomLabel(r, now))),
      b)
  }

  async function loadRooms() {
    let data = null
    try { data = await ctx.get('/rooms?district=' + district) } catch (e) { data = null }
    if (closed || !listing) return
    note.textContent = data ? '' : 'Could not load the rooms, try again.'
    const list = data && Array.isArray(data.rooms) ? data.rooms : []
    const now = Date.now()
    rows.replaceChildren(...list.map(r => roomRow(r, now)))
  }

  function cleanup() {
    closed = true
    stopList()
    stopTick()
    leave()
  }

  const box = ctx.ui.sheet('Study rooms', h('div', { class: 'k-panel col', style: { padding: '12px' } }, body), { onClose: cleanup })
  showList()
  return box
}
