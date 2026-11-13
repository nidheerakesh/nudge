import { SKINS, HAIRS } from '../art/palette.js'

const TOPS = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D7BAFF', '#FFC8E4', '#C9F2E6']
const BOTTOMS = ['#B5C7F0', '#F0D9B5', '#C8E6C9', '#E6C8F0', '#F5E0A8', '#A8D8EA', '#E8B4B8', '#D4D4D4']
const PAD = 12
const MAXC = 64

const clampI = (v, n) => Math.min(n, Math.max(1, Math.trunc(Number(v)) || 1))

const hash = (s) => {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

const outfitName = (look) => {
  const s = String((look && look.outfit) || 'casual')
  return s.slice(s.indexOf(':') + 1) || 'casual'
}

export function colorsOf(look) {
  const l = look || {}
  const h = hash(outfitName(l))
  return {
    skin: SKINS[clampI(l.skin, SKINS.length) - 1][0],
    hair: HAIRS[clampI(l.hair_color, HAIRS.length) - 1][1],
    top: TOPS[h % TOPS.length],
    bottom: BOTTOMS[(h >>> 3) % BOTTOMS.length],
  }
}

const mat = (T, c) => new T.MeshStandardMaterial({ color: c, roughness: 0.8 })

const part = (T, geo, m, x, y, z) => {
  const me = new T.Mesh(geo, m)
  me.position.set(x, y, z)
  me.castShadow = true
  return me
}

const pivot = (T, x, y) => {
  const p = new T.Group()
  p.position.set(x, y, 0)
  return p
}

const paint = (m, c) => {
  m.skin.color.set(c.skin)
  m.hair.color.set(c.hair)
  m.top.color.set(c.top)
  m.bottom.color.set(c.bottom)
}

export function makeFigure(T, look) {
  const c = colorsOf(look)
  const m = { skin: mat(T, c.skin), hair: mat(T, c.hair), top: mat(T, c.top), bottom: mat(T, c.bottom) }
  const group = new T.Group()
  const pl = pivot(T, -0.1, 0.75)
  const pr = pivot(T, 0.1, 0.75)
  const al = pivot(T, -0.34, 1.32)
  const ar = pivot(T, 0.34, 1.32)
  const legGeo = new T.BoxGeometry(0.16, 0.75, 0.16)
  const armGeo = new T.BoxGeometry(0.12, 0.55, 0.12)
  pl.add(part(T, legGeo, m.bottom, 0, -0.375, 0))
  pr.add(part(T, legGeo, m.bottom, 0, -0.375, 0))
  al.add(part(T, armGeo, m.top, 0, -0.275, 0))
  ar.add(part(T, armGeo, m.top, 0, -0.275, 0))
  const torso = part(T, new T.BoxGeometry(0.5, 0.6, 0.28), m.top, 0, 1.05, 0)
  const head = part(T, new T.SphereGeometry(0.2, 24, 16), m.skin, 0, 1.52, 0)
  const hair = part(T, new T.SphereGeometry(0.215, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.hair, 0, 1.53, -0.025)
  group.add(pl, pr, al, ar, torso, head, hair)
  const pivots = [pl, pr, al, ar]
  return {
    group,
    setLook(l) {
      paint(m, colorsOf(l))
    },
    pose(t, moving) {
      if (moving) {
        const s = Math.sin(t * 9)
        pl.rotation.x = s * 0.7
        pr.rotation.x = -s * 0.7
        al.rotation.x = -s * 0.5
        ar.rotation.x = s * 0.5
        return
      }
      for (const p of pivots) p.rotation.x *= 0.8
      torso.position.set(0, 1.05, 0)
      torso.rotation.set(0, 0, 0)
    },
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
      })
      Object.values(m).forEach((x) => x.dispose())
    },
  }
}

export function fitText(s) {
  const t = s == null ? '' : String(s).trim()
  return t.length > MAXC ? t.slice(0, MAXC - 3) + '...' : t
}

const rect = (ctx, w, h) => {
  if (ctx.roundRect) {
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, 10)
    ctx.fill()
  } else ctx.fillRect(0, 0, w, h)
}

export function makeLabel(T, text, opts = {}) {
  if (typeof document === 'undefined') return { sprite: new T.Sprite(), set() {}, dispose() {} }
  const fg = opts.fg || '#2A1F2D'
  const bg = opts.bg || 'rgba(255,255,255,0.92)'
  const size = opts.size || 28
  const height = opts.height || 0.45
  const font = `600 ${size}px system-ui, sans-serif`
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const map = new T.CanvasTexture(canvas)
  const material = new T.SpriteMaterial({ map, depthTest: false, transparent: true })
  const sprite = new T.Sprite(material)
  sprite.renderOrder = 10
  const set = (s) => {
    const t = fitText(s)
    ctx.font = font
    const w = Math.ceil(ctx.measureText(t).width) + PAD * 2
    const h = size + PAD * 2
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.clearRect(0, 0, w, h)
    ctx.font = font
    ctx.fillStyle = bg
    rect(ctx, w, h)
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, w / 2, h / 2)
    map.needsUpdate = true
    sprite.scale.set((height * w) / h, height, 1)
  }
  set(text)
  return {
    sprite,
    set,
    dispose() {
      material.dispose()
      map.dispose()
    },
  }
}
