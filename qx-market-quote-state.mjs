import {assetPriceFields,priceState,isQhooksPriceAsset,QHOOKS_PRICE_IDENTITY} from './qx-price-state.mjs';
import {capDiscoveryObservations} from './qx-discovery-freshness.mjs';
import {chainById} from './chains.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n),own=(v,k)=>!!v&&Object.hasOwn(v,k),object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const original=(values,names,fallback=null)=>{for(const v of values)for(const key of names)if(own(v,key))return v[key];return fallback;};
const identity=row=>{const chainId=String(row?.chainId||''),controller=String(row?.controller||row?.address||'').toLowerCase(),rawToken=typeof row?.token==='string'?row.token:row?.token?.address||row?.tokenAddress||controller,token=String(rawToken||'').toLowerCase();return chainById(chainId)&&/^0x[\da-f]{40}$/.test(controller)&&/^0x[\da-f]{40}$/.test(token)?{chainId,controller,token,key:chainId+':'+controller,assetKey:'m:'+chainId+':'+controller}:null;};
export const marketQuoteAsset=row=>{const id=identity(row);return id?{chainId:id.chainId,kind:'launch',address:id.controller,token:id.token,key:id.assetKey}:null;};

// Original observations only. Provider/window facts and USD/native price have
// distinct clocks; a request, cached write, or contract check never renews them.
export function marketQuoteState(row,{now=Date.now()}={}){
 const id=identity(row);if(!id)return null;const s=object(row.summary)?row.summary:row;
 const lastTradeAt=original([s,row],['lastTradeAt']),tradeAt=finite(lastTradeAt)&&lastTradeAt>0?lastTradeAt*1000:null;
 const clock=value=>Number.isSafeInteger(value)&&value>0&&value<=now?value:null;
 const observedAt=clock(original([s,row],['observedAt'],tradeAt)),priceAt=clock(original([s,row],['priceAt','priceObservedAt'],observedAt)),changeAt=clock(original([s,row],['changeAt'],observedAt));
 const priceSource=original([s,row],['priceSource']),pricePoolId=original([s,row],['pricePoolId']);
 const normalized={...id,priceUsd:finite(s.priceUsd)?s.priceUsd:null,priceAt,observedAt,changeAt,priceSource,pricePoolId,
  marketCapUsd:finite(s.marketCapUsd)?s.marketCapUsd:finite(s.mcapUsd)?s.mcapUsd:null,change24:finite(s.change24)?s.change24:null,
  volume24Usd:finite(s.volume24Usd)?s.volume24Usd:null,pricesRefreshing:!!s.pricesRefreshing||!!row.pricesRefreshing||!!row.refreshing,quoteReadFailed:!!row.quoteReadFailed};
 const capped=capDiscoveryObservations(normalized,{fallbackAt:null,now});
 // Do not let the canonical guard's generic legacy fallback turn explicit
 // priceAt:null into observedAt. The independently capped provider clock stays.
 const priced=assetPriceFields({...capped,observedAt:null,priceObservedAt:null},{chainId:id.chainId,token:id.token,now});
 const proof=!isQhooksPriceAsset(id.chainId,id.token)||(priceSource==='qhooks-main-pool'&&pricePoolId===QHOOKS_PRICE_IDENTITY.poolId);
 const nativeAt=clock(original([s,row],['nativePriceAt','priceQuoteAt'],priceAt)),priceQuote=finite(s.priceQuote)?s.priceQuote:finite(s.price)?s.price:null;
 const quoteSymbol=String(row.quoteSymbol||s.quoteSymbol||'').slice(0,24),nativeUsable=proof&&priceState(nativeAt,now).usable&&priceQuote!==null&&priceQuote>=0&&!!quoteSymbol;
 const usdUsable=priceState(priced.priceAt,now).usable&&finite(priced.priceUsd)&&priced.priceUsd>=0,at=usdUsable?priced.priceAt:nativeUsable?nativeAt:null;
 return {...capped,priceUsd:usdUsable?priced.priceUsd:null,priceAt:priced.priceAt,marketCapUsd:priced.marketCapUsd,change24:priced.change24,
  priceQuote:nativeUsable?priceQuote:null,nativePriceAt:nativeUsable?nativeAt:null,quoteSymbol,
  usable:usdUsable||nativeUsable,unit:usdUsable?'USD':nativeUsable?quoteSymbol:null,value:usdUsable?priced.priceUsd:nativeUsable?priceQuote:null,quoteAt:at,age:at===null?null:Math.max(0,now-at)};
}

const stores=new WeakMap();
const copy=value=>value==null?value:structuredClone(value);
const borrow=(promise,signal)=>!signal?promise: new Promise((resolve,reject)=>{
 const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
});
// Shared display admission, separate from source age. No wallet, balance,
// allowance, nonce, quote/preparation or signing state is read or cached here.
export function createMarketQuoteLookup({fetcher=globalThis.fetch,now=Date.now}={}){
 if(typeof fetcher!=='function')throw Error('Public quote reader required');
 let store=stores.get(fetcher);if(!store){store={records:new Map(),flights:new Map()};stores.set(fetcher,store);}
 const positiveMs=90000,negativeMs=300000,maxRecords=256,maxFlights=48;
 const selection=rows=>{const found=new Map();for(const raw of rows||[]){const asset=marketQuoteAsset(raw);if(asset)found.set(asset.key,asset);}return [...found.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).slice(0,24);};
 const put=(key,value)=>{store.records.delete(key);store.records.set(key,value);while(store.records.size>maxRecords)store.records.delete(store.records.keys().next().value);};
 const snapshot=assets=>assets.map(asset=>{const record=store.records.get(asset.key);if(!record?.row||marketQuoteAsset(record.row)?.token!==asset.token)return null;return {...copy(record.row),quoteReadFailed:!!record.error};}).filter(Boolean);
 function seed(rows){for(const row of rows||[]){const asset=marketQuoteAsset(row),view=marketQuoteState(row,{now:now()});if(!asset||!view?.usable)continue;const old=store.records.get(asset.key),prior=old?.row&&marketQuoteAsset(old.row)?.token===asset.token&&marketQuoteState(old.row,{now:now()});if(prior?.usable&&(prior.quoteAt||0)>=(view.quoteAt||0)){if(old.error)put(asset.key,{...old,error:false});continue;}put(asset.key,{row:copy(row),until:now()+positiveMs,forceUsed:false,error:false});}}
 async function read(rows,{force=false,signal}={}){
  const assets=selection(rows);if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
  const time=now(),admit=[],waiting=[];
  for(const asset of assets){const pending=store.flights.get(asset.key);if(pending){waiting.push(pending);continue;}const stored=store.records.get(asset.key),record=stored?.row&&marketQuoteAsset(stored.row)?.token!==asset.token?null:stored,active=record&&time<record.until;if(active&&(!force||record.forceUsed))continue;if(store.flights.size+admit.length>=maxFlights)continue;
   admit.push(asset);put(asset.key,{row:record?.row||null,until:time+negativeMs,forceUsed:active?record.forceUsed||force:!!force,error:false});
  }
  let physical=null;
  if(admit.length){
   physical=Promise.resolve().then(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let received=new Map(),failed=false;
    try{
     const payload=admit.map(({chainId,kind,address})=>({chainId,kind,address})),response=await fetcher('/api/terminal/token-prices?'+new URLSearchParams({assets:JSON.stringify(payload)}),{cache:'no-store',credentials:'omit',signal:controller.signal});
     if(!response.ok)throw Error('Cached quotes unavailable');const text=await response.text();if(text.length>131072)throw Error('Cached quote response too large');const body=JSON.parse(text);if(body?.version!==1||!Array.isArray(body.rows)||body.rows.length>24)throw Error('Cached quote shape');
     for(const row of body.rows){const asset=marketQuoteAsset({...row,controller:row.address,token:row.tokenAddress||row.address}),expected=asset&&admit.find(a=>a.key===asset.key);if(!expected||row.key!==asset.key||asset.token!==expected.token)continue;received.set(asset.key,row);}
    }catch{failed=true;}finally{clearTimeout(timer);}
    for(const asset of admit){const prior=store.records.get(asset.key),incoming=received.get(asset.key),view=incoming&&marketQuoteState({...incoming,controller:incoming.address,token:incoming.tokenAddress||asset.token},{now:now()}),old=prior?.row&&marketQuoteState(prior.row,{now:now()});
     const usable=!!view?.usable,row=usable&&(!old?.usable||view.quoteAt>=old.quoteAt)?{...incoming,controller:incoming.address,token:incoming.tokenAddress||asset.token}:prior?.row||null;
     put(asset.key,{row:copy(row),until:now()+(usable?positiveMs:negativeMs),forceUsed:!!prior?.forceUsed,error:failed});
    }
   }).finally(()=>{for(const asset of admit)if(store.flights.get(asset.key)===physical)store.flights.delete(asset.key);});
   for(const asset of admit)store.flights.set(asset.key,physical);waiting.push(physical);
  }
  await borrow(Promise.all([...new Set(waiting)]),signal);
  return {rows:snapshot(assets),requested:admit.length,selectionKey:assets.map(a=>a.key).join('|')};
 }
 return {seed,read,cached:rows=>snapshot(selection(rows))};
}
