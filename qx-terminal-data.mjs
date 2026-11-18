import {swapCandles,mergeSwapCandles} from './qx-swap-candles.mjs';
import {readHistoryPanel} from './qx-history-read.mjs';
// Provider observations and the terminal's read-only page adapters. No wallet calls.
const time=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:null;
const utc=at=>new Date(at).toISOString().slice(11,16)+' UTC';
const age=(at,now)=>{const s=Math.max(0,Math.floor((now-at)/1000));return s<60?s+'s':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d';};
export const plainMarketError=()=> 'Refreshing market data…';
export function freshnessState(data={},now=Date.now(),{fresh='Live · '}={}){
 const stamp=time(data?.observedAt),observedAt=stamp&&stamp<=now+5000?stamp:null;
 const stale=!!data?.stale||!!observedAt&&now-observedAt>120000;
 return {observedAt,stale,label:observedAt&&!stale?fresh+age(observedAt,now)+' ago':stale?'Refreshing…':''};
}
export function historyState(kind,{available,loading=false,observedAt=null,stale=false,lastEventAt=null}={},now=Date.now()){
 const panel=kind==='candles'?'Chart':'Trades',event=kind==='candles'?'candle':'trade';
 if(loading)return {stale:false,label:'Loading '+panel.toLowerCase()+'…'};
 if(available===false)return {stale:false,label:'Refreshing '+panel.toLowerCase()+'…'};
 // Staleness is the age of the data observation. A quiet market (no trade for minutes) is not stale data.
 const fresh=freshnessState({observedAt:time(observedAt)||time(lastEventAt),stale},now,{fresh:'updated '});
 return {...fresh,label:(time(lastEventAt)?'Last '+event+' '+age(lastEventAt,now)+' ago · ':'')+fresh.label};
}
export function safetyChecked(safety){
 return safety?.checked===true||typeof safety?.honeypot==='boolean'||[safety?.buyTax,safety?.sellTax].some(v=>typeof v==='number'&&Number.isFinite(v))||
  Array.isArray(safety?.checks)&&safety.checks.some(c=>c&&['ok','clear','pass','passed','caution','danger'].includes(c.status));
}
// The header in the /x/token shape, read by the visitor's browser from DexScreener (2026-11-09). Used when the server copy
// can't answer (shared egress rate limits on DexScreener/GeckoTerminal), so a token never sticks on "Token unavailable".
export async function browserHeader({chainId,address,fetcher=globalThis.fetch,dex}){
 const {fetchDexPairs,pickPair,headerPatch}=dex||await import('/qx-dex-live.mjs');
 const pairs=await fetchDexPairs(chainId,[address],{fetcher});
 const low=a=>chainId==='solana'?String(a||''):String(a||'').toLowerCase(),best=pickPair(pairs,chainId,address,null),patch=headerPatch(best);
 if(!best||!patch)return null;
 const mine=(pairs||[]).filter(p=>low(p?.baseToken?.address)===low(address)&&p?.pairAddress).sort((a,b)=>(Number(b.liquidity?.usd)||-1)-(Number(a.liquidity?.usd)||-1)).slice(0,8);
 return {chainId,address:low(address),symbol:String(best.baseToken.symbol||''),name:String(best.baseToken.name||''),logo:best.info?.imageUrl||null,decimals:null,...patch,live:false,
  pools:mine.map(p=>({address:low(p.pairAddress),dex:p.dexId||null,quoteAddress:low(p.quoteToken?.address),quoteSymbol:p.quoteToken?.symbol||null,liquidityUsd:Number(p.liquidity?.usd)||null,volume24Usd:Number(p.volume?.h24)||null}))};
}
// The server's outside-token routes have no Elysium (400 invalid_chain): don't ask, so the page logs no errors.
const SERVER_SKIP=new Set(['99901']);
async function serverHeader(chainId,address,signal,fetcher){
 if(SERVER_SKIP.has(String(chainId)))return {status:-1};
 try{const r=await fetcher(`/api/terminal/x/token/${chainId}/${address}`,{cache:'no-store',signal});return r.ok?{t:await r.json()}:{status:r.status};}
 catch(e){if(signal?.aborted)throw e;return {status:0};}
}
// mktsearch (2026-11-12): an outside token with no market, or only a near-empty pool, is never offered for trading
// against that pool. A launchpad token still on its curve (Pons on Robinhood Chain: AEON, BULW) says so, with the curve's
// link; a contract with no pool says "No pool found for X on Y yet". The extra read happens only on those paths.
const deepest=t=>{const v=[...(t?.pools||[]).map(p=>p?.liquidityUsd),t?.liquidityUsd].filter(x=>typeof x==='number'&&Number.isFinite(x));return v.length?Math.max(...v):null;};
function venueError(message,{view=null,link=null}={}){const e=Error(message);e.view=view;e.link=link;e.venue=true;return e;}
async function outsideVerdict({chainId,address,t,fetcher,signal,venue,early}){
 if(String(chainId)==='solana')return null;
 const v=venue||await import('./qx-token-venue.mjs'),depth=t?deepest(t):null;
 if(t&&!(depth!=null&&depth<v.THIN_LIQUIDITY_USD))return null;
 const facts=await (early||v.outsideFacts(chainId,address,{fetcher,signal})).catch(()=>null);if(signal?.aborted)throw Error('aborted');
 const {chainById}=await import('./chains.mjs'),chain=chainById(String(chainId))?.name||'this chain',sym=t?.symbol||facts?.symbol||null;
 if(facts?.pons&&!facts.pons.graduated)return venueError(v.curveLine(sym,facts.pons),{view:sym,link:facts.pons.curveUrl?{href:facts.pons.curveUrl,text:'View the curve'}:null});
 if(t)return venueError((sym||'This token')+' has no pool with real liquidity on '+chain+' yet (the deepest one listed holds $'+depth.toFixed(2)+'). Trading is off for it here.',{view:sym});
 if(facts?.symbol)return venueError('No pool found for '+facts.symbol+' on '+chain+' yet.',{view:facts.symbol});
 return null;
}
// curves (2026-11-12, Randall: "No I wanna buy it here"): a launchpad token (Pons V2 on Robinhood Chain) opens as a real
// market built from the launchpad itself (/api/curve: price, market cap, bonding progress, the curve's own trades) with the
// Buy/Sell ticket, instead of the "Buy it on Pons" line. Its curve read runs beside the market read; for any other token it
// is one cached 404 and the page continues exactly as before.
const curveHeaderData=(t,tf,chainId)=>headerData(t,tf,t.address,String(chainId));
function headerData(t,tf,token,chainId){
 return {ext:true,tf,token:t,receivedAt:Date.now(),safety:null,
  meta:{symbol:t.symbol,name:t.name,token,chainId,quoteSymbol:'USD',owner:null},
  summary:{price:t.priceUsd,priceUsd:t.priceUsd,priceAt:t.priceAt??t.observedAt,priceSource:t.priceSource,pricePoolId:t.pricePoolId,pricesRefreshing:t.pricesRefreshing??t.stale,change24:t.change24,mcap:t.mcapUsd??t.fdvUsd,supply:t.supply??null,fdv:t.fdvUsd,liquidity:t.liquidityUsd,volume24:t.volume24Usd,buys24:t.buys24,sells24:t.sells24,trades24:t.buys24!=null&&t.sells24!=null?t.buys24+t.sells24:null},
  candles:[],trades:[],holders:[],traders:[],synced:{behind:0,at:0,block:0},
  marketCoverage:{candles:'loading',trades:'loading'},historyFreshness:{candles:{loading:true},trades:{loading:true}}};
}
export async function loadExternalHeader({chainId,address,tf,signal,fetcher=globalThis.fetch,retryMs=1200,dex,venue,curves}){
 const cm=curves||await import('./qx-curve-market.mjs').catch(()=>null);
 const readCurve=()=>cm?cm.readCurve(chainId,address,{fetcher,signal}).catch(()=>undefined):Promise.resolve(null);
 if(signal?.aborted)throw signal.reason||Error('aborted');
 const curveP=readCurve();
 // Robinhood Pons curves already supply their identity, price, progress and trading venue.
 // Classify that existing read before requesting optional outside-market metadata.
 // Other chains keep their parallel provider read; graduated pools still use enrichment.
 let headerP=String(chainId)==='4663'?null:serverHeader(chainId,address,signal,fetcher);
 let curve=await curveP,got;
 if(curve===undefined&&cm){if(String(chainId)==='4663')headerP ||= serverHeader(chainId,address,signal,fetcher).catch(()=>({status:0}));await new Promise(r=>setTimeout(r,800));if(signal?.aborted)throw Error('aborted');curve=await readCurve();}
 if(signal?.aborted)throw signal.reason||Error('aborted');
 const at=curve?.observedAt,ownCurve=String(chainId)==='4663'&&String(curve?.chainId)==='4663'&&String(curve?.token||'').toLowerCase()===String(address).toLowerCase()&&curve?.kind==='pons-v2'&&curve?.venue?.id==='pons-v2'&&curve?.history==='events'&&['curve','graduating'].includes(curve?.phase)&&/^0x[0-9a-f]{40}$/i.test(curve?.curve||'')&&Number.isSafeInteger(at)&&at>0&&at<=Date.now()+5000&&Date.now()-at<=120000;
 if(ownCurve)return curveHeaderData(cm.curveHeader(curve,null),tf,chainId);
 headerP ||= serverHeader(chainId,address,signal,fetcher);
 if(curve){got=await Promise.race([headerP,new Promise(r=>setTimeout(()=>r({status:-2}),250))]);return curveHeaderData(cm.curveHeader(curve,got.t||null),tf,chainId);}
 got=await headerP;
 // Not a launchpad curve: on a launchpad chain the venue read (a graduated or rescued launch, a dust pool) starts now,
 // beside the retry below (one display-cached relay batch).
 let early=null;
 if(String(chainId)!=='solana'){const v=venue||await import('./qx-token-venue.mjs').catch(()=>null);if(v?.hasLaunchpad?.(chainId)){early=v.outsideFacts(chainId,address,{fetcher,signal});early.catch(()=>{});}}
 if(!got.t&&got.status!==404&&got.status!==-1){await new Promise(r=>setTimeout(r,retryMs));if(signal?.aborted)throw Error('aborted');got=await serverHeader(chainId,address,signal,fetcher);}
 if(!got.t){const t=await browserHeader({chainId,address,fetcher,dex}).catch(()=>null);if(t)got={t};}
 const verdict=await outsideVerdict({chainId,address,t:got.t,fetcher,signal,venue,early}).catch(e=>{if(signal?.aborted)throw e;return null;});
 if(verdict)throw verdict;
 if(!got.t)throw Error(got.status===404?'No market found for this token.':plainMarketError());
 const t=got.t,token=chainId==='solana'?t.address:t.address?.toLowerCase();
 if(token!==address||(t.chainId!=null&&String(t.chainId)!==chainId))throw Error('Token metadata does not match this selection. Choose the token again.');
 return headerData(t,tf,token,chainId);
}
const GECKO_NET={'8453':'base','1':'eth','42161':'arbitrum','56':'bsc','4663':'robinhood','99901':'elysium','143':'monad',solana:'solana'};
/// Recent swaps for one pool from GeckoTerminal, in the server's /x/trades shape. Null when unavailable.
export async function browserTrades({chainId,pool,signal,fetcher=globalThis.fetch}){
 const net=GECKO_NET[String(chainId)];if(!net||!pool)return null;
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,8000);signal?.addEventListener('abort',abort,{once:true});
 try{
  const {readGecko}=await import('./qx-gecko-read.mjs');
  const r=await readGecko('https://api.geckoterminal.com/api/v2/networks/'+net+'/pools/'+(chainId==='solana'?pool:String(pool).toLowerCase())+'/trades',{fetcher,signal:controller.signal});
  const body=r?.body;if(!Array.isArray(body?.data))return null;
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
  const trades=body.data.map(d=>d?.attributes).filter(a=>a&&(a.kind==='buy'||a.kind==='sell')&&a.tx_hash&&!a.is_anomalous).map(a=>{const buy=a.kind==='buy';
   return {tx:a.tx_hash,index:null,wallet:a.tx_from_address||'',ts:Date.parse(a.block_timestamp),side:a.kind,priceUsd:n(buy?a.price_to_in_usd:a.price_from_in_usd),amountToken:n(buy?a.to_token_amount:a.from_token_amount),valueUsd:n(a.volume_in_usd)};}).filter(x=>Number.isFinite(x.ts));
  return {body:{trades,coverage:{scope:'browser_recent_trades',provider:'GeckoTerminal'}},observedAt:r.observedAt,stale:r.stale};
 }catch{return null;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
// On-chain tape (2026-11-10, Randall: "make it stronger"): when GeckoTerminal won't answer (per-visitor 429s), read the
// pool's own Uniswap v4 Swap events through qhooks.com/api/rpc/<chain> (read-only proxy, site only, ≤10,000 blocks per
// log read, ≤20 calls per batch). One batch: 6 windows of 10,000 blocks (~2 h on Elysium) + decimals; a second batch reads
// the senders of the newest 20 swaps. Signs are the swapper's: token > 0 = buy. USD = quote price × native USD price.
const SWAP='0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f',PROXY_CHAINS={'4663':'ETH','99901':'HYPE'};
// Exact block clocks only. A log's blockTimestamp:'0x0' means unknown, not an event at epoch zero.
const tradeBlockClocks=new Map(),TRADE_CLOCK_BLOCKS=40;
const blockNumber=value=>{try{return typeof value==='string'&&/^0x[0-9a-f]+$/i.test(value)?BigInt(value):null;}catch{return null;}};
const eventTime=(value,now)=>{try{const ms=Number(BigInt(value))*1000;return Number.isSafeInteger(ms)&&ms>0&&ms<=now+5000?ms:null;}catch{return null;}};
async function tradeLogClocks(logs,{chainId,rpc,signal,now=Date.now()}){
 const clocks=new Map(),missing=new Map();
 for(const log of logs){
  if(log.removed===true)continue;
  const direct=eventTime(log.blockTimestamp,now);if(direct){clocks.set(log,direct);continue;}
  const number=blockNumber(log.blockNumber),hash=typeof log.blockHash==='string'&&/^0x[0-9a-f]{64}$/i.test(log.blockHash)?log.blockHash.toLowerCase():null;
  if(number===null||!hash)continue;
  const hit=tradeBlockClocks.get(chainId+':'+hash);if(hit?.number===number){clocks.set(log,hit.time);continue;}
  if(!missing.has(hash))missing.set(hash,{hash,number});
 }
 const blocks=[...missing.values()].sort((a,b)=>a.number>b.number?-1:a.number<b.number?1:0).slice(0,TRADE_CLOCK_BLOCKS);
 for(let at=0;at<blocks.length;at+=20){
  if(signal?.aborted)return clocks;
  const part=blocks.slice(at,at+20),result=await rpc(part.map((block,i)=>({jsonrpc:'2.0',id:i,method:'eth_getBlockByHash',params:[block.hash,false]}))).catch(()=>null);
  if(signal?.aborted)return clocks;
  for(const row of Array.isArray(result)?result:[]){
   const asked=part[row?.id],header=row?.result;if(!asked||typeof header?.hash!=='string'||header.hash.toLowerCase()!==asked.hash||blockNumber(header.number)!==asked.number)continue;
   const timestamp=eventTime(header.timestamp,now);if(!timestamp)continue;
   tradeBlockClocks.set(chainId+':'+asked.hash,{number:asked.number,time:timestamp});if(tradeBlockClocks.size>512)tradeBlockClocks.delete(tradeBlockClocks.keys().next().value);
  }
 }
 for(const log of logs){if(clocks.has(log)||log.removed===true)continue;const hit=typeof log.blockHash==='string'?tradeBlockClocks.get(chainId+':'+log.blockHash.toLowerCase()):null;if(hit?.number===blockNumber(log.blockNumber))clocks.set(log,hit.time);}
 return clocks;
}
const word=(hex,i)=>hex.slice(2+i*64,66+i*64),int128=w=>{const v=BigInt('0x'+w);return v>=1n<<255n?v-(1n<<256n):v;};
const units=(v,d)=>Number(v)/10**d;
export async function chainTrades({chainId,pool,token,quote,signal,fetcher=globalThis.fetch,windows=6,usd=null}){
 chainId=String(chainId);if(!PROXY_CHAINS[chainId]||!/^0x[0-9a-f]{64}$/i.test(pool||'')||!/^0x[0-9a-f]{40}$/i.test(token||'')||!/^0x[0-9a-f]{40}$/i.test(quote||''))return null;
 const {chainById}=await import('./chains.mjs'),manager=chainById(chainId)?.contracts?.manager;if(!manager)return null;
 const rpc=async body=>{const r=await fetcher('/api/rpc/'+chainId,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});return r.ok?r.json():null;};
 try{
  const head=await rpc({jsonrpc:'2.0',id:0,method:'eth_blockNumber',params:[]}),latest=head?.result?BigInt(head.result):null;if(latest===null)return null;
  const t=token.toLowerCase(),q=quote.toLowerCase(),native=BigInt(q)===0n,tokenIs0=BigInt(t)<BigInt(q);
  const span=(batch,i)=>{const to=latest-10000n*BigInt(batch*windows+i),from=to-9999n;return to<0n?null:{jsonrpc:'2.0',id:i+1,method:'eth_getLogs',params:[{address:manager,fromBlock:'0x'+(from>0n?from:0n).toString(16),toBlock:'0x'+to.toString(16),topics:[SWAP,pool.toLowerCase()]}]};};
  const calls=[...Array(windows)].map((_,i)=>span(0,i)).filter(Boolean);
  calls.push({jsonrpc:'2.0',id:90,method:'eth_call',params:[{to:t,data:'0x313ce567'},'latest']});
  if(!native)calls.push({jsonrpc:'2.0',id:91,method:'eth_call',params:[{to:q,data:'0x313ce567'},'latest']});
  const out=await rpc(calls);if(!Array.isArray(out))return null;
  const by=new Map(out.map(x=>[x.id,x])),dec=id=>{const v=by.get(id)?.result;return typeof v==='string'&&v.length>2?Number(BigInt(v)):18;},td=dec(90),qd=native?18:dec(91);
  const swapsOf=list=>list.filter(x=>x.id>=1&&x.id<=windows&&Array.isArray(x.result)).flatMap(x=>x.result);
  let logs=swapsOf(out),batches=1;
  // A quiet token: go further back, up to two more batches (~6.5 h in all on Elysium), until there are 50 swaps.
  for(let batch=1;batch<3&&logs.length<50;batch++){const more=await rpc([...Array(windows)].map((_,i)=>span(batch,i)).filter(Boolean)).catch(()=>null);if(!Array.isArray(more))break;logs=logs.concat(swapsOf(more));batches++;}
  if(usd==null){try{const r=await fetcher('/api/funding/native-prices?symbols='+PROXY_CHAINS[chainId],{signal});usd=r.ok?Number((await r.json()).prices?.[PROXY_CHAINS[chainId]])||null:null;}catch{usd=null;}}
  const clocks=await tradeLogClocks(logs,{chainId,rpc,signal});if(signal?.aborted)return null;
  const rows=logs.filter(l=>l.removed!==true).map(l=>{
   const a0=int128(word(l.data,0)),a1=int128(word(l.data,1)),ta=tokenIs0?a0:a1,qa=tokenIs0?a1:a0;if(ta===0n||qa===0n)return null;
   const tokenAmt=units(ta<0n?-ta:ta,td),quoteAmt=units(qa<0n?-qa:qa,qd),px=quoteAmt/tokenAmt,ts=clocks.get(l)??null;
   return {tx:l.transactionHash,index:l.logIndex?Number(BigInt(l.logIndex)):null,wallet:'',ts,side:ta>0n?'buy':'sell',priceUsd:usd?px*usd:null,amountToken:tokenAmt,valueUsd:usd?quoteAmt*usd:null};
  }).filter(r=>r&&Number.isFinite(r.ts)).sort((a,b)=>b.ts-a.ts).slice(0,300);
  // Who traded: the transaction sender for the newest 20 (Swap's sender is the router).
  const hashes=[...new Set(rows.slice(0,20).map(r=>r.tx))];
  if(hashes.length){const txs=await rpc(hashes.map((h,i)=>({jsonrpc:'2.0',id:i,method:'eth_getTransactionByHash',params:[h]}))).catch(()=>null);
   const from=new Map((Array.isArray(txs)?txs:[]).filter(x=>x?.result?.from).map(x=>[x.result.hash,x.result.from.toLowerCase()]));for(const r of rows)r.wallet=from.get(r.tx)||'';}
  return {body:{trades:rows,coverage:{scope:'onchain_recent_swaps',provider:'QHooks RPC',windowBlocks:batches*windows*10000,timestampedLogs:clocks.size,unresolvedTimestamps:logs.filter(l=>l.removed!==true&&!clocks.has(l)).length}},observedAt:Date.now(),stale:logs.some(l=>l.removed!==true&&!clocks.has(l))};
 }catch{return null;}
}
export async function loadExternalHistory({chainId,pool,tf,signal,fetcher=globalThis.fetch,token=null,quote=null,curve=null,onData=null,fallbackDelayMs=250}){
 // curves: the curve's own events. Graduated: the curve's history, then the pool's (read the usual way below).
 // four.meme-style curves (history 'pool') read the usual pool feeds, keyed by the curve's pool address set in its header.
 if(curve&&token&&curve.history!=='pool'){
  const cm=await import('./qx-curve-market.mjs'),body=await cm.curveHistory({chainId,token,tf,signal,fetcher}),own=body?cm.curveHistoryData(body,chainId):null;
  if(curve.phase!=='pool'||!pool){if(own)return own;return {candles:[],trades:[],tradeCoverage:null,marketCoverage:{candles:'unavailable',trades:'unavailable'},historyFreshness:{candles:{available:false},trades:{available:false}}};}
  const after=await loadExternalHistory({chainId,pool,tf,signal,fetcher,token,quote});
  if(!own)return after;
  const candles=mergeSwapCandles(own.candles,after.candles||[]),trades=[...(after.trades||[]),...own.trades];
  const newest=(rows,field,scale)=>rows.reduce((last,row)=>Number.isFinite(row?.[field])&&row[field]>0&&row[field]*scale<=Date.now()+5000?Math.max(last,row[field]*scale):last,0)||null;
  const candleClock=(after.candles?.length?after:own).historyFreshness?.candles,tradeClock=(after.trades?.length?after:own).historyFreshness?.trades;
  return {...after,candles,trades,curveStats:null,marketCoverage:{candles:candles.length?'available':'unavailable',trades:trades.length?'available':'unavailable'},
   historyFreshness:{candles:{...candleClock,available:candles.length>0,lastEventAt:newest(candles,'time',1000)},trades:{...tradeClock,available:trades.length>0,lastEventAt:newest(trades.filter(t=>t.via!=='eth'),'ts',1000)}}};
 }
 async function read(kind,parentSignal=signal){
  if(!pool||SERVER_SKIP.has(String(chainId)))return null;
  const controller=new AbortController(),abort=()=>controller.abort();
  if(parentSignal?.aborted)controller.abort();else parentSignal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,12000);
  try{
   const response=await fetcher(`/api/terminal/x/${kind}/${chainId}/${pool}`+(kind==='candles'?'?tf='+tf:''),{cache:'no-store',signal:controller.signal});
   if(!response.ok)return null;const body=await response.json();if(!Array.isArray(body?.[kind]))return null;
   return {body,sameOrigin:true,observedAt:time(Number(response.headers.get('x-qhooks-observed-at')))||time(body.observedAt),stale:response.headers.get('x-qhooks-stale')==='1'||body.stale===true};
  }catch{return null;}finally{clearTimeout(timer);parentSignal?.removeEventListener('abort',abort);}
 }
 // Quick server responses win without another provider call. When they stall,
 // existing fallback paths start after a short grace; each panel can paint alone.
 const candleFallback=async fallbackSignal=>{try{const {loadBars}=await import('./qx-candles.mjs');const got=await loadBars({chainId,pool,token,quote,tf,signal:fallbackSignal,fetcher});
   return got?.bars?.length?{body:{candles:got.bars,source:got.source,unit:got.unit},sameOrigin:got.origin==='server',observedAt:got.observedAt||null,stale:!!got.stale||!got.observedAt}:null;}catch{return null;}};
 const tradeFallback=async fallbackSignal=>{
   // A fresh per-visitor public tape avoids an RPC scan and its shared-provider budget.
   const publicTape=await browserTrades({chainId,pool,signal:fallbackSignal,fetcher});
   if(publicTape?.body?.trades?.length&&!publicTape.stale)return publicTape;
   const own=PROXY_CHAINS[String(chainId)]?await chainTrades({chainId,pool,token,quote,signal:fallbackSignal,fetcher}):null;
   return (own?.body?.trades?.length?own:null)||publicTape||own;
 };
 const panel=(kind,fallback)=>{
   let retained=null;
   return readHistoryPanel({primary:async s=>{const value=await read(kind,s);if(kind==='trades'&&value&&freshnessState(value).stale){retained={...value,stale:true};return null;}return value;},fallback,signal,delayMs:fallbackDelayMs,
     useful:value=>Array.isArray(value?.body?.[kind])&&(kind==='trades'?!value.stale||value.body[kind].length>0:value.body[kind].length>0)}).then(value=>value||retained);
 };
 const notify=patch=>{if(typeof onData==='function'&&!signal?.aborted)onData(patch);};
 const cP=panel('candles',candleFallback).then(c=>{if(c){const h=historyData(c,null,chainId,tf);notify({candles:h.candles,serverCandles:h.serverCandles,marketCoverage:{candles:h.marketCoverage.candles},historyFreshness:{candles:h.historyFreshness.candles}});}return c;});
 const tP=panel('trades',tradeFallback).then(t=>{if(t){const h=historyData(null,t,chainId,tf);notify({trades:h.trades,tradeCoverage:h.tradeCoverage,marketCoverage:{trades:h.marketCoverage.trades},historyFreshness:{trades:h.historyFreshness.trades}});}return t;});
 const [c,t]=await Promise.all([cP,tP]);
 if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
 return historyData(c,t,chainId,tf);
}
function historyData(c,t,chainId,tf){
 const rawTrades=t?.body.trades||[];
 const indexed=swapCandles(rawTrades.map(x=>({ts:Math.floor(x.ts/1000),price:x.priceUsd,quote:x.valueUsd})),tf);
 const candles=mergeSwapCandles(indexed,c?.body?.candles||[]),deep=candles.length>0;
 const newest=values=>values.filter(v=>Number.isFinite(v)&&v>0).reduce((a,b)=>Math.max(a,b),0)||null;
 // ux-tradingview: bars our own server routes answered (never browser/third-party reads), for the licensed chart.
 return {candles,serverCandles:c?.sameOrigin&&Array.isArray(c.body?.candles)?c.body.candles:null,tradeCoverage:t?.body.coverage||null,
  trades:rawTrades.map(x=>({id:x.tx+':'+(x.index??x.logIndex??'')+':'+(x.wallet||'')+':'+x.ts,logIndex:x.index??x.logIndex,ts:Math.floor(x.ts/1000),buy:x.side==='buy',price:x.priceUsd,token:x.amountToken,quote:x.valueUsd,trader:chainId==='solana'?(x.wallet||''):(x.wallet||'').toLowerCase(),tx:x.tx,pool:0})),
  marketCoverage:{candles:deep?'available':!c?'provider':'unavailable',trades:t?'available':'unavailable'},
  historyFreshness:{candles:{available:deep,observedAt:(c?c.observedAt:t?.observedAt)||null,stale:c?!!c.stale||!c.observedAt:!!t?.stale||!!t&&!t.observedAt,lastEventAt:newest(candles.map(x=>x.time*1000))},trades:{available:!!t,observedAt:t?.observedAt||null,stale:!!t?.stale,lastEventAt:newest(rawTrades.map(x=>x.ts))}}};
}
