/* Service worker du KGD : rend l'appli installable et utilisable hors ligne.
   Réseau d'abord pour les pages et scripts (toujours la dernière version), cache en secours.
   Les appels /api ne sont jamais mis en cache. */
const VERSION = 'kgd-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './views.js', './manifest.json', './favicon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/logo.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copie)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
