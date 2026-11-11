// Public market context and device-local workspace state. No wallet requests,
// signatures or trading authority; execution remains in the guarded ticket.
import {freshnessState,safetyChecked} from './qx-terminal-data.mjs';
const EVM=/^0x[0-9a-f]{40}$/i,MINT=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const nonnegative=v=>finite(v)!==null&&v>=0?v:null;
const text=(v,max=80)=>typeof v==='string'?v.trim().slice(0,max):'';
const copy=v=>structuredClone(v);
export function workspaceAsset(raw) {
 if(!raw||typeof raw!=='object')return null;
 const chainId=String(raw.chainId||''),kind=raw.kind==='launch'||raw.controller?'launch':'external';
 if(!/^(?:[1-9]\d*|solana)$/.test(chainId))return null;
 const normalize=v=>chainId==='solana'?String(v||''):String(v||'').toLowerCase();
 const token=normalize(raw.token||raw.address),controller=kind==='launch'?normalize(raw.controller):null;
 if(kind==='launch'&&(chainId==='solana'||!EVM.test(controller)))return null;
 if(kind==='external'&&!(chainId==='solana'?MINT.test(token):EVM.test(token)))return null;
 if(token&&!(chainId==='solana'?MINT.test(token):EVM.test(token)))return null;
 return {kind,chainId,token:token||null,controller,key:(kind==='launch'?'m:':'t:')+chainId+':'+(controller||token),
  symbol:text(raw.symbol,20),name:text(raw.name,100),decimals:Number.isInteger(raw.decimals)&&raw.decimals>=0&&raw.decimals<=36?raw.decimals:null,
  priceUsd:nonnegative(raw.priceUsd),priceQuote:nonnegative(raw.priceQuote),quoteSymbol:text(raw.quoteSymbol,12),
  liquidityUsd:nonnegative(raw.liquidityUsd),change24:finite(raw.change24),
  receivedAt:Number.isSafeInteger(raw.receivedAt)&&raw.receivedAt>0?raw.receivedAt:null,
  observedAt:Number.isSafeInteger(raw.observedAt)&&raw.observedAt>0?raw.observedAt:null,stale:raw.stale===true,
  openedAt:Number.isSafeInteger(raw.openedAt)&&raw.openedAt>0?raw.openedAt:null};
}
export function sameWorkspaceSelection(a,b) {
 const x=workspaceAsset(a),y=workspaceAsset(b);
 return !!x&&!!y&&x.key===y.key&&a.revision===b.revision&&(!x.token||!y.token||x.token===y.token);
}
export function createWorkspaceMemory({storage,now=Date.now,key='qhooks:terminal:workspace:v1'}={}) {
 let recent=[],watched=[],persistent=true;
 try{const raw=storage?.getItem(key);if(raw&&raw.length<=100000){const parsed=JSON.parse(raw);if(parsed.version===1){recent=(Array.isArray(parsed.recent)?parsed.recent:[]).map(workspaceAsset).filter(Boolean).slice(0,32);watched=(Array.isArray(parsed.watched)?parsed.watched:[]).map(workspaceAsset).filter(Boolean).slice(0,64);}}}catch{persistent=false;}
 const unique=rows=>rows.filter((row,i)=>rows.findIndex(other=>other.key===row.key)===i);
 recent=unique(recent);watched=unique(watched);
 function save(){try{if(!storage?.setItem){persistent=false;return;}storage.setItem(key,JSON.stringify({version:1,recent,watched}));}catch{persistent=false;}}
 const api={
  remember(raw){const asset=workspaceAsset({...raw,openedAt:Number.isSafeInteger(raw?.openedAt)&&raw.openedAt>0?raw.openedAt:now()});if(!asset)return false;recent=[asset,...recent.filter(row=>row.key!==asset.key)].slice(0,32);watched=watched.map(row=>row.key===asset.key?{...asset,openedAt:row.openedAt}:row);save();return true;},
  watch(raw,on=true){const asset=workspaceAsset(raw);if(!asset)return false;const had=watched.some(row=>row.key===asset.key);watched=on?[asset,...watched.filter(row=>row.key!==asset.key)].slice(0,64):watched.filter(row=>row.key!==asset.key);if(had!==on)save();return on;},
  toggle(raw){const asset=workspaceAsset(raw);if(!asset)return false;return api.watch(asset,!api.has(asset));},
  has(raw){const asset=workspaceAsset(raw);return !!asset&&watched.some(row=>row.key===asset.key);},
  rows({mode='recent',chain='all',query=''}={}){const q=String(query).trim().toLowerCase();return copy((mode==='watch'?watched:recent).filter(row=>(chain==='all'||row.chainId===String(chain))&&(!q||[row.symbol,row.name,row.token,row.controller,row.chainId].some(v=>String(v||'').toLowerCase().includes(q)))));},
  snapshot:()=>({recent:copy(recent),watched:copy(watched),persistent}),
 };return Object.freeze(api);
}
// One ordered result model drives both the Recent/Watch rail and its keyboard
// cursor. Listed native matches remain discoverable before their first visit.
export function workspaceSearchRows({query='',chain='all',launches=[],external=[],saved=[]}={}){
 const q=String(query).trim().toLowerCase(),onChain=row=>chain==='all'||row.chainId===String(chain);
 const matchesQuery=row=>!q||[row.symbol,row.name,row.token,row.controller,row.chainId].some(value=>String(value||'').toLowerCase().includes(q));
 const local=(Array.isArray(saved)?saved:[]).map(workspaceAsset).filter(row=>row&&onChain(row)&&matchesQuery(row)).map(row=>({...row,origin:'saved'}));
 if(q.length<2)return{matches:[],saved:local,rows:local};
 const listed=(Array.isArray(launches)?launches:[]).filter(row=>row?.live).map(row=>{
  const price=finite(row.summary?.price)>0?row.summary.price:null;
  const asset=workspaceAsset({kind:'launch',chainId:row.chainId,controller:row.controller,token:row.token,name:row.name,symbol:row.symbol,
   priceQuote:price,priceUsd:/^(?:USD|USDC|USDT)$/i.test(row.quoteSymbol||'')?price:null,quoteSymbol:row.quoteSymbol,change24:row.summary?.change24});
  return asset?{...asset,origin:'listed',launchedAt:Number.isSafeInteger(row.launchedAt)?row.launchedAt:0}:null;
 }).filter(row=>row&&onChain(row)&&matchesQuery(row)).sort((a,b)=>b.launchedAt-a.launchedAt);
 const outside=(Array.isArray(external)?external:[]).flatMap(row=>{
  const asset=workspaceAsset({...row,kind:'external',controller:null,token:row?.address||row?.token});
  return asset&&onChain(asset)?[{...row,...asset,address:asset.token,origin:'search'}]:[];
 });
 const seenKeys=new Set(),seenTokens=new Set();
 const unique=rows=>rows.filter(row=>{
  const tokenKey=row.token?row.chainId+':'+row.token:null;
  if(seenKeys.has(row.key)||tokenKey&&seenTokens.has(tokenKey))return false;
  seenKeys.add(row.key);if(tokenKey)seenTokens.add(tokenKey);return true;
 });
 const matches=unique([...listed,...outside]),remaining=unique(local);
 return{matches,saved:remaining,rows:[...matches,...remaining]};
}
// The workspace search owns its read revision, independently of trade selection.
// When the server search fails or finds nothing, the visitor's browser searches the providers itself.
const defaultBrowserSearch=opts=>import('./qx-browser-market.mjs').then(m=>m.browserSearch(opts));
export function createWorkspaceSearch({fetchImpl=globalThis.fetch,onChange=()=>{},delay=350,setTimer=setTimeout,clearTimer=clearTimeout,browserSearch=defaultBrowserSearch}={}) {
 let revision=0,timer=null,controller=null,value={query:'',chain:'all',status:'idle',results:[],error:null};
 const snapshot=()=>copy(value),publish=()=>onChange(snapshot());
 async function read(mine,query,chain,signal){
  try{
   let rows=null;
   try{const response=await fetchImpl('/api/terminal/x/search?'+new URLSearchParams({q:query,...(chain!=='all'?{chain}:{})}),{cache:'no-store',signal});
    if(response.ok){const body=await response.json();if(Array.isArray(body?.results))rows=body.results;}}catch(error){if(signal?.aborted)throw error;}
   if(mine!==revision)return false;
   if(!rows?.length&&browserSearch){const own=await browserSearch({q:query,chain,signal}).catch(()=>null);if(mine!==revision)return false;if(Array.isArray(own)&&own.length)rows=own;}
   if(!rows)throw Error('Token search is unavailable.');
   const results=rows.flatMap(row=>{const asset=workspaceAsset({...row,kind:'external',token:row?.address});return asset&&(chain==='all'||asset.chainId===chain)?[{...row,address:asset.token,chainId:asset.chainId}]:[];});
   value={query,chain,status:'received',results,error:null};publish();return true;
  }catch(error){if(mine!==revision)return false;value={query,chain,status:'error',results:[],error:text(error?.message||error,180)};publish();return false;}
 }
 const api={
  search(rawQuery,rawChain='all'){
   const query=String(rawQuery||'').trim(),chain=String(rawChain),mine=++revision;
   clearTimer(timer);controller?.abort();controller=null;timer=null;
   value={query,chain,status:query.length>=2?'loading':'idle',results:[],error:null};publish();
   if(query.length<2)return false;
   controller=new AbortController();const signal=controller.signal;
   timer=setTimer(()=>{timer=null;read(mine,query,chain,signal);},delay);return true;
  },
  retry(){return api.search(value.query,value.chain);},snapshot,
  dispose(){revision++;clearTimer(timer);controller?.abort();timer=null;controller=null;},
 };return Object.freeze(api);
}
export function riskEvidence(raw,{receivedAt=null,pending=false,error=null,native=false}={}) {
 const verdict=raw?.verdict||({clear:'ok'}[raw?.level]||raw?.level),reportedChecks=Array.isArray(raw?.checks)?raw.checks.filter(v=>v&&typeof v.title==='string'):[],flags=Array.isArray(raw?.flags)?raw.flags.filter(v=>typeof v==='string').slice(0,8):reportedChecks.filter(v=>v.status==='danger'||v.status==='caution').map(v=>text(v.title,120)).slice(0,8);
 const source=text(raw?.source,100)||(native?'RepoProof via QHooks':null);
 const providerTime=[raw?.checkedAt,raw?.observedAt,raw?.scannedAt,raw?.retrievedAt,raw?.at].find(v=>typeof v==='string'||Number.isSafeInteger(v));
 const stamp=typeof providerTime==='number'?(providerTime<1e12?providerTime*1000:providerTime):typeof providerTime==='string'?Date.parse(providerTime):NaN;
 const asOf=Number.isFinite(stamp)&&stamp>0&&Number.isFinite(new Date(stamp).getTime())?stamp:null;
 const coverage=[];
 if(typeof raw?.honeypot==='boolean')coverage.push('Honeypot flag');
 if(raw?.buyTax!=null||raw?.sellTax!=null)coverage.push('Provider tax report');
 if(Array.isArray(raw?.flags))coverage.push('Returned token flags');
 if(Array.isArray(raw?.checks))coverage.push(reportedChecks.length+' reported pre-buy checks');
 if(Array.isArray(raw?.coverage))coverage.push(...raw.coverage.filter(v=>typeof v==='string').map(v=>text(v,100)));
 // 2026-11-10: "Refreshing checks…" is only for a check that is really in flight; a check that was never run, a chain
 // without automated checks and a failed read each get a final state (copy rule: no "unavailable").
 const inFlight=['queued','running','pending','checking'].includes(raw?.state)||Number.isSafeInteger(raw?.retryAt)&&raw.retryAt>Date.now();
 const status=pending&&!raw?'pending':raw?.unsupported?'unsupported':raw?.state==='not_checked'?'not_checked':(!raw||raw.unavailable)&&inFlight?'stale':!raw||raw.unavailable?'unavailable':verdict==='danger'?'danger':verdict==='caution'||flags.length?'caution':error||raw.stale?'stale':verdict==='ok'&&safetyChecked(raw)?'limited':'unknown';
 const headline={pending:'Checking available signals',unavailable:'Checks paused · retry',not_checked:'Not checked yet',unsupported:'No automated checks on this chain yet',danger:'High-risk signals returned',caution:'Review the reported flags',limited:'No flags returned by available checks',stale:'Refreshing checks…',unknown:'No verdict returned'}[status];
 return {status,headline,flags,source,asOf,refreshError:error?text(error.message||error,180):null,receivedAt:Number.isSafeInteger(receivedAt)?receivedAt:null,
  coverage:[...new Set(coverage)],coverageText:coverage.length?[...new Set(coverage)].join(' · '):native?'Pre-buy endpoint; coverage not reported':'Provider coverage not reported',
  detail:error?text(error.message||error,180):text(raw?.headline||raw?.detail,180)||null};
}
// A display projection only. Index coverage is independent of ticket readiness
// and HTTP receipt time; raw prices, rows and financial state stay untouched.
export function nativeMarketView(market,{now=Date.now()}={}) {
 if(!market||market.ext)return null;
 const whole=v=>Number.isSafeInteger(v)&&v>=0,record=v=>v&&typeof v==='object'&&!Array.isArray(v),missing=[];
 const validAmount=v=>nonnegative(v)!==null;
 function rows(field,label,valid){
  const raw=market[field];if(!Array.isArray(raw)){missing.push(label);return [];}
  const kept=raw.filter(row=>record(row)&&valid(row));if(kept.length!==raw.length)missing.push(label);return copy(kept);
 }
 const candles=rows('candles','chart',r=>whole(r.time)&&['open','high','low','close','volume'].every(k=>validAmount(r[k])));
 const trades=rows('trades','trades',r=>whole(r.ts)&&whole(r.pool)&&[0,1,true,false].includes(r.buy)&&['price','token','quote'].every(k=>validAmount(r[k]))&&/^0x[0-9a-f]{64}$/i.test(r.tx)&&(r.trader==null||EVM.test(r.trader)));
 const holders=rows('holders','holders',r=>EVM.test(r.holder)&&validAmount(r.units));
 const traders=rows('traders','traders',r=>EVM.test(r.trader)&&whole(r.n)&&whole(r.last)&&['bought','sold','spent','received','balance'].every(k=>validAmount(r[k])));
 const raw=record(market.summary)?market.summary:{},summary=copy(raw),counts=['trades24','buys24','sells24','traders24','holders'];
 let summaryValid=record(market.summary);
 for(const field of ['volume24','top10','burned','locked','supply',...counts]){
  const valid=counts.includes(field)?whole(raw[field]):validAmount(raw[field]);
  if(!valid){summary[field]=null;summaryValid=false;}
 }
 const hasTraded=whole(raw.lastTradeAt)&&raw.lastTradeAt>0;
 if(raw.lastTradeAt!==null&&!hasTraded)summaryValid=false;
 if(!hasTraded&&(trades.length||candles.length||summary.trades24>0)||hasTraded&&!trades.length||summary.holders>0&&!holders.length)summaryValid=false;
 if(summary.buys24!==null&&summary.sells24!==null&&summary.trades24!==summary.buys24+summary.sells24)summaryValid=false;
 for(const field of ['price','mcap','change24']){
  const valid=field==='change24'?finite(raw[field])!==null:validAmount(raw[field]);
  if(!valid)summaryValid=false;
  // Before the first trade, a price read from the pool itself (raw.priceFromPool) is still shown.
  summary[field]=(hasTraded||raw.priceFromPool===true&&field!=='change24')&&valid?raw[field]:null;
 }
 if(!summaryValid)missing.push('summary');
 const sync=market.synced,indexedAt=whole(sync?.at)&&sync.at>0&&sync.at<=now+5000?sync.at:null;
 const behind=whole(sync?.behind)?sync.behind:null,gaps=whole(sync?.gaps)?sync.gaps:null;
 const indexedBlock=whole(sync?.block)?sync.block:null,head=whole(sync?.head)?sync.head:null;
 if(behind===null||gaps===null||indexedBlock===null||head===null||head<indexedBlock)missing.push('index coverage');
 const complete=!!indexedAt&&behind===0&&gaps===0&&missing.length===0,stale=!!indexedAt&&now-indexedAt>45000;
 const status=!indexedAt?'pending':gaps>0||missing.length?'partial':stale?'stale':behind>0?'syncing':'ready';
 // An incomplete address/log scan cannot establish absence. Positive observed
 // values and valid rows are still useful; zero counts await complete coverage.
 if(!complete)for(const field of ['volume24','top10','burned','locked',...counts])if(summary[field]===0)summary[field]=null;
 const note=status==='pending'?'Refreshing':
  status==='syncing'?'Refreshing':
  status==='partial'?'Refreshing…':
  status==='stale'?'Refreshing…':
  'Live · updated just now.';
 const noTradesYet=status==='ready'&&!hasTraded&&!trades.length&&!candles.length&&summary.trades24===0;
 const emptyText=noTradesYet?'No swaps yet. The chart starts with the first trade.':status==='ready'?'No trades in this window yet.':
  status==='pending'?'Reading this launch’s market history…':status==='syncing'?'Reading market history… Activity may still be arriving.':
  status==='stale'?'Refreshing trades…':'Refreshing trades…';
 return {status,note,summary,candles,trades,holders,traders,indexedAt,indexedBlock,head,behind,gaps,complete,stale,hasTraded,noTradesYet,emptyText,missing:[...new Set(missing)]};
}
export function marketHealth({market,loading=false,error=null,receivedAt=null,parts={},now=Date.now()}={}) {
 if(!market)return {status:loading?'loading':'unavailable',headline:loading?'Loading selected market':'Refreshing market data…',missing:[],receivedAt:null,source:null};
 if(!market.ext){
  const native=nativeMarketView(market,{now});
  return {status:error?'error':loading?'refreshing':native.status==='ready'?'received':native.status,
   headline:error?'Refresh failed; last received data remains visible':loading?'Refreshing selected market':native.note,
   missing:native.missing,receivedAt:Number.isSafeInteger(receivedAt)?receivedAt:null,source:'QHooks launch index',indexedAt:native.indexedAt,nativeStatus:native.status};
 }
 const summary=market.summary||{},missing=[];
 for(const [field,label] of [['price','price'],['liquidity','liquidity'],['volume24','24h volume']])if(nonnegative(summary[field])===null)missing.push(label);
 for(const [field,label] of [['candles','chart'],['trades','trades']])if(parts[field]&&parts[field]!=='available'&&parts[field]!=='provider')missing.push(label); // 'provider': the provider chart is shown on purpose
 const source=text(market.token?.source||market.source,100)||(!market.ext?'QHooks launch index':null);
 const fresh=freshnessState(market.token||market,now,{fresh:'Live · '});
 return {status:error?'error':fresh.stale?'stale':loading?'refreshing':missing.length?'partial':fresh.observedAt?'received':'unknown',
  headline:error?'Refresh failed; last data remains visible':loading?'Refreshing selected market':fresh.label,
  missing,receivedAt:Number.isSafeInteger(receivedAt)?receivedAt:null,source,observedAt:fresh.observedAt,stale:fresh.stale,freshnessLabel:fresh.label};
}
export function createMarketWorkspace({getSelection,isBusy=()=>false,now=Date.now,onChange=()=>{},onRetry=()=>{},onBlocked=()=>{}}) {
 let value={selection:null,market:null,loading:false,error:null,receivedAt:null,parts:{},risk:null,riskPending:false,riskError:null,riskReceivedAt:null};
 const active=selection=>sameWorkspaceSelection(selection,getSelection());
 const notify=()=>onChange(api.snapshot());
 const api={
  start(selection){if(!active(selection))return false;value={selection:copy(selection),market:null,loading:true,error:null,receivedAt:null,parts:{},risk:null,riskPending:true,riskError:null,riskReceivedAt:null};notify();return true;},
  clear(){value={selection:null,market:null,loading:false,error:null,receivedAt:null,parts:{},risk:null,riskPending:false,riskError:null,riskReceivedAt:null};notify();},
  refreshing(selection){if(!active(selection))return false;value={...value,selection:copy(getSelection()),loading:true,error:null,riskPending:true};notify();return true;},
  receiveMarket(selection,market,parts={}){if(!active(selection))return false;const selected=workspaceAsset(getSelection()),token=market?.meta?.token;
   if(!market||!selected||String(market.meta?.chainId)!==selected.chainId||(selected.token&&token!==selected.token))return false;
   value={...value,selection:copy(getSelection()),market:copy(market),loading:false,error:null,receivedAt:now(),parts:copy(parts)};notify();return true;},
  failMarket(selection,error){if(!active(selection))return false;value={...value,loading:false,error:text(error?.message||String(error),180)};notify();return true;},
  receiveRisk(selection,risk){if(!active(selection))return false;const selected=workspaceAsset(getSelection());if(risk?.address&&risk.address!==selected.token||risk?.chainId!=null&&String(risk.chainId)!==selected.chainId)return false;
   value={...value,risk:copy(risk),riskPending:false,riskError:null,riskReceivedAt:now()};notify();return true;},
  failRisk(selection,error){if(!active(selection))return false;value={...value,riskPending:false,riskError:text(error?.message||String(error),180)};notify();return true;},
  async retry(){if(!value.selection||!active(value.selection))return false;if(isBusy()){onBlocked();return false;}return onRetry(copy(getSelection()));},
  snapshot(){return {...copy(value),health:marketHealth({...value,now:now()}),checks:riskEvidence(value.risk,{receivedAt:value.riskReceivedAt,pending:value.riskPending,error:value.riskError,native:value.selection?.kind==='launch'})};},
 };return Object.freeze(api);
}
export const workspaceSource=value=>({geckoterminal:'GeckoTerminal',coingecko:'CoinGecko',goplus:'GoPlus',rugcheck:'RugCheck',repoproof:'RepoProof'}[value]||value||'Source not reported');
const clock=value=>value?new Date(value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC'})+' UTC':null;
const providerClock=value=>value?new Date(value).toISOString().slice(0,19).replace('T',' ')+' UTC':null;
export function workspaceLinks(selection) {
 const asset=workspaceAsset(selection);if(!asset)return null;
 const hash=asset.kind==='launch'?'#m='+asset.chainId+':'+asset.controller:'#t='+asset.chainId+':'+asset.token;
 return {board:'/board'+hash,call:'/board?intent=call'+hash};
}
export function renderWorkspaceContext({h,selection,snapshot,chainName=id=>id,onRetry=()=>{},onCopy=()=>{}}) {
 const asset=workspaceAsset(selection),health=snapshot.health,checks=snapshot.checks;
 if(!asset)return {identity:h('p',{class:'qxt-context-empty'},'Open a token to build your trading workspace.'),data:h('p',{class:'qxt-context-empty'},'Market data, coverage and community stay with the selected token.'),checks:null};
 const address=asset.token||asset.controller,links=workspaceLinks(asset),route=asset.kind==='launch'?'QHooks pool':asset.chainId==='solana'?'Jupiter route':'0x route';
 const identity=h('div',{class:'qxt-identity-context'},
  h('span',{class:'qxt-chain-label'},chainName(asset.chainId)),h('span',{class:'qxt-route-label'},route),
  h('span',{class:'qxt-contract-kind'},asset.token?'Token contract':'Launch contract'),h('code',{class:'qxt-contract',title:address},address),
  h('button',{type:'button',class:'qxt-context-action',ariaLabel:'Copy contract '+address,onclick:()=>onCopy(address)},'Copy'),
  h('a',{class:'qxt-context-action',href:links.board},'Board'),h('a',{class:'qxt-context-action qxt-call-action',href:links.call},'Make a call'));
 const indexed=clock(health.indexedAt),data=h('div',{class:'qxt-data-health '+health.status,role:'status'},
  h('span',{class:'qxt-status-dot',ariaHidden:'true'}),h('span',{class:'qxt-data-health-copy'},h('b',{},health.headline),h('small',{},[indexed?'Indexed '+indexed:'',health.freshnessLabel&&health.freshnessLabel!==health.headline?health.freshnessLabel:''].filter(Boolean).join(' · '))),
  h('button',{type:'button',class:'qxt-context-action',disabled:!!snapshot.loading,onclick:onRetry},snapshot.loading?'Reading…':'Refresh data'));
 if(health.missing.length){const list=health.missing.length>1?health.missing.slice(0,-1).join(', ')+' and '+health.missing.at(-1):health.missing[0];data.append(h('span',{class:'qxt-coverage-gap'},'Refreshing '+list+'\u2026'));}
 const details=h('details',{class:'qxt-market-checks '+checks.status},h('summary',{},h('span',{},'Market checks'),h('b',{},checks.headline)),
  h('div',{class:'qxt-checks-body'},h('dl',{},
   h('div',{},h('dt',{},'Source'),h('dd',{},workspaceSource(checks.source))),
   h('div',{},h('dt',{},'Provider as-of'),h('dd',{},providerClock(checks.asOf)||'Time not reported')),
   h('div',{},h('dt',{},'Response'),h('dd',{},clock(checks.receivedAt)||'Not received')),
   h('div',{},h('dt',{},'Coverage'),h('dd',{},checks.coverageText))),
   checks.detail?h('p',{class:'qxt-checks-note'},checks.detail):null,
   checks.flags.length?h('ul',{},...checks.flags.map(flag=>h('li',{},flag))):null,
   checks.refreshError?h('p',{class:'qxt-checks-note'},'Checks paused. Use Refresh data to retry.'):null,
   checks.status==='not_checked'||checks.status==='unsupported'?h('p',{class:'qxt-checks-note'},h('a',{href:'https://repoproof.online/proof',target:'_blank',rel:'noopener'},'Run a full check on RepoProof ↗')):null,
   h('p',{class:'qxt-checks-note'},'A returned check describes its reported coverage. Review the token controls, liquidity and quoted costs alongside it.')));
 return {identity,data,checks:details};
}
