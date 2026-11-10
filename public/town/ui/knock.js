import { kicon } from './icons.js'
export const WHY_TEXT = {
  closed: 'The door is closed',
  away: 'Not home right now',
  declined: 'They said no this time',
  blocked: 'You cannot visit this house',
  later: 'Maybe later',
}

export const whyText = why => WHY_TEXT[why] || 'Nobody answered'

// Knock dialogs. host is a positioned element the dialogs are placed in.
export function createKnock({ ui, portrait, host }) {
  const { h } = ui
  const box = h('div', {
    style: { position: 'absolute', left: '0', right: '0', top: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: '6', pointerEvents: 'none', padding: '0 12px' },
  })
  host.append(box)
  let wait = null
  const incoming = new Map()

  const card = (label, ...kids) => h('div', {
    class: 'k-panel col', role: 'dialog', 'aria-label': label,
    style: { pointerEvents: 'auto', width: 'min(360px,100%)', padding: '12px' },
  }, h('div', null, h('span', { class: 'k-title' }, kicon('bell', 18), ' Knock knock!')), ...kids)

  const clearWait = () => {
    if (wait) { wait.el.remove(); wait = null }
  }

  const k = {
    // visitor side
    waiting(name, onCancel) {
      clearWait()
      const cancel = h('button', {
        class: 'k-btn', type: 'button', 'aria-label': 'Cancel knocking',
        onclick: () => { clearWait(); if (onCancel) onCancel() },
      }, 'Cancel')
      const el = card('Knocking', h('div', { role: 'status' }, 'Knocking' + (name ? ' at ' + name + "'s door" : '') + '...'), cancel)
      box.append(el)
      wait = { el }
      cancel.focus()
    },
    done() { clearWait() },
    get isWaiting() { return !!wait },
    notice(why) {
      clearWait()
      const el = card('Door', h('div', { role: 'status' }, whyText(why)),
        h('button', { class: 'k-btn', type: 'button', 'aria-label': 'Close', onclick: () => el.remove() }, 'OK'))
      box.append(el)
      setTimeout(() => el.remove(), 4000)
    },
    // owner side
    incoming(kn, answer) {
      if (incoming.has(kn.id)) return
      const from = kn.from || {}
      let pic = null
      try {
        pic = portrait ? portrait(from.look) : null
      } catch (e) { pic = null }
      let img = null
      if (pic) {
        img = document.createElement('canvas')
        img.width = 32
        img.height = 32
        img.setAttribute('aria-hidden', 'true')
        img.style.cssText = 'width:64px;height:64px;image-rendering:pixelated'
        img.getContext('2d').drawImage(pic, 0, 0)
      }
      const close = () => {
        const e = incoming.get(kn.id)
        if (e) { e.remove(); incoming.delete(kn.id) }
      }
      const reply = allow => { close(); answer(kn.id, allow) }
      const allow = h('button', { class: 'k-btn mint', type: 'button', 'aria-label': 'Allow ' + (from.name || 'visitor') + ' in', onclick: () => reply(true) }, 'Allow')
      const later = h('button', { class: 'k-btn', type: 'button', 'aria-label': 'Maybe later', onclick: () => reply(false) }, 'Maybe Later')
      const el = card('Someone is knocking',
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, img,
          h('div', { class: 'grow' }, h('strong', null, from.name || 'Someone'), h('div', { role: 'status' }, 'Can I come in?'))),
        h('div', { class: 'row' }, allow, later))
      incoming.set(kn.id, el)
      box.append(el)
      allow.focus()
    },
    clear() {
      clearWait()
      for (const e of incoming.values()) e.remove()
      incoming.clear()
    },
    destroy() { k.clear(); box.remove() },
  }
  return k
}
