const SPEED = 9
const R = 0.45
const HOUSE_R = 4.6
const DOOR_D = 6.4
const EMO = { cheer: '!', heart: '<3', wave: 'hi', zzz: 'zzz', think: '...', ok: 'ok' }
const LM = [
  { kind: 'hall', re: /academic block\s*-\s*1/i, text: 'Study hall' },
  { kind: 'boutique', re: /academic block\s*-\s*2/i, text: 'Wardrobe shop' },
  { kind: 'homestore', re: /admin/i, text: 'Home store' },
  { kind: 'bakery', re: /dining/i, text: 'Bakery' },
]
const WALLS = ['#F6D9C4', '#DCE9F5', '#F3E6B8', '#D9EDD6', '#EBD9F2', '#F7D2D8', '#D6EEF0', '#F0E2D0']
const ROOFS = ['#B5533C', '#7A5C99', '#3E7C8C', '#A8643A', '#5C7F4E', '#9C4860']
const KEYS = {
  ArrowUp: 'f', w: 'f', W: 'f', ArrowDown: 'b', s: 'b', S: 'b',
  ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', q: 'ql', Q: 'ql', e: 'qr', E: 'qr',
}

const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const fin = v => typeof v === 'number' && Number.isFinite(v)

export function landmarksOf(geo) {
  const out = []
  for (const l of LM) {
    const b = geo.bld.find(q => q.n && l.re.test(q.n))
    if (b) out.push({ kind: l.kind, text: l.text, x: b.door[0], z: b.door[1] })
  }
  return out
}

export function doorOf(spot) {
  return { x: spot.x + Math.sin(spot.r) * DOOR_D, z: spot.z + Math.cos(spot.r) * DOOR_D }
}

export function dirOf(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'r' : 'l'
  return dz > 0 ? 'd' : 'u'
}

function turn(cur, to, k) {
  let d = to - cur
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return cur + d * k
}

export function createCampusScene({ T, geo, geom, people, world, host, plots = [], players = [], me = {} } = {}) {
  const M = geo.m
  const cv = document.createElement('canvas')
  cv.setAttribute('role', 'img')
  cv.setAttribute('aria-label', geo.name + ' campus in 3D. Use the arrow keys or tap the ground to walk. Drag to look around.')
  cv.tabIndex = 0
  cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;outline:none'
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  let shadows = !coarse
  let pr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
  const rdr = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' })
  rdr.setPixelRatio(pr)
  rdr.shadowMap.enabled = shadows
  rdr.shadowMap.type = T.PCFSoftShadowMap
  rdr.toneMapping = T.ACESFilmicToneMapping
  host.insertBefore(cv, host.children[1] || null)

  const sc = new T.Scene()
  sc.fog = new T.Fog(0x9fd0f0, 240, 1000)
  sc.background = new T.Color(0x9fd0f0)
  const cam = new T.PerspectiveCamera(55, 1, 0.3, 1800)
  const wld = world.buildWorld(T, geo, { trees: geom.scatter(geo, coarse ? 350 : 700, 7), shadows })
  sc.add(wld.group)

  const scene = { is3d: true, district: 0, onDoor: null, onPlayer: null, onLandmark: null }
  const junk = []
  const keep = o => { junk.push(o); return o }
  const zones = []
  const extra = []
  const labels = []

  function label(text, x, y, z, opts) {
    const l = people.makeLabel(T, text, opts)
    l.sprite.position.set(x, y, z)
    sc.add(l.sprite)
    labels.push(l)
    return l
  }

  // ----- door markers -----
  const ringGeo = keep(new T.RingGeometry(1.0, 1.35, 28))
  ringGeo.rotateX(-Math.PI / 2)
  function zone(x, z, r, color, fire) {
    const mat = keep(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }))
    const m = new T.Mesh(ringGeo, mat)
    m.position.set(x, 0.09, z)
    sc.add(m)
    const o = { x, z, r, fire, in: false, m, pulse: 0 }
    zones.push(o)
    return o
  }

  // ----- campus buildings -----
  for (const b of geo.bld) if (b.n) label(b.n, b.c[0], b.h + 3, b.c[1], { height: 2.2, size: 30 })
  for (const l of landmarksOf(geo)) {
    zone(l.x, l.z, 2.1, 0xffc94d, () => { if (scene.onLandmark) scene.onLandmark(l.kind) })
    label(l.text, l.x, 3.4, l.z, { height: 0.9, bg: 'rgba(255,236,170,0.95)' })
  }

  // ----- player houses -----
  const bodyGeo = keep(new T.BoxGeometry(7, 3.4, 6))
  const roofGeo = keep(new T.ConeGeometry(5.7, 2.6, 4))
  roofGeo.rotateY(Math.PI / 4)
  const doorGeo = keep(new T.BoxGeometry(1.1, 2.1, 0.12))
  const winGeo = keep(new T.BoxGeometry(1.2, 1.1, 0.1))
  const doorMat = keep(new T.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.8 }))
  const winMat = keep(new T.MeshStandardMaterial({ color: 0x9cc9e8, roughness: 0.2, metalness: 0.3 }))
  const houseBy = new Map()
  function house(pl) {
    const spot = geo.plots[pl.slot]
    if (!spot || !pl.owner) return
    const id = pl.owner.id
    const g = new T.Group()
    const wall = keep(new T.MeshStandardMaterial({ color: WALLS[Math.abs(id) % WALLS.length], roughness: 0.9 }))
    const top = keep(new T.MeshStandardMaterial({ color: ROOFS[Math.abs(id) % ROOFS.length], roughness: 0.8, flatShading: true }))
    const body = new T.Mesh(bodyGeo, wall)
    body.position.y = 1.7
    const roof = new T.Mesh(roofGeo, top)
    roof.position.y = 4.7
    roof.scale.z = 0.88
    const door = new T.Mesh(doorGeo, doorMat)
    door.position.set(0, 1.05, 3.02)
    const w1 = new T.Mesh(winGeo, winMat)
    w1.position.set(-2.1, 1.9, 3.02)
    const w2 = new T.Mesh(winGeo, winMat)
    w2.position.set(2.1, 1.9, 3.02)
    for (const m of [body, roof]) { m.castShadow = true; m.receiveShadow = true }
    g.add(body, roof, door, w1, w2)
    g.position.set(spot.x, 0, spot.z)
    g.rotation.y = spot.r
    sc.add(g)
    extra.push({ x: spot.x, z: spot.z, r: HOUSE_R })
    const d = doorOf(spot)
    const z = zone(d.x, d.z, 1.9, 0xff8fb3, () => { if (scene.onDoor) scene.onDoor(id) })
    houseBy.set(id, z)
    const name = (pl.house && pl.house.name) || (pl.owner.name ? pl.owner.name + "'s house" : 'House')
    label(name, spot.x, 7.2, spot.z, { height: 0.9 })
  }
  for (const pl of plots) house(pl)

  const col = geom.makeCollider(geo, extra)

  // ----- people -----
  const focusGeo = keep(new T.RingGeometry(0.5, 0.66, 24))
  focusGeo.rotateX(-Math.PI / 2)
  const focusMat = keep(new T.MeshBasicMaterial({ color: 0x2e9d57, transparent: true, opacity: 0.9, depthWrite: false }))
  const tapGeo = keep(new T.RingGeometry(0.35, 0.5, 20))
  tapGeo.rotateX(-Math.PI / 2)
  const tapMat = keep(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }))
  const tapM = new T.Mesh(tapGeo, tapMat)
  tapM.visible = false
  sc.add(tapM)

  function ent(p, x, z) {
    const fig = people.makeFigure(T, p.look)
    fig.group.position.set(x, 0, z)
    fig.group.userData.pid = p.id
    const tag = people.makeLabel(T, p.name || '', { height: 0.5 })
    tag.sprite.position.y = 2.1
    tag.sprite.visible = !!p.name
    const bub = people.makeLabel(T, '', { height: 0.62, bg: 'rgba(255,255,255,0.97)' })
    bub.sprite.position.y = 2.75
    bub.sprite.visible = false
    const ring = new T.Mesh(focusGeo, focusMat)
    ring.position.y = 0.07
    ring.visible = p.st === 'focus'
    fig.group.add(tag.sprite, bub.sprite, ring)
    sc.add(fig.group)
    return { id: p.id, name: p.name || '', st: p.st, x, z, tx: x, tz: z, yaw: 0, moving: false, dir: 'd', fig, tag, bub, ring, until: 0 }
  }
  function drop(o) {
    sc.remove(o.fig.group)
    o.fig.dispose()
    o.tag.dispose()
    o.bub.dispose()
  }
  function patch(o, p) {
    if (p.name !== undefined && p.name !== o.name) { o.name = p.name || ''; o.tag.set(o.name); o.tag.sprite.visible = !!o.name }
    if (p.look !== undefined) o.fig.setLook(p.look)
    if (p.st !== undefined) { o.st = p.st; o.ring.visible = p.st === 'focus' }
  }

  let sx = fin(me.x) ? me.x * M : geo.spawn[0]
  let sz = fin(me.y) ? me.y * M : geo.spawn[1]
  if (col.blocked(sx, sz, R)) { sx = geo.spawn[0]; sz = geo.spawn[1] }
  const self = ent(me, sx, sz)
  for (const z of zones) z.in = Math.hypot(z.x - sx, z.z - sz) < z.r
  const others = new Map()

  function add(p) {
    if (!p || p.id == null || p.id === self.id) return
    const old = others.get(p.id)
    if (old) { patch(old, p); if (fin(p.x) && fin(p.y)) { old.tx = p.x * M; old.tz = p.y * M } return }
    const x = fin(p.x) ? p.x * M : geo.spawn[0], z = fin(p.y) ? p.y * M : geo.spawn[1]
    others.set(p.id, ent(p, x, z))
  }
  scene.setPlayers = list => {
    const ids = new Set((list || []).map(p => p && p.id))
    for (const [id, o] of others) if (!ids.has(id)) { drop(o); others.delete(id) }
    for (const p of list || []) add(p)
  }
  scene.addPlayer = add
  scene.removePlayer = id => { const o = others.get(id); if (o) { drop(o); others.delete(id) } }
  scene.updatePlayer = (id, p) => {
    const o = others.get(id)
    if (!o || !p) return
    if (fin(p.x) && fin(p.y)) { o.tx = p.x * M; o.tz = p.y * M }
    patch(o, p)
  }
  const who = id => (id === self.id ? self : others.get(id))
  function bubble(id, text, ms) {
    const o = who(id)
    if (!o || !text) return
    o.bub.set(text)
    o.bub.sprite.visible = true
    o.until = clock + ms / 1000
  }
  scene.emote = (id, k, ms = 2600) => bubble(id, EMO[k] || k, ms)
  scene.say = (id, text) => bubble(id, String(text == null ? '' : text).trim(), 5000)
  scene.knock = owner => { const z = houseBy.get(owner); if (z) z.pulse = 2.5 }
  scene.setMe = p => { if (p) patch(self, p) }
  scene.player = () => ({
    x: self.x / M, y: self.z / M, dir: self.dir, moving: self.moving,
    a: self.moving ? 'walk.' + (self.dir === 'r' ? 'l' : self.dir) : 'idle.d',
  })

  // ----- input -----
  const keys = new Set()
  const ptrs = new Map()
  let yaw = 0.6, pitch = 0.5, dist = 16
  let goal = null
  let drag = false
  let pinch = 0
  const kd = e => {
    const el = e.target
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const k = KEYS[e.key]
    if (k) keys.add(k)
  }
  const ku = e => { const k = KEYS[e.key]; if (k) keys.delete(k) }
  const blur = () => keys.clear()
  const pd = e => {
    if (e.button > 0) return
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY })
    if (ptrs.size === 1) drag = false
    pinch = 0
    try { cv.setPointerCapture(e.pointerId) } catch (err) { /* pointer already gone */ }
  }
  const pm = e => {
    const p = ptrs.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch > 0 && d > 0) dist = cl(dist * pinch / d, 5, 70)
      pinch = d
      drag = true
      return
    }
    if (!drag && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8) return
    drag = true
    yaw -= dx * 0.006
    pitch = cl(pitch + dy * 0.005, 0.12, 1.35)
  }
  const pu = e => {
    const p = ptrs.get(e.pointerId)
    ptrs.delete(e.pointerId)
    pinch = 0
    if (p && !drag && ptrs.size === 0) tap(e.clientX, e.clientY)
  }
  const pc = e => { ptrs.delete(e.pointerId); pinch = 0 }
  const wh = e => { e.preventDefault(); dist = cl(dist * Math.exp(e.deltaY * 0.0012), 5, 70) }
  window.addEventListener('keydown', kd)
  window.addEventListener('keyup', ku)
  window.addEventListener('blur', blur)
  cv.addEventListener('pointerdown', pd)
  cv.addEventListener('pointermove', pm)
  cv.addEventListener('pointerup', pu)
  cv.addEventListener('pointercancel', pc)
  cv.addEventListener('wheel', wh, { passive: false })

  const ray = new T.Raycaster()
  const ndc = new T.Vector2()
  const floor = new T.Plane(new T.Vector3(0, 1, 0), 0)
  const hit = new T.Vector3()
  function tap(cx, cy) {
    const r = cv.getBoundingClientRect()
    if (!r.width || !r.height) return
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, cam)
    const figs = [...others.values()].map(o => o.fig.group)
    const got = ray.intersectObjects(figs, true).find(h => h.object.isMesh)
    if (got) {
      let o = got.object
      while (o && o.userData.pid === undefined) o = o.parent
      if (o && scene.onPlayer) scene.onPlayer(o.userData.pid)
      return
    }
    if (!ray.ray.intersectPlane(floor, hit)) return
    let x = cl(hit.x, 1, geo.w - 1), z = cl(hit.z, 1, geo.h - 1)
    for (const q of zones) if (Math.hypot(q.x - x, q.z - z) < q.r + 2.5) { x = q.x; z = q.z; break }
    goal = { x, z }
    tapM.position.set(x, 0.1, z)
    tapM.visible = true
  }

  // ----- loop -----
  let clock = 0
  let raf = 0
  let last = 0
  let paused = false
  let dead = false
  let hourT = 99
  let fpsN = 0, fpsT = 0, tuned = false

  function hour() {
    const d = new Date()
    wld.setHour(d.getHours() + d.getMinutes() / 60)
    const u = wld.group.userData
    if (fin(u.sky)) sc.background.setHex(u.sky)
    if (fin(u.fog)) sc.fog.color.setHex(u.fog)
  }

  function walk(dt) {
    let mx = 0, mz = 0
    const f = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0)
    const s = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0)
    if (keys.has('ql')) yaw += dt * 1.8
    if (keys.has('qr')) yaw -= dt * 1.8
    if (f || s) {
      goal = null
      tapM.visible = false
      mx = -Math.sin(yaw) * f + Math.cos(yaw) * s
      mz = -Math.cos(yaw) * f - Math.sin(yaw) * s
      const n = Math.hypot(mx, mz)
      mx = mx / n * SPEED * dt
      mz = mz / n * SPEED * dt
    } else if (goal) {
      const dx = goal.x - self.x, dz = goal.z - self.z
      const n = Math.hypot(dx, dz)
      if (n < 0.3) { goal = null; tapM.visible = false } else {
        const k = Math.min(SPEED * dt, n) / n
        mx = dx * k
        mz = dz * k
      }
    }
    if (!mx && !mz) { self.moving = false; return }
    const p = col.move(self.x, self.z, mx, mz, R)
    const dx = p.x - self.x, dz = p.z - self.z
    const moved = Math.hypot(dx, dz)
    self.moving = moved > 1e-4
    if (!self.moving) { goal = null; tapM.visible = false; return }
    self.x = p.x
    self.z = p.z
    self.dir = dirOf(dx, dz)
    self.yaw = turn(self.yaw, Math.atan2(dx, dz), Math.min(1, dt * 12))
  }

  function update(dt) {
    clock += dt
    walk(dt)
    self.fig.group.position.set(self.x, 0, self.z)
    self.fig.group.rotation.y = self.yaw
    self.fig.pose(clock, self.moving)
    for (const z of zones) {
      const inn = Math.hypot(z.x - self.x, z.z - self.z) < z.r
      if (inn && !z.in) { goal = null; tapM.visible = false; keys.clear(); z.fire() }
      z.in = inn
      if (z.pulse > 0) z.pulse -= dt
      const k = 1 + Math.sin(clock * (z.pulse > 0 ? 14 : 3)) * (z.pulse > 0 ? 0.25 : 0.08)
      z.m.scale.set(k, 1, k)
    }
    const k = Math.min(1, dt * 8)
    for (const o of others.values()) {
      const dx = o.tx - o.x, dz = o.tz - o.z
      const n = Math.hypot(dx, dz)
      o.moving = n > 0.15
      if (n > 90) { o.x = o.tx; o.z = o.tz } else { o.x += dx * k; o.z += dz * k }
      if (o.moving) o.yaw = turn(o.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10))
      o.fig.group.position.set(o.x, 0, o.z)
      o.fig.group.rotation.y = o.yaw
      o.fig.pose(clock, o.moving)
      if (o.until && o.until < clock) { o.until = 0; o.bub.sprite.visible = false }
    }
    if (self.until && self.until < clock) { self.until = 0; self.bub.sprite.visible = false }
    const cp = Math.cos(pitch)
    cam.position.set(self.x + Math.sin(yaw) * cp * dist, 1.5 + Math.sin(pitch) * dist, self.z + Math.cos(yaw) * cp * dist)
    cam.lookAt(self.x, 1.5, self.z)
    wld.sun.target.position.set(self.x, 0, self.z)
    wld.update(clock)
    hourT += dt
    if (hourT > 60) { hourT = 0; hour() }
  }

  function tune(dt) {
    if (tuned || clock < 2) return
    fpsN++
    fpsT += dt
    if (fpsT < 4) return
    tuned = true
    if (fpsN / fpsT >= 26) return
    shadows = false
    rdr.shadowMap.enabled = false
    wld.sun.castShadow = false
    pr = 1
    rdr.setPixelRatio(pr)
    size()
  }

  function frame(now) {
    raf = 0
    if (dead || paused || document.hidden) return
    const raw = (now - last) / 1000
    const dt = Math.min(0.1, Math.max(0, raw))
    last = now
    update(dt)
    rdr.render(sc, cam)
    tune(raw)
    raf = requestAnimationFrame(frame)
  }
  function run() {
    if (raf || dead || paused || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const vis = () => { keys.clear(); run() }
  document.addEventListener('visibilitychange', vis)

  function size() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1
    rdr.setSize(w, h, false)
    cam.aspect = w / h
    cam.updateProjectionMatrix()
  }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null
  if (ro) ro.observe(host)
  else window.addEventListener('resize', size)

  scene.pause = on => {
    paused = !!on
    cv.style.display = paused ? 'none' : 'block'
    keys.clear()
    if (!paused) { size(); run() }
  }
  scene.step = dt => { update(dt); rdr.render(sc, cam) }
  scene.info = () => ({ calls: rdr.info.render.calls, tris: rdr.info.render.triangles, shadows, pr, others: others.size, zones: zones.length })
  scene.destroy = () => {
    if (dead) return
    dead = true
    cancelAnimationFrame(raf)
    document.removeEventListener('visibilitychange', vis)
    window.removeEventListener('keydown', kd)
    window.removeEventListener('keyup', ku)
    window.removeEventListener('blur', blur)
    window.removeEventListener('resize', size)
    if (ro) ro.disconnect()
    for (const o of others.values()) drop(o)
    others.clear()
    drop(self)
    for (const l of labels) l.dispose()
    for (const j of junk) j.dispose()
    wld.dispose()
    rdr.dispose()
    try { rdr.forceContextLoss() } catch (e) { /* context already lost */ }
    cv.remove()
  }

  for (const p of players) add(p)
  size()
  hour()
  update(0)
  run()
  return scene
}
