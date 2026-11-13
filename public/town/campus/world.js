const PI = Math.PI
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function rng(s) {
  let a = s >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function merge(T, gs) {
  const l = gs.map((g) => (g.index ? g.toNonIndexed() : g))
  const g = new T.BufferGeometry()
  for (const k of Object.keys(l[0].attributes)) {
    const sz = l[0].attributes[k].itemSize
    let n = 0
    for (const q of l) n += q.attributes[k].array.length
    const a = new Float32Array(n)
    let o = 0
    for (const q of l) {
      a.set(q.attributes[k].array, o)
      o += q.attributes[k].array.length
    }
    g.setAttribute(k, new T.BufferAttribute(a, sz))
  }
  return g
}

const nb = (vc) => ({ p: [], n: [], u: [], c: vc ? [] : null, col: [1, 1, 1] })

function tri(b, a, c, d, n, ua, uc, ud) {
  const e = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const f = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
  const x = e[1] * f[2] - e[2] * f[1]
  const y = e[2] * f[0] - e[0] * f[2]
  const z = e[0] * f[1] - e[1] * f[0]
  if (x * n[0] + y * n[1] + z * n[2] < 0) {
    const t = c
    c = d
    d = t
    const w = uc
    uc = ud
    ud = w
  }
  b.p.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2])
  for (let i = 0; i < 3; i++) b.n.push(n[0], n[1], n[2])
  b.u.push(ua[0], ua[1], uc[0], uc[1], ud[0], ud[1])
  if (b.c) for (let i = 0; i < 3; i++) b.c.push(b.col[0], b.col[1], b.col[2])
}

const Z2 = [0, 0]

function quad(b, p0, p1, p2, p3, n, uv) {
  const u = uv || [Z2, Z2, Z2, Z2]
  tri(b, p0, p1, p2, n, u[0], u[1], u[2])
  tri(b, p0, p2, p3, n, u[0], u[2], u[3])
}

function toGeo(T, b) {
  if (!b.p.length) return null
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(b.p, 3))
  g.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(b.u, 2))
  if (b.c) g.setAttribute('color', new T.Float32BufferAttribute(b.c, 3))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}

function setc(c, b, hex) {
  const k = new c.T.Color(hex)
  b.col = [k.r, k.g, k.b]
}

function cleanRing(p) {
  const o = []
  const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.01
  for (const q of p) if (!o.length || far(q, o[o.length - 1])) o.push(q)
  while (o.length > 1 && !far(o[0], o[o.length - 1])) o.pop()
  return o
}

function area(p) {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

function cent(p) {
  let x = 0
  let z = 0
  for (const q of p) {
    x += q[0]
    z += q[1]
  }
  return [x / p.length, z / p.length]
}

function inside(p, x, z) {
  let r = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]
    const b = p[j]
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) r = !r
  }
  return r
}

function outN(p, i, ccw) {
  const a = p[i]
  const b = p[(i + 1) % p.length]
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l = Math.hypot(dx, dz) || 1
  return ccw ? [dz / l, 0, -dx / l] : [-dz / l, 0, dx / l]
}

function walls(b, p, y0, y1, o = {}) {
  const ccw = area(p) > 0
  const vk = o.vk || 1
  let u = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const c = p[(i + 1) % p.length]
    const l = Math.hypot(c[0] - a[0], c[1] - a[1])
    if (l < 0.01) continue
    const n0 = outN(p, i, ccw)
    const n = o.inv ? [-n0[0], 0, -n0[2]] : n0
    const ub = o.uv ? u + Math.max(1, Math.round(l / 4)) * 4 : u + l
    const uv = [[u, y0 * vk], [ub, y0 * vk], [ub, y1 * vk], [u, y1 * vk]]
    quad(b, [a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], n, uv)
    u = ub
  }
}

function parapet(b, p, h, t, ph) {
  const ccw = area(p) > 0
  walls(b, p, h, h + ph)
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const c = p[(i + 1) % p.length]
    const n = outN(p, i, ccw)
    const y = h + ph
    const ia = [a[0] - n[0] * t, y, a[1] - n[2] * t]
    const ic = [c[0] - n[0] * t, y, c[1] - n[2] * t]
    quad(b, [a[0], y, a[1]], [c[0], y, c[1]], ic, ia, [0, 1, 0])
    quad(b, [ia[0], h, ia[2]], [ic[0], h, ic[2]], ic, ia, [-n[0], 0, -n[2]])
  }
}

function box(b, cx, cz, y0, y1, len, wid, dx, dz) {
  const px = -dz
  const pz = dx
  const k = (s, t) => [cx + dx * len * s + px * wid * t, 0, cz + dz * len * s + pz * wid * t]
  const q = [k(-0.5, -0.5), k(0.5, -0.5), k(0.5, 0.5), k(-0.5, 0.5)]
  const at = (v, y) => [v[0], y, v[2]]
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const c = q[(i + 1) % 4]
    const ex = c[0] - a[0]
    const ez = c[2] - a[2]
    const l = Math.hypot(ex, ez) || 1
    const m = [(a[0] + c[0]) / 2 - cx, 0, (a[2] + c[2]) / 2 - cz]
    let n = [ez / l, 0, -ex / l]
    if (n[0] * m[0] + n[2] * m[2] < 0) n = [-n[0], 0, -n[2]]
    quad(b, at(a, y0), at(c, y0), at(c, y1), at(a, y1), n)
  }
  quad(b, at(q[0], y1), at(q[1], y1), at(q[2], y1), at(q[3], y1), [0, 1, 0])
}

function cyl(b, cx, cz, y0, y1, r, sg) {
  for (let i = 0; i < sg; i++) {
    const a0 = (i / sg) * PI * 2
    const a1 = ((i + 1) / sg) * PI * 2
    const c0 = Math.cos(a0)
    const s0 = Math.sin(a0)
    const c1 = Math.cos(a1)
    const s1 = Math.sin(a1)
    const am = (a0 + a1) / 2
    const n = [Math.cos(am), 0, Math.sin(am)]
    quad(b, [cx + c0 * r, y0, cz + s0 * r], [cx + c1 * r, y0, cz + s1 * r], [cx + c1 * r, y1, cz + s1 * r], [cx + c0 * r, y1, cz + s0 * r], n)
    tri(b, [cx, y1, cz], [cx + c0 * r, y1, cz + s0 * r], [cx + c1 * r, y1, cz + s1 * r], [0, 1, 0], Z2, Z2, Z2)
  }
}

function flat(T, p, y, kx, kz) {
  if (p.length < 3) return null
  const s = new T.Shape(p.map((q) => new T.Vector2(q[0], -q[1])))
  let g = new T.ShapeGeometry(s)
  g.rotateX(-PI / 2)
  g.translate(0, y, 0)
  g = g.toNonIndexed()
  const ps = g.attributes.position
  const u = g.attributes.uv
  for (let i = 0; i < ps.count; i++) u.setXY(i, ps.getX(i) * kx, ps.getZ(i) * kz)
  return g
}

function seg(b, ax, az, cx, cz, w, y) {
  const dx = cx - ax
  const dz = cz - az
  const l = Math.hypot(dx, dz)
  if (l < 1e-6) return
  const px = (-dz / l) * (w / 2)
  const pz = (dx / l) * (w / 2)
  quad(b, [ax - px, y, az - pz], [ax + px, y, az + pz], [cx + px, y, cz + pz], [cx - px, y, cz - pz], [0, 1, 0])
}

function disc(b, x, z, r, y, k) {
  const m = 10
  for (let i = 0; i < m; i++) {
    const a0 = (i / m) * PI * 2
    const a1 = ((i + 1) / m) * PI * 2
    const q = (a) => [x + Math.cos(a) * r, y, z + Math.sin(a) * r]
    const ua = [x * k, z * k]
    tri(b, [x, y, z], q(a0), q(a1), [0, 1, 0], ua, [q(a0)[0] * k, q(a0)[2] * k], [q(a1)[0] * k, q(a1)[2] * k])
  }
}

function ribbon(b, pts, w, y, k, close) {
  const n = pts.length
  const m = close ? n : n - 1
  for (let i = 0; i < m; i++) {
    const a = pts[i]
    const c = pts[(i + 1) % n]
    const dx = c[0] - a[0]
    const dz = c[1] - a[1]
    const l = Math.hypot(dx, dz)
    if (l < 1e-6) continue
    const px = (-dz / l) * (w / 2)
    const pz = (dx / l) * (w / 2)
    const q = [[a[0] - px, y, a[1] - pz], [a[0] + px, y, a[1] + pz], [c[0] + px, y, c[1] + pz], [c[0] - px, y, c[1] - pz]]
    quad(b, q[0], q[1], q[2], q[3], [0, 1, 0], q.map((v) => [v[0] * k, v[2] * k]))
  }
  for (let i = 0; i < n; i++) disc(b, pts[i][0], pts[i][1], w / 2, y, k)
}

function walk(pts, step, fn) {
  let d = step / 2
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const c = pts[i + 1]
    const l = Math.hypot(c[0] - a[0], c[1] - a[1])
    if (l < 1e-6) continue
    const dx = (c[0] - a[0]) / l
    const dz = (c[1] - a[1]) / l
    while (d <= acc + l) {
      const t = d - acc
      fn(a[0] + dx * t, a[1] + dz * t, dx, dz)
      d += step
    }
    acc += l
  }
}

const KS = {
  academic: { fh: 3.6, col: '#e9e5db', slab: '#bdb9ae', wins: [[0.05, 0.28, 0.9, 0.46]], glass: '#3d566c', frame: '#f4f3ee', mull: 4, pier: '#a9513a', em: '#ffe2a0', par: 1 },
  hostel: { fh: 3.3, col: '#efe2b4', slab: '#cdbf92', wins: [[0.12, 0.3, 0.3, 0.36], [0.58, 0.3, 0.3, 0.36]], glass: '#2f4559', frame: '#fffdf4', mull: 2, balc: '#4a4a48', em: '#ffd58a', par: 1 },
  admin: { fh: 4, col: '#f3f3ef', slab: '#cfd2d4', wins: [[0.06, 0.1, 0.88, 0.8]], glass: '#4f87b8', frame: '#e9edf0', mull: 3, refl: 1, em: '#d6ecff', par: 1 },
  dining: { fh: 5.5, col: '#ece2cd', slab: '#c5b9a1', wins: [[0.08, 0.2, 0.84, 0.62]], glass: '#486c86', frame: '#f7f3ea', mull: 3, em: '#ffe0a0', par: 1 },
  house: { fh: 3, col: '#efdcb6', slab: '#c9b78f', wins: [[0.3, 0.28, 0.4, 0.44]], glass: '#324b60', frame: '#ffffff', mull: 2, shut: '#6b4a2f', em: '#ffd890', par: 0 },
  utility: { fh: 4, col: '#a2a29e', slab: '#80807c', wins: [[0.4, 0.62, 0.2, 0.1]], glass: '#2a2c2e', frame: '#6c6c68', mull: 0, em: '#ffe0a0', par: 0 },
  gym: { fh: 5.5, col: '#dfe2e3', slab: '#b5babd', wins: [[0.06, 0.3, 0.88, 0.5]], glass: '#4a6f8c', frame: '#cfd6da', mull: 4, band: '#2a5d9f', em: '#ffe8b8', par: 1 },
  other: { fh: 3.3, col: '#e8dec6', slab: '#c3b79c', wins: [[0.28, 0.3, 0.44, 0.4]], glass: '#3c566b', frame: '#f8f6ee', mull: 2, em: '#ffd890', par: 1 }
}

const ROOF = { house: '#a8502f', flat: '#8f8d88' }

function cv(n) {
  const c = document.createElement('canvas')
  c.width = n
  c.height = n
  return c
}

function spk(g, r, n, w, cols, sz, al) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = al * (0.5 + r() * 0.5)
    g.fillStyle = cols[(r() * cols.length) | 0]
    g.fillRect(r() * w, r() * w, sz, sz)
  }
  g.globalAlpha = 1
}

function wrap(g, n, fn) {
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) fn(i * n, j * n)
}

function baseCv(n, col, r, specks, sz, cnt, al = 0.6) {
  const c = cv(n)
  const g = c.getContext('2d')
  g.fillStyle = col
  g.fillRect(0, 0, n, n)
  spk(g, r, cnt, n, specks, sz, al)
  return c
}

function grassCv(r) {
  const c = baseCv(256, '#5b8c3e', r, ['#4c7d33', '#69974a', '#5a8236'], 1, 1500, 0.5)
  const g = c.getContext('2d')
  const cols = ['#8a7a52', '#4a7a2e', '#6fa04c', '#3f6e2a']
  for (let i = 0; i < 40; i++) {
    const x = r() * 256
    const y = r() * 256
    const rad = 8 + r() * 26
    const col = cols[(r() * cols.length) | 0]
    wrap(g, 256, (dx, dy) => {
      g.globalAlpha = 0.1 + r() * 0.06
      g.fillStyle = col
      g.beginPath()
      g.arc(x + dx, y + dy, rad, 0, PI * 2)
      g.fill()
    })
  }
  g.globalAlpha = 0.5
  for (let i = 0; i < 1800; i++) {
    g.strokeStyle = r() < 0.5 ? '#79a655' : '#3d6a2a'
    const x = r() * 256
    const y = r() * 256
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 3)
    g.stroke()
  }
  g.globalAlpha = 1
  return c
}

function asphCv(r) {
  const c = baseCv(128, '#4d4e52', r, ['#3a3b3e', '#66676b', '#2e2f31', '#7a7b7f'], 1, 2200, 0.55)
  const g = c.getContext('2d')
  g.strokeStyle = 'rgba(20,20,20,0.35)'
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.moveTo(r() * 128, r() * 128)
    g.lineTo(r() * 128, r() * 128)
    g.stroke()
  }
  return c
}

function paveCv(r) {
  const c = baseCv(128, '#cbc5b8', r, ['#b8b2a5', '#d8d3c6', '#aaa498'], 1, 1500, 0.5)
  const g = c.getContext('2d')
  g.fillStyle = '#a39d90'
  g.fillRect(0, 0, 128, 2)
  g.fillRect(0, 0, 2, 128)
  g.fillRect(0, 63, 128, 2)
  g.fillRect(63, 0, 2, 128)
  return c
}

function tileCv(r) {
  const c = baseCv(128, '#a9532f', r, ['#8f4426', '#bd6238', '#7d3a20'], 2, 900, 0.5)
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(40,15,5,0.45)'
  for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 2)
  g.fillStyle = 'rgba(40,15,5,0.25)'
  for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) g.fillRect(x, y, 1, 16)
  return c
}

function waterCv(r) {
  const c = baseCv(256, '#37889a', r, ['#2c7889', '#4399a8'], 2, 400, 0.4)
  const g = c.getContext('2d')
  g.lineWidth = 1.5
  for (let i = 0; i < 70; i++) {
    const x = r() * 256
    const y = r() * 256
    const rad = 6 + r() * 14
    wrap(g, 256, (dx, dy) => {
      g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(10,50,70,0.16)'
      g.beginPath()
      g.arc(x + dx, y + dy, rad, 0.3, 2.2)
      g.stroke()
    })
  }
  return c
}

function stripeCv(r) {
  const c = baseCv(64, '#4f9a45', r, ['#448a3b', '#5ca950'], 1, 500, 0.5)
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(255,255,255,0.07)'
  g.fillRect(32, 0, 32, 64)
  return c
}

function parkCv(r) {
  const c = baseCv(128, '#4b4c50', r, ['#3a3b3e', '#66676b'], 1, 1500, 0.5)
  const g = c.getContext('2d')
  g.fillStyle = '#e8e8e4'
  g.fillRect(0, 0, 4, 104)
  g.fillRect(0, 0, 128, 3)
  return c
}

function bay(g, s, ox, oy, em, r) {
  if (!em) {
    g.fillStyle = s.slab
    g.fillRect(ox, oy + 250, 256, 6)
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.fillRect(ox, oy + 244, 256, 6)
    if (s.pier) {
      g.fillStyle = s.pier
      g.fillRect(ox, oy, 11, 244)
      g.fillRect(ox + 245, oy, 11, 244)
    }
    if (s.band) {
      g.fillStyle = s.band
      g.fillRect(ox, oy + 8, 256, 22)
    }
  }
  for (const w of s.wins) {
    const x = ox + w[0] * 256
    const y = oy + w[1] * 256
    const ww = w[2] * 256
    const hh = w[3] * 256
    if (em) {
      if (r() < 0.55) {
        g.globalAlpha = 0.7 + r() * 0.3
        g.fillStyle = s.em
        g.fillRect(x + 3, y + 3, ww - 6, hh - 6)
        g.globalAlpha = 1
      }
      continue
    }
    const sh = g.createLinearGradient(0, y + hh, 0, y + hh + 70)
    sh.addColorStop(0, 'rgba(0,0,0,0.16)')
    sh.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = sh
    g.fillRect(x + 4, y + hh, ww - 8, 70)
    g.fillStyle = s.frame
    g.fillRect(x - 3, y - 3, ww + 6, hh + 6)
    const gl = g.createLinearGradient(0, y, 0, y + hh)
    gl.addColorStop(0, s.glass)
    gl.addColorStop(1, 'rgba(15,25,35,1)')
    g.fillStyle = s.glass
    g.fillRect(x, y, ww, hh)
    g.globalAlpha = 0.45
    g.fillStyle = gl
    g.fillRect(x, y, ww, hh)
    g.globalAlpha = 0.14 + (s.refl ? 0.1 : 0)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(x + ww * 0.15, y)
    g.lineTo(x + ww * 0.4, y)
    g.lineTo(x + ww * 0.1, y + hh)
    g.lineTo(x - ww * 0.1, y + hh)
    g.fill()
    g.globalAlpha = 1
    if (r() < 0.3 && s.mull) {
      g.fillStyle = 'rgba(230,225,210,0.55)'
      g.fillRect(x, y, ww, hh * (0.2 + r() * 0.3))
    }
    g.fillStyle = s.frame
    for (let i = 1; i < s.mull; i++) g.fillRect(x + (ww * i) / s.mull - 1.5, y, 3, hh)
    g.fillRect(x, y + hh * 0.5 - 1, ww, s.mull > 2 ? 2 : 0)
    g.fillStyle = '#d8d4c8'
    g.fillRect(x - 6, y + hh + 3, ww + 12, 6)
    g.fillStyle = 'rgba(0,0,0,0.3)'
    g.fillRect(x - 6, y + hh + 9, ww + 12, 3)
    if (s.shut) {
      g.fillStyle = s.shut
      g.fillRect(x - 3 - ww * 0.3, y - 3, ww * 0.3, hh + 6)
      g.fillRect(x + ww + 3, y - 3, ww * 0.3, hh + 6)
    }
    if (s.balc) {
      g.fillStyle = s.balc
      g.fillRect(ox + 16, oy + 192, 224, 14)
      g.fillStyle = 'rgba(255,255,255,0.35)'
      for (let i = 0; i < 28; i++) g.fillRect(ox + 20 + i * 8, oy + 208, 2, 20)
    }
  }
}

function wallCv(s, em, r) {
  const c = cv(512)
  const g = c.getContext('2d')
  g.fillStyle = em ? '#000000' : s.col
  g.fillRect(0, 0, 512, 512)
  for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) bay(g, s, bx * 256, by * 256, em, r)
  if (!em) {
    spk(g, r, 5000, 512, ['#000000', '#ffffff', '#7a6a50'], 1, 0.05)
    g.globalAlpha = 0.05
    g.fillStyle = '#000'
    for (let i = 0; i < 25; i++) g.fillRect(r() * 512, 0, 2 + r() * 4, 512)
    g.globalAlpha = 1
  }
  return c
}

function sunCfg(T) {
  const K = [
    [0, 0x8fa8d8, 0.15, 0x1d2d5e, 0x0a0f1e, 0.5, 0x0a1430, 0x0e1a38, 1],
    [5, 0x8fa8d8, 0.15, 0x2a3468, 0x12162a, 0.5, 0x1a2250, 0x232b58, 1],
    [6, 0xff9a5a, 0.8, 0xffb98f, 0x4a3d44, 0.55, 0xf4a58a, 0xf0b79c, 0.5],
    [7, 0xffd9a0, 1.8, 0xd6e0f2, 0x6a6a54, 0.8, 0xa9c9ea, 0xcfdbe6, 0.05],
    [8.5, 0xfff1d8, 2.4, 0xc4dcff, 0x6e6c52, 0.9, 0x87ceeb, 0xbcd8ec, 0],
    [16, 0xfff0d4, 2.4, 0xc4dcff, 0x6e6c52, 0.9, 0x87ceeb, 0xbcd8ec, 0],
    [17, 0xffd0a0, 2, 0xd6e0f2, 0x6a6a54, 0.8, 0x9fc3e6, 0xd0d9e4, 0.05],
    [18, 0xff8a48, 0.8, 0xffa98a, 0x4a3d44, 0.55, 0xf09a7e, 0xeaa88c, 0.5],
    [19, 0x8fa8d8, 0.15, 0x3a3466, 0x161a2e, 0.5, 0x2c2a5a, 0x3c3a68, 1],
    [20, 0x8fa8d8, 0.15, 0x1d2d5e, 0x0a0f1e, 0.5, 0x0a1430, 0x0e1a38, 1],
    [24, 0x8fa8d8, 0.15, 0x1d2d5e, 0x0a0f1e, 0.5, 0x0a1430, 0x0e1a38, 1]
  ]
  const a = new T.Color()
  const b = new T.Color()
  return (h) => {
    let i = 0
    while (i < K.length - 2 && h > K[i + 1][0]) i++
    const p = K[i]
    const q = K[i + 1]
    const t = clamp((h - p[0]) / (q[0] - p[0]), 0, 1)
    const col = (j) => new T.Color().lerpColors(a.setHex(p[j]), b.setHex(q[j]), t)
    const f = (j) => p[j] + (q[j] - p[j]) * t
    return { sc: col(1), si: f(2), hs: col(3), hg: col(4), hi: f(5), sky: col(6), fog: col(7), gl: f(8) }
  }
}

function roadsGeo(c, geo, M) {
  const T = c.T
  const A = nb()
  const P = nb()
  const D = nb()
  const L = nb()
  const KB = nb()
  const asph = new Set(['secondary', 'tertiary', 'service', 'residential', 'unclassified', 'primary', 'trunk', 'living_street'])
  const paved = new Set(['pedestrian', 'footway', 'path', 'steps', 'cycleway'])
  const lamps = []
  let ri = 0
  for (const r of geo.roads || []) {
    const pts = r.p
    if (!pts || pts.length < 2) continue
    const w = r.w || (r.k === 'secondary' ? 8 : r.k === 'tertiary' ? 6 : 4)
    if (r.k === 'track') ribbon(D, pts, w, 0.032, 0.2)
    else if (paved.has(r.k)) ribbon(P, pts, w, r.k === 'pedestrian' ? 0.04 : 0.042, 0.5)
    else ribbon(A, pts, w, 0.03, 0.25)
    if (r.k === 'secondary' || r.k === 'tertiary') dashes(L, pts)
    if (asph.has(r.k) && r.k !== 'service') kerbs(KB, pts, w)
    if (r.k === 'secondary' || r.k === 'tertiary' || r.k === 'service') {
      let k = ri
      walk(pts, 30, (x, z, dx, dz) => {
        const s = k++ % 2 ? 1 : -1
        const off = w / 2 + 1
        lamps.push({ x: x - dz * off * s, z: z + dx * off * s, a: Math.atan2(dx * s, dz * s) })
      })
    }
    ri++
  }
  const mk = (b, m) => c.add(toGeo(T, b), m, false, true)
  mk(A, M.asph)
  mk(P, M.pave)
  mk(D, M.dirt)
  mk(KB, M.kerb)
  mk(L, M.line)
  return lamps
}

function dashes(b, pts) {
  let d = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const e = pts[i + 1]
    const l = Math.hypot(e[0] - a[0], e[1] - a[1])
    if (l < 1e-6) continue
    const dx = (e[0] - a[0]) / l
    const dz = (e[1] - a[1]) / l
    let s = 0
    while (s < l - 1e-6) {
      const ph = d % 7
      const st = ph < 3 ? Math.min(3 - ph, l - s) : Math.min(7 - ph, l - s)
      if (ph < 3) seg(b, a[0] + dx * s, a[1] + dz * s, a[0] + dx * (s + st), a[1] + dz * (s + st), 0.18, 0.05)
      s += st
      d += st
    }
  }
}

function kerbs(b, pts, w) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const e = pts[i + 1]
    const l = Math.hypot(e[0] - a[0], e[1] - a[1])
    if (l < 1e-6) continue
    const nx = -(e[1] - a[1]) / l
    const nz = (e[0] - a[0]) / l
    const o = w / 2 - 0.12
    for (const s of [-1, 1]) seg(b, a[0] + nx * o * s, a[1] + nz * o * s, e[0] + nx * o * s, e[1] + nz * o * s, 0.26, 0.034)
  }
}

function nearSeg(x, z, a, b) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz || 1
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1)
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z)
}

function nearEdge(p, x, z) {
  let bd = 1e9
  let bi = 0
  let bt = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1)
    const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z)
    if (d < bd) {
      bd = d
      bi = i
      bt = t
    }
  }
  return { i: bi, t: bt }
}

function door(c, det, p, bd) {
  if (!bd.door) return
  const e = nearEdge(p, bd.door[0], bd.door[1])
  const a = p[e.i]
  const b = p[(e.i + 1) % p.length]
  const l = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (l < 2) return
  const dx = (b[0] - a[0]) / l
  const dz = (b[1] - a[1]) / l
  const n = outN(p, e.i, area(p) > 0)
  const qx = a[0] + (b[0] - a[0]) * e.t
  const qz = a[1] + (b[1] - a[1]) * e.t
  const at = (d, y0, y1, ln, wd, col) => {
    setc(c, det, col)
    box(det, qx + n[0] * d, qz + n[2] * d, y0, y1, ln, wd, dx, dz)
  }
  at(0.04, 0, 2.5, 2.3, 0.1, '#e4e0d4')
  at(0.1, 0, 2.3, 1.8, 0.1, '#2b2018')
  at(0.45, 0, 0.15, 2.6, 0.9, '#b8b4aa')
  at(0.7, 2.6, 2.78, 3.2, 1.5, '#d8d6d0')
}

function roofTop(c, det, p, bd, r) {
  const ct = cent(p)
  let mnx = 1e9
  let mxx = -1e9
  let mnz = 1e9
  let mxz = -1e9
  for (const q of p) {
    mnx = Math.min(mnx, q[0])
    mxx = Math.max(mxx, q[0])
    mnz = Math.min(mnz, q[1])
    mxz = Math.max(mxz, q[1])
  }
  if (Math.min(mxx - mnx, mxz - mnz) < 8) return
  let bl = 0
  let dx = 1
  let dz = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > bl) {
      bl = l
      dx = (b[0] - a[0]) / l
      dz = (b[1] - a[1]) / l
    }
  }
  const sp = [[0.18, 0.1], [-0.18, -0.1], [0.12, -0.2], [-0.12, 0.2]]
  const ok = (x, z, rad) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].every((s) => inside(p, x + s[0] * rad, z + s[1] * rad))
  const spots = sp.map((s) => [ct[0] + s[0] * (mxx - mnx), ct[1] + s[1] * (mxz - mnz)]).filter((s) => ok(s[0], s[1], 2))
  if (spots[0]) {
    setc(c, det, '#bab7ae')
    box(det, spots[0][0], spots[0][1], bd.h, bd.h + 2.3, 3.4, 3, dx, dz)
    setc(c, det, '#8a8780')
    box(det, spots[0][0], spots[0][1], bd.h + 2.3, bd.h + 2.45, 3.8, 3.4, dx, dz)
  }
  const t = spots[1]
  if (t) {
    setc(c, det, '#1e2226')
    cyl(det, t[0], t[1], bd.h + 0.5, bd.h + 1.9, 0.95, 10)
    setc(c, det, '#6a6a66')
    box(det, t[0], t[1], bd.h, bd.h + 0.5, 1.6, 1.6, dx, dz)
  }
  if (spots[2] && r() < 0.8) {
    setc(c, det, '#9a9a96')
    box(det, spots[2][0], spots[2][1], bd.h, bd.h + 0.9, 1.6, 1.2, dx, dz)
  }
}

function theatre(b, p, ct, h) {
  const ns = 4
  const sc = [1, 0.78, 0.56, 0.34]
  const hs = sc.map((_, k) => (h * (ns - k)) / ns)
  const ring = (s) => p.map((q) => [ct[0] + (q[0] - ct[0]) * s, ct[1] + (q[1] - ct[1]) * s])
  const rs = sc.map(ring)
  for (let k = 0; k < ns; k++) walls(b, rs[k], k ? hs[k] : 0, k ? hs[k - 1] : hs[0], { inv: k > 0 })
  for (let k = 0; k < ns - 1; k++) {
    const hi = hs[k]
    const a = rs[k]
    const e = rs[k + 1]
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length
      quad(b, [a[i][0], hi, a[i][1]], [a[j][0], hi, a[j][1]], [e[j][0], hi, e[j][1]], [e[i][0], hi, e[i][1]], [0, 1, 0])
    }
  }
  return { ring: rs[ns - 1], y: hs[ns - 1] }
}

function bldGeo(c, geo, M) {
  const T = c.T
  const W = {}
  const RF = []
  const RH = nb()
  const PA = nb()
  const TH = nb()
  const DT = nb(true)
  const roofs = []
  const tcaps = []
  for (const bd of geo.bld || []) {
    const p = cleanRing(bd.p || [])
    if (p.length < 3) continue
    const k = KS[bd.k] ? bd.k : 'other'
    const s = KS[k]
    const h = bd.h > 0 ? bd.h : 6
    const r = rng(Number(bd.id) || p.length * 977)
    if (bd.k === 'theatre') {
      const t = theatre(TH, p, cent(p), Math.min(h, 1.2))
      tcaps.push(flat(T, t.ring, t.y, 0.2, 0.2))
      continue
    }
    const fl = Math.max(1, Math.round(h / s.fh))
    W[k] = W[k] || nb()
    walls(W[k], p, 0, h, { uv: true, vk: (s.fh * fl) / h })
    if (k === 'house') {
      walls(RH, p, h, h + 0.3)
      roofs.push([RH, p, h + 0.3])
      ridge(RH, p, h + 0.3)
    } else roofs.push([null, p, h])
    if (s.par) parapet(PA, p, h, 0.25, 0.9)
    door(c, DT, p, { ...bd, h })
    if (k !== 'house' && k !== 'utility') roofTop(c, DT, p, { ...bd, h }, r)
  }
  const flatList = roofs.filter((q) => !q[0]).map((q) => flat(T, q[1], q[2], 0.15, 0.15)).filter(Boolean)
  const houseTop = roofs.filter((q) => q[0]).map((q) => flat(T, q[1], q[2], 0.35, 0.35)).filter(Boolean)
  for (const k of Object.keys(W)) c.add(toGeo(T, W[k]), M.wall[k], true, true)
  if (flatList.length) c.add(merge(T, flatList), M.roof, true, true)
  const rh = toGeo(T, RH)
  if (rh) houseTop.push(rh)
  if (houseTop.length) c.add(merge(T, houseTop), M.tile, true, true)
  c.add(toGeo(T, PA), M.par, true, true)
  const th = toGeo(T, TH)
  if (th) c.add(merge(T, [th, ...tcaps.filter(Boolean)]), M.conc, true, true)
  c.add(toGeo(T, DT), M.det, true, true)
}

function ridge(b, p, y) {
  let bl = 0
  let dx = 1
  let dz = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const e = p[(i + 1) % p.length]
    const l = Math.hypot(e[0] - a[0], e[1] - a[1])
    if (l > bl) {
      bl = l
      dx = (e[0] - a[0]) / l
      dz = (e[1] - a[1]) / l
    }
  }
  const ct = cent(p)
  const q = inside(p, ct[0], ct[1]) ? ct : p[0]
  box(b, q[0], q[1], y, y + 0.5, Math.min(bl * 0.7, 6), 1.2, dx, dz)
}

function surfaces(c, geo, M) {
  const T = c.T
  const mk = (list, y, kx, kz) => {
    const l = list.map((q) => flat(T, cleanRing(q), y, kx, kz)).filter(Boolean)
    return l.length ? merge(T, l) : null
  }
  if (geo.edge && geo.edge.length > 2) c.add(mk([geo.edge], 0.01, 0.1, 0.1), M.lawn, false, true)
  const wr = (geo.water || []).map(cleanRing).filter((q) => q.length > 2)
  const bank = wr.map((q) => {
    const ct = cent(q)
    return q.map((v) => {
      const d = Math.hypot(v[0] - ct[0], v[1] - ct[1]) || 1
      return [v[0] + ((v[0] - ct[0]) / d) * 1.4, v[1] + ((v[1] - ct[1]) / d) * 1.4]
    })
  })
  c.add(mk(bank, 0.02, 0.2, 0.2), M.bank, false, true)
  c.water = c.add(mk(wr, 0.06, 0.04, 0.04), M.water, false, true)
  c.add(mk(geo.pitch || [], 0.035, 1 / 8, 1 / 8), M.pitch, false, true)
  const pk = (geo.park || []).filter((q) => q.k === 'parking').map((q) => q.p)
  const qr = (geo.park || []).filter((q) => q.k === 'quarry').map((q) => q.p)
  c.add(mk(pk, 0.035, 1 / 2.5, 1 / 5.5), M.park, false, true)
  c.add(mk(qr, 0.02, 0.1, 0.1), M.rock, false, true)
  const L = nb()
  for (const q of (geo.pitch || []).map(cleanRing)) pitchLines(L, q)
  for (const q of pk.map(cleanRing)) if (!c.o.textures) parkLines(L, q)
  c.add(toGeo(T, L), M.mark, false, true)
}

function pitchLines(b, p) {
  if (p.length < 3) return
  const ct = cent(p)
  const ins = p.map((q) => {
    const d = Math.hypot(q[0] - ct[0], q[1] - ct[1]) || 1
    const k = Math.min(0.8, d * 0.3) / d
    return [q[0] - (q[0] - ct[0]) * k, q[1] - (q[1] - ct[1]) * k]
  })
  ribbon(b, ins, 0.2, 0.045, 0, true)
  let mn = 1e9
  for (const q of p) mn = Math.min(mn, Math.hypot(q[0] - ct[0], q[1] - ct[1]))
  const rad = mn * 0.3
  const cr = []
  for (let i = 0; i < 24; i++) cr.push([ct[0] + Math.cos((i / 24) * PI * 2) * rad, ct[1] + Math.sin((i / 24) * PI * 2) * rad])
  ribbon(b, cr, 0.18, 0.046, 0, true)
}

function parkLines(b, p) {
  if (p.length < 3) return
  let mnx = 1e9
  let mxx = -1e9
  let mnz = 1e9
  let mxz = -1e9
  for (const q of p) {
    mnx = Math.min(mnx, q[0])
    mxx = Math.max(mxx, q[0])
    mnz = Math.min(mnz, q[1])
    mxz = Math.max(mxz, q[1])
  }
  const z0 = (mnz + mxz) / 2 - 2.5
  for (let x = mnx + 2; x < mxx - 1; x += 2.5) {
    if (inside(p, x, z0) && inside(p, x, z0 + 5)) seg(b, x, z0, x, z0 + 5, 0.12, 0.045)
  }
}

function treesGeo(c, list) {
  const T = c.T
  const r = rng(7)
  const ts = list.filter((t) => Number.isFinite(t.x) && Number.isFinite(t.z))
  const ng = ts.filter((t) => t.t !== 1).length
  const np = ts.length - ng
  const tg = new T.CylinderGeometry(0.14, 0.24, 1, 7)
  tg.translate(0, 0.5, 0)
  const sg = new T.SphereGeometry(1, 11, 8)
  const ps = sg.attributes.position
  const cl = new Float32Array(ps.count * 3)
  for (let i = 0; i < ps.count; i++) {
    const x = ps.getX(i)
    const y = ps.getY(i)
    const z = ps.getZ(i)
    const k = 1 + 0.16 * Math.sin(x * 4.3 + z * 3.1) * Math.cos(y * 3.7 + x * 1.9)
    ps.setXYZ(i, x * k, y * k, z * k)
    const v = 0.55 + 0.5 * ((y + 1) / 2)
    cl.set([v, v, v], i * 3)
  }
  sg.setAttribute('color', new T.BufferAttribute(cl, 3))
  sg.computeVertexNormals()
  const fg = frondGeo(T)
  c.geos.push(tg, sg, fg)
  const mt = c.mat('#ffffff', { roughness: 1 })
  const mc = c.mat('#ffffff', { roughness: 0.9, vertexColors: true })
  const mf = c.mat('#ffffff', { roughness: 0.85, side: T.DoubleSide })
  const im = (g, m, n) => {
    const q = new T.InstancedMesh(g, m, Math.max(n, 1))
    q.count = n
    q.castShadow = c.o.shadows
    q.frustumCulled = false
    c.insts.push(q)
    c.g.add(q)
    return q
  }
  const trunk = im(tg, mt, ts.length)
  const can = im(sg, mc, ng)
  const fro = im(fg, mf, np)
  const d = new T.Object3D()
  const col = new T.Color()
  let ic = 0
  let ip = 0
  const sc = (q, i, x, y, z, sx, sy, sz, ry, rx, rz) => {
    d.position.set(x, y, z)
    d.rotation.set(rx || 0, ry || 0, rz || 0)
    d.scale.set(sx, sy, sz)
    d.updateMatrix()
    q.setMatrixAt(i, d.matrix)
  }
  ts.forEach((t, i) => {
    const s = t.s || 1
    const ry = r() * PI * 2
    if (t.t === 1) {
      const h = 8 * s
      const e = new T.Euler((r() - 0.5) * 0.16, 0, (r() - 0.5) * 0.16)
      const top = new T.Vector3(0, h, 0).applyEuler(e)
      sc(trunk, i, t.x, 0, t.z, 0.55 * s, h, 0.55 * s, 0, e.x, e.z)
      trunk.setColorAt(i, col.set('#8a7a62').offsetHSL(0, 0, (r() - 0.5) * 0.06))
      sc(fro, ip, t.x + top.x, top.y, t.z + top.z, s, s, s, ry)
      fro.setColorAt(ip++, col.setHSL(0.26 + r() * 0.05, 0.5, 0.22 + r() * 0.1))
    } else {
      const bush = t.t === 2
      const th = (bush ? 0.8 : 3.2) * s
      sc(trunk, i, t.x, 0, t.z, (bush ? 0.6 : 1) * s, th, (bush ? 0.6 : 1) * s, 0)
      trunk.setColorAt(i, col.set('#5a4330').offsetHSL(0, 0, (r() - 0.5) * 0.05))
      const rx = (bush ? 1.3 : 2.6) * s
      const ry2 = (bush ? 1.1 : 2.1) * s
      sc(can, ic, t.x, th + ry2 * 0.6, t.z, rx, ry2, rx, ry)
      can.setColorAt(ic++, col.setHSL(0.24 + r() * 0.09, 0.42 + r() * 0.15, (bush ? 0.28 : 0.2) + r() * 0.09))
    }
  })
  for (const q of [trunk, can, fro]) {
    q.instanceMatrix.needsUpdate = true
    if (q.instanceColor) q.instanceColor.needsUpdate = true
  }
}

function frondGeo(T) {
  const gs = []
  const n = 4
  for (let f = 0; f < 8; f++) {
    const b = nb()
    const a = (f / 8) * PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const pt = (t, side) => {
      const l = t * 3.2
      const y = 0.35 * t - 1.1 * t * t
      const w = side * 0.55 * Math.pow(Math.sin(PI * Math.min(t + 0.08, 1)), 0.7)
      return [ca * l - sa * w, y, sa * l + ca * w]
    }
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      quad(b, pt(t0, -1), pt(t0, 1), pt(t1, 1), pt(t1, -1), [0, 1, 0])
    }
    const g = toGeo(T, b)
    g.computeVertexNormals()
    gs.push(g)
  }
  return merge(T, gs)
}

function lampsGeo(c, lamps) {
  const T = c.T
  if (!lamps.length) return
  const pole = new T.CylinderGeometry(0.05, 0.08, 6.5, 6)
  pole.translate(0, 3.25, 0)
  const arm = new T.BoxGeometry(1.4, 0.08, 0.08)
  arm.translate(0.6, 6.4, 0)
  const pg = merge(T, [pole, arm])
  const hg = new T.BoxGeometry(0.6, 0.14, 0.3)
  hg.translate(1.2, 6.32, 0)
  c.geos.push(pole, arm, pg, hg)
  const mp = c.mat('#3a3d42', { roughness: 0.6, metalness: 0.5 })
  const mh = c.mat('#fff4d0', { roughness: 0.4, emissive: new T.Color('#ffd890'), emissiveIntensity: 0.3 })
  c.lampMat = mh
  const a = new T.InstancedMesh(pg, mp, lamps.length)
  const b = new T.InstancedMesh(hg, mh, lamps.length)
  const d = new T.Object3D()
  lamps.forEach((l, i) => {
    d.position.set(l.x, 0, l.z)
    d.rotation.set(0, l.a, 0)
    d.updateMatrix()
    a.setMatrixAt(i, d.matrix)
    b.setMatrixAt(i, d.matrix)
  })
  a.castShadow = c.o.shadows
  a.frustumCulled = false
  b.frustumCulled = false
  c.insts.push(a, b)
  c.g.add(a, b)
}

function edgeGeo(c, geo, M) {
  const T = c.T
  const e = geo.edge ? cleanRing(geo.edge) : null
  if (!e || e.length < 3) return
  const segs = []
  for (const r of geo.roads || []) {
    if (!r.p || r.k === 'track') continue
    for (let i = 0; i < r.p.length - 1; i++) segs.push([r.p[i], r.p[i + 1], (r.w || 4) / 2 + 2])
  }
  const B = nb()
  const posts = []
  let k = 0
  const ring = e.concat([e[0]])
  walk(ring, 3, (x, z, dx, dz) => {
    k++
    if (segs.some((s) => nearSeg(x, z, s[0], s[1]) < s[2])) return
    box(B, x, z, 0, 1.2, 3.05, 0.28, dx, dz)
    if (k % 4 === 0) posts.push([x, z, Math.atan2(-dz, dx)])
  })
  c.add(toGeo(T, B), M.fence, true, true)
  if (!posts.length) return
  const pg = new T.BoxGeometry(0.55, 1.6, 0.55)
  pg.translate(0, 0.8, 0)
  c.geos.push(pg)
  const im = new T.InstancedMesh(pg, M.fence, posts.length)
  const d = new T.Object3D()
  posts.forEach((q, i) => {
    d.position.set(q[0], 0, q[1])
    d.rotation.set(0, q[2], 0)
    d.updateMatrix()
    im.setMatrixAt(i, d.matrix)
  })
  im.castShadow = c.o.shadows
  im.frustumCulled = false
  c.insts.push(im)
  c.g.add(im)
}

export function buildWorld(T, geo, opts = {}) {
  const o = { trees: [], textures: typeof document !== 'undefined', shadows: true, ...opts }
  const group = new T.Group()
  const c = { T, o, g: group, geos: [], mats: [], texs: [], insts: [], water: null, lampMat: null }
  const r = rng(1234)
  c.mat = (col, ex = {}) => {
    const m = new T.MeshStandardMaterial({ roughness: 0.95, metalness: 0, ...ex, color: ex.map ? '#ffffff' : col })
    c.mats.push(m)
    return m
  }
  c.tex = (cvs, rx, ry, srgb = true) => {
    const t = new T.CanvasTexture(cvs)
    t.wrapS = t.wrapT = T.RepeatWrapping
    t.repeat.set(rx, ry)
    if (srgb) t.colorSpace = T.SRGBColorSpace
    t.anisotropy = 4
    c.texs.push(t)
    return t
  }
  c.add = (g, m, cast, recv) => {
    if (!g) return null
    c.geos.push(g)
    const q = new T.Mesh(g, m)
    q.castShadow = !!cast && o.shadows
    q.receiveShadow = !!recv && o.shadows
    group.add(q)
    return q
  }
  const tx = (fn, rx, ry) => (o.textures ? c.tex(fn(r), rx, ry) : null)
  const po = (l) => ({ polygonOffset: true, polygonOffsetFactor: -l, polygonOffsetUnits: -l })
  const M = { wall: {} }
  const wallE = []
  M.asph = c.mat('#4a4b4f', { map: tx(asphCv, 1, 1), ...po(2) })
  M.pave = c.mat('#c9c3b6', { map: tx(paveCv, 1, 1), ...po(4) })
  M.dirt = c.mat('#7a5c3c', { roughness: 1, ...po(3) })
  M.kerb = c.mat('#b9b6ae', po(3))
  M.line = c.mat('#f2f2ee', { roughness: 0.7, ...po(5) })
  M.mark = c.mat('#f2f2ee', { roughness: 0.7, ...po(5) })
  M.lawn = c.mat('#6f9a4a', { roughness: 1, ...po(1) })
  M.bank = c.mat('#7a6a4a', { roughness: 1, ...po(1) })
  M.water = c.mat('#2f7f8f', { map: tx(waterCv, 1, 1), roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85, ...po(4) })
  M.pitch = c.mat('#559c49', { map: tx(stripeCv, 1, 1), roughness: 1, ...po(3) })
  M.park = c.mat('#4b4c50', { map: tx(parkCv, 1, 1), ...po(3) })
  M.rock = c.mat('#857b6d', { roughness: 1, ...po(1) })
  M.roof = c.mat('#8f8d88', { map: tx((q) => baseCv(128, '#8d8b86', q, ['#7c7a76', '#9d9b96', '#6f6d69'], 2, 900, 0.5), 1, 1), roughness: 0.9 })
  M.tile = c.mat('#a8502f', { map: tx(tileCv, 1, 1), roughness: 0.85 })
  M.par = c.mat('#d9d6cd', { roughness: 0.9 })
  M.conc = c.mat('#aaa8a2', { roughness: 0.95 })
  M.det = c.mat('#ffffff', { roughness: 0.8, vertexColors: true })
  M.fence = c.mat('#cfc8b8', { roughness: 0.95 })
  for (const k of Object.keys(KS)) {
    const s = KS[k]
    if (o.textures) {
      const map = c.tex(wallCv(s, false, r), 1 / 8, 1 / (2 * s.fh))
      const em = c.tex(wallCv(s, true, r), 1 / 8, 1 / (2 * s.fh))
      M.wall[k] = c.mat('#ffffff', { map, emissiveMap: em, emissive: new T.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.85 })
      wallE.push(M.wall[k])
    } else M.wall[k] = c.mat(s.col)
  }
  const gm = c.mat('#5a8a3c', { map: tx(grassCv, 1400 / 16, 1400 / 16), roughness: 1 })
  const gg = new T.PlaneGeometry(1400, 1400)
  gg.rotateX(-PI / 2)
  gg.translate((geo.w || 616) / 2, 0, (geo.h || 484) / 2)
  c.add(gg, gm, false, true)
  surfaces(c, geo, M)
  const lamps = roadsGeo(c, geo, M)
  bldGeo(c, geo, M)
  treesGeo(c, o.trees || [])
  lampsGeo(c, lamps)
  edgeGeo(c, geo, M)
  const sun = new T.DirectionalLight(0xffffff, 2.4)
  sun.castShadow = o.shadows
  if (o.shadows) {
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera
    sc.left = sc.bottom = -90
    sc.right = sc.top = 90
    sc.near = 1
    sc.far = 400
    sc.updateProjectionMatrix()
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.5
  }
  sun.target.position.set((geo.w || 616) / 2, 0, (geo.h || 484) / 2)
  const hemi = new T.HemisphereLight(0xc4dcff, 0x6e6c52, 0.9)
  group.add(sun, sun.target, hemi)
  const cfg = sunCfg(T)
  const dir = new T.Vector3(0, 1, 0)
  const place = () => sun.position.copy(sun.target.position).addScaledVector(dir, 180)
  const setHour = (h) => {
    h = ((h % 24) + 24) % 24
    const k = cfg(h)
    const hh = h < 6 ? h + 24 : h
    const a = ((hh - 6) / 12) * PI
    const e = ((8 + (40 + 22 * clamp((k.si - 0.15) / 0.65, 0, 1)) * Math.abs(Math.sin(a))) * PI) / 180
    dir.set(Math.cos(a) * Math.cos(e), Math.sin(e), 0.35 * Math.cos(e)).normalize()
    sun.color.copy(k.sc)
    sun.intensity = k.si
    hemi.color.copy(k.hs)
    hemi.groundColor.copy(k.hg)
    hemi.intensity = k.hi
    group.userData.sky = k.sky.getHex()
    group.userData.fog = k.fog.getHex()
    group.userData.hour = h
    for (const m of wallE) m.emissiveIntensity = k.gl * 1.1
    if (c.lampMat) c.lampMat.emissiveIntensity = 0.3 + k.gl * 2.5
    place()
  }
  const wm = c.water ? M.water : null
  const base = new T.Color('#2f7f8f')
  const wh = new T.Color('#ffffff')
  const update = (t) => {
    if (wm) {
      wm.opacity = 0.85 + Math.sin(t * 0.6) * 0.03
      wm.color.copy(wm.map ? wh : base).multiplyScalar(0.95 + Math.sin(t * 0.4) * 0.05)
      if (wm.map) wm.map.offset.set(t * 0.004, t * 0.0027)
    }
    place()
  }
  const dispose = () => {
    for (const g of c.geos) g.dispose()
    for (const q of c.insts) q.dispose()
    for (const m of c.mats) m.dispose()
    for (const t of c.texs) t.dispose()
    if (sun.shadow.map) sun.shadow.map.dispose()
  }
  setHour(12)
  return { group, sun, hemi, update, setHour, dispose }
}
