// QHooks installed app: the only thing this worker caches is the offline page. Every other request goes to the network
// untouched, so a deploy is live for app users immediately and wallet, RPC and API traffic never meets a stale cache.
const CACHE = 'qhooks-offline-v1', OFFLINE = '/offline';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE, '/app-icons/icon-192.png'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
// Public activity alerts open review pages only. No push action approves, signs or sends a trade.
function notificationDestination(value){
 try{const u=new URL(value,self.location.origin);if(u.origin!==self.location.origin)return null;
  const q=new URLSearchParams();
  if(['/traders','/following'].includes(u.pathname)){const w=u.searchParams.get('wallet');if(w&&/^(?:0x[\da-f]{40}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/i.test(w))q.set('wallet',w);}
  else if(u.pathname==='/wallets'){const w=u.searchParams.get('w'),c=u.searchParams.get('chain');if(!/^0x[\da-f]{40}$/i.test(w||'')||!/^\d{1,6}$/.test(c||''))return null;q.set('w',w);q.set('chain',c);}
  else if(u.pathname==='/terminal'){const t=u.searchParams.get('t');if(!/^(?:\d{1,6}:0x[\da-f]{40}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/i.test(t||''))return null;q.set('t',t);q.set('side','buy');}
  else if(u.pathname==='/qproof'){const c=u.searchParams.get('chain'),a=u.searchParams.get('q');if(!/^(?:\d{1,6}|solana)$/.test(c||'')||!/^(?:0x[\da-f]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/i.test(a||''))return null;q.set('chain',c);q.set('q',a);}
  else return null;
  return u.pathname+(q.size?'?'+q:'');
 }catch{return null;}
}
self.addEventListener('push', e => {
  let value;try{value=e.data?.json();}catch{return;}
  if(!value||typeof value.title!=='string'||typeof value.body!=='string')return;
  const destination=notificationDestination(value.url)||'/traders',buy=notificationDestination(value.buy),proof=notificationDestination(value.proof);
  e.waitUntil(self.registration.showNotification(value.title.slice(0,100),{body:value.body.slice(0,240),icon:'/app-icons/icon-192.png',tag:'qhooks-activity-'+String(value.tradeId||'latest').slice(0,80),renotify:false,actions:[...(buy?[{action:'buy',title:'Buy'}]:[]),...(proof?[{action:'proof',title:'QProof'}]:[])],data:{url:destination,buy,proof}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();const choice=['buy','proof'].includes(e.action)?e.notification.data?.[e.action]:e.notification.data?.url,destination=notificationDestination(choice)||notificationDestination(e.notification.data?.url)||'/traders';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const current=clients.find(client=>new URL(client.url).origin===self.location.origin);
    if(current){await current.navigate(destination);return current.focus();}return self.clients.openWindow(destination);
  }));
});
