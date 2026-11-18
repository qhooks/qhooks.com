import {portfolioPriceFields,allocatePortfolioValuation} from './qx-portfolio-pricing.mjs';
import {portfolioTotals} from './qx-wallet-pnl.mjs';
const KEY='qhooks:portfolio:last:v1:',MAX_AGE=7*86400000,FRESH=60000;
const registry=Symbol.for('qhooks.portfolio.read.v1'),copy=x=>structuredClone(x);
const known=n=>typeof n==='number'&&Number.isFinite(n),address=(family,w)=>family==='solana'?String(w||''):String(w||'').toLowerCase();
const validOwner=(family,w)=>family==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w):/^0x[0-9a-f]{40}$/.test(w);
export function portfolioBalanceAt(report){
 const assets=(report?.chains||[]).flatMap(c=>[c.native,...(c.tokens||[])]).filter(a=>Number(a?.units)>0||Number(a?.balance)>0);
 const clocks=assets.map(a=>Object.hasOwn(a,'balanceAt')?a.balanceAt:report.at);
 // Explicitly unknown is not an absent legacy clock. A new envelope cannot
 // turn an unknown acquisition into a fresh balance.
 if(clocks.some(at=>!known(at)))return null;
 return clocks.length?Math.min(...clocks):known(report?.at)?report.at:null;
}
export function chainReadState(c,{partial=false}={}){
 const assets=[c.native,...(c.tokens||[])],missing=assets.some(a=>!a||a.balance==null&&a.units==null||a.balanceRefreshing);
 const balances=missing||c.error==='balances_unavailable'||!!c.balancesRefreshing;
 // Wallet-token coverage is independent of native/metadata/price failures.
 // Only a positive producer proof overrides a partial/failed enumeration;
 // old healthy nonpartial reports retain their legacy complete contract.
 const complete=c.tokenBalancesComplete===true,declared=Object.hasOwn(c,'tokenBalancesComplete');
 const positions=!complete&&(declared||balances||!!partial||!!c.error||!!c.positionsRefreshing||c.source==='index-only'||c.source==='index');
 return {balances,positions,prices:assets.some(a=>(Number(a.units)>0||Number(a.balance)>0)&&!known(a.valueUsd))||!!c.pricesRefreshing};
}
export function portfolioNeedsRefresh(report){return !!report?.refreshing||(report?.chains||[]).some(c=>{const s=chainReadState(c,{partial:!!report.partial});return s.balances||s.positions||[c.native,...(c.tokens||[]).filter(t=>!t.spam)].some(a=>(Number(a?.units)>0||Number(a?.balance)>0)&&!known(a?.valueUsd));});}
function valid(report,family,w){return report?.version===1&&address(family,report.address)===w&&Array.isArray(report.chains)&&report.totals&&report.chains.every(c=>c&&c.native&&Array.isArray(c.tokens))&&new Set(report.chains.map(c=>String(c.chainId))).size===report.chains.length;}
function priced(asset,at,now,chainId){
 return portfolioPriceFields(asset,{chainId,token:asset.address,at,now});
}
// Acquisition time is distinct from a cache write or a later partial report.
function balanceClock(asset,at){return {...asset,balanceAt:Object.hasOwn(asset,'balanceAt')?asset.balanceAt:asset.balance!=null||asset.units!=null?at??null:null};}
function priceOwnerMatches(next,prior,chainId){
 const key=v=>String(chainId)==='solana'?String(v||''):String(v||'').toLowerCase();
 for(const a of [next,prior]){const q=a.qhooks;if(q&&(q.chainId!=null&&String(q.chainId)!==String(chainId)||q.token&&key(q.token)!==key(a.address)))return false;}
 return !(next.qhooks?.controller&&prior.qhooks?.controller&&key(next.qhooks.controller)!==key(prior.qhooks.controller));
}
function assetMerge(input,old,now,at,oldAt,chainId){
 const next=balanceClock(priced(input,at,now,chainId),at),prior=old?balanceClock(priced(old,oldAt,now,chainId),oldAt):null;
 if(!prior)return next;
 // A balance-stage frame has not read cost/launch identity yet. Keep dated
 // evidence only for exactly the same inventory; explicit null clears it.
 if(next.balance===prior.balance&&next.units===prior.units){
  for(const field of ['cost','costState','qhooks','symbol','name','logo'])if(!Object.hasOwn(input,field)&&Object.hasOwn(prior,field))next[field]=copy(prior[field]);
 }
 const samePriceOwner=priceOwnerMatches(next,prior,chainId);
 if(next.balance==null&&next.units==null)return {...prior,...next,balance:prior.balance,units:prior.units,
  priceUsd:known(next.priceUsd)?next.priceUsd:samePriceOwner?prior.priceUsd:null,priceAt:known(next.priceUsd)?next.priceAt:samePriceOwner?prior.priceAt:null,priceSource:known(next.priceUsd)?next.priceSource:samePriceOwner?prior.priceSource:null,pricePoolId:known(next.priceUsd)?next.pricePoolId:samePriceOwner?prior.pricePoolId:null,
  valueUsd:known(next.priceUsd)&&known(prior.units)?next.priceUsd*prior.units:samePriceOwner?prior.valueUsd:null,balanceRefreshing:true,balanceAt:prior.balanceAt,
  pricesRefreshing:!!next.pricesRefreshing||!!prior.pricesRefreshing};
 if(samePriceOwner&&!known(next.priceUsd)&&known(prior.priceUsd)){
  const units=known(next.units)?next.units:next.balance!=null&&Number.isInteger(next.decimals)?Number(next.balance)/10**next.decimals:null;
  return {...next,priceUsd:prior.priceUsd,priceAt:prior.priceAt,priceSource:prior.priceSource,pricePoolId:prior.pricePoolId,priceStatus:'last-known',lastKnownPriceUsd:prior.priceUsd,lastKnownPriceAt:prior.priceAt,lastKnownPriceSource:prior.priceSource,lastKnownPricePoolId:prior.pricePoolId,valueUsd:known(units)?units*prior.priceUsd:next.valueUsd,pricesRefreshing:true};
 }
 return next;
}
export function reconcilePortfolio(report,previous,now=known(report?.at)?report.at:Date.now(),{inventoryPending=false}={}){
 if(previous&&address(/^0x/i.test(report.address)?'evm':'solana',report.address)!==address(/^0x/i.test(report.address)?'evm':'solana',previous.address))previous=null;
 const next=copy(report),prior=new Map((previous?.chains||[]).map(c=>[String(c.chainId),c]));
 next.chains=next.chains.map(c=>{
  const old=prior.get(String(c.chainId));prior.delete(String(c.chainId));
  const state=chainReadState(c,{partial:!!report.partial||inventoryPending}),byToken=new Map((old?.tokens||[]).map(t=>[(String(c.chainId)==='solana'?String(t.address):String(t.address).toLowerCase()),t]));
  const tokens=c.tokens.map(t=>{const key=String(c.chainId)==='solana'?String(t.address):String(t.address).toLowerCase(),oldToken=byToken.get(key);byToken.delete(key);return priced(assetMerge(t,oldToken,now,report.at,previous?.at,c.chainId),report.at,now,c.chainId);});
  for(const t of byToken.values()){
   const priorAt=Object.hasOwn(t,'balanceAt')?t.balanceAt:previous?.at;
   if(state.positions||!known(report.at)||!known(priorAt)||report.at<priorAt)tokens.push({...balanceClock(priced(t,previous?.at,now,c.chainId),previous?.at),balanceRefreshing:true});
  }
  const native=priced(assetMerge(c.native,old?.native,now,report.at,previous?.at,c.chainId),report.at,now,c.chainId);
  return {...c,native,tokens,positionsRefreshing:state.positions,balancesRefreshing:state.balances||!!native.balanceRefreshing||tokens.some(t=>t.balanceRefreshing),pricesRefreshing:!!native.pricesRefreshing||tokens.some(t=>t.pricesRefreshing)};
 });
 for(const c of prior.values())next.chains.push({...c,native:{...balanceClock(priced(c.native,previous?.at,now,c.chainId),previous?.at),balanceRefreshing:true},tokens:c.tokens.map(t=>({...balanceClock(priced(t,previous?.at,now,c.chainId),previous?.at),balanceRefreshing:true})),balancesRefreshing:true,error:c.error||'balances_unavailable'});
 next.partial=!!report.partial||inventoryPending||next.chains.some(c=>{const s=chainReadState(c);return s.balances||s.positions||s.prices;});
 allocatePortfolioValuation(next,{now});next.totals=portfolioTotals(next.chains);return next;
}
// Local cost/price completion is a patch, never a new balance enumeration. A
// captured callback cannot remove assets, undo a zero balance, or renew its age.
function derivedReport(report,previous){
 if(!previous)return report;
 const next=copy(previous),chains=new Map(report.chains.map(c=>[String(c.chainId),c]));
 const costs=['cost','costState'],prices=['priceUsd','priceAt','priceSource','pricePoolId','pricesRefreshing','valueUsd','liquidityUsd','priceLabel','spam','spamReason','venue'];
 const merge=(asset,patch)=>{
  if(!patch||asset.balance!==patch.balance||asset.units!==patch.units)return asset;
  // Cost PnL is calculated at the patch price too. Reject the whole stale
  // valuation patch; keeping only the newer displayed price would mix clocks.
  if(known(asset.priceUsd)&&(!known(patch.priceUsd)||known(asset.priceAt)&&(!known(patch.priceAt)||patch.priceAt<asset.priceAt)))return asset;
  const fields=costs.concat(prices),out={...asset};
  for(const key of fields)if(Object.hasOwn(patch,key))out[key]=copy(patch[key]);return out;
 };
 for(const chain of next.chains){const patch=chains.get(String(chain.chainId));if(!patch)continue;
  const key=t=>String(chain.chainId)==='solana'?String(t.address):String(t.address).toLowerCase(),tokens=new Map(patch.tokens.map(t=>[key(t),t]));
  chain.native=merge(chain.native,patch.native);chain.tokens=chain.tokens.map(t=>merge(t,tokens.get(key(t))));
 }
 return next;
}
export function createPortfolioReader({fetchImpl=globalThis.fetch,storage,now=Date.now,eventTarget=globalThis,timeoutMs=20000}={}){
 const reports=new Map(),flights=new Map(),listeners=new Set();
 const key=(family,w)=>family+':'+address(family,w);
 function cached(family,owner){const w=address(family,owner),k=key(family,w);if(!validOwner(family,w))return null;let item=reports.get(k);
  if(!item)try{const value=JSON.parse(storage?.getItem(KEY+k)||'null');if(valid(value?.report,family,w)&&known(value.at)&&now()-value.at<MAX_AGE&&value.at<=now()+60000)item=value;}catch{}
  if(item&&now()-item.at>=MAX_AGE){reports.delete(k);return null;}
  if(!item)return null;item={...item,report:reconcilePortfolio(item.report,null,now())};reports.set(k,item);return {...copy(item),fresh:now()-item.at<FRESH};
 }
 function accept(family,owner,report,{derived=false,refreshing=false,inventoryPending=false}={}){
  const w=address(family,owner);if(!valid(report,family,w))throw Error('Invalid portfolio report');
  const prior=cached(family,w);if(known(prior?.report?.at)&&known(report.at)&&report.at<prior.report.at)return copy(prior.report);
  if(derived&&prior&&report.at!==prior.report.at)return copy(prior.report);
  const next=reconcilePortfolio(derived?derivedReport(report,prior?.report):report,derived?null:prior?.report,now(),{inventoryPending}),item={at:derived&&prior?prior.at:now(),report:{...next,refreshing:derived&&prior?!!prior.report.refreshing||refreshing:refreshing}};
  reports.set(key(family,w),copy(item));try{storage?.setItem(KEY+key(family,w),JSON.stringify(item));}catch{}
  const detail={family,owner:w,report:copy(item.report)};
  for(const listener of listeners)try{listener(detail);}catch{}
  try{eventTarget.dispatchEvent?.(new CustomEvent('qhooks:portfolio-report',{detail}));}catch{}
  return copy(item.report);
 }
 function read(family,owner,{purpose='portfolio',force=false,signal}={}){
  const w=address(family,owner),k=key(family,w);if(!validOwner(family,w))return Promise.reject(Error('Wallet required'));
  const prior=cached(family,w);if(prior?.fresh&&!force&&!prior.report.refreshing)return Promise.resolve(copy(prior.report));
  const purposeKey=k+':'+purpose,normal=flights.get(k+':portfolio'),existing=normal||flights.get(purposeKey);
  // A header may share a normal portfolio request. A normal request never inherits a capped header admission.
  let promise=existing;
  if(!promise){promise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(10000,timeoutMs));
   try{const r=await fetchImpl('/api/portfolio/'+family+'/'+encodeURIComponent(w),{cache:'no-store',signal:controller.signal,headers:{accept:purpose==='header-total'?'application/json':'application/x-ndjson, application/json',...(purpose==='header-total'?{'x-qhooks-read-purpose':'header-total'}:{})}});
    if(!r.ok){let error;try{error=(await r.json())?.error;}catch{}const e=Error(error||'Portfolio unavailable');e.capped=error==='header_total_cap'||r.headers?.get?.('x-qhooks-header-cap')==='1';throw e;}
    const refreshing=r.headers?.get?.('x-qhooks-cache')==='refreshing';
    if(!r.headers?.get?.('content-type')?.includes('application/x-ndjson'))return accept(family,w,await r.json(),{refreshing});
    // One request, bounded progressive reports. Prices and a slow chain cannot
    // hold back balances already read. EOF is not evidence of complete coverage.
    const stream=r.body?.getReader();if(!stream)throw Error('Portfolio stream unavailable');
    const decoder=new TextDecoder();let buffer='',bytes=0,count=0,last=null,complete=false;
    const receive=line=>{if(!line.trim())return;if(++count>40||line.length>2*1024*1024)throw Error('Portfolio stream limit');
     const item=JSON.parse(line);if(item?.type!=='report'||typeof item.complete!=='boolean')throw Error('Invalid portfolio stream');
     if(complete)throw Error('Portfolio stream already settled');
     last=accept(family,w,item.report,{inventoryPending:!item.complete,refreshing:!item.complete||refreshing||!!item.report?.refreshing||!!item.report?.progress?.transportTimedOut||!!item.report?.progress?.valuationPending});complete=item.complete;
    };
    try{for(;;){const part=await stream.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>8*1024*1024)throw Error('Portfolio stream limit');buffer+=decoder.decode(part.value,{stream:true});let cut;while((cut=buffer.indexOf('\n'))>=0){receive(buffer.slice(0,cut));buffer=buffer.slice(cut+1);}if(buffer.length>2*1024*1024)throw Error('Portfolio stream limit');}
     buffer+=decoder.decode();receive(buffer);if(!last||!complete)throw Error('Portfolio refresh interrupted');return last;
    }catch(e){await stream.cancel().catch(()=>{});throw e;}finally{stream.releaseLock();}
   }finally{clearTimeout(timer);}
  })().finally(()=>flights.delete(purposeKey));flights.set(purposeKey,promise);}
  // A superseded view stops listening without aborting the shared request needed by the header/menu.
  if(!signal)return promise.then(copy);
  return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});promise.then(v=>{signal.removeEventListener('abort',abort);resolve(copy(v));},e=>{signal.removeEventListener('abort',abort);reject(e);});});
 }
 return {cached,accept,read,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
}
export function portfolioReader({fetchImpl=globalThis.fetch,storage,eventTarget=globalThis}={}){
 try{storage??=globalThis.localStorage;}catch{}
 const all=globalThis[registry]??=new WeakMap();let reader=all.get(fetchImpl);if(!reader){reader=createPortfolioReader({fetchImpl,storage,eventTarget});all.set(fetchImpl,reader);}return reader;
}
