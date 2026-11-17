// Offline: every game file goes into the cache on install and is served from it from then on.
// When any file changes, bump VERSION — otherwise devices stay on the old version.
const VERSION = '59';
const CACHE = `zmeigrad-v${VERSION}`;
const MUSIC_CACHE = 'snake-music-1'; // survives version bumps; bump only if a track file changes (activate then drops the old one)
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
  'lang/de.js',
  'lang/es.js',
  'lang/fr.js',
  'lang/it.js',
  'lang/ja.js',
  'lang/ko.js',
  'lang/nl.js',
  'lang/pl.js',
  'lang/pt.js',
  'lang/ru.js',
  'lang/tr.js',
  'lang/zh.js',
  'sfx/eat.wav',
  'manifest.webmanifest',
  'manifest.de.webmanifest',
  'manifest.es.webmanifest',
  'manifest.fr.webmanifest',
  'manifest.it.webmanifest',
  'manifest.ja.webmanifest',
  'manifest.ko.webmanifest',
  'manifest.nl.webmanifest',
  'manifest.pl.webmanifest',
  'manifest.pt.webmanifest',
  'manifest.ru.webmanifest',
  'manifest.tr.webmanifest',
  'manifest.zh.webmanifest',
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
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('zmeigrad-') && k !== CACHE) || (k.startsWith('snake-music-') && k !== MUSIC_CACHE)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/ws') || url.pathname.endsWith('/healthz')) return;
  if (url.pathname.includes('/music/')) { // music: kept in its own cache across versions — fetched once, then offline too
    e.respondWith(caches.open(MUSIC_CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req.url);
      if (r.ok) e.waitUntil(c.put(req.url, r.clone()).catch(() => {})); // the worker must not be stopped mid-write
      return r;
    }));
    return;
  }
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
