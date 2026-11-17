import{assetPriceFields,priceState,priceObservation,isQhooksPriceAsset,priceFields}from'./qx-price-state.mjs';
import{capDiscoveryObservations}from'./qx-discovery-freshness.mjs';
const KEY='qhooks:feed:prices:v1',identity=r=>String(r.chainId)+':'+(r.chainId==='solana'?r.token?.address:String(r.token?.address||'').toLowerCase()),positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const capObservation=(row,fallback=null)=>Object.hasOwn(row,'capAt')?row.capAt:Object.hasOwn(row,'observedAt')?row.observedAt:fallback;
const priceOnly=value=>({priceUsd:value.priceUsd,priceAt:value.priceAt,priceSource:value.priceSource,pricePoolId:value.pricePoolId,priceSourceVersion:value.priceSourceVersion});
// Each kind of observation keeps its own source clock through partial reads and reloads.
export function createFeedPriceCache({storage,now=Date.now}={}){
 const prices=new Map(),caps=new Map(),holders=new Map(),persisted=new Map();
 function load(suffix,map,valid){try{const raw=storage?.getItem(KEY+suffix)||'[]';persisted.set(suffix,raw);for(const[k,v]of JSON.parse(raw))if(v&&valid(v)&&(!k.startsWith('4663:0x20429af7ca3b0ce4d99edbaa0693f26c5df05195')||v.priceSourceVersion===2||suffix===':holders'))map.set(k,v);}catch{}}
 load('',prices,v=>priceState(v.priceAt,now()).usable);load(':caps',caps,v=>priceState(v.capAt,now()).usable);load(':holders',holders,v=>Number.isSafeInteger(v.holdersCount)&&v.holdersCount>=0&&priceState(v.holdersAt,now()).usable);
 for(const[k,v]of prices)if(!caps.has(k)&&priceState(v.capAt,now()).usable&&(positive(v.marketCapUsd)||positive(v.fdvUsd)))caps.set(k,{marketCapUsd:v.marketCapUsd,fdvUsd:v.fdvUsd,capAt:v.capAt});
 function withHolders(row,fallback){
  const scope=row.holdersScope??row.holdersCoverage?.scope??row.holdersCoverage,sampled=typeof scope==='string'&&/sample|largest|returned|top[_ -]?\d|top_holders/i.test(scope),count=sampled?undefined:[row.holdersCount,row.holderCount,typeof row.holders==='number'?row.holders:null,row.launch?.summary?.holders].find(n=>Number.isSafeInteger(n)&&n>=0);
  const at=Object.hasOwn(row,'holdersAt')?row.holdersAt:row.observedAt??row.launch?.observedAt??(row.launch?.synced?.at?row.launch.synced.at*1000:null)??fallback,key=identity(row),prior=holders.get(key);
  if(count!==undefined&&priceState(at,now()).usable&&(!prior||at>=prior.holdersAt))holders.set(key,{holdersCount:count,holdersAt:at,holdersScope:'global'});
  const kept=holders.get(key);if(kept&&priceState(kept.holdersAt,now()).usable)return{...row,...kept,holdersCached:!!row.holdersCached||count===undefined||at<kept.holdersAt};
  return{...row,holdersCount:null,holderCount:null,...(typeof row.holders==='number'?{holders:null}:{}),...(row.launch?.summary?{launch:{...row.launch,summary:{...row.launch.summary,holders:null}}}:{})};
 }
 function withCaps(row,fallback){const key=identity(row),at=capObservation(row,fallback),prior=caps.get(key),valid=priceState(at,now()).usable&&(positive(row.marketCapUsd)||positive(row.fdvUsd));
  if(valid&&(!prior||at>=prior.capAt))caps.set(key,{marketCapUsd:positive(row.marketCapUsd)?row.marketCapUsd:null,fdvUsd:positive(row.fdvUsd)?row.fdvUsd:null,capAt:at,priceSourceVersion:row.priceSourceVersion});
  const kept=caps.get(key);return kept&&priceState(kept.capAt,now()).usable?{...row,...kept,capsCached:!!row.capsCached||!valid||at<kept.capAt,capsRefreshing:priceState(kept.capAt,now()).refreshing}:{...row,marketCapUsd:null,fdvUsd:null,capAt:null,capsRefreshing:true};
 }
 function trim(map,clock){const keep=[...map].filter(([,v])=>priceState(v[clock],now()).usable).sort((a,b)=>b[1][clock]-a[1][clock]).slice(0,240);map.clear();for(const[k,v]of keep)map.set(k,v);return keep;}
 function persist(suffix,rows){const raw=JSON.stringify(rows);if(raw===persisted.get(suffix))return;try{storage?.setItem(KEY+suffix,raw);persisted.set(suffix,raw);}catch{}}
 return{reconcile(data){if(!Array.isArray(data?.rows))return data;
  const rows=data.rows.filter(r=>r?.token&&typeof r.token.address==='string').map(input=>{
   // Preserve CURRENT's independent provider-window expiry before borrowing any
   // separately dated price, capitalization or global holder observation.
   input=capDiscoveryObservations(input,{fallbackAt:null,now:now()});
   if(isQhooksPriceAsset(input.chainId,input.token.address)&&data.cached&&input.priceSourceVersion!==2)input=priceFields({...input,priceAt:null,priceObservedAt:null,observedAt:null,capAt:null,marketCapUsd:null,fdvUsd:null},{now:now()});
   const row=withHolders(data.cached?{...input,pricesCached:true,capsCached:true,holdersCached:true}:input,data.observedAt),key=identity(row),live=assetPriceFields(row,{chainId:row.chainId,token:row.token.address,at:priceObservation(row,data.observedAt),now:now()}),saved=prices.get(key),prior=saved?assetPriceFields(saved,{chainId:row.chainId,token:row.token.address,now:now()}):null;let result=live;
   const borrow=()=>{
    const value={...live,...priceOnly(prior),pricesCached:true,pricesRefreshing:true};
    // A retained USD observation cannot renew a different native quote's clock.
    if(isQhooksPriceAsset(row.chainId,row.token.address)&&live.priceAt!==prior.priceAt){if('priceQuote'in value)value.priceQuote=null;if(value.quoteAmounts?.unit==='WETH')value.quoteAmounts={...value.quoteAmounts,price:null};}
    return value;
   };
   if(positive(live.priceUsd)){
    if(prior&&positive(prior.priceUsd)&&prior.priceAt>live.priceAt)result=borrow();
    else prices.set(key,{priceUsd:live.priceUsd,priceAt:live.priceAt,priceSource:live.priceSource,pricePoolId:live.pricePoolId,priceSourceVersion:live.priceSourceVersion});
   }else if(prior&&positive(prior.priceUsd)&&priceState(prior.priceAt,now()).usable)result={...borrow(),pricesRefreshing:!!live.pricesRefreshing||priceState(prior.priceAt,now()).refreshing};
   // Capitalization is independently observed; a new price never renews an older cap.
   return withCaps({...result,marketCapUsd:input.marketCapUsd,fdvUsd:input.fdvUsd,capAt:capObservation(input,data.observedAt)},data.observedAt);
  });
  persist('',trim(prices,'priceAt'));persist(':caps',trim(caps,'capAt'));persist(':holders',trim(holders,'holdersAt'));return{...data,rows};
 }};
}
