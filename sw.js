/* Service worker du KGD : l'appli s'ouvre tout de suite, même sans réseau.
   - La coquille (pages, scripts, styles, polices, icônes) vient du cache, puis se met à jour en arrière-plan.
   - Le reste : réseau, avec 3 s de patience, puis le cache ; une page inconnue retombe sur l'accueil.
   - Les appels /api ne sont jamais mis en cache.
   - Une nouvelle version attend que l'utilisateur choisisse « Recharger » (message SKIP_WAITING) : rien ne change sous ses doigts.
   VERSION est à changer à chaque déploiement qui touche ces fichiers. */
const VERSION = 'kgd-v21';
const SHELL = ['./', './index.html', './style.css', './app.js', './views.js', './lire.js', './manifest.json', './favicon.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/logo.svg', './icons/apple-touch-icon.png',
  './fonts/inter-latin-400-normal.woff2', './fonts/inter-latin-500-normal.woff2', './fonts/inter-latin-600-normal.woff2', './fonts/inter-latin-700-normal.woff2', './fonts/sora-latin-600-normal.woff2', './fonts/sora-latin-700-normal.woff2'];
const COQUILLE = new Set(SHELL.map(u => new URL(u, self.location).pathname));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const pause = ms => new Promise(r => setTimeout(() => r(null), ms));
const garder = (cle, r) => { if (r && r.ok && r.type === 'basic') { const copie = r.clone(); caches.open(VERSION).then(c => c.put(cle, copie)).catch(() => {}); } return r; };

/* Coquille : le cache tout de suite, la version fraîche rangée pour la prochaine ouverture */
function coquille(e, url) {
  const cle = url.origin + url.pathname; // ?text=… (partage) ou ?stockage : même page
  const frais = fetch(e.request).then(r => garder(cle, r));
  return caches.match(cle).then(enCache => {
    if (enCache) { e.waitUntil(frais.catch(() => null)); return enCache; }
    return frais.catch(() => caches.match('./index.html')).then(r => r || Response.error());
  });
}
/* Le reste : réseau (3 s au plus), puis cache, puis l'accueil pour une page ; sinon une vraie erreur réseau */
function reseau(e) {
  const req = e.request, page = req.mode === 'navigate';
  const frais = fetch(req).then(r => garder(req, r));
  e.waitUntil(frais.catch(() => null));
  return Promise.race([frais, pause(3000)]).catch(() => null)
    .then(r => r || caches.match(req, { ignoreSearch: page }))
    .then(r => r || frais.catch(() => null))
    .then(r => r || (page ? caches.match('./index.html') : null))
    .then(r => r || Response.error());
}
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(COQUILLE.has(url.pathname) ? coquille(e, url) : reseau(e));
});
