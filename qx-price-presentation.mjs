import {priceState} from './qx-price-state.mjs';
export function observedAge(at,now=Date.now()){
 const state=priceState(at,now);if(state.age===null)return null;
 const seconds=Math.floor(state.age/1000);return seconds<60?seconds+'s':seconds<3600?Math.floor(seconds/60)+'m':Math.floor(seconds/3600)+'h';
}
export function priceLabel(at,{now=Date.now(),refreshing=false,cached=false}={}){
 const state=priceState(at,now),age=observedAge(at,now);
 if(!state.usable)return 'Price syncing';
 return (refreshing||state.refreshing?'Refreshing · ':cached?'Updated ':'Live · ')+age+' ago';
}
// Cache-only HTTP reads, at most six per selection. A new market read cannot
// restart a completed burst; only selection/manual refresh explicitly resets it.
export function createPriceRefreshBurst({read,apply,isActive,delayMs=1500,maxAttempts=6,schedule=setTimeout,cancel=clearTimeout}={}){
 let key=null,attempts=0,timer=null,controller=null,generation=0,complete=false;
 function stop(){generation++;if(timer!==null)cancel(timer);timer=null;controller?.abort();controller=null;}
 function reset(){stop();key=null;attempts=0;complete=false;}
 async function tick(mine,target){
  timer=null;if(mine!==generation||!isActive(target)||attempts>=maxAttempts)return;
  attempts++;controller=new AbortController();let done=false;
  try{const value=await read({key:target,signal:controller.signal});if(mine===generation&&isActive(target))done=apply(value,target)===true;}catch{}
  if(mine!==generation)return;controller=null;if(done||attempts>=maxAttempts)complete=true;
  if(!done&&isActive(target)&&attempts<maxAttempts)timer=schedule(()=>tick(mine,target),delayMs);
 }
 return {start(target){if(target!==key){reset();key=target;}if(timer!==null||controller||complete||attempts>=maxAttempts||!isActive(target))return;const mine=generation;timer=schedule(()=>tick(mine,target),delayMs);},stop,reset,snapshot:()=>({key,attempts,complete,pending:timer!==null||!!controller})};
}

// Only the exact main-pool observation can update the canonical asset. An older
// cache response cannot rewind a more recent market read.
export function mainPricePatch(q,{chainId,token,previousAt=null,now=Date.now()}={}){
 if(String(chainId)!=='4663'||String(token||'').toLowerCase()!=='0x20429af7ca3b0ce4d99edbaa0693f26c5df05195'||q?.source!=='qhooks-main-pool'||q?.priceSourceVersion!==2||q?.poolId!=='0x007d77e43164a5d7d1251457f47f556c2be7f865942c7ec7a91c3cbbf50e53fe'||!priceState(q.priceAt,now).usable||q.priceAt<previousAt||!(q.priceUsd>0)||!(q.priceQuote>0))return null;
 return {priceUsd:q.priceUsd,priceQuote:q.priceQuote,priceAt:q.priceAt,priceSource:q.source,pricePoolId:q.poolId,priceSourceVersion:2,pricesRefreshing:!!q.refreshing||priceState(q.priceAt,now).refreshing,change24:q.change24??null};
}
