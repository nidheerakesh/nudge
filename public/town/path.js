export function walkableTile(id) {
  return id >= 0 && id <= 10 && id !== 6
}

class Heap {
  constructor(f) { this.a = []; this.f = f }
  get size() { return this.a.length }
  push(v) {
    const a = this.a, f = this.f
    let i = a.length
    a.push(v)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (f[a[p]] <= f[v]) break
      a[i] = a[p]
      i = p
    }
    a[i] = v
  }
  pop() {
    const a = this.a, f = this.f
    const top = a[0], last = a.pop()
    const n = a.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && f[a[c + 1]] < f[a[c]]) c++
        if (f[a[c]] >= f[last]) break
        a[i] = a[c]
        i = c
      }
      a[i] = last
    }
    return top
  }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export function astar(grid, w, h, from, to, walkable = walkableTile) {
  const ok = (x, y) => x >= 0 && y >= 0 && x < w && y < h && walkable(grid[y][x])
  if (!ok(from.x, from.y)) return null
  let tx = to.x, ty = to.y
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null
  if (!ok(tx, ty)) {
    let best = null, bd = Infinity
    for (const [dx, dy] of DIRS) {
      const x = tx + dx, y = ty + dy
      if (!ok(x, y)) continue
      const d = Math.abs(x - from.x) + Math.abs(y - from.y)
      if (d < bd) { bd = d; best = { x, y } }
    }
    if (!best) return null
    tx = best.x
    ty = best.y
  }
  const sx = from.x, sy = from.y
  if (sx === tx && sy === ty) return [{ x: sx, y: sy }]
  const n = w * h
  const g = new Float64Array(n).fill(Infinity)
  const f = new Float64Array(n)
  const prev = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const hh = (x, y) => Math.abs(x - tx) + Math.abs(y - ty)
  const heap = new Heap(f)
  const s = sy * w + sx, t = ty * w + tx
  g[s] = 0
  f[s] = hh(sx, sy)
  heap.push(s)
  while (heap.size) {
    const cur = heap.pop()
    if (closed[cur]) continue
    if (cur === t) {
      const res = []
      for (let k = t; k !== -1; k = prev[k]) res.push({ x: k % w, y: (k / w) | 0 })
      return res.reverse()
    }
    closed[cur] = 1
    const cx = cur % w, cy = (cur / w) | 0
    for (const [dx, dy] of DIRS) {
      const x = cx + dx, y = cy + dy
      if (!ok(x, y)) continue
      const k = y * w + x
      if (closed[k]) continue
      const ng = g[cur] + 1
      if (ng < g[k]) {
        g[k] = ng
        prev[k] = cur
        f[k] = ng + hh(x, y)
        heap.push(k)
      }
    }
  }
  return null
}

export function smooth(path) {
  if (!path || path.length < 3) return path
  const res = [path[0]]
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], b = path[i], c = path[i + 1]
    if (b.x - a.x === c.x - b.x && b.y - a.y === c.y - b.y) continue
    res.push(b)
  }
  res.push(path[path.length - 1])
  return res
}
