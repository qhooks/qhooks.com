// Same-origin public chart/tape transport. The Worker owns provider pacing,
// breaker and last-good; this adapter never retries direct GeckoTerminal.
const clients=new WeakMap(),KEEP=86400000,FRESH=300000;
const abort=signal=>signal?.reason||new DOMException('Aborted','AbortError');
const wait=(task,signal)=>{if(!signal)return task;if(signal.aborted)return Promise.reject(abort(signal));return new Promise((resolve,reject)=>{const stop=()=>reject(abort(signal));signal.addEventListener('abort',stop,{once:true});task.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));});};
function client(fetcher){if(!clients.has(fetcher))clients.set(fetcher,{rows:new Map(),flights:new Map()});return clients.get(fetcher);}
export async function readGecko(url,{fetcher=globalThis.fetch,signal,now=Date.now}={}){
 let target;try{target=new URL(url);}catch{return null;}
 if(target.origin!=='https://api.geckoterminal.com'||target.username||target.password||target.hash||!target.pathname.startsWith('/api/v2/'))return null;
 if(signal?.aborted)throw abort(signal);
 const state=client(fetcher),key=target.href,hit=state.rows.get(key),old=()=>hit&&now()>=hit.observedAt&&now()-hit.observedAt<KEEP?{...structuredClone(hit),stale:true}:null;
 if(hit&&now()>=hit.observedAt&&now()-hit.observedAt<FRESH&&!hit.stale)return structuredClone(hit);
 let task=state.flights.get(key);
 if(!task){if(state.flights.size>=24)return old();task=(async()=>{const controller=new AbortController();let timer;try{
  const proxy='/api/market/geckoterminal'+target.pathname+target.search;
  return await Promise.race([(async()=>{const response=await fetcher(proxy,{headers:{accept:'application/json'},credentials:'omit',signal:controller.signal});if(!response.ok)return old();
   const at=Number(response.headers.get('x-qhooks-gecko-observed-at')),until=Number(response.headers.get('x-qhooks-gecko-fresh-until')),stale=response.headers.get('x-qhooks-gecko-stale');
   if(!Number.isSafeInteger(at)||at<=0||at>now()||now()-at>=KEEP||![FRESH,21600000].includes(until-at)||!['0','1'].includes(stale))return old();
   const reader=response.body?.getReader();if(!reader)return old();let size=0;const parts=[],stop=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',stop,{once:true});
   try{for(;;){const r=await reader.read();if(controller.signal.aborted)return old();if(r.done)break;size+=r.value.byteLength;if(size>2097152){stop();return old();}parts.push(r.value);}}finally{controller.signal.removeEventListener('abort',stop);reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),value={body,observedAt:at,stale:stale==='1'||now()>=until};
   const previous=state.rows.get(key);if(previous&&previous.observedAt>at)return{...structuredClone(previous),stale:true};
   const empty=body?.data===null||Array.isArray(body?.data)&&!body.data.length||Array.isArray(body?.data?.attributes?.ohlcv_list)&&!body.data.attributes.ohlcv_list.length||body?.data?.attributes?.token_prices&&Object.keys(body.data.attributes.token_prices).length===0;
   if(empty)return old()||value;
   state.rows.set(key,value);while(state.rows.size>32)state.rows.delete(state.rows.keys().next().value);return structuredClone(value);
  })(),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(old());},8000);})]);
 }catch{return old();}finally{clearTimeout(timer);}})();state.flights.set(key,task);task.finally(()=>{if(state.flights.get(key)===task)state.flights.delete(key);}).catch(()=>{});}
 const value=await wait(task,signal);return value?structuredClone(value):null;
}
