import { register } from './pixel.js';

const FILES = ['body', 'hair', 'accessories', 'outfits_a', 'outfits_b', 'houses', 'interiors', 'world', 'fx', 'shops', 'food', 'hall'];

export default async function loadAll() {
  const got = [];
  for (const n of FILES) {
    try {
      const mod = await import(`./${n}.js`);
      register(mod);
      got.push(n);
    } catch (e) {
      if (!/fetch|import|resolve|not found|Cannot find|Failed/i.test(String(e && e.message))) console.warn('art', n, e);
    }
  }
  return got;
}

export { loadAll };
