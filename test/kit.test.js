import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICONS, iconRows } from '../public/town/ui/icons.js';

const NAMES = ['coin', 'gem', 'map', 'chat', 'shirt', 'house', 'gear', 'heart', 'party', 'close', 'more', 'send', 'play', 'pause', 'bell', 'cake'];

test('icons are 12x12 with allowed chars', () => {
  for (const n of NAMES) assert.ok(ICONS[n], n);
  for (const [n, rows] of Object.entries(ICONS)) {
    assert.equal(rows.length, 12, n);
    for (const r of rows) assert.match(r, /^[.a-xOWE1-9BL]{12}$/, n);
  }
  assert.equal(iconRows('nope'), null);
});

test('kit tokens alias the palette, skins cover light and dark', () => {
  const css = readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');
  for (const t of ['--k-panel:var(', '--k-edge:var(', '--k-ink:var(']) assert.equal(css.split(t).length - 1, 1, t);
  const tok = readFileSync(new URL('../public/css/cute-tokens.css', import.meta.url), 'utf8');
  for (const s of ['bubblegum', 'matcha', 'peach', 'starlight']) {
    assert.ok(tok.includes(`html[data-skin=${s}]`), s);
    const dark = s === 'bubblegum' ? 'html[data-theme=dark]{' : `html[data-theme=dark][data-skin=${s}]`;
    assert.ok(tok.includes(dark), s + ' dark');
  }
  assert.ok(tok.includes('prefers-color-scheme:dark'));
});

test('town.js cleaned up', () => {
  const s = readFileSync(new URL('../public/js/views/town.js', import.meta.url), 'utf8');
  assert.ok(!s.includes('houseeditor'));
  assert.ok(!s.includes('\\u{1FA99}'));
});
