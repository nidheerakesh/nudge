import { makeLayout } from './shared/layout.js'
import { districtTemplate } from './shared/plots.js'

export function layoutOf(info) {
  const place = (info && info.place) || null
  const made = info && info.feat ? makeLayout(info.feat) : null
  if (made) return { tpl: made, place, real: true }
  return { tpl: districtTemplate(), place, real: false }
}

export function makeLayouts(get) {
  const cache = new Map()
  function load(n) {
    if (!cache.has(n)) {
      const p = get(n).then(layoutOf, () => {
        cache.delete(n)
        return layoutOf(null)
      })
      cache.set(n, p)
    }
    return cache.get(n)
  }
  return { load }
}
