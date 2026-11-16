import {assetPriceFields,PRICE_VALUE_MS,priceState} from './qx-price-state.mjs';
import {allocatePortfolioBasis} from './qx-holding-basis.mjs';
import {portfolioTotals} from './qx-wallet-pnl.mjs';
const KEY='qhooks:portfolio:last:v1:',MAX_AGE=7*86400000,FRESH=60000;
const registry=Symbol.for('qhooks.portfolio.read.v1'),copy=x=>structuredClone(x);
const known=n=>typeof n==='number'&&Number.isFinite(n),address=(family,w)=>family==='solana'?String(w||''):String(w||'').toLowerCase();
const validOwner=(family,w)=>family==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w):/^0x[0-9a-f]{40}$/.test(w);
export function chainReadState(c){
 const assets=[c.native,...(c.tokens||[])],missing=assets.some(a=>!a||a.balance==null&&a.units==null);
 return {balances:missing||c.error==='balances_unavailable'||!!c.balancesRefreshing,prices:assets.some(a=>(Number(a.units)>0||Number(a.balance)>0)&&!known(a.valueUsd))||!!c.pricesRefreshing};
}
export function portfolioNeedsRefresh(report){return !!report?.refreshing||(report?.chains||[]).some(c=>chainReadState(c).balances||[c.native,...(c.tokens||[]).filter(t=>!t.spam)].some(a=>(Number(a?.units)>0||Number(a?.balance)>0)&&!known(a?.valueUsd)));}
function valid(report,family,w){return report?.version===1&&address(family,report.address)===w&&Array.isArray(report.chains)&&report.totals&&report.chains.every(c=>c&&c.native&&Array.isArray(c.tokens))&&new Set(report.chains.map(c=>String(c.chainId))).size===report.chains.length;}
function priced(asset,at,now,chainId){
 return assetPriceFields(asset,{chainId,token:asset.address,at,now});
}
function assetMerge(input,old,now,at,oldAt,chainId){
 const next=priced(input,at,now,chainId),prior=old?priced(old,oldAt,now,chainId):null;
 if(!prior)return next;
 if(next.balance==null&&next.units==null)return {...prior,...next,balance:prior.balance,units:prior.units,
  priceUsd:known(next.priceUsd)?next.priceUsd:prior.priceUsd,priceAt:known(next.priceUsd)?next.priceAt:prior.priceAt,
  valueUsd:known(next.priceUsd)&&known(prior.units)?next.priceUsd*prior.units:prior.valueUsd,balanceRefreshing:true,
  pricesRefreshing:!!next.pricesRefreshing||!!prior.pricesRefreshing};
 if(!known(next.priceUsd)&&known(prior.priceUsd)){
  const units=known(next.units)?next.units:next.balance!=null&&Number.isInteger(next.decimals)?Number(next.balance)/10**next.decimals:null;
  return {...next,priceUsd:prior.priceUsd,priceAt:prior.priceAt,valueUsd:known(units)?units*prior.priceUsd:next.valueUsd,pricesRefreshing:true};
 }
 return next;
}
export function reconcilePortfolio(report,previous,now=known(report?.at)?report.at:Date.now()){
 const next=copy(report),prior=new Map((previous?.chains||[]).map(c=>[String(c.chainId),c]));
 next.chains=next.chains.map(c=>{
  const old=prior.get(String(c.chainId));prior.delete(String(c.chainId));
  const failed=chainReadState(c).balances,byToken=new Map((old?.tokens||[]).map(t=>[(String(c.chainId)==='solana'?String(t.address):String(t.address).toLowerCase()),t]));
  const tokens=c.tokens.map(t=>{const key=String(c.chainId)==='solana'?String(t.address):String(t.address).toLowerCase(),oldToken=byToken.get(key);byToken.delete(key);return assetMerge(t,oldToken,now,report.at,previous?.at,c.chainId);});
  if(failed)for(const t of byToken.values())tokens.push({...priced(t,previous?.at,now,c.chainId),balanceRefreshing:true});
  const native=assetMerge(c.native,old?.native,now,report.at,previous?.at,c.chainId);
  return {...c,native,tokens,balancesRefreshing:failed,pricesRefreshing:!!native.pricesRefreshing||tokens.some(t=>t.pricesRefreshing)};
 });
 for(const c of prior.values())next.chains.push({...c,native:priced(c.native,previous?.at,now,c.chainId),tokens:c.tokens.map(t=>priced(t,previous?.at,now,c.chainId)),balancesRefreshing:true,error:c.error||'balances_unavailable'});
 next.partial=!!report.partial||next.chains.some(c=>{const s=chainReadState(c);return s.balances||s.prices;});
 allocatePortfolioBasis(next);next.totals=portfolioTotals(next.chains);return next;
}
export function createPortfolioReader({fetchImpl=globalThis.fetch,storage,now=Date.now,eventTarget=globalThis,timeoutMs=20000}={}){
 const reports=new Map(),flights=new Map(),listeners=new Set();
 const key=(family,w)=>family+':'+address(family,w);
 function cached(family,owner){const w=address(family,owner),k=key(family,w);if(!validOwner(family,w))return null;let item=reports.get(k);
  if(!item)try{const value=JSON.parse(storage?.getItem(KEY+k)||'null');if(valid(value?.report,family,w)&&known(value.at)&&now()-value.at<MAX_AGE&&value.at<=now()+60000)item=value;}catch{}
  if(item&&now()-item.at>=MAX_AGE){reports.delete(k);return null;}
  if(!item)return null;item={...item,report:reconcilePortfolio(item.report,null,now())};reports.set(k,item);return {...copy(item),fresh:now()-item.at<FRESH};
 }
 function accept(family,owner,report,{derived=false,refreshing=false}={}){
  const w=address(family,owner);if(!valid(report,family,w))throw Error('Invalid portfolio report');
  const prior=cached(family,w);if(known(prior?.report?.at)&&known(report.at)&&report.at<prior.report.at)return copy(prior.report);
  const next=reconcilePortfolio(report,derived?null:prior?.report,now()),item={at:derived&&prior?prior.at:now(),report:{...next,refreshing}};
  reports.set(key(family,w),copy(item));try{storage?.setItem(KEY+key(family,w),JSON.stringify(item));}catch{}
  const detail={family,owner:w,report:copy(item.report)};
  for(const listener of listeners)try{listener(detail);}catch{}
  try{eventTarget.dispatchEvent?.(new CustomEvent('qhooks:portfolio-report',{detail}));}catch{}
  return copy(item.report);
 }
 function read(family,owner,{purpose='portfolio',force=false,signal}={}){
  const w=address(family,owner),k=key(family,w);if(!validOwner(family,w))return Promise.reject(Error('Wallet required'));
  const prior=cached(family,w);if(prior?.fresh&&!force)return Promise.resolve(copy(prior.report));
  const purposeKey=k+':'+purpose,normal=flights.get(k+':portfolio'),existing=normal||flights.get(purposeKey);
  // A header may share a normal portfolio request. A normal request never inherits a capped header admission.
  let promise=existing;
  if(!promise){promise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(10000,timeoutMs));
   try{const r=await fetchImpl('/api/portfolio/'+family+'/'+encodeURIComponent(w),{cache:'no-store',signal:controller.signal,...(purpose==='header-total'?{headers:{'x-qhooks-read-purpose':'header-total'}}:{})});
    if(!r.ok){let error;try{error=(await r.json())?.error;}catch{}const e=Error(error||'Portfolio unavailable');e.capped=error==='header_total_cap'||r.headers?.get?.('x-qhooks-header-cap')==='1';throw e;}
    return accept(family,w,await r.json(),{refreshing:r.headers?.get?.('x-qhooks-cache')==='refreshing'});
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
