import { today } from './store.js';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-today': today() },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || String(res.status));
    err.status = res.status;
    err.data = data;
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('nudge:auth'));
    throw err;
  }
  return data;
}
