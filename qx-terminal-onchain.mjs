import {admitProviderChart} from './qx-provider-chart.mjs';
import {renderMarketHolders,holderSource} from './qx-terminal-holders.mjs';
// Read-only fallback for an outside EVM selection. The server admits the index's
// exact projections; this view adapter keeps their scope and source clocks.
const CHAINS=Object.freeze({'8453':'base','1':'ethereum','56':'bsc','4663':'robinhood','42161':'arbitrum','solana':'solana'});
const B58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,SIGNATURE=/^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const HOLDER_PAGE=100,HOLDER_MAX_OFFSET=500;
const TFS=Object.freeze({60:'1m',300:'5m',900:'15m',3600:'1h',14400:'4h',86400:'1d'});
const ADDRESS=/^0x[\da-f]{40}$/i,POOL=/^0x(?:[\da-f]{40}|[\da-f]{64})$/i;
const stamp=value=>typeof value==='string'&&Number.isSafeInteger(Date.parse(value))&&Date.parse(value)>0?Date.parse(value):null;
const number=value=>value!==null&&value!==''&&value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
const latest=rows=>Math.max(0,...rows)||null;
const stale=p=>p.stale===true||['stale','retained','delayed'].includes(p.freshness_state)||['stale','retained','delayed'].includes(p.freshness?.state)||['stale','retained'].includes(p.delivery?.state);
function selectionOf(value){
 const chainId=String(value?.chainId),{token,pool,quote}=value||{};
 // Solana identities are case-sensitive Base58: never lowercased.
 if(chainId==='solana')return B58.test(token)&&B58.test(pool)&&B58.test(quote)&&token!==quote?Object.freeze({...value,chainId}):null;
 if(!Object.hasOwn(CHAINS,chainId)||!ADDRESS.test(token)||!POOL.test(pool)||!ADDRESS.test(quote)||token.toLowerCase()===quote.toLowerCase())return null;
 return Object.freeze({...value,chainId,token:token.toLowerCase(),pool:pool.toLowerCase(),quote:quote.toLowerCase()});
}
function exact(p,s,chart=false){
 const i=chart?{chain:p.chain,pool_address:p.pair_address,token_address:p.token_address,quote_token_address:p.quote_address}:p.identity;
 return p.ok===true&&p.source==='QHooks data'&&i?.chain===CHAINS[s.chainId]&&i.pool_address===s.pool&&i.token_address===s.token&&i.quote_token_address===s.quote;
}
function needed(data,kind){
 if(!data?.ext)return false;
 if(kind==='holders')return !data.holders?.length&&!data.holderSample?.rows?.length;
 return data.marketCoverage?.[kind]!=='loading'&&!data[kind]?.length;
}
function history(p,lastEventAt){
 return {available:true,observedAt:stamp(p.observed_at||p.updated_at),lastEventAt,stale:stale(p),source:'QHooks data',attribution:p.attribution?.label||p.provider_source?.label||null};
}

// Provider names only; upstream labels can carry internal names.
function providerName(src){
 const v=[src?.provider,src?.provider_path,src?.method].filter(x=>typeof x==='string').join(' ').toLowerCase();
 return /moralis/.test(v)?'Moralis':/blockscout/.test(v)?'Blockscout':/alchemy/.test(v)?'Alchemy':/helius|solana|rpc/.test(v)?'Public RPC':null;
}
const decimalText=v=>typeof v==='string'&&/^\d{1,100}(?:\.\d{1,36})?$/.test(v)?v:null;
function holderSampleOf(p,s){
 const c=p?.coverage,scope=c?.scope,block=c?.balance_evidence?.block_number,count=Number.isSafeInteger(p.holder_count)&&p.holder_count>=0?p.holder_count:null;
 if(p?.schema_version!=='qhooks.onchain_holder_list.v2'||!['provider_ranked_top_holders','observed_wallet_balances'].includes(scope)||typeof c.complete_holder_census!=='boolean'||!Array.isArray(p.holders)||!p.holders.length||p.holders.length>HOLDER_PAGE)return null;
 const complete=c.complete_holder_census===true;
 // A complete census needs the proven state and a real count; an observed sample never carries a global count.
 if(complete&&(scope!=='provider_ranked_top_holders'||!['complete','supply_coverage_proven'].includes(c.scan_state)||count===null))return null;
 if(scope==='observed_wallet_balances'&&(c.global_ranking_available!==false||count!==null))return null;
 const sol=s.chainId==='solana',valid=sol?B58:ADDRESS;
 const rows=p.holders.filter(r=>valid.test(r.holder_address)&&decimalText(r.balance)).map(r=>({holder:sol?r.holder_address:r.holder_address.toLowerCase(),balance:r.balance,balanceKind:'units',rank:Number.isSafeInteger(r.rank)?r.rank:null,sharePct:Number.isFinite(r.supply_share_pct)&&r.supply_share_pct>=0?r.supply_share_pct:null}));
 if(!rows.length)return null;
 const page=p.pagination||{},nextOffset=page.has_more===true&&Number.isSafeInteger(page.next_offset)&&page.next_offset>0&&page.next_offset<=HOLDER_MAX_OFFSET?page.next_offset:null;
 const cursor=page.has_more===true&&typeof page.next_cursor==='string'&&page.next_cursor.length<=4096&&/^(bh1\.[A-Za-z0-9_-]+|sh1:[A-Za-z0-9:]+)$/.test(page.next_cursor)?page.next_cursor:null;
 const ranked=scope==='provider_ranked_top_holders'&&c.global_ranking_available===true,top10=ranked&&Number.isFinite(p.summary?.top_10_supply_pct)?p.summary.top_10_supply_pct:null;
 const observed=scope==='observed_wallet_balances',throughBlock=/^\d+$/.test(String(block))?String(block):null;
 return {label:complete?'Complete holder list':observed?'Holders seen at block '+block+' · not a full holder list':'Indexed holder balances · partial list',scope,throughBlock,rows,
  observedAt:stamp(p.observed_at),stale:stale(p),source:providerName(p.provider_source)||(observed?'Public RPC':'Public holder index'),
  count,complete,ranked,top10Pct:top10,supply:decimalText(p.summary?.supply),decimals:Number.isInteger(p.summary?.decimals)?p.summary.decimals:undefined,
  ageSeconds:Number.isFinite(p.source_age_seconds)?p.source_age_seconds:null,offset:Number.isSafeInteger(page.offset)?page.offset:0,
  next:nextOffset!==null||cursor?{offset:nextOffset,cursor}:null};
}
export function appendOnchainHolderPage(data,p,selection){
 const s=selectionOf(selection),prior=data?.holderSample;
 if(!s||!prior?.next||!p||!exact(p,s))return data;
 const page=holderSampleOf(p,s);if(!page||page.scope!==prior.scope)return data;
 const seen=new Set(prior.rows.map(r=>r.holder)),rows=[...prior.rows,...page.rows.filter(r=>!seen.has(r.holder))];
 return {...data,holderSample:{...prior,rows,next:rows.length>prior.rows.length?page.next:null,observedAt:Math.min(prior.observedAt||Infinity,page.observedAt||Infinity)||null,stale:prior.stale||page.stale}};
}

export function applyOnchainEvmPanel(data,kind,p,selection){
 const s=selectionOf(selection);
 if(!s||!p||!needed(data,kind)||!exact(p,s,kind==='candles')||!stamp(p.observed_at||p.updated_at))return data;
 if(kind==='holders'){
  const sample=holderSampleOf(p,s);if(!sample)return data;
  return {...data,holderSample:sample};
 }
 if(kind==='candles'){
  if(p.source_type==='provider_embed'){
   const chartSurface=admitProviderChart(p,s);if(!chartSurface)return data;
   if(data.chartSurface&&JSON.stringify(data.chartSurface)===JSON.stringify(chartSurface))return data;
   return{...data,chartSurface};
  }
  const bars=p.candles,fingerprint=[CHAINS[s.chainId],s.pool,s.token,s.quote].join(':');
  if(p.source_type!=='provider'||p.instrument_scope!=='exact_pool'||p.asset!==s.asset||p.timeframe!==TFS[s.tf]||p.continuity?.identity?.exact_market_preserved!==true||p.continuity?.exact_pool_fingerprint!==fingerprint||p.continuity?.token_orientation!=='selected_token_usd'||!Array.isArray(bars)||!bars.length||bars.length>1000)return data;
  if(!bars.every((c,i)=>Number.isSafeInteger(c.time)&&c.time>0&&(!i||c.time>bars[i-1].time)&&['open','high','low','close','volume'].every(k=>typeof c[k]==='number'&&Number.isFinite(c[k])&&c[k]>=0)&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.high>=c.low))return data;
  return {...data,chartSurface:null,candles:bars,marketCoverage:{...data.marketCoverage,candles:'available'},historyFreshness:{...data.historyFreshness,candles:history(p,stamp(p.last_candle_at)||latest(bars.map(c=>c.time*1000)))}};
 }
 if(kind!=='trades'||p.schema_version!=='qhooks.onchain_pool_trades.v1'||p.coverage?.exact_pool_verified!==true||p.coverage.complete_history!==false||p.execution_boundary?.signing_available!==false||p.execution_boundary?.submission_available!==false||!Array.isArray(p.trades)||p.trades.length>120)return data;
 const sol=s.chainId==='solana',traderOk=sol?B58:ADDRESS,txOk=sol?SIGNATURE:/^0x[\da-f]{64}$/i;
 const rows=p.trades.filter(r=>['buy','sell'].includes(r.side)&&stamp(r.observed_at)&&traderOk.test(r.trader_address)&&txOk.test(r.transaction_hash)).map(r=>({id:r.event_id,ts:Math.floor(stamp(r.observed_at)/1000),buy:r.side==='buy',price:number(r.price_usd),token:number(r.token_amount),quote:number(r.volume_usd),valueUsd:number(r.volume_usd),trader:sol?r.trader_address:r.trader_address.toLowerCase(),tx:r.transaction_hash,pool:0,source:'QHooks data'}));
 if(!rows.length)return data;
 return {...data,trades:rows,tradeCoverage:p.coverage,marketCoverage:{...data.marketCoverage,trades:'available'},historyFreshness:{...data.historyFreshness,trades:history(p,stamp(p.freshness?.latest_trade_at)||latest(rows.map(r=>r.ts*1000)))}};
}

export function createOnchainEvmFallback({fetcher=globalThis.fetch,timeoutMs=9500,retryCooldownMs=30000,now=Date.now}={}){
 if(typeof fetcher!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(retryCooldownMs)||retryCooldownMs<1||retryCooldownMs>300000)throw TypeError('Invalid market fallback limits.');
 let key=null,jobs=new Map();const active=new Map();
 function clear(){for(const job of new Set([...jobs.values(),...active.values()]))job.stop();jobs=new Map();key=null;}
 function request(kind,s,signal){
  const controller=new AbortController(),job={running:true,retryAt:Infinity};let timer,stop;
  const stopped=new Promise(resolve=>{stop=()=>{clearTimeout(timer);controller.abort();resolve(null);};timer=setTimeout(stop,timeoutMs);});
  if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
  const query=new URLSearchParams({token:s.token,quote:s.quote});
  if(kind==='candles'){query.set('asset',s.asset||'');query.set('tf',TFS[s.tf]||'');}
  if(kind==='holders')query.set('limit',String(HOLDER_PAGE));
  const route=kind==='candles'?'chart':kind;
  const work=Promise.resolve().then(async()=>{
   if(controller.signal.aborted)return null;
   try{const r=await fetcher(`/api/terminal/onchain/${route}/${s.chainId}/${s.pool}?${query}`,{method:'GET',cache:'no-store',signal:controller.signal});return r.ok?await r.json():null;}catch{return null;}
  }).finally(()=>{job.running=false;if(active.get(kind)===job)active.delete(kind);});
  const promise=Promise.race([work,stopped]).finally(()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);const at=Number(now());job.retryAt=Number.isFinite(at)?at+retryCooldownMs:Infinity;});
  Object.assign(job,{promise,stop});active.set(kind,job);return job;
 }
 let paging=null;
 async function more({selection,getData,onData,isCurrent}){
  const s=selectionOf(selection),next=getData()?.holderSample?.next;if(!s||!next||paging)return false;
  const query=new URLSearchParams({token:s.token,quote:s.quote,limit:String(HOLDER_PAGE)});
  if(next.cursor)query.set('cursor',next.cursor);else query.set('offset',String(next.offset));
  paging=new AbortController();const timer=setTimeout(()=>paging?.abort(),timeoutMs);
  try{const r=await fetcher(`/api/terminal/onchain/holders/${s.chainId}/${s.pool}?${query}`,{method:'GET',cache:'no-store',signal:paging.signal});
   const p=r.ok?await r.json():null;if(!isCurrent())return false;const current=getData(),updated=appendOnchainHolderPage(current,p,s);
   if(updated===current)return false;onData(updated);return true;}catch{return false;}finally{clearTimeout(timer);paging=null;}
 }
 return Object.freeze({clear,more,async fill({selection,panels=['candles','trades','holders'],signal,isCurrent,getData,onData}){
  const s=selectionOf(selection);if(!s||!isCurrent()||signal?.aborted)return;
  const next=[s.revision,s.chainId,s.token,s.pool,s.quote,s.tf].join(':');
  if(key!==next){clear();key=next;}
  await Promise.all(panels.map(async kind=>{
   if(!['candles','trades','holders'].includes(kind)||!needed(getData(),kind)||kind==='candles'&&!TFS[s.tf]||kind==='holders'&&s.chainId==='solana')return;
   let job=jobs.get(kind);const at=Number(now());if(!Number.isFinite(at))return;
   if(!job||!job.running&&at>=job.retryAt){
    // A deadline/selection abort resolves the caller, but cannot free a
    // transport slot until fetch AND JSON have actually stopped/settled.
    if(active.has(kind))return;
    job=request(kind,s,signal);jobs.set(kind,job);
   }
   const projection=await job.promise;
   // Check after both fetch and JSON parsing, even if transport ignored abort.
   if(key!==next||!isCurrent()||signal?.aborted)return;
   const current=getData(),updated=applyOnchainEvmPanel(current,kind,projection,s);
   if(updated!==current)onData(updated);
  }));
 }});
}

export function renderOnchainHolderSample({h,who,link,short,chainId,market={},sample,now=Date.now(),onMore=null}){
 return renderMarketHolders({h,who,link,short,chainId,market,sample,now,onMore});
}
