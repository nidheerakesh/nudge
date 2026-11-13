const r2 = (v) => Math.round(v * 100) / 100

export function inPoly(p, x, z) {
  let res = false
  const n = p.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = p[i]
    const [xj, zj] = p[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) res = !res
  }
  return res
}

export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0
  return Math.hypot(x - ax - t * dx, z - az - t * dz)
}

function edgeMin(p, x, z, closed) {
  const n = p.length
  const m = closed ? n : n - 1
  let mn = Infinity
  for (let i = 0; i < m; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    mn = Math.min(mn, segDist(x, z, a[0], a[1], b[0], b[1]))
  }
  return mn
}

export function ringDist(p, x, z) {
  return edgeMin(p, x, z, true)
}

export function lineDist(p, x, z) {
  if (p.length === 1) return Math.hypot(x - p[0][0], z - p[0][1])
  return edgeMin(p, x, z, false)
}

export function bbox(p) {
  let x0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let z1 = -Infinity
  for (const [x, z] of p) {
    x0 = Math.min(x0, x)
    z0 = Math.min(z0, z)
    x1 = Math.max(x1, x)
    z1 = Math.max(z1, z)
  }
  return { x0, z0, x1, z1 }
}

function outBox(b, x, z, r) {
  return x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r
}

export function makeCollider(geo, extra = []) {
  const bl = geo.bld
    .filter((b) => b.k !== 'theatre')
    .map((b) => ({ p: b.p, bb: bbox(b.p) }))

  function onBld(x, z, r) {
    return bl.some((b) => !outBox(b.bb, x, z, r) && (inPoly(b.p, x, z) || ringDist(b.p, x, z) <= r))
  }

  function inWater(x, z) {
    return geo.water.some((q) => inPoly(q, x, z))
  }

  function nearCircle(x, z, r) {
    return extra.some((c) => Math.hypot(x - c.x, z - c.z) <= c.r + r)
  }

  function blocked(x, z, r) {
    if (x < 1 || x > geo.w - 1 || z < 1 || z > geo.h - 1) return true
    return onBld(x, z, r) || inWater(x, z) || nearCircle(x, z, r)
  }

  function move(x, z, dx, dz, r) {
    if (!blocked(x + dx, z + dz, r)) return { x: x + dx, z: z + dz }
    if (!blocked(x + dx, z, r)) return { x: x + dx, z }
    if (!blocked(x, z + dz, r)) return { x, z: z + dz }
    return { x, z }
  }

  return { blocked, move }
}

function rng(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function nearAnyRing(rings, x, z, d) {
  return rings.some((q) => inPoly(q, x, z) || ringDist(q, x, z) <= d)
}

function rejected(geo, acc, x, z) {
  if (nearAnyRing(geo.bld.map((b) => b.p), x, z, 4)) return true
  if (nearAnyRing(geo.water, x, z, 2)) return true
  if (nearAnyRing(geo.pitch, x, z, 2)) return true
  if (nearAnyRing(geo.park.map((q) => q.p), x, z, 2)) return true
  if (geo.roads.some((rd) => lineDist(rd.p, x, z) <= rd.w / 2 + 2.5)) return true
  if (geo.plots.some((q) => Math.hypot(x - q.x, z - q.z) <= 9)) return true
  if (Math.hypot(x - geo.spawn[0], z - geo.spawn[1]) <= 6) return true
  return acc.some((t) => Math.hypot(x - t.x, z - t.z) <= 3.5)
}

export function scatter(geo, n, seed = 1) {
  const rnd = rng(seed)
  const acc = []
  for (let k = 0; k < n * 30 && acc.length < n; k++) {
    const x = r2(-40 + rnd() * (geo.w + 80))
    const z = r2(-40 + rnd() * (geo.h + 80))
    if (rejected(geo, acc, x, z)) continue
    const s = r2(0.8 + rnd() * 0.7)
    const t = Math.floor(rnd() * 3)
    acc.push({ x, z, s, t })
  }
  return acc
}
