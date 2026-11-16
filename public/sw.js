// Офлайн: все файлы игры кладутся в кэш при установке и дальше отдаются из него.
// При изменении любого файла увеличить VERSION — иначе устройства останутся на старой версии.
const VERSION = '32';
const CACHE = `zmeigrad-v${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'client.js',
  'core.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

// Новая версия ставится в фоне и ждёт: страница показывает «Вышло обновление», и только по кнопке «Обновить»
// (сообщение 'skip') новая версия берёт управление. Без кнопки она включится сама, когда игру закроют и откроют заново.
// Версии до 6-й кнопки не знают и ждут, что новая версия включится сама, — для них включаемся сразу, как раньше.
const PROMPT_SINCE = 6;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => caches.keys()).then((keys) => {
    const old = keys.some((k) => { const m = /^zmeigrad-v(\d+)$/.exec(k); return m && Number(m[1]) < PROMPT_SINCE; });
    if (old) return self.skipWaiting();
  }));
});
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zmeigrad-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/ws') || url.pathname.endsWith('/healthz')) return;
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
