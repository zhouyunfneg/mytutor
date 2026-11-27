const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event('mytutor:unauthorized'));
    throw new Error('未登录');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const api = {
  get: (p) => req('GET', p),
  put: (p, b) => req('PUT', p, b),
  post: (p, b) => req('POST', p, b),
  del: (p) => req('DELETE', p),
  beacon: (p, b) => navigator.sendBeacon(
    BASE + p,
    new Blob([JSON.stringify(b)], { type: 'application/json' }),
  ),
};