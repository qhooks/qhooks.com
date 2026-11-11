// QHooks installed app: the only thing this worker caches is the offline page. Every other request goes to the network
// untouched, so a deploy is live for app users immediately and wallet, RPC and API traffic never meets a stale cache.
const CACHE = 'qhooks-offline-v1', OFFLINE = '/offline';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE, '/app-icons/icon-192.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
// Push messages contain public terminal buys only. Navigation is confined to this app.
self.addEventListener('push', e => {
  let value;try{value=e.data?.json();}catch{return;}
  if(!value||typeof value.title!=='string'||typeof value.body!=='string')return;
  let destination='/traders';try{const url=new URL(value.url,self.location.origin);if(url.origin===self.location.origin&&url.pathname==='/traders')destination=url.pathname+url.search;}catch{}
  e.waitUntil(self.registration.showNotification(value.title.slice(0,100),{body:value.body.slice(0,240),icon:'/app-icons/icon-192.png',tag:'qhooks-trader-buy',renotify:false,data:{url:destination}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();let destination='/traders';try{const url=new URL(e.notification.data?.url,self.location.origin);if(url.origin===self.location.origin&&url.pathname==='/traders')destination=url.pathname+url.search;}catch{}
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const current=clients.find(client=>new URL(client.url).origin===self.location.origin);
    if(current){await current.navigate(destination);return current.focus();}return self.clients.openWindow(destination);
  }));
});
