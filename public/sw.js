// Offline: every game file goes into the cache on install and is served from it from then on.
// When any file changes, bump VERSION — otherwise devices stay on the old version.
const VERSION = '44';
const CACHE = `zmeigrad-v${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'client.js',
  'core.js',
  'room.js',
  'rtc.js',
  'backdrop.js',
  'sounds.js',
  'i18n.js',
  'lang/en.js',
  'lang/ru.js',
  'sfx/eat.wav',
  'manifest.webmanifest',
  'manifest.ru.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

// A new version installs in the background and waits: the page shows "A game update is ready", and only the "Update"
// button (message 'skip') lets the new version take over. Without the button it takes over once the game is closed and reopened.
// Versions before 6 don't know the button and expect the new version to take over by itself — for them we activate at once, as before.
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
