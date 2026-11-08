import { getSprite, getAnim, has } from './art/pixel.js'

export const KINDS = ['clear', 'cloudy', 'rain', 'snow', 'leaves']

function hash(n) {
  let h = Math.imul(n | 0, 2654435761) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return (h ^ (h >>> 16)) >>> 0
}

function rnd(i, k) {
  return hash(i * 31 + k * 7919) / 4294967296
}

export function weatherFor(date = new Date()) {
  const key = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  const r = hash(key) % 100
  if (r < 40) return 'clear'
  if (r < 60) return 'cloudy'
  if (r < 75) return 'rain'
  if (r < 80) return 'snow'
  return 'leaves'
}

function frame(animId, t, i) {
  const a = getAnim(animId)
  if (!a) return null
  const f = a.frames[(Math.floor(t * a.fps) + i) % a.frames.length]
  return has(f) ? getSprite(f) : null
}

export function createWeather({ engine, kind } = {}) {
  const w = { kind: KINDS.includes(kind) ? kind : weatherFor() }

  w.setKind = k => { if (KINDS.includes(k)) w.kind = k }
  w.update = () => {}

  function clouds(ctx, cam, t, red, alpha) {
    const dr = red ? 0 : t
    for (let i = 0; i < 6; i++) {
      const id = `sky.cloud.${i % 3}`
      if (!has(id)) continue
      const cv = getSprite(id)
      const span = cam.w + cv.width * 2
      const x = ((rnd(i, 1) * span + dr * (2 + rnd(i, 2) * 3)) % span) - cv.width
      const y = Math.round(4 + ((i * 41 + rnd(i, 3) * 30) % Math.max(20, cam.h - 20)))
      ctx.globalAlpha = alpha
      ctx.drawImage(cv, Math.round(x), y)
    }
    ctx.globalAlpha = 1
  }

  function fall(ctx, cam, t, animId, n, vx, vy, jitter) {
    for (let i = 0; i < n; i++) {
      const sp = 0.7 + rnd(i, 4) * 0.6
      const sw = cam.w + 32, sh = cam.h + 32
      let x = rnd(i, 5) * sw + t * vx * sp
      let y = rnd(i, 6) * sh + t * vy * sp
      if (jitter) x += Math.sin(t * 1.5 + i) * jitter
      x = ((x % sw) + sw) % sw - 16
      y = ((y % sh) + sh) % sh - 16
      const cv = frame(animId, t, i)
      if (cv) ctx.drawImage(cv, Math.round(x), Math.round(y))
    }
  }

  function splashes(ctx, cam, t, n) {
    for (let i = 0; i < n; i++) {
      const cyc = 0.9
      const ph = (t + rnd(i, 7) * cyc) / cyc
      const k = Math.floor(ph)
      const f = Math.floor((ph - k) * 3)
      const id = `fx.splash.${f}`
      if (!has(id)) continue
      const x = rnd(i + k * 13, 8) * cam.w
      const y = rnd(i + k * 13, 9) * cam.h
      ctx.drawImage(getSprite(id), Math.round(x), Math.round(y))
    }
  }

  // screen-space overlay, drawn after the day/night tint
  w.draw = (ctx, cam, t) => {
    const red = !!(engine && engine.reduced)
    const area = cam.w * cam.h
    if (w.kind === 'cloudy' || w.kind === 'rain') {
      ctx.globalAlpha = w.kind === 'rain' ? 0.18 : 0.08
      ctx.fillStyle = '#5A6678'
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillRect(0, 0, cam.w, cam.h)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      clouds(ctx, cam, t, red, w.kind === 'rain' ? 0.75 : 0.6)
    }
    if (red) return
    if (w.kind === 'rain') {
      fall(ctx, cam, t, 'rain', Math.ceil(area / 2600), -14, 150, 0)
      splashes(ctx, cam, t, Math.ceil(area / 9000))
    } else if (w.kind === 'snow') {
      fall(ctx, cam, t, 'snow', Math.ceil(area / 3000), -4, 22, 5)
    } else if (w.kind === 'leaves') {
      fall(ctx, cam, t, 'leaves', Math.ceil(area / 9000), -18, 14, 7)
    }
  }

  return w
}
