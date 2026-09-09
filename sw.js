const CACHE = 'uim-logbook-v5';
const ASSETS = [
  './', './index.html', './admin/',
  './js/state.js','./js/ui.js',
  './js/db.js','./js/export.js','./js/sync.js','./js/app.js',
  './manifest.json', './logo.png', './icon-192.png', './icon-512.png',
];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); });
self.addEventListener('fetch', e => { e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))); });
