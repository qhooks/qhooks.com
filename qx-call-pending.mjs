// One deadline timer for unresolved values across a page. Never fetches or polls.
export const CALL_PENDING_MS=10000;
export function createCallPendingClock({now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,limit=512}={}){
 const starts=new Map(),listeners=new Set();let timer=null,dead=false;
 const state=at=>now()-at>=CALL_PENDING_MS?'syncing':'loading';
 function schedule(){if(timer!==null){clearTimer(timer);timer=null;}if(dead||!listeners.size)return;const next=Math.min(...[...listeners].map(x=>x.at+CALL_PENDING_MS));timer=setTimer(flush,Math.max(0,next-now()));}
 function flush(){if(timer!==null)clearTimer(timer);timer=null;for(const x of [...listeners]){if(state(x.at)==='syncing'){listeners.delete(x);if(x.active())x.notify('syncing');}}schedule();}
 return{watch(key,notify,{active=()=>true}={}){if(dead)return()=>{};let at=starts.get(key);if(at===undefined){at=now();starts.set(key,at);while(starts.size>limit)starts.delete(starts.keys().next().value);}const current=state(at);notify(current);if(current==='syncing')return()=>{};const entry={at,notify,active};listeners.add(entry);schedule();return()=>{listeners.delete(entry);schedule();};},flush,dispose(){dead=true;listeners.clear();starts.clear();if(timer!==null)clearTimer(timer);timer=null;}};
}
let clock,serial=0;const bindings=new WeakMap();
export function clearCallPending(node){bindings.get(node)?.();bindings.delete(node);node.classList.remove('qx-call-pending');}
export function bindCallPending(node,key,{document:doc=globalThis.document}={}){
 clearCallPending(node);if(!doc.querySelector('link[href="/qx-call-pending.css"]')){const css=doc.createElement('link');css.rel='stylesheet';css.href='/qx-call-pending.css';doc.head.append(css);}
 if(!clock){clock=createCallPendingClock();globalThis.addEventListener?.('pagehide',event=>{if(!event.persisted){clock?.dispose();clock=null;}});doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)clock?.flush();});}
 node.classList.add('qx-call-pending');const dispose=clock.watch(key||'value-'+ ++serial,state=>{if(state==='loading'){node.textContent='Refreshing';return;}const small=doc.createElement('small');small.className='qa-muted qx-syncing';small.textContent='syncing';node.replaceChildren(doc.createTextNode('— '),small);},{active:()=>node.isConnected});bindings.set(node,dispose);return dispose;
}
