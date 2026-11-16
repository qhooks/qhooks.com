import {PRICE_VALUE_MS,priceState,isQhooksPriceAsset,QHOOKS_PRICE_IDENTITY} from './qx-price-state.mjs';
import {workspaceAsset} from './qx-terminal-workspace.mjs';
import {priceDigits} from './qx-price.mjs';
const DAY=PRICE_VALUE_MS,KEY='qhooks:token-list-prices:v1';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export const listPriceAsset=raw=>{const a=workspaceAsset(raw);return a?{chainId:a.chainId,kind:a.kind,address:a.controller||a.token,key:a.key}:null;};
export function tokenListQuoteText(q={}){
 const digits=priceDigits(q.priceUsd);return {price:digits===null?'—':'$'+digits,change:finite(q.change24)?(q.change24>0?'+':'')+(q.change24*100).toLocaleString('en-US',{maximumFractionDigits:2})+'%':'—',direction:finite(q.change24)?Math.sign(q.change24):0,refreshing:!!q.refreshing,onCurve:!!q.onCurve};
}
export function createTokenListPrices({fetchImpl=globalThis.fetch,storage,now=Date.now}={}){
 const records=new Map();const validAt=n=>Number.isSafeInteger(n)&&n>0&&n<=now()&&now()-n<=DAY;
 function accept(raw,save=true){
  const a=listPriceAsset({...raw,token:raw.address||raw.token,controller:raw.kind==='launch'?(raw.address||raw.controller):null});if(!a)return;
  const old=records.get(a.key)||{},next={...old,key:a.key};
  if(isQhooksPriceAsset(a.chainId,a.address)&&((raw.priceSource??raw.source)!=='qhooks-main-pool'||raw.pricePoolId!==QHOOKS_PRICE_IDENTITY.poolId))return;
  const phaseAt=raw.phaseAt??raw.observedAt;
  if(typeof raw.onCurve==='boolean'&&validAt(phaseAt)&&phaseAt>=(old.phaseAt||0)){
   next.onCurve=raw.onCurve;next.phaseAt=phaseAt;
   if(raw.onCurve&&old.price?.source!=='curve')next.price=null;
   if(raw.onCurve&&old.change?.source!=='curve')next.change=null;
   if(!raw.onCurve&&old.onCurve){next.price=null;next.change=null;}
  }
  for(const[field,prop]of[['price','priceUsd'],['change','change24']]){
   const at=raw[field+'At']??raw.observedAt,source=raw.priceSource||raw.source||'feed';
   if(!finite(raw[prop])||field==='price'&&raw[prop]<0||!validAt(at)||next.onCurve&&source!=='curve')continue;
   if(at>=(next[field]?.at||0))next[field]={value:raw[prop],at,source,poolId:raw.pricePoolId,refreshing:!!raw.refreshing||!!raw.stale};
  }
  records.delete(a.key);records.set(a.key,next);while(records.size>256)records.delete(records.keys().next().value);
  if(save)try{storage?.setItem(KEY,JSON.stringify({version:1,records:[...records.values()]}));}catch{}
 }
 try{const text=storage?.getItem(KEY);if(text&&text.length<=131072){const d=JSON.parse(text);if(d.version===1)for(const r of(d.records||[]).slice(-256)){if(typeof r.key!=='string')continue;const [kind,chainId,address]=r.key.split(':');accept({kind:kind==='m'?'launch':'external',chainId,address,onCurve:r.onCurve,phaseAt:r.phaseAt,priceUsd:r.price?.value,priceAt:r.price?.at,change24:r.change?.value,changeAt:r.change?.at,source:r.price?.source,pricePoolId:r.price?.poolId,refreshing:true},false);}}}catch{}
 function cached(raw){const a=listPriceAsset(raw),r=a&&records.get(a.key)||{},price=validAt(r.price?.at)?r.price:null,change=validAt(r.change?.at)?r.change:null;return {key:a?.key,priceUsd:price?.value??null,change24:change?.value??null,onCurve:validAt(r.phaseAt)&&r.onCurve===true,refreshing:!price||!change||[price,change].filter(Boolean).some(v=>v.refreshing||priceState(v.at,now()).refreshing)};}
 return {cached,seed(rows){for(const row of rows||[])accept(row);},async read(rows,{signal}={}){
  const assets=[...new Map(rows.map(listPriceAsset).filter(Boolean).map(a=>[a.key,a])).values()].slice(0,24);if(!assets.length||signal?.aborted)return;
  try{const res=await fetchImpl('/api/terminal/token-prices?'+new URLSearchParams({assets:JSON.stringify(assets.map(({chainId,kind,address})=>({chainId,kind,address})))}),{cache:'no-store',signal});if(!res.ok||signal?.aborted)return;const body=await res.json();if(signal?.aborted||body?.version!==1)return;for(const row of body.rows||[]){const identity=listPriceAsset({...row,token:row.address,controller:row.kind==='launch'?row.address:null});if(identity?.key===row.key&&assets.some(a=>a.key===row.key))accept(row);}}catch{}
 }};
}
