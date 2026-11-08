import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(join(root, 'town')).concat(walk(join(root, 'js'))).filter((f) => f.endsWith('.js'));

test('every static and dynamic import in the browser code resolves to a file', () => {
  const bad = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const p = m[1];
      let t = null;
      if (p.startsWith('/')) t = join(root, p);
      else if (p.startsWith('.')) t = resolve(dirname(f), p);
      if (t && !existsSync(t)) bad.push(f.slice(root.length) + ' -> ' + p);
    }
  }
  assert.deepEqual(bad, []);
});

test('no innerHTML in town code', () => {
  const bad = files.filter((f) => f.includes('/town/') || f.endsWith('views/town.js')).filter((f) => /innerHTML\s*=/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length));
  assert.deepEqual(bad, []);
});
