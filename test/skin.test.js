import test from 'node:test';
import assert from 'node:assert/strict';

test('applySkin validates, defaults and persists', async () => {
  const ls = {};
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.localStorage = { setItem: (k, v) => { ls[k] = v; } };
  const { applySkin } = await import('../public/js/store.js');
  applySkin('matcha');
  assert.equal(document.documentElement.dataset.skin, 'matcha');
  assert.equal(ls.skin, 'matcha');
  applySkin('nope');
  assert.equal(document.documentElement.dataset.skin, 'bubblegum');
  assert.equal(ls.skin, 'bubblegum');
  applySkin(null);
  assert.equal(ls.skin, 'bubblegum');
  delete globalThis.document;
  delete globalThis.localStorage;
});
