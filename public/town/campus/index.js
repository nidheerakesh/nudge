const CAMPUS = { 'way/1077351803': 'kottayam' }
const KEY = 'town_3d'

export const campusOf = lay => (lay && lay.place && CAMPUS[lay.place.osm]) || null

export function want3d() {
  try { return localStorage.getItem(KEY) !== '0' } catch (e) { return true }
}

export function set3d(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch (e) { /* storage blocked */ }
}

export function canGl() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch (e) { return false }
}

let kit = null
export function loadCampus(id) {
  if (!kit) {
    kit = Promise.all([
      import('../../vendor/three.module.min.js'),
      import('./geom.js'),
      import('./people.js'),
      import('./world.js'),
      import('./scene3d.js'),
    ]).then(([T, geom, people, world, scene]) => ({ T, geom, people, world, scene }), e => { kit = null; throw e })
  }
  return Promise.all([kit, fetch('/town/campus/' + id + '.json').then(r => { if (!r.ok) throw new Error('geo'); return r.json() })])
    .then(([k, geo]) => ({ ...k, geo }))
}
