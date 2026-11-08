import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const OK = /^[.a-xOWE1-9BL]$/;
const ID = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

function want(id) {
  const p = id.split('.');
  if (p[0] === 'shadow') return [12, 3];
  if (p[0] === 'body') return [16, 24];
  if (p[0] === 'head') return [12, 11];
  if (p[0] === 'hair' || p[0] === 'acc' || p[0] === 'accessory') return [16, 14];
  if (p[0] === 'top' || (p[0] === 'outfit' && p.includes('top'))) return [16, 9];
  if (p[0] === 'bottom' || (p[0] === 'outfit' && p.includes('bottom'))) return [16, 10];
  return null;
}

export function check(mod) {
  const m = mod && mod.default ? mod.default : mod;
  const bad = [];
  const sp = (m && m.sprites) || {};
  const an = (m && m.anims) || {};
  for (const id of Object.keys(sp)) {
    const s = sp[id];
    if (!ID.test(id)) bad.push(`${id}: id must be lowercase dot-separated`);
    if (!s || !Array.isArray(s.rows)) { bad.push(`${id}: missing rows`); continue; }
    if (s.rows.length !== s.h) bad.push(`${id}: has ${s.rows.length} rows, h is ${s.h}`);
    s.rows.forEach((r, y) => {
      if (r.length !== s.w) bad.push(`${id}: row ${y} has length ${r.length}, w is ${s.w}`);
      for (const ch of r) if (!OK.test(ch)) { bad.push(`${id}: row ${y} has unknown char '${ch}'`); break; }
    });
    const w = want(id);
    if (w && (s.w !== w[0] || s.h !== w[1])) bad.push(`${id}: layer size ${s.w}x${s.h}, expected ${w[0]}x${w[1]}`);
  }
  for (const id of Object.keys(an)) {
    const a = an[id];
    if (!ID.test(id)) bad.push(`anim ${id}: id must be lowercase dot-separated`);
    for (const f of (a && a.frames) || []) {
      const fid = typeof f === 'string' ? f : f && f.body;
      if (!sp[fid]) bad.push(`anim ${id}: frame '${fid}' does not exist`);
    }
  }
  return bad;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const f = process.argv[2];
  if (!f) { console.error('usage: art-check.mjs <file>'); process.exit(2); }
  const mod = await import(pathToFileURL(resolve(f)).href);
  const bad = check(mod);
  if (bad.length) {
    console.error(bad.join('\n'));
    console.error(`${bad.length} problem(s)`);
    process.exit(1);
  }
  const m = mod.default || mod;
  console.log(`ok: ${Object.keys(m.sprites || {}).length} sprites, ${Object.keys(m.anims || {}).length} anims`);
}
