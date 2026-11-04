// QHooks installed app: the only thing this worker caches is the offline page. Every other request goes to the network
// untouched, so a deploy is live for app users immediately and wallet, RPC and API traffic never meets a stale cache.
const CACHE = 'qhooks-offline-v1', OFFLINE = '/offline.html';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE, '/app-icons/icon-192.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
