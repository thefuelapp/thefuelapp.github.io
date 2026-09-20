// Network-first, cache fallback. Bump VERSION on every deploy.
const VERSION = 'fuel-v72';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './planner.js', './config.js', './cloud.js', './terms.html', './privacy.html', './data/ingredients.json', './data/recipes.json', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
