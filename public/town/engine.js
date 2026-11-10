export const TILE = 16
const STEP = 1 / 60

const KEYS = {
  ArrowLeft: 'l', a: 'l', A: 'l',
  ArrowRight: 'r', d: 'r', D: 'r',
  ArrowUp: 'u', w: 'u', W: 'u',
  ArrowDown: 'd', s: 'd', S: 'd',
}

export function baseScale(cw, ch) {
  return Math.min(6, Math.max(2, Math.floor(Math.min(cw, ch) / 200)))
}

export function fitScale(viewW, viewH, sceneWpx, sceneHpx, dpr = 1) {
  const s = Math.floor(viewH / Math.max(1, sceneHpx))
  return Math.min(8, Math.max(2, s))
}

export function sortByY(list) {
  return list.sort((a, b) => a.y - b.y)
}

export function drawSprite(ctx, canvas, x, y, opts = {}) {
  if (!canvas) return
  const w = canvas.width, h = canvas.height
  const px = Math.round(x - w / 2 + (opts.ox || 0))
  const py = Math.round(y - h + (opts.oy || 0))
  const al = opts.alpha
  if (al != null && al !== 1) ctx.globalAlpha = al
  if (opts.flip) {
    ctx.save()
    ctx.translate(px + w, py)
    ctx.scale(-1, 1)
    ctx.drawImage(canvas, 0, 0)
    ctx.restore()
  } else {
    ctx.drawImage(canvas, px, py)
  }
  if (al != null && al !== 1) ctx.globalAlpha = 1
}

export function createEngine(canvas, opts = {}) {
  const tile = opts.tile || TILE
  const ctx = canvas.getContext('2d')
  const off = document.createElement('canvas')
  const octx = off.getContext('2d')
  const cam = { x: 0, y: 0, w: 0, h: 0, fx: 0, fy: 0, target: null, ease: opts.ease || 8 }
  const keys = new Set()
  const taps = []
  let scene = null
  let raf = 0
  let running = false
  let last = 0
  let acc = 0
  let t = 0
  let scale = 1
  let dev = 1
  let tapCb = null
  let ptr = null
  let frames = 0
  let fpsT = 0

  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const eng = {
    camera: cam,
    reduced: !!(mq && mq.matches),
    fps: 0,
    scale: 1,
    input: { dir },
  }
  if (mq) {
    const f = e => { eng.reduced = e.matches }
    if (mq.addEventListener) mq.addEventListener('change', f)
    else if (mq.addListener) mq.addListener(f)
  }

  function dir() {
    let x = 0, y = 0
    if (keys.has('l')) x -= 1
    if (keys.has('r')) x += 1
    if (keys.has('u')) y -= 1
    if (keys.has('d')) y += 1
    return { x, y }
  }

  function resize() {
    const r = canvas.getBoundingClientRect()
    const cw = Math.max(1, r.width), ch = Math.max(1, r.height)
    const dpr = window.devicePixelRatio || 1
    const bw = Math.max(1, Math.round(cw * dpr)), bh = Math.max(1, Math.round(ch * dpr))
    if (scene && scene.fit && scene.size) scale = fitScale(cw, ch, scene.size.w * tile, scene.size.h * tile, dpr)
    else scale = opts.scale || baseScale(cw, ch)
    dev = Math.max(1, Math.round(scale * dpr))
    if (canvas.width !== bw) canvas.width = bw
    if (canvas.height !== bh) canvas.height = bh
    off.width = cam.w = Math.ceil(bw / dev)
    off.height = cam.h = Math.ceil(bh / dev)
    eng.scale = scale
    clamp()
    place()
  }

  function clamp() {
    if (!scene || !scene.size) return
    const sw = scene.size.w * tile, sh = scene.size.h * tile
    cam.fx = sw <= cam.w ? (sw - cam.w) / 2 : Math.min(Math.max(cam.fx, 0), sw - cam.w)
    cam.fy = sh <= cam.h ? (sh - cam.h) / 2 : Math.min(Math.max(cam.fy, 0), sh - cam.h)
  }

  function place() {
    cam.x = Math.round(cam.fx)
    cam.y = Math.round(cam.fy)
  }

  function snap() {
    const g = cam.target
    if (g) {
      cam.fx = g.x - cam.w / 2
      cam.fy = g.y - cam.h / 2
    }
    clamp()
    place()
  }
  cam.snap = snap
  cam.follow = g => { cam.target = g }

  function step() {
    if (scene) scene.update(STEP)
    const g = cam.target
    if (g) {
      const k = eng.reduced ? 1 : 1 - Math.exp(-cam.ease * STEP)
      cam.fx += (g.x - cam.w / 2 - cam.fx) * k
      cam.fy += (g.y - cam.h / 2 - cam.fy) * k
    }
    clamp()
    place()
    t += STEP
  }

  function frame(ts) {
    if (!running) return
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.25, (ts - last) / 1000)
    last = ts
    acc += dt
    while (acc >= STEP) { step(); acc -= STEP }
    octx.imageSmoothingEnabled = false
    octx.clearRect(0, 0, off.width, off.height)
    if (scene && scene.bg) { octx.fillStyle = scene.bg; octx.fillRect(0, 0, off.width, off.height) }
    if (scene) scene.draw(octx, cam, t)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, off.width * dev, off.height * dev)
    frames++
    if (ts - fpsT >= 500) {
      eng.fps = Math.round(frames * 1000 / (ts - fpsT))
      frames = 0
      fpsT = ts
    }
  }

  function run() {
    if (running || document.hidden) return
    running = true
    last = performance.now()
    fpsT = last
    frames = 0
    acc = 0
    raf = requestAnimationFrame(frame)
  }

  function halt() {
    running = false
    cancelAnimationFrame(raf)
  }

  let wanted = false
  function onVis() {
    if (!wanted) return
    if (document.hidden) { halt(); keys.clear() } else run()
  }

  function screenToTile(cx, cy) {
    const r = canvas.getBoundingClientRect()
    const px = (cx - r.left) / r.width * canvas.width / dev + cam.x
    const py = (cy - r.top) / r.height * canvas.height / dev + cam.y
    return { x: Math.floor(px / tile), y: Math.floor(py / tile), px, py }
  }

  function onKey(e, down) {
    const el = e.target
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const d = KEYS[e.key]
    if (!d) return
    if (down) keys.add(d)
    else keys.delete(d)
    e.preventDefault()
  }
  const kd = e => onKey(e, true)
  const ku = e => onKey(e, false)
  const blur = () => keys.clear()
  const pd = e => {
    if (e.button > 0) return
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const pu = e => {
    if (!ptr || ptr.id !== e.pointerId) return
    const mv = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y)
    ptr = null
    if (mv > 10 || !tapCb) return
    const p = screenToTile(e.clientX, e.clientY)
    tapCb(p.x, p.y, p)
  }
  const pc = () => { ptr = null }

  canvas.style.touchAction = 'manipulation'
  canvas.style.imageRendering = 'pixelated'
  window.addEventListener('keydown', kd)
  window.addEventListener('keyup', ku)
  window.addEventListener('blur', blur)
  canvas.addEventListener('pointerdown', pd)
  canvas.addEventListener('pointerup', pu)
  canvas.addEventListener('pointercancel', pc)
  document.addEventListener('visibilitychange', onVis)
  let ro = null
  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => resize())
    ro.observe(canvas)
  } else {
    window.addEventListener('resize', resize)
  }

  eng.setScene = s => {
    scene = s
    resize()
    snap()
  }
  eng.start = () => { wanted = true; resize(); run() }
  eng.stop = () => {
    wanted = false
    halt()
    keys.clear()
  }
  eng.destroy = () => {
    eng.stop()
    window.removeEventListener('keydown', kd)
    window.removeEventListener('keyup', ku)
    window.removeEventListener('blur', blur)
    window.removeEventListener('resize', resize)
    canvas.removeEventListener('pointerdown', pd)
    canvas.removeEventListener('pointerup', pu)
    canvas.removeEventListener('pointercancel', pc)
    document.removeEventListener('visibilitychange', onVis)
    if (ro) ro.disconnect()
  }
  eng.resize = resize
  eng.screenToTile = screenToTile
  eng.onTap = f => { tapCb = f }
  return eng
}

// x, y in tile units (tile centre = +0.5 handled by caller); speed in tiles per second
export function moveController({ speed = 4, x = 0, y = 0, canMove = null } = {}) {
  const m = { x, y, facing: 'd', isMoving: false, speed }
  let path = null
  let pi = 0
  let lastAxis = 'x'

  m.setPath = p => {
    path = p && p.length ? p.map(c => ({ x: c.x, y: c.y })) : null
    pi = 0
  }
  m.cancel = () => { path = null }
  m.hasPath = () => !!path

  function face(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) m.facing = dx < 0 ? 'l' : 'r'
    else m.facing = dy < 0 ? 'u' : 'd'
  }

  m.update = (dt, d) => {
    let mx = 0, my = 0
    if (d && (d.x || d.y)) {
      path = null
      if (d.x && d.y) {
        if (lastAxis === 'x') mx = Math.sign(d.x)
        else my = Math.sign(d.y)
      } else {
        mx = d.x
        my = d.y
        lastAxis = mx ? 'x' : 'y'
      }
      const nx = m.x + mx * speed * dt, ny = m.y + my * speed * dt
      face(mx, my)
      if (!canMove || canMove(nx, ny)) { m.x = nx; m.y = ny; m.isMoving = true }
      else m.isMoving = false
      return m
    }
    if (path) {
      let left = speed * dt
      m.isMoving = false
      while (left > 0 && path) {
        const c = path[pi]
        const tx = c.x + 0.5, ty = c.y + 0.5
        const ex = tx - m.x
        const dx = Math.abs(ex) > 1e-6 ? ex : 0
        const dy = dx ? 0 : ty - m.y
        const dist = Math.abs(dx) + Math.abs(dy)
        if (dist < 1e-6) {
          pi++
          if (pi >= path.length) path = null
          continue
        }
        face(dx, dy)
        m.isMoving = true
        const mv = Math.min(dist, left)
        m.x += Math.sign(dx) * mv
        m.y += Math.sign(dy) * mv
        left -= mv
      }
      return m
    }
    m.isMoving = false
    return m
  }
  return m
}
