// Shared transport for explicitly public display GETs only. Raw payload clocks
// survive verbatim. No persistent cache, private data, RPC, quote or wallet read.
const REGISTRY=Symbol.for('qhooks.public-display-reads.v1');
const ownFetch=(...args)=>globalThis.fetch(...args),MAX_BODY=2*1024*1024;
const API_RULES=new Map([
 ['/api/terminal/feed',new Set(['chain'])],
 ['/api/terminal/market/feed',new Set(['tab','chain','window','liquidityMin','liquidityMax','capMin','capMax','volumeMin','transactionsMin','ageMinHours','ageMaxHours','venue','hasSocials'])],
 ['/api/founding',new Set()],
 ['/api/funding/native-prices',new Set(['symbols'])]
]);
const abortError=signal=>signal?.reason||new DOMException('This display read was cancelled.','AbortError');
function eligible(input,init,origin){
 if(typeof input!=='string'&&!(input instanceof URL))return null;
 if((init.method||'GET').toUpperCase()!=='GET'||init.body!=null||init.credentials==='include'||init.mode==='no-cors'||init.force===true||['reload','no-cache'].includes(init.cache)||['fresh','force','trade','send','move','review','prepare'].includes(init.qhooksReadPurpose||init.purpose))return null;
 const headers=new Headers(init.headers);for(const name of headers.keys())if(name!=='accept')return null;
 let url;try{url=new URL(String(input),origin);}catch{return null;}if(url.username||url.password||url.hash)return null;
 let ttl=0;if(url.origin===origin){const keys=API_RULES.get(url.pathname);if(!keys)return null;const seen=new Set();for(const key of url.searchParams.keys()){if(seen.has(key)||!keys.has(key))return null;seen.add(key);}ttl=1000;}
 else if(url.origin==='https://api.dexscreener.com'){
  if(!/^\/tokens\/v1\/[a-z0-9-]+\/[A-Za-z0-9,%]+$/.test(url.pathname)&&!['/latest/dex/search','/token-boosts/top/v1','/token-boosts/latest/v1','/token-profiles/latest/v1'].includes(url.pathname))return null;
  if([...url.searchParams.keys()].some(k=>k!=='q'))return null;
 }else return null;
 url.searchParams.sort();return{key:url.href,ttl};
}
const responseHeaders=response=>[...response.headers].filter(([name])=>!['content-length','content-encoding','transfer-encoding'].includes(name.toLowerCase()));
async function buffer(response){
 const reader=response.body?.getReader();if(!reader)return{bytes:new Uint8Array()};const chunks=[];let length=0,streaming=false;
 try{for(;;){const{done,value}=await reader.read();if(done)break;length+=value.byteLength;chunks.push(value);if(length>MAX_BODY){
   // Preserve a larger legitimate route without a retry or an unbounded replay
   // allocation. The prefix and remaining stream go to current borrowers only.
   streaming=true;return{stream:new ReadableStream({start(c){for(const part of chunks)c.enqueue(part);},async pull(c){try{const next=await reader.read();if(next.done){reader.releaseLock();c.close();}else c.enqueue(next.value);}catch(e){c.error(e);}},cancel(reason){return reader.cancel(reason).finally(()=>reader.releaseLock());}})};
  }}}
 finally{if(!streaming)reader.releaseLock();}
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return{bytes};
}
const responseFrom=r=>r.prepared||new Response([204,205,304].includes(r.status)?null:r.bytes.slice(),{status:r.status,statusText:r.statusText,headers:r.headers});
export function createPublicReader({fetcher=ownFetch,now=Date.now,origin=globalThis.location?.origin||'https://qhooks.com',timeoutMs=15000,maxEntries=48,maxCacheBytes=4*1024*1024,maxFlights=24,eventTarget=globalThis,durationNow=()=>globalThis.performance?.now?.()??Date.now()}={}){
 const cache=new Map(),flights=new Map(),active=new Set();let cacheBytes=0;
 const release=entry=>{if(entry.borrowers.size)return;clearTimeout(entry.timer);active.delete(entry);if(flights.get(entry.key)===entry)flights.delete(entry.key);};
 const forget=key=>{const old=cache.get(key);if(old){cacheBytes-=old.bytes.length;cache.delete(key);}};
 const add=(key,value)=>{if(value.bytes.length>262144)return;forget(key);cache.set(key,value);cacheBytes+=value.bytes.length;while(cache.size>maxEntries||cacheBytes>maxCacheBytes)forget(cache.keys().next().value);};
 const emit=(rule,status,start)=>{if(!rule)return;try{const url=new URL(rule.key),path=url.hostname==='api.dexscreener.com'?url.pathname.replace(/^\/tokens\/v1\/[^/]+\/[^/]+$/,'/tokens/v1/:chain/:tokens'):url.pathname;eventTarget.dispatchEvent?.(new CustomEvent('qhooks:public-read-finished',{detail:{path,status,durationMs:Math.max(0,durationNow()-start),network:true}}));}catch{}};
 async function physical(input,init,rule){const start=durationNow();try{const response=await fetcher(input,init);emit(rule,response.status,start);return response;}catch(error){emit(rule,0,start);throw error;}}
 function direct(input,init,rule=null){return physical(input,init,rule);}
 function read(input,init={}){
  if(init.signal?.aborted)return Promise.reject(abortError(init.signal));const rule=eligible(input,init,origin);if(!rule)return direct(input,init);
  const hit=cache.get(rule.key);if(hit&&hit.until>now()&&hit.at<=now())return Promise.resolve(responseFrom(hit));if(hit)forget(rule.key);
  let entry=flights.get(rule.key);
  if(!entry){if(active.size>=maxFlights)return direct(input,init,rule);entry={key:rule.key,controller:new AbortController(),borrowers:new Set(),dead:false};flights.set(rule.key,entry);active.add(entry);
   entry.controller.signal.addEventListener('abort',()=>{entry.dead=true;for(const borrower of[...entry.borrowers])borrower.finish(abortError(entry.controller.signal));release(entry);},{once:true});
   entry.timer=setTimeout(()=>entry.controller.abort(new DOMException('Public read timed out.','TimeoutError')),timeoutMs);
   entry.work=Promise.resolve().then(async()=>{
    const response=await physical(input,{...init,credentials:'omit',signal:entry.controller.signal},rule);
    const body=await buffer(response),at=now(),value={...body,status:response.status,statusText:response.statusText,headers:responseHeaders(response),at,until:at+rule.ttl};
    if(body.stream){value.streaming=true;value.response=new Response(body.stream,{status:value.status,statusText:value.statusText,headers:value.headers});}
    else if(!entry.dead&&response.ok&&rule.ttl&&!response.headers.has('set-cookie')&&!/private/i.test(response.headers.get('cache-control')||''))add(rule.key,value);return value;
   }).then(value=>{const borrowers=[...entry.borrowers];
    // A handed-out stream cannot accept late borrowers. Keep its physical
    // request and timeout active until every current body releases its lease.
    if(value.streaming&&flights.get(rule.key)===entry)flights.delete(rule.key);
    if(!borrowers.length&&value.streaming){void value.response.body?.cancel().catch(()=>{});return;}
    for(const[i,borrower]of borrowers.entries())borrower.finish(null,value.streaming?{prepared:i===borrowers.length-1?value.response:value.response.clone()}:value);
   },error=>{for(const borrower of[...entry.borrowers])borrower.finish(error);
   }).finally(()=>release(entry));
  }
  return new Promise((resolve,reject)=>{
   let done=false,delivered=false,bodyReader,bodyController;const borrowed=entry,signal=init.signal;
   const leave=()=>{done=true;borrowed.borrowers.delete(borrower);signal?.removeEventListener('abort',abort);release(borrowed);};
   const cancelBody=reason=>{if(bodyReader)void bodyReader.cancel(reason).catch(()=>{}).finally(()=>bodyReader.releaseLock());};
   const stopIfLast=reason=>{if(!borrowed.borrowers.size){borrowed.dead=true;borrowed.controller.abort(reason);release(borrowed);}};
   const borrower={finish(error,value){
    if(done)return;
    if(error){if(delivered){bodyController.error(error);cancelBody(error);}else reject(error);leave();return;}
    if(!value.prepared){const response=responseFrom(value);leave();resolve(response);return;}
    const response=value.prepared;delivered=true;bodyReader=response.body.getReader();
    const stream=new ReadableStream({start(c){bodyController=c;},async pull(c){
     try{const next=await bodyReader.read();if(done)return;if(next.done){c.close();bodyReader.releaseLock();leave();}else c.enqueue(next.value);}
     catch(error){if(!done)borrower.finish(error);}
    },cancel(reason){if(done)return;cancelBody(reason);leave();stopIfLast(reason);}});
    resolve(new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers}));
   }};
   const abort=()=>{if(done)return;const reason=abortError(signal);borrower.finish(reason);stopIfLast(reason);};
   borrowed.borrowers.add(borrower);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
 }
 return{fetch:read,clear(){cache.clear();cacheBytes=0;},counts:()=>({cached:cache.size,bytes:cacheBytes,flights:active.size})};
}
export function publicReadFetch(input,init={},options={}){
 // Different injected transports are isolated. The Symbol shares the actual
 // browser fetch across independent chunks and literal dynamic imports.
 const fetcher=options.fetcher||globalThis.fetch,registry=globalThis[REGISTRY]??=new WeakMap();let reader=registry.get(fetcher);
 if(!reader){reader=createPublicReader({fetcher:(...args)=>fetcher.call(globalThis,...args)});registry.set(fetcher,reader);}return reader.fetch(input,init);
}
