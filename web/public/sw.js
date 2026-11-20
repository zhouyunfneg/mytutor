/* MyTutor Service Worker — 网络优先 + 运行时缓存 + 离线兜底。
   部署频繁、资源带哈希：永远先走网络拿最新，成功才顺手缓存一份；
   断网时回退缓存，导航请求回退到缓存的 index.html（HashRouter 只需这一个入口）。
   /api/ 永不缓存：判题、进度、密钥设置必须实时。 */
const CACHE = 'mytutor-runtime-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域不接管
  if (url.pathname.includes('/api/')) return; // API 实时，不缓存

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const scope = self.registration.scope;
        const index = (await caches.match(scope + 'index.html')) || (await caches.match(scope));
        if (index) return index;
      }
      throw err;
    }
  })());
});