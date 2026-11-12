export function statusText(f) {
  if (!f.online) return 'Offline'
  if (f.st === 'focus') return 'Studying'
  if (f.st === 'break') return 'On a break'
  return 'Online'
}

export function inviteText(v) {
  const n = (/(\d+)$/.exec(v.ref) || [])[1] || ''
  if (v.kind === 'house') return v.from.name + ' invited you to their house'
  return v.from.name + ' invited you to study room ' + n
}

const EMPTY = 'No friends yet. Tap someone on the street to add them.'

export function openFriends(ctx) {
  const { h } = ctx.ui
  const note = h('p', { class: 'small', role: 'status' }, 'Loading...')
  const none = h('p', { class: 'muted', hidden: true }, EMPTY)
  const reqList = h('div', { class: 'list' })
  const friendList = h('div', { class: 'list' })
  const sentList = h('div', { class: 'list' })
  const section = (title, list) => h('div', { class: 'col', hidden: true }, h('strong', null, title), list)
  const reqBox = section('Requests', reqList)
  const friendBox = section('Friends', friendList)
  const sentBox = section('Sent', sentList)
  const btn = (label, fn) => h('button', { class: 'btn', type: 'button', style: { minHeight: '44px' }, onclick: fn }, label)

  async function act(fn) {
    try {
      await fn()
    } catch (e) {
      ctx.toast('Could not update friends')
    }
    await load()
  }

  async function invite(f) {
    try {
      await ctx.post('/invites', { to: f.id, kind: 'house', ref: 'h:' + ctx.uid })
      ctx.toast('Invite sent')
    } catch (e) {
      ctx.toast(e && e.code === 'rate' ? 'Too many invites, wait a minute' : 'Could not send the invite')
    }
  }

  async function remove(f) {
    if (!(await ctx.ui.confirmBox('Remove ' + f.name + ' from your friends?', { ok: 'Remove', danger: true }))) return
    await act(() => ctx.del('/friends/' + f.id))
  }

  const incRow = (f) => h('div', { class: 'item row', style: { alignItems: 'center' } },
    h('span', { class: 'grow' }, f.name),
    btn('Accept', () => act(() => ctx.post('/friends/' + f.id + '/accept'))),
    btn('Decline', () => act(() => ctx.del('/friends/' + f.id))))

  const friendRow = (f) => h('div', { class: 'item row', style: { alignItems: 'center' } },
    h('div', { class: 'col grow' }, h('span', null, f.name), h('small', { class: 'muted' }, statusText(f))),
    f.online ? btn('Invite home', () => invite(f)) : null,
    btn('Remove', () => remove(f)))

  const sentRow = (f) => h('div', { class: 'item row', style: { alignItems: 'center' } },
    h('span', { class: 'grow' }, f.name),
    btn('Cancel', () => act(() => ctx.del('/friends/' + f.id))))

  function fill(d) {
    const inc = d.incoming || []
    const fr = d.friends || []
    const out = d.outgoing || []
    reqList.replaceChildren(...inc.map(incRow))
    friendList.replaceChildren(...fr.map(friendRow))
    sentList.replaceChildren(...out.map(sentRow))
    reqBox.hidden = !inc.length
    friendBox.hidden = !fr.length
    sentBox.hidden = !out.length
    none.hidden = inc.length + fr.length + out.length > 0
  }

  async function load() {
    let d = null
    try {
      d = await ctx.get('/friends')
    } catch (e) {
      note.textContent = 'Could not load friends'
      return
    }
    note.textContent = ''
    fill(d)
  }

  const body = h('div', { class: 'col', style: { gap: '8px' } }, note, none, reqBox, friendBox, sentBox)
  const box = ctx.ui.sheet('Friends', h('div', { class: 'k-panel col', style: { padding: '12px' } }, body))
  load()
  return box
}

export function openPlayerCard(ctx, p) {
  const { h } = ctx.ui
  let box = null

  async function add() {
    try {
      const r = await ctx.post('/friends', { id: p.id })
      ctx.toast(r && r.status === 'ok' ? 'You are now friends' : 'Friend request sent')
    } catch (e) {
      ctx.toast(e && e.code === 'blocked' ? 'You cannot add this person' : 'Could not send the request')
    }
    box.close()
  }

  const btn = (label, fn) => h('button', { class: 'btn', type: 'button', style: { minHeight: '44px' }, onclick: fn }, label)
  const body = h('div', { class: 'col', style: { gap: '8px' } },
    btn('Add friend', add),
    btn('Report', () => { ctx.report(p); box.close() }),
    btn('Block', () => { ctx.block(p); box.close() }))
  box = ctx.ui.sheet(p.name, h('div', { class: 'k-panel col', style: { padding: '12px' } }, body))
  return box
}
