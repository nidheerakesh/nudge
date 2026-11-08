const NS = 'http://www.w3.org/2000/svg'

function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag)
  for (const k of Object.keys(attrs || {})) el.setAttribute(k, attrs[k])
  for (const c of kids) el.append(c)
  return el
}

function tomato() {
  return svg('svg', { viewBox: '0 0 32 32', width: '34', height: '34', 'aria-hidden': 'true', focusable: 'false' },
    svg('circle', { cx: '16', cy: '18', r: '11', fill: '#d9453b', stroke: '#7a1d17', 'stroke-width': '1.5' }),
    svg('path', { d: 'M9 9 L16 12 L23 9 L19 14 L13 14 Z', fill: '#4f9a3c', stroke: '#2d5f22', 'stroke-width': '1' }),
    svg('path', { d: 'M16 7 L16 12', stroke: '#2d5f22', 'stroke-width': '2', 'stroke-linecap': 'round' }))
}

function glyph(paused) {
  return paused
    ? svg('svg', { viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' }, svg('path', { d: 'M8 5 L19 12 L8 19 Z', fill: 'currentColor' }))
    : svg('svg', { viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' },
      svg('rect', { x: '6', y: '5', width: '4', height: '14', fill: 'currentColor' }),
      svg('rect', { x: '14', y: '5', width: '4', height: '14', fill: 'currentColor' }))
}

const fmt = ms => {
  const s = Math.max(0, Math.round(ms / 1000))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

// Floating tomato timer wired to the shared focus timer in store.
export function createTimerWidget({ ui, store }) {
  const { h } = ui
  const time = h('span', { style: { font: '700 22px/1 "Plus Jakarta Sans",system-ui,sans-serif', fontVariantNumeric: 'tabular-nums', minWidth: '58px', textAlign: 'center' }, 'aria-live': 'off' }, '')
  const btn = h('button', { class: 'btn icon', type: 'button', style: { borderRadius: '50%' } })
  const wrap = h('div', {
    role: 'group', 'aria-label': 'Focus timer',
    style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px 6px 12px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '999px', boxShadow: '0 4px 14px rgba(0,0,0,.18)' },
  }, tomato(), time, btn)
  let busy = false

  const draw = () => {
    const t = store.timer()
    const paused = !t || !!t.paused_at
    time.textContent = t ? fmt(store.remainingMs(t)) : fmt(Number(store.pref('focus_mins', 45)) * 60000)
    btn.replaceChildren(glyph(paused))
    btn.setAttribute('aria-label', !t ? 'Start focus timer' : t.paused_at ? 'Resume focus timer' : 'Pause focus timer')
  }

  btn.addEventListener('click', async () => {
    if (busy) return
    busy = true
    try {
      const t = store.timer()
      if (!t) await store.startTimer({ title: 'Focus', mins: Number(store.pref('focus_mins', 45)) || 45 })
      else if (t.paused_at) await store.resumeTimer()
      else await store.pauseTimer()
    } catch (e) {
      ui.toast('Could not change the timer')
    }
    busy = false
    draw()
  })

  draw()
  const off = store.on(draw)
  const iv = setInterval(draw, 1000)
  return {
    el: wrap,
    destroy() { clearInterval(iv); if (off) off() },
  }
}
