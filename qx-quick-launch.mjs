import {mountAnyTokenPicker,ANY_TOKEN_NOTE} from './qx-launch-any-token.mjs';
import {appendArbRecaptureLine} from './qx-create-display.mjs';
import {readLaunchPrefill,launchPostLink} from './qx-launch-prefill.mjs';
// Quick launch and launch-idea cards on /create. An extra path beside the guided flow, which it never changes.
// One transaction: QSimpleLaunch.launch with the card's preset. The person types name and ticker and picks an image.
import {checkTicker,assertTickerFree,TickerTaken,tickerBlockNodes} from '/qx-ticker-guard.mjs';
import {chainById,visibleChains} from './chains.mjs';
import {getWalletHub} from './wallet-hub-fresh.mjs';
import {CREATE_EXECUTION_ENABLED,CREATE_EXECUTION_HOLD} from './qx-create-release.mjs';
import {readCreateNativeUSD} from './qx-create-prices.mjs';
import {launchError} from './qx-create-plan.mjs';
import {quoteNextChain,recheckNextChain} from './full-launch/packages/multichain/fees.mjs';
import {quoteBaseCall,recheckBaseCall} from './qx-base-call-fees.mjs';
const quoteCall=a=>String(a.chainId)==='8453'?quoteBaseCall(a):quoteNextChain(a),recheckCall=(chainId,a)=>String(chainId)==='8453'?recheckBaseCall(a):recheckNextChain(a);
import {startCapFactory,START_TIERS,START_STEPS_MAX,stepsForUsd,capAtSteps,startAtCall,readStartAt,usdShort} from './qx-quick-launch-core.mjs';
import {pqFactory,primeCleanFactory} from './qx-quick-launch-core.mjs';
import {multiFactory,multiQuotes,primeMultiFactory,multiLive,alignTick,poolWeights} from './qx-quick-launch-core.mjs';
import {pairsFactory,pairQuotes,primePairsFactory,pairsLive,pairStartAtCall,readPairStartAt,usdFromSqrt} from './qx-quick-launch-core.mjs';
import {mountAccountQuantum} from './qx-account-quantum-control.mjs';
import {ideaCards,ideaCard,visibleGroups,quickFactory,encodeQuickLaunch,validateQuick,launchFeeWei,quickCost,ethText,launchedToken,marketPath,randomSalt,PLANNING_GAS,META_LIMIT} from './qx-quick-launch-core.mjs';

const $=id=>document.getElementById('qq-'+id),hub=getWalletHub(window),LAST='qhooks:create:quick:v1';
const el=(tag,attrs={},...kids)=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k in n)n[k]=v;else n.setAttribute(k,v);}n.append(...kids.filter(x=>x!=null));return n;};
const SVG='http://www.w3.org/2000/svg';
// Line icons per block, drawn in currentColor. Each icon carries the block's name for screen readers and on hover.
const PATHS={
 antiSnipe:'M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z',walletCap:'M4 7h14a2 2 0 012 2v8a2 2 0 01-2 2H4zM4 7l11-3v3M16 13h2',
 cooldown:'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',sandwich:'M4 8h16M4 12h16M4 16h16',exitClock:'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9',
 stormFee:'M3 15l4-6 4 4 4-8 6 10',sessionFee:'M12 3v2M12 19v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M3 12h2M19 12h2M12 8a4 4 0 100 8 4 4 0 000-8z',
 tax:'M6 18L18 6M7.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',referrals:'M9 15l6-6M8 11l-2 2a3 3 0 004 4l2-2M16 13l2-2a3 3 0 00-4-4l-2 2',
 autoBurn:'M12 3c1 3 5 5 5 10a5 5 0 01-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z',buyback:'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4',
 king:'M4 18h16M5 18l-1-10 5 4 3-6 3 6 5-4-1 10',clockPot:'M9 3h6M12 8v5M12 6a7 7 0 100 14 7 7 0 000-14z',points:'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z'};
function icon(block){const s=document.createElementNS(SVG,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');
 const p=document.createElementNS(SVG,'path');p.setAttribute('d',PATHS[block.id]||'M12 12h.01');s.append(p);return el('span',{class:'qq-icon',title:block.name,role:'img','aria-label':block.name},s);}

const QUICK_CHAIN='4663';
let taken=null,tickerRun=0,tickerTimer=0;
let costError='',chainId=null,group='all',pick=null,image='',cost=null,costRun=0,busy=false,usd=null,feeRead=new Map();
const chainSelect=document.getElementById('qc-chainId');
// One-tap has its own chain picker (2026-11-09): ?chain= wins over the wallet's network and over the guided form
// (which an unfinished guided launch can lock to another chain). Launch asks the wallet to switch (adding the chain if needed).
const urlChain=()=>new URLSearchParams(location.search).get('chain');
let quickChain=null,solQuickPrevious=null;
const currentChain=()=>quickChain||chainSelect?.value||urlChain()||'4663';
const quickChains=()=>[...visibleChains().filter(c=>ideaCards(c.id).length),{id:'solana',name:'Solana',native:'SOL'}];
function setQuickChain(id){const wasSol=quickChain==='solana';if(id!==currentChain()){extraPools=[];poolPrices=null;pairIdx=0;}quickChain=id;if(id==='solana'||wasSol)document.dispatchEvent(new CustomEvent('qhooks:sol-create',{detail:{chain:id}}));try{const u=new URL(location.href);u.searchParams.set('chain',id);history.replaceState(history.state,'',u);}catch{}
 renderIdeas();if(pick)openQuick(pick.id);checkTickerSoon();costSoon();}
function renderPicker(){
 let sel=$('chain');
 if(!sel){const label=el('label',{class:'qq-chain'},el('span',{},'Chain'));sel=el('select',{id:'qq-chain','aria-label':'Chain for one-tap launch'});label.append(sel);$('chips').before(label);
  sel.addEventListener('change',()=>setQuickChain(sel.value));}
 const list=quickChains(),want=chainId;
 if(sel.options.length!==list.length||[...sel.options].some((o,i)=>o.value!==list[i].id))sel.replaceChildren(...list.map(c=>el('option',{value:c.id},c.name+' · '+c.native)));
 if(list.some(c=>c.id===want))sel.value=want;
}
const note=(text,error=false)=>{$('message').textContent=text;$('message').dataset.error=String(error);};
// Anti-copycat ticker block: a ticker already launched through QHooks is refused before the wallet opens.
const noteNodes=(nodes,error=true)=>{$('message').replaceChildren(...nodes);$('message').dataset.error=String(error);};
function showTaken(r){taken=r;noteNodes(tickerBlockNodes(r));}
function checkTickerSoon(){clearTimeout(tickerTimer);const run=++tickerRun;tickerTimer=setTimeout(async()=>{
 const symbol=$('symbol').value.trim(),owner=hub.snapshot().current?.owner||'';if(!pick||!symbol){taken=null;renderQuick();return;}
 const r=await checkTicker({symbol,chainId,creator:owner});if(run!==tickerRun)return;
 if(!r.available)showTaken(r);else if(taken){taken=null;note('');}renderQuick();},350);}

// USD for the cost line in the chain's own coin (ETH, BNB, HYPE): the price of the selected chain, read again on change.
let usdFor=null;function readUsd(){const id=currentChain(),sym=chainById(id)?.native||'ETH';if(usdFor===id)return;usdFor=id;usd=null;
 void readCreateNativeUSD(sym).then(v=>{if(usdFor===id){usd=v;renderQuick();}}).catch(()=>{});}
function renderIdeas(){chainId=currentChain();renderPicker();if(chainId==='solana'){if(pick)solQuickPrevious=pick;pick=null;cost=null;costRun++;clearTimeout(costTimer);clearTimeout(tickerTimer);tickerRun++;$('chips').replaceChildren();$('cards').replaceChildren();$('none').hidden=true;$('quick').hidden=true;$('open').hidden=true;return;}if(!pick&&solQuickPrevious){pick=ideaCard(chainId,solQuickPrevious.id);solQuickPrevious=null;}readUsd();
 // Clean-token launch contract: once it has code on this chain, new launches go to it (redraw once when it switches).
 {const id=chainId;primeClean(id).then(r=>{if(r.changed&&id===chainId){costRun++;cost=null;renderIdeas();if(pick)void refreshCost();}}).catch(()=>{});}
 // Pairs launch contract (Robinhood): the pair picker appears once it has code on this chain.
 {const id=chainId;primePairs(id).then(r=>{if(r.changed&&id===chainId&&pick){renderPair();renderStart();renderQuick();}}).catch(()=>{});}
 {const id=chainId;primeMulti(id).then(r=>{if(r.changed&&id===chainId){renderIdeas();if(pick){renderPair();void readStartBase();renderStart();renderPq();renderQuick();costSoon();}}}).catch(()=>{});}
 chainId=currentChain();const own=ideaCards(chainId),offChain=!own.length,cards=offChain?ideaCards(QUICK_CHAIN).filter(card=>card.id!=='arb-burns'):own,groups=visibleGroups(cards),c=chainById(chainId);
 if(!groups.some(([id])=>id===group))group='all';
 $('chips').replaceChildren(...groups.map(([id,label])=>{const b=el('button',{type:'button','aria-pressed':String(id===group),'data-group':id},label);b.addEventListener('click',()=>{group=id;renderIdeas();});return b;}));
 $('chips').hidden=!cards.length;
 $('cards').replaceChildren(...cards.map(card=>{
  const btn=el('button',{type:'button',class:'qq-launch-card','data-launch':card.id},'Launch this');btn.addEventListener('click',()=>launchCard(card.id));
  const blocks=card.blocks.length?el('div',{class:'qq-blocks'},...card.blocks.map(icon)):el('div',{class:'qq-blocks qq-blocks-none'},el('span',{},'No extra rules'));
  return el('article',{class:'qq-card','data-card':card.id,'data-group':card.group,hidden:group!=='all'&&card.group!==group},
   el('h3',{},card.name),card.chip?el('span',{class:'qq-chip'},card.chip):null,el('p',{class:'qq-what'},card.what),el('p',{class:'qq-why'},card.why),blocks,btn);
 }));
 // Off Robinhood Chain the cards stay visible (lead, 2026-11-08); "Launch this" switches the chain first.
 $('none').hidden=!offChain;$('use-robinhood').hidden=true;$('open').hidden=false;
 if(offChain)$('none-text').textContent='One-tap launches run on Robinhood Chain';
 if(pick&&!ideaCard(chainId,pick.id)){pick=null;$('quick').hidden=true;}
}

// A card picked while another chain is selected: switch the page to Robinhood Chain, then open that card.
function launchCard(id){
 if(!ideaCards(currentChain()).length){setQuickChain(QUICK_CHAIN);}
 openQuick(id,{scroll:true});
}

// ---- Starting market cap (start-cap generation only; DESIGN.md §6) ----
// Standard keeps today's start. A higher start costs bundlers and snipers more; the price can't fall below it.
// Randall 2026-11-08: Elysium launches default to the Floor start (~$20K).
const DEFAULT_TIER={'99901':'floor'};
let startTier='standard',startSteps=0,startBase=null,startRun=0,startRetry=null;
/// Floor/High are USD targets: without a live USD price their steps can't be known, so launching waits ("Refreshing price…").
const priceBlocked=()=>startCapOn()&&(startTier==='floor'||startTier==='high')&&!startBase?.usd;
const startCapOn=()=>!!curPair()||multiOn()||!!startCapFactory(chainId);
// ---- Pair (Robinhood Chain, pairs launch contract only) ----
// 0 = the chain's standard quote (WETH). Stakers' share stays on ETH (the contract refuses it on a pair).
let pairIdx=0;
// Stock-token pairs are not offered to US visitors (Robinhood stock tokens aren't available to US persons). Country from the
// Worker (/api/geo, Cloudflare's geolocation). Fail closed: until it answers, or when it can't tell, only USDG is offered.
let geo={country:null,read:false};
function readGeo(){if(geo.read)return;geo.read=true;fetch('/api/geo',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{const c=typeof j?.country==='string'&&/^[A-Z]{2}$/.test(j.country)?j.country:null;if(c!==geo.country){geo.country=c;if(pick){renderPair();renderQuick();}}}).catch(()=>{});}
const stocksOk=()=>!!geo.country&&geo.country!=='US';
const offeredPairs=()=>(multiLive(chainId)?multiQuotes(chainId):pairQuotes(chainId)).filter(q=>q.risk!=='stock'||stocksOk());
const curPair=()=>pairIdx&&pick&&pick.style!=='flywheel'&&(multiLive(chainId)||pairsLive(chainId))?offeredPairs().find(q=>q.index===pairIdx)||null:null;
const pairFactory=()=>multiLive(chainId)?multiFactory(chainId):pairsFactory(chainId);
const launchFactory=()=>multiOn()?multiFactory(chainId):curPair()?pairFactory():quickFactory(chainId);
const pqOnChain=()=>multiOn()||!!curPair()||pqFactory(chainId);
const RISK={stable:s=>s+' is a dollar stablecoin. Its issuer can freeze any address, this pool included, and can pause it. Either one stops trading in this pool.',
 stock:s=>s+' is a Robinhood stock token. Its issuer can block any address, this pool included, pause the token, burn from any holder, and apply splits. Blocking or pausing stops trading in this pool. Stock tokens are not offered to US persons.'};
function renderPair(){
 readGeo();let box=$('pair');const list=offeredPairs(),hiddenStocks=geo.country==='US'&&pairQuotes(chainId).some(q=>q.risk==='stock');
 if(!pick||!list.length||!multiLive(chainId)&&!pairsLive(chainId)){box?.remove();renderPools();return;}
 if(!box){box=el('div',{id:'qq-pair',class:'qq-startcap qq-pair'});$('style-blocks').after(box);}
 if(pick.style==='flywheel'){box.replaceChildren(el('p',{class:'qq-start-k'},'Pair with'),el('p',{class:'qq-start-note'},'Stakers’ share launches pair with ETH. Pick another idea to pair with USDG or a stock token.'));renderPools();return;}
 const opt=(idx,label)=>{const b=el('button',{type:'button',class:'qq-start-opt','aria-pressed':String(idx===pairIdx),'data-pair':String(idx)},label+(idx===pairIdx&&multiLive(chainId)?' · '+poolWeights(extraPools.length)[0]/100+'%':''));
  b.addEventListener('click',()=>{if(busy)return;pairIdx=idx;extraPools=extraPools.filter(i=>i!==idx);poolPrices=null;renderPair();void readStartBase();renderStart();renderPq();renderQuick();costSoon();});return b;};
 if(pairIdx&&!list.some(q=>q.index===pairIdx)){pairIdx=0;void readStartBase();renderStart();costSoon();} // not offered here: back to ETH
 renderPools();const p=curPair(),kids=[el('p',{class:'qq-start-k'},'Pair with'),el('div',{class:'qq-start-opts',role:'group','aria-label':'Pair with'},opt(0,chainById(chainId).quote.symbol.replace(/^W/,'')),...list.map(q=>opt(q.index,q.symbol)))];
 if(hiddenStocks)kids.push(el('p',{class:'qq-start-note',id:'qq-pair-region'},'Stock-token pairs aren’t available in your region.'));
 if(p){const native=chainById(chainId).native,line='Buyers pay in '+p.symbol+'. The terminal also takes '+native+(p.risk==='weth'?'.':' and routes it through '+(p.risk==='stock'?'USDG and '+p.symbol:p.symbol)+'.');kids.push(el('p',{class:'qq-start-note'},line));if(RISK[p.risk])kids.push(el('p',{class:'qq-start-note qq-pair-risk'},RISK[p.risk](p.symbol)));}
 box.replaceChildren(...kids);renderPools();
}
async function readStartBase(){
 const run=++startRun,c=chainById(chainId);startBase=null;
 try{
  const p=curPair();
  if(p){const r=readPairStartAt(await rpc('eth_call',[{to:pairFactory(),data:pairStartAtCall(p.index,0)},'latest']));if(!r)throw Error('no start');
   const cap=Number(r.startCapWei)/10**p.decimals,each=await quoteUsd(p).catch(()=>null);
   if(run===startRun)startBase={cap,unit:p.symbol,usd:each>0?cap*each:null};
  }else{
  const r=multiLive(chainId)?readPairStartAt(await rpc('eth_call',[{to:multiFactory(chainId),data:pairStartAtCall(0,0)},'latest'])):readStartAt(await rpc('eth_call',[{to:startCapFactory(chainId),data:startAtCall(0)},'latest']));if(!r)throw Error('no start');
  const q=c.quote?.symbol||'',usd=/USD/.test(q)?1:await readCreateNativeUSD(q.replace(/^W/,'')).catch(()=>null);
  const cap=Number(r.startCapWei)/10**(c.quote?.decimals??18);
  if(run===startRun)startBase={cap,unit:q.replace(/^W/,''),usd:usd>0?cap*usd:null};}
 }catch{}
 if(run===startRun){const was=startSteps;renderStart();renderQuick();if(startSteps!==was)costSoon(); // a USD tier's steps are known only now: re-price so one tap is enough
  // A USD tier (Floor/High) never silently becomes the standard start: keep reading the price until it answers.
  clearTimeout(startRetry);if(startCapOn()&&!startBase?.usd)startRetry=setTimeout(()=>{if(run===startRun&&pick)void readStartBase().then(()=>{if(startTier!=='custom')startSteps=tierSteps(startTier);renderStart();renderQuick();costSoon();});},10000);}
}
// A stock token's USD price from its USDG pool (StateView.getSlot0 on the chain's own pool), for the start-cap tiers.
async function stockUsd(p){const c=chainById(chainId),usdg=pairQuotes(chainId).find(q=>q.risk==='stable')?.address;
 const r=await rpc('eth_call',[{to:c.contracts.stateView,data:'0xc815641c'+p.usdPool.slice(2)},'latest']);return usdg?usdFromSqrt('0x'+r.slice(2,66),p.address,usdg):null;}
// ---- Extra pools (v4 only, opt-in; prices and table bounds are read before enabling a chip) ----
let extraPools=[],poolPrices=null,poolRun=0,poolReadKey='',poolDefaults=new Map(),anyQuotes=new Map(),anyPicker=null,anyPanel=null;
const multiOn=()=>!!pick&&pick.style!=='flywheel'&&multiLive(chainId)&&extraPools.length>0;
const isAddressPool=q=>typeof q.index==='string';
const anyOnChain=()=>[...(anyQuotes.get(chainId)?.values()||[])].filter(q=>q.risk!=='stock'||stocksOk());
const allPoolQuotes=()=>[{index:0,...chainById(chainId).quote,risk:chainById(chainId).quote.wrapNative?'weth':'stable'},...offeredPairs(),...anyOnChain()];
const poolKey=()=>[chainId,pairIdx,startSteps,stocksOk(),anyOnChain().map(q=>q.address).join(',')].join(':');
const pricesFresh=()=>poolPrices?.key===poolKey()&&(!anyOnChain().length||Date.now()-poolPrices.at<600000);
const mainQuote=()=>curPair()||{index:0,...chainById(chainId).quote,risk:chainById(chainId).quote.wrapNative?'weth':'stable'};
const quoteUsd=p=>isAddressPool(p)?readAnyQuote(p):p.risk==='stock'?stockUsd(p):p.risk==='stable'?Promise.resolve(1):readCreateNativeUSD(chainById(chainId).native);
const poolsBlocked=()=>multiOn()&&(!pricesFresh()||extraPools.some(i=>!poolPrices.rows.find(r=>r.index===i)?.ok));
function multiFields(){
 if(!multiOn())return {};
 if(poolsBlocked())throw Error('Refresh pool prices before launching.');
 return {quotes:[pairIdx,...extraPools.map(i=>typeof i==='string'?BigInt(i):i)],ticks:[0,...extraPools.map(i=>poolPrices.rows.find(r=>r.index===i).tick)],weights:poolWeights(extraPools.length)};
}
function selectedAddresses(){const list=allPoolQuotes();return [mainQuote().address,...extraPools.map(i=>list.find(q=>q.index===i)?.address).filter(Boolean)];}
async function addAnyPool(q){
 if(busy)throw Error('Finish this launch before adding a pool.');
 if(extraPools.length>=6)throw Error('The 70/30 split fits up to six extra pools.');
 if(extraPools.length+2>8)throw Error('Choose up to eight pools.');
 if(!anyQuotes.has(chainId))anyQuotes.set(chainId,new Map());anyQuotes.get(chainId).set(q.address,q);
 extraPools=[...extraPools,q.index];poolDefaults.set(chainId+':'+pairIdx,[...extraPools]);poolPrices=null;poolReadKey='';poolRun++;costRun++;cost=null;renderPair();renderPq();renderQuick();costSoon();
}
async function readAnyQuote(q){
 if(q.usd>0&&Date.now()-q.checkedAt<600000)return q.usd;
 const r=await fetch('/api/launch/quote-check?'+new URLSearchParams({chain:chainId,token:q.address}),{cache:'no-store'}),check=r.ok?await r.json():null;
 if(check?.ok!==true){q.usd=null;return null;}Object.assign(q,{symbol:check.symbol,decimals:check.decimals,usd:check.usd,checkedAt:Date.now()});return q.usd;
}
function renderPools(){
 const box=$('pools');if(!box)return;
 const show=!!pick&&pick.style!=='flywheel'&&multiLive(chainId)&&multiQuotes(chainId).length>0;box.hidden=!show;
 if(!show){if(pick?.style==='flywheel')extraPools=[];return;}
 const list=allPoolQuotes().filter(q=>q.address.toLowerCase()!==mainQuote().address.toLowerCase()),choice=chainId+':'+pairIdx;
 if(!poolDefaults.has(choice)){poolDefaults.set(choice,[pairIdx===0?multiQuotes(chainId)[0].index:0]);costRun++;cost=null;}
 extraPools=poolDefaults.get(choice).filter(i=>list.some(q=>q.index===i));
 const weights=poolWeights(extraPools.length),fresh=pricesFresh();
 const chips=list.map(q=>{const r=fresh?poolPrices.rows.find(r=>r.index===q.index):null,selected=extraPools.includes(q.index),duplicate=extraPools.some(i=>i!==q.index&&list.find(p=>p.index===i)?.address.toLowerCase()===q.address.toLowerCase()),full=!selected&&extraPools.length>=6;
  const note=duplicate?'This pool is already selected.':full?'The 70/30 split fits up to six extra pools.':r&&!r.ok?r.tick!=null?"Can't open this pool at today's price.":'Price unavailable.':!r?'Reading price…':'';
  const b=el('button',{type:'button',class:'qq-start-opt','aria-pressed':String(selected),disabled:busy||!r?.ok||duplicate||full,'data-extra-pool':String(q.index),...(note?{'aria-describedby':'qq-pool-note-'+q.index}:{}),...(q.risk==='stock'?{title:RISK.stock(q.symbol)}:{})},q.symbol+(selected?' · '+weights[extraPools.indexOf(q.index)+1]/100+'%':''));
  b.addEventListener('click',()=>{if(busy||!r?.ok||duplicate||full||!selected&&extraPools.length>=6)return;extraPools=selected?extraPools.filter(i=>i!==q.index):[...extraPools,q.index];poolDefaults.set(choice,[...extraPools]);costRun++;cost=null;renderPair();renderPq();renderQuick();costSoon();$('pools').querySelector?.('[data-extra-pool="'+q.index+'"]')?.focus();});
  return el('div',{class:'qq-pool-chip'},b,isAddressPool(q)?el('span',{class:'qq-start-note'},'Any token'):null,note?el('span',{class:'qq-start-note',id:'qq-pool-note-'+q.index},note):null,isAddressPool(q)?el('span',{class:'qq-start-note'},ANY_TOKEN_NOTE):null);});
 const single=el('button',{type:'button',class:'qq-pq-skip',disabled:busy},'Use one pool');single.addEventListener('click',()=>{if(busy)return;extraPools=[];poolDefaults.set(choice,[]);costRun++;cost=null;renderPair();renderPq();renderQuick();costSoon();});
 if(!anyPanel){anyPanel=el('div',{class:'qq-any-token'});anyPicker=mountAnyTokenPicker(anyPanel,{chainId:()=>chainId,stocksOk,selected:selectedAddresses,onAdd:addAnyPool,enabled:()=>!busy,doc:document,fetchImpl:(...a)=>fetch(...a)});}anyPicker.setChain(chainId);
 box.replaceChildren(el('p',{class:'qq-start-k'},'Pools'),el('p',{class:'qq-start-note'},'Open more pools for your token in the same launch. Your main pool keeps 70% of the supply; the others share 30%.'),el('div',{class:'qq-start-opts',role:'group','aria-label':'Extra pools'},...chips),...(extraPools.length?[single]:[]),...list.filter(q=>q.risk==='stock'&&extraPools.includes(q.index)).map(q=>el('p',{class:'qq-start-note qq-pair-risk'},RISK.stock(q.symbol))),anyPanel);
 if(!fresh&&poolReadKey!==poolKey())void readPoolPrices();
}
async function readPoolPrices(){
 const run=++poolRun,key=poolKey(),steps=startSteps,main=mainQuote(),list=allPoolQuotes(),fixed=list.filter(q=>!isAddressPool(q));poolReadKey=key;
 try{
  const tables=await rpcMany(fixed.map(q=>['eth_call',[{to:multiFactory(chainId),data:pairStartAtCall(q.index,steps)},'latest']])),byIndex=new Map(fixed.map((q,i)=>[q.index,readPairStartAt(tables[i])]));
  const prices=await Promise.all(list.map(q=>quoteUsd(q).catch(()=>null))),mi=list.findIndex(q=>q.index===main.index),table=byIndex.get(main.index),usdPerToken=table&&prices[mi]>0?Number(table.startCapWei)/10**main.decimals*prices[mi]/1e9:null;
  const rows=list.map((q,i)=>{const table=byIndex.get(q.index);let tick=null;try{tick=alignTick({usdPerToken,quoteUsd:prices[i],quoteDecimals:q.decimals});}catch{}return {...q,tick,ok:tick!==null&&(isAddressPool(q)?tick!==0&&Math.abs(tick)<=887200:!!table&&Math.abs(tick-table.tick0)<=7000)};});
  if(run===poolRun&&key===poolKey()){poolPrices={key,rows,at:Date.now()};renderPools();renderQuick();if(extraPools.length){costRun++;cost=null;costSoon();}}
 }catch{if(run===poolRun&&key===poolKey()){poolPrices={key,rows:[],at:Date.now()};renderPools();renderQuick();}}
 finally{if(run===poolRun)poolReadKey='';}
}
async function rpcMany(calls){const c=chainById(chainId),r=await fetch(c.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(calls.map(([method,params],id)=>({jsonrpc:'2.0',id,method,params})))}),j=await r.json();if(!Array.isArray(j))throw Error('RPC error');return calls.map((_,id)=>j.find(r=>r.id===id)?.result||'0x');}
function tierSteps(t){const tier=START_TIERS.find(x=>x[0]===t);if(!tier||tier[2]===null)return startSteps;if(!tier[2])return 0;return startBase?.usd?stepsForUsd(tier[2],startBase.usd):0;}
function capText(steps){if(!startBase)return '';const usd=startBase.usd?capAtSteps(startBase.usd,steps):null;return usd?'~'+usdShort(usd):+capAtSteps(startBase.cap,steps).toPrecision(3)+' '+startBase.unit;}
function renderStart(){
 let box=$('startcap');
 if(!startCapOn()){box?.remove();startSteps=0;startTier='standard';return;}
 if(!box){box=el('div',{id:'qq-startcap',class:'qq-startcap'});($('pools')||$('pair')||$('style-blocks')).after(box);}
 if(startTier!=='custom')startSteps=tierSteps(startTier);
 const radios=START_TIERS.map(([id,label])=>{const b=el('button',{type:'button',class:'qq-start-opt','aria-pressed':String(id===startTier)},label+(id==='standard'&&startBase?' · '+capText(tierSteps(id)):''));
  b.addEventListener('click',()=>{startTier=id;if(id==='custom'&&!startSteps)startSteps=tierSteps('floor');renderStart();renderQuick();costSoon();});return b;});
 const kids=[el('p',{class:'qq-start-k'},'Starting market cap'),el('div',{class:'qq-start-opts',role:'group','aria-label':'Starting market cap'},...radios)];
 if(startTier==='custom'){const r=el('input',{type:'range',min:'0',max:String(START_STEPS_MAX),step:'1',value:String(startSteps),'aria-label':'Starting market cap'});
  r.addEventListener('input',()=>{startSteps=Number(r.value);out.textContent=capText(startSteps);renderPools();renderQuick();costSoon();});
  const out=el('span',{class:'qq-start-val'},capText(startSteps));kids.push(el('div',{class:'qq-start-custom'},r,out));}
 kids.push(el('p',{class:'qq-start-note'},'A higher start makes bundling and sniping cost more: buyers pay more for the same share of the supply. The price can’t go below where it starts, and Bonded comes at 25× the start.'));
 if(startSteps>0&&startBase)kids.push(el('p',{class:'qq-start-sum'},'Starts at '+capText(startSteps)+' · Bonded at '+capText(startSteps+161)));
 box.replaceChildren(...kids);renderPools();
}

// ---- Optional post-quantum key (next-generation factory only, chains.mjs simpleLaunchNext.abi 'pq') ----
// On by default for new launches (2026-11-09, Randall); one tap opts out. On: the launch's creator role (where its LP fees go, handing the role on) is held by the shared
// QPQCreator, so changing it needs the creator's wallet AND this account quantum key. Fees keep flowing either way.
let pqOn=false,pqOptOut=false,pqSigner=null,pqReady=false,pqControl=null,pqPanel=null;
const pqKeyHex=()=>pqOn&&pqReady&&pqSigner&&!pqSigner.locked&&pqSigner.backupVerified&&/^0x[0-9a-f]{64}$/i.test(pqSigner.publicKeyHex||'')?pqSigner.publicKeyHex.toLowerCase():null;
const pqBlocked=()=>pqOn&&!pqKeyHex();
function renderPq(){
 let box=$('pq');
 if(!pqOnChain()){box?.remove();pqOn=false;return;}
 pqOn=!pqOptOut;
 if(!box){box=el('div',{id:'qq-pq',class:'qq-pq'});($('startcap')||$('style-blocks')).after(box);}
 const check=el('input',{type:'checkbox',id:'qq-pq-on',checked:pqOn});
 check.addEventListener('change',()=>{pqOptOut=!check.checked;renderPq();renderQuick();costSoon();});
 const kids=[el('label',{class:'qxc-check qq-pq-toggle'},check,el('strong',{},'Add a post-quantum key')),
  el('p',{class:'qq-start-note'},'Optional. With it on, changing where this launch’s LP fees go, or handing that role on, needs your wallet and your QHooks quantum key. Fees keep flowing whatever happens to either key.')];
 if(pqOn){
  if(!pqPanel){pqPanel=el('div',{class:'qq-pq-key'});pqControl=mountAccountQuantum(pqPanel,{hub,id:'qqk',mode:'launch',enabled:()=>!busy,onChange:st=>{pqSigner=st.signer||null;pqReady=!!st.ready;renderPqStatus();renderQuick();costSoon();}});}
  const skip=el('button',{type:'button',id:'qq-pq-skip',class:'qq-pq-skip'},'Launch without a post-quantum key');
  skip.addEventListener('click',()=>{pqOptOut=true;renderPq();renderQuick();costSoon();});
  kids.push(pqPanel,el('p',{id:'qq-pq-status',class:'qxc-fine'}),skip);
 }
 box.replaceChildren(...kids);renderPqStatus();
}
function renderPqStatus(){const p=$('pq-status');if(!p)return;const k=pqKeyHex();
 p.textContent=k?'Key ready: '+k.slice(0,10)+'…'+k.slice(-6)+'. It is set in the same launch transaction.':'Unlock your quantum key above, with its backup saved, to launch with it.';}

function openQuick(id,{scroll=false}={}){
 const card=ideaCard(chainId,id)||ideaCard(chainId,'fair');if(!card)return;pick=card;$('quick').hidden=false;
 renderPair();startTier=card.startUsd?'custom':DEFAULT_TIER[chainId]||'standard';startSteps=0;if(startCapOn()){void readStartBase().then(()=>{if(card.startUsd&&startBase?.usd){startSteps=stepsForUsd(card.startUsd,startBase.usd);renderStart();renderQuick();costSoon();}});}renderStart();
 renderPq();$('style-name').textContent=card.name;$('style-line').textContent=card.what;
 $('style-blocks').replaceChildren(...card.blocks.map(icon));
 for(const a of document.querySelectorAll('#qq-cards [data-launch]'))a.setAttribute('aria-pressed',String(a.dataset.launch===card.id));
 if(!$('done').hidden){$('done').hidden=true;$('launch').hidden=false;$('name').value='';$('symbol').value='';note('');}
 cost=null;renderQuick();void refreshCost();
 if(scroll){$('quick').scrollIntoView({block:'start',behavior:'auto'});$('name').focus({preventScroll:true});}
}

const costKey=v=>JSON.stringify(v,(_k,value)=>typeof value==='bigint'?value.toString():value);
function fields(){return {name:$('name').value,symbol:$('symbol').value,image};}
function renderQuick(){
 if(!pick)return;const c=chainById(chainId),conn=hub.snapshot().current;
 let ready=true;try{validateQuick(fields());}catch{ready=false;}
 const box=$('cost');
 if(!cost)box.replaceChildren(el('p',{class:'qq-total'},'Loading…'),...(costError?[el('p',{class:'qxc-fine'},costError)]:[]));
 else{const line=(k,v)=>el('div',{class:'qxc-summary-line'},el('span',{},k),el('b',{class:'qxc-number'},v));
  const dollars=usd?' · about $'+(Number(BigInt(cost.totalWei))/1e18*usd).toFixed(2):'';
  box.replaceChildren(el('p',{class:'qq-total qxc-number'},ethText(cost.totalWei)+' '+c.native+dollars),
   line('Launch fee',ethText(cost.feeWei)+' '+c.native),line('Network gas · up to',ethText(cost.networkWei)+' '+c.native),
   ...(cost.live&&!cost.quote.funded?[el('p',{class:'qxc-fine qq-short','data-error':'true'},'Add '+ethText(BigInt(cost.quote.requiredBalance)-BigInt(cost.quote.balance))+' '+c.native+' on '+c.name+' to launch.')]:[]),el('p',{class:'qxc-fine'},cost.live?'Priced for this launch from your wallet’s estimate. One transaction, one confirmation.':'Planning estimate. Connect a wallet for this launch’s own estimate. One transaction, one confirmation.'));}
 appendArbRecaptureLine(box,c,pick.blocks||[],launchFactory());
 const b=$('launch');
 b.textContent=busy?'Launching…':!conn?'Connect wallet':conn.chainId!==chainId?'Switch to '+c.short+' and launch':priceBlocked()||poolsBlocked()?'Refreshing price…':pqBlocked()?'Unlock your quantum key to launch':'Launch for '+(cost?ethText(cost.totalWei)+' '+c.native:'…');
 // A token image is required (2026-11-10): no launch, or chain switch for one, until the image is ready.
 const needImage=!image;$('need-image').hidden=!needImage||busy;
 b.disabled=busy||!!taken||!!conn&&(needImage||conn.chainId===chainId&&(!ready||!cost||priceBlocked()||poolsBlocked()||pqBlocked()||cost.live&&!cost.quote.funded));
}

async function rpc(method,params){const c=chainById(chainId);const r=await fetch(c.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const j=await r.json();if(j.error||typeof j.result!=='string')throw Error(j.error?.message||'RPC error');return j.result;}
async function readFee(){
 const key=chainId+':'+launchFactory();if(!feeRead.has(key))feeRead.set(key,rpc('eth_call',[{to:launchFactory(),data:'0xc763e5a1'},'latest']).then(r=>launchFeeWei(r,chainId)).catch(()=>{feeRead.delete(key);return launchFeeWei(null,chainId);}));
 return feeRead.get(key);
}
// Cost shown before any wallet prompt. With a connected wallet on the right chain and valid fields, the guided flow's
// own fee quote (quoteNextChain: wallet estimate +25%, 2 x base fee + tip, review caps) prices this exact transaction,
// and that quoted transaction is what gets sent after a recheck. Otherwise: planning gas x the public gas price.
const walletRequest=conn=>(method,params)=>conn.entry.provider.request({method,params});
// Checks whether this chain's clean-token launch contract has code (cached; see qx-quick-launch-core primeCleanFactory).
const getCodeOn=id=>a=>fetch(chainById(id).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getCode',params:[a,'latest']})}).then(r=>r.json()).then(j=>j.result);
const primeClean=(id,o)=>primeCleanFactory(id,getCodeOn(id),o),primePairs=(id,o)=>primePairsFactory(id,getCodeOn(id),o),primeMulti=(id,o)=>primeMultiFactory(id,getCodeOn(id),o);
async function refreshCost(){
 if(!pick)return null;
 renderPools();if(poolsBlocked()){cost=null;renderQuick();return null;}
 // The launch contract must be settled before the price of the exact transaction is read.
 await primeClean(chainId,{background:true}).catch(()=>{});const run=++costRun,style=pick.style,snipe=pick.snipe,steps=startCapOn()?startSteps:0,pqKey=pqOnChain()?pqKeyHex():null,pair=curPair(),quoteIndex=pair?pair.index:0;
 try{
  const conn=hub.snapshot().current,fee=await readFee();let next=null;
  if(conn&&conn.chainId===chainId&&!pqBlocked()){let f=null;try{f=fields();validateQuick(f);}catch{f=null;}
   if(f){const salt=randomSalt(),data=encodeQuickLaunch({...f,style,snipe,salt,steps,startCap:startCapOn(),pq:pqOnChain(),pqKey,quoteIndex,...multiFields()}),call={to:launchFactory(),data,value:'0x'+fee.toString(16)};
    const quote=await quoteCall({chainId,request:walletRequest(conn),owner:conn.owner,call});
    next={...quickCost({feeWei:fee,gas:quote.gas,gasPriceWei:BigInt(quote.transaction.maxFeePerGas),dataFeeWei:quote.dataFeeWei||0}),live:true,quote,owner:conn.owner,key:costKey([f,style,snipe,steps,pqKey,call.to,quoteIndex,multiFields()])};}}
  if(!next){const price=await rpc('eth_gasPrice',[]);next={...quickCost({feeWei:fee,gas:Math.ceil(PLANNING_GAS[style]*1.25),gasPriceWei:2n*BigInt(price)}),live:false};}
  if(run!==costRun)return cost;cost=next;
 }catch(e){if(run===costRun){cost=null;costError=/insufficient|exceeds balance/i.test(String(e?.message))?launchError(e):/review limit/i.test(String(e?.message))?launchError(e):'Reading network fees. Trying again in a few seconds.';clearTimeout(costTimer);costTimer=setTimeout(()=>void refreshCost(),10000);}}
 if(run===costRun){if(cost)costError='';renderQuick();}return cost;
}
let costTimer=null;const costSoon=()=>{clearTimeout(costTimer);costTimer=setTimeout(()=>void refreshCost(),400);};

// Downscale the picked image to a small square JPEG that fits inside the token's on-chain meta (4 KB).
async function thumbnail(file){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Choose a PNG, JPEG or WebP image.');
 if(file.size>8e6)throw Error('Choose an image under 8 MB.');
 const bitmap=await createImageBitmap(file);const side=Math.min(bitmap.width,bitmap.height);
 for(const [px,q] of [[96,.82],[80,.78],[64,.74],[64,.6],[48,.6]]){
  const canvas=el('canvas',{width:px,height:px}),ctx=canvas.getContext('2d');ctx.fillStyle='#fbf9f4';ctx.fillRect(0,0,px,px);
  ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,px,px);
  const url=canvas.toDataURL('image/jpeg',q);if(url.length<=META_LIMIT-200)return url;
 }
 throw Error('That image is too detailed to store. Try a simpler one.');
}

const rememberLast=v=>{try{localStorage.setItem(LAST,JSON.stringify(v));}catch{/* the receipt is still shown on this page */}};
function showDone(token,hash){
 const c=chainById(chainId);$('done').hidden=false;$('launch').hidden=true;$('done-name').textContent=$('name').value.trim()+' ('+$('symbol').value.trim().toUpperCase()+') · '+c.name;
 $('token').textContent=token;$('open-market').href=marketPath(chainId,token);$('tx').href=c.explorer+'/tx/'+hash;{const x=launchPostLink({name:$('name').value,ticker:$('symbol').value,chainName:c.name,chainId,token}),px=$('post-x');if(px){px.hidden=!x;if(x)px.href=x;}}$('done').focus?.();
}
async function receipt(provider,hash){
 for(let i=0;i<240;i++){
  const r=await provider.request({method:'eth_getTransactionReceipt',params:[hash]}).catch(()=>null);
  if(r)return r;await new Promise(res=>setTimeout(res,i<20?750:2000));
 }
 throw Error('The network took too long to confirm. Your transaction may still land; check it with the link below.');
}
async function launch(){
 if(busy||!pick)return;if(!CREATE_EXECUTION_ENABLED){note(CREATE_EXECUTION_HOLD,true);return;}
 let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 let f;try{f=fields();validateQuick(f);}catch(e){note(e.message,true);return;}
 try{await assertTickerFree({symbol:f.symbol,chainId,creator:conn.owner});}catch(e){if(e instanceof TickerTaken){showTaken(e.result);renderQuick();return;}throw e;}
 busy=true;note('');renderQuick();
 try{
  if(conn.chainId!==chainId){note('Switching your wallet to '+chainById(chainId).name+'…');conn=await hub.switchChain(chainId);busy=false;await refreshCost();note('Check the cost, then launch.');return;}
  if(pqBlocked()){busy=false;note('Unlock your quantum key, or turn the post-quantum key off, then launch.',true);return;}
  if(priceBlocked()||poolsBlocked()){if(poolsBlocked())void readPoolPrices();busy=false;note('Refreshing price… The starting market cap needs a live price. Try again in a moment, or choose Standard.',true);return;}
  const key=costKey([f,pick.style,pick.snipe,startCapOn()?startSteps:0,pqOnChain()?pqKeyHex():null,launchFactory(),curPair()?.index||0,multiFields()]);
  // The person must have seen the price of this exact transaction before the wallet opens.
  if(!cost?.live||cost.key!==key||cost.owner!==conn.owner){busy=false;await refreshCost();note('Check the cost, then launch.');return;}
  const tx=await recheckCall(chainId,{request:walletRequest(conn),quote:cost.quote}).catch(async e=>{busy=false;await refreshCost();throw e;});
  const factory=String(tx.to).toLowerCase(),sent={from:conn.owner,to:tx.to,data:tx.data,value:tx.value,gas:tx.gas,maxFeePerGas:tx.maxFeePerGas,maxPriorityFeePerGas:tx.maxPriorityFeePerGas};
  note('Confirm '+ethText(cost.totalWei)+' '+chainById(chainId).native+' or less in your wallet: the launch fee plus network gas.');
  const hash=await conn.entry.provider.request({method:'eth_sendTransaction',params:[sent]});
  rememberLast({chainId,hash,name:f.name.trim(),symbol:f.symbol.trim().toUpperCase(),at:Date.now()});
  $('tx-wait').href=chainById(chainId).explorer+'/tx/'+hash;$('waiting').hidden=false;note('Sent. Waiting for the network to confirm…');
  const r=await receipt(conn.entry.provider,hash);
  if(r.status!=='0x1')throw Error('The network refused this launch. Nothing was created; only network gas was spent.');
  const token=launchedToken(r,factory);if(!token)throw Error('The launch confirmed, but its token could not be read. Open the transaction link to see it.');
  rememberLast({chainId,hash,token,name:f.name.trim(),symbol:f.symbol.trim().toUpperCase(),at:Date.now()});
  $('waiting').hidden=true;note('Your token launched.');showDone(token,hash);
 }catch(e){note(launchError(e),true);}
 finally{busy=false;renderQuick();}
}

function mount(){
 if(!$('ideas'))return;
 {const u=urlChain();if(u&&(ideaCards(u).length||multiFactory(u)))quickChain=u;}
 renderIdeas();
 chainSelect?.addEventListener('change',()=>{renderIdeas();if(pick)openQuick(pick.id);checkTickerSoon();});
 $('use-robinhood')?.addEventListener('click',()=>setQuickChain('4663'));
 $('open').addEventListener('click',()=>launchCard(pick?.id||'fair'));
 for(const id of ['name','symbol'])$(id).addEventListener('input',()=>{if(id==='symbol'){$('symbol').value=$('symbol').value.toUpperCase();checkTickerSoon();}renderQuick();costSoon();});
 $('image').addEventListener('change',async()=>{const file=$('image').files?.[0];if(!file)return;
  try{image=await thumbnail(file);$('preview').src=image;$('preview').hidden=false;$('image-status').textContent='Image ready.';}
  catch(e){image='';$('preview').hidden=true;$('image-status').textContent=e.message;}renderQuick();costSoon();});
 $('launch').addEventListener('click',()=>void launch());
 $('change').addEventListener('click',()=>$('ideas').scrollIntoView({block:'start'}));
 hub.subscribe(()=>{void pqControl?.refresh();renderQuick();if(pick)costSoon();checkTickerSoon();});
 readUsd();
 const prefill=readLaunchPrefill(location);
 if(prefill){
  if(prefill.chain&&ideaCards(prefill.chain).length){quickChain=prefill.chain;renderIdeas();}
  if(prefill.name!==undefined)$('name').value=prefill.name;
  if(prefill.ticker!==undefined)$('symbol').value=prefill.ticker;
  openQuick(prefill.style,{scroll:true});checkTickerSoon();costSoon();
 }else{const h=/^#quick(?:-([a-z-]+))?$/.exec(location.hash);if(h)openQuick(h[1]||'fair',{scroll:true});}
}
mount();
