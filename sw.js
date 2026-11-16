// Офлайн: все файлы игры кладутся в кэш при установке и дальше отдаются из него.
// При изменении любого файла увеличить VERSION — иначе устройства останутся на старой версии.
const VERSION = '1';
const CACHE = `zmeigrad-v${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'game.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zmeigrad-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const page = await c.match('index.html');
        if (page) return page;
      }
      return fetch(req);
    }),
  );
});
