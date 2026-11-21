import {setGlossaryContext} from './qx-glossary-context.mjs';
import {kitTradeoff} from './qx-launch-kit-copy.mjs';
import {createFeePresentation} from './qx-create-fee-presentation.mjs';
import {evmModel,mountCreateModelPreview,mountChainModelLabels} from './qx-create-model-preview.mjs';
import {validLaunchTicker,mountLaunchTickerInput} from './qx-launch-ticker.mjs';
import {launchReadiness,paintLaunchReadiness} from './qx-quick-launch-readiness.mjs';
import {launchIdentityDraft} from './qx-create-draft.mjs';
import {editableTokenProfileDraft} from './qx-token-profile.mjs';
import {paintQuickLaunchResult} from './qx-quick-launch-result.mjs';
import {QUICK_LAUNCH_DEFAULTS,quickLaunchEntry} from './qx-quick-launch-defaults.mjs';
import {quickSplitPreview,splitPreviewNode} from './qx-create-split-preview.mjs';
import {prepareTokenBanner,uploadTokenBanner,LAUNCH_ICON_LIMIT} from './qx-token-banner.mjs';
import {readFactoryStart} from './qx-guided-start.mjs';
import {selectedStart,START_PRICE_HOLD} from './qx-guided-start-core.mjs';
import {assertQuickStart,startTierLabel,startCapText} from './qx-quick-start-check.mjs';
import {mountAnyTokenPicker,ANY_TOKEN_NOTE} from './qx-launch-any-token.mjs';
import {appendArbRecaptureLine} from './qx-create-display.mjs';
import {readLaunchPrefill} from './qx-launch-prefill.mjs';
import {readHandoff} from './qcaster-handoff.mjs';
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
import {startCapFactory,START_TIERS,START_STEPS_MAX,stepsForUsd,capAtSteps} from './qx-quick-launch-core.mjs';
import {pqFactory,primeCleanFactory} from './qx-quick-launch-core.mjs';
import {multiFactory,multiQuotes,primeMultiFactory,multiLive,alignTick,poolWeights} from './qx-quick-launch-core.mjs';
import {pairsFactory,pairQuotes,primePairsFactory,pairsLive,pairStartAtCall,readPairStartAt,usdFromSqrt} from './qx-quick-launch-core.mjs';
import {mountAccountQuantum} from './qx-account-quantum-control.mjs';
import {rangeKitReady,planRange,makeCall,pointCall,pointCallPq,checkPqMessage,payoutOf,sendBatch,RANGE_SHARES,DEFAULT_RANGE_BPS,RANGE_GAS} from './qx-range-kit.mjs';
import {ideaCards,ideaCard,visibleGroups,quickFactory,encodeQuickLaunch,validateQuick,launchFeeWei,quickCost,ethText,launchedToken,randomSalt,PLANNING_GAS,QUICK_PRESET} from './qx-quick-launch-core.mjs';
import {mountTeamBuy} from './qx-team-buy-ui.mjs';
import {TEAM_TEXT,TEAM_NATIVE_CHAINS,TEAM_BUY_LIVE,teamSplit} from './qx-team-buy-core.mjs';

let banner='',bannerData='',bannerRevision=0,imageRevision=0,bannerSource='',lastImageFile=null;
let simpleDefault=false;
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
// ---- Auto-range liquidity kit (qx-range-kit.mjs): ready where QRangeMaker has code and knows this launch contract ----
let rangeCfg=null,rangeBps=DEFAULT_RANGE_BPS;const rangeReady=new Map();
const isRangeKit=()=>pick?.kit==='range';
const rangeOn=id=>rangeReady.get(String(id))===true;
async function primeRange(id){
 rangeCfg||=await fetch('/full-launch/range-v1.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);if(!rangeCfg)return false;
 const was=rangeOn(id),f=quickFactory(id);if(!f)return false;
 const ok=await rangeKitReady(id,f,getCodeOn(id),rangeCfg);rangeReady.set(String(id),ok);return ok!==was;
}
let taken=null,tickerRun=0,tickerTimer=0;
let costError='',chainId=null,group='all',pick=null,image='',cost=null,costRun=0,busy=false,usd=null,feeRead=new Map();
let modelPreview=null,chainModelLabels=false,feeKey='';
const feePresentation=createFeePresentation({onChange:()=>{if(pick&&chainId!=='solana')renderQuick();}});
function retryFeePreview(){if(busy)return;clearTimeout(costTimer);costRun++;cost=null;costError='';feePresentation.retry(feeKey,costRun);renderQuick();void refreshCost();}
function evmPreview(){if(!modelPreview){const fees=document.getElementById('cr5-fees');if(fees)modelPreview=mountCreateModelPreview({before:fees,feeDetails:fees,id:'qq-model-preview'});}return modelPreview;}

const chainSelect=document.getElementById('qc-chainId');
// One-tap has its own chain picker (2026-11-09): ?chain= wins over the wallet's network and over the guided form
// (which an unfinished guided launch can lock to another chain). Launch asks the wallet to switch (adding the chain if needed).
const urlChain=()=>new URLSearchParams(location.search).get('chain');
let quickChain=null,solQuickPrevious=null;
const identityDraft=launchIdentityDraft();let draftDiscord='';
function keepDraft(){const saved=identityDraft.replace({...fields(),chain:String(currentChain()),bannerData,bannerSource,discord:draftDiscord});const n=document.getElementById('qq-draft-notice');if(n){n.hidden=saved;n.textContent=saved?'':'Your draft is only in this tab. Browser storage is unavailable; it will not survive a reload.';}return saved;}
function restoreDraft(d){if(!d)return;draftDiscord=d.discord||d.links?.discord||'';for(const k of ['name','symbol','description','x','telegram','website'])if($(k))$(k).value=d[k]||'';image=d.image||'';banner=d.banner||'';bannerData=d.bannerData||'';bannerSource=d.bannerSource||'';if(image){$('preview').src=image;$('preview').hidden=false;$('image-status').textContent='Image ready.';}if(bannerData){$('banner-preview').src=bannerData;$('banner-preview').hidden=false;$('banner-status').textContent='Banner ready.';}}
function chainPresentation(kind){mountLaunchTickerInput($('symbol')).paint();if(kind!=='evm'){modelPreview?.hide();feePresentation.hide();}const sol=kind==='solana',unavailable=kind==='unavailable';$('quick').hidden=false;$('quick').dataset.chainState=kind;$('launch').closest('.cr-go').hidden=sol;document.getElementById('cr5-fees').hidden=sol||unavailable;document.getElementById('cr5-defaults').hidden=sol||unavailable;$('need-banner').hidden=sol||unavailable;let n=document.getElementById('qq-unavailable');if(!n){n=el('p',{id:'qq-unavailable',class:'qxc-message',role:'status'});$('message').before(n);}n.hidden=!unavailable;if(unavailable){n.textContent='Quick Launch is not available on '+(chainById(chainId)?.name||'this chain')+'. Choose another chain; your draft is kept.';$('launch').disabled=true;$('launch').textContent='Choose another chain';paintLaunchReadiness(quickReadinessHost(),launchReadiness({available:false,hold:n.textContent,image,name:$('name').value,symbol:$('symbol').value,wallet:!!hub.snapshot().current}));}}
const currentChain=()=>quickChain||chainSelect?.value||urlChain()||'4663';
const quickChains=()=>[...visibleChains().filter(c=>ideaCards(c.id).length).sort((a,b)=>Number(b.id==='4663')-Number(a.id==='4663')),{id:'solana',name:'Solana',native:'SOL'}];
function setQuickChain(id){if(busy)return;const wasSol=quickChain==='solana';if(id!==currentChain()){extraPools=[];poolPrices=null;pairIdx=0;}quickChain=id;try{const u=new URL(location.href);u.searchParams.set('chain',id);history.replaceState(history.state,'',u);}catch{}
 renderIdeas();if(pick)openQuick(pick.id);else if(id!=='solana'&&ideaCards(id).length)openQuick(QUICK_LAUNCH_DEFAULTS.cardId);keepDraft();if(id==='solana'||wasSol)document.dispatchEvent(new CustomEvent('qhooks:sol-create',{detail:{chain:id,quick:true}}));checkTickerSoon();costSoon();}
let draftBannerRecovery=null;
function restoreBannerReference(){
 if(chainId==='solana'||banner||!bannerData||draftBannerRecovery)return;
 const data=bannerData,revision=bannerRevision;$('banner-status').textContent='Restoring your banner…';
 draftBannerRecovery=uploadTokenBanner(data).then(hash=>{if(data!==bannerData||revision!==bannerRevision)return;banner=hash;$('banner-status').textContent='Banner ready.';$('banner-retry').hidden=true;keepDraft();renderQuick();costSoon();}).catch(e=>{if(data!==bannerData||revision!==bannerRevision)return;$('banner-status').textContent=e.message;$('need-banner').textContent='Your banner did not save. Retry under Customize launch.';$('banner-retry').hidden=false;}).finally(()=>{draftBannerRecovery=null;});
}
function renderPicker(){
 let sel=$('chain');
 if(!sel){const label=el('label',{class:'qq-chain'},el('span',{},'Chain'));sel=el('select',{id:'qq-chain','aria-label':'Chain for one-tap launch'});label.append(sel);$('chips').before(label);
  sel.addEventListener('change',()=>setQuickChain(sel.value));}
 const list=quickChains(),want=chainId;if(want&&!list.some(c=>c.id===want))list.push({id:want,name:chainById(want)?.name||'Unavailable chain',native:chainById(want)?.native||''});
 if(sel.options.length!==list.length||[...sel.options].some((o,i)=>o.value!==list[i].id))sel.replaceChildren(...list.map(c=>el('option',{value:c.id},c.name+' · '+c.native)));
 if(list.some(c=>c.id===want))sel.value=want;
 if(!chainModelLabels&&document.getElementById('cr-chains')){mountChainModelLabels(document.getElementById('cr-chains'));chainModelLabels=true;}
}
const note=(text,error=false)=>{$('message').textContent=text;$('message').dataset.error=String(error);};
// Anti-copycat ticker block: a ticker already launched through QHooks is refused before the wallet opens.
const noteNodes=(nodes,error=true)=>{$('message').replaceChildren(...nodes);$('message').dataset.error=String(error);};
function showTaken(r){taken=r;noteNodes(tickerBlockNodes(r));}
function checkTickerSoon(){clearTimeout(tickerTimer);const run=++tickerRun;tickerTimer=setTimeout(async()=>{
 const symbol=$('symbol').value,owner=hub.snapshot().current?.owner||'';if(!pick||!validLaunchTicker(symbol)){taken=null;renderQuick();return;}
 const r=await checkTicker({symbol,chainId,creator:owner});if(run!==tickerRun)return;
 if(!r.available)showTaken(r);else if(taken){taken=null;note('');}renderQuick();},350);}

// USD for the cost line in the chain's own coin (ETH, BNB, HYPE): the price of the selected chain, read again on change.
let usdFor=null;function readUsd(){const id=currentChain(),sym=chainById(id)?.native||'ETH';if(usdFor===id)return;usdFor=id;usd=null;
 void readCreateNativeUSD(sym).then(v=>{if(usdFor===id){usd=v;renderQuick();}}).catch(()=>{});}
const kitDetailsOpen=new Map();
function kitDetails(card,...nodes){return el('details',{class:'qq-kit-details',open:kitDetailsOpen.get(card.id)||false,'data-kit-details':card.id},el('summary',{},'Details'),...nodes);}
function renderIdeas(){for(const n of $('cards').querySelectorAll('[data-kit-details]'))kitDetailsOpen.set(n.dataset.kitDetails,n.open);chainId=currentChain();renderPicker();if(chainId==='solana'){if(pick)solQuickPrevious=pick;pick=null;cost=null;costRun++;clearTimeout(costTimer);clearTimeout(tickerTimer);tickerRun++;$('chips').replaceChildren();$('cards').replaceChildren();$('none').hidden=true;$('open').hidden=true;chainPresentation('solana');return;}if(!pick&&solQuickPrevious){pick=ideaCard(chainId,solQuickPrevious.id);solQuickPrevious=null;}readUsd();
 // Clean-token launch contract: once it has code on this chain, new launches go to it (redraw once when it switches).
 {const id=chainId;primeClean(id).then(r=>{if(r.changed&&id===chainId){costRun++;cost=null;renderIdeas();if(pick)void refreshCost();}}).catch(()=>{});}
 // Pairs launch contract (Robinhood): the pair picker appears once it has code on this chain.
 {const id=chainId;primePairs(id).then(r=>{if(r.changed&&id===chainId&&pick){renderPair();renderStart();renderQuick();}}).catch(()=>{});}
 for(const id of new Set([chainId,QUICK_CHAIN]))primeRange(id).then(changed=>{if(changed)renderIdeas();}).catch(()=>{});
 {const id=chainId;primeMulti(id).then(r=>{if(r.changed&&id===chainId){renderIdeas();if(pick){renderPair();void readStartBase();renderStart();renderPq();renderQuick();costSoon();}}}).catch(()=>{});}
 chainId=currentChain();const own=ideaCards(chainId),offChain=!own.length,cards=offChain?ideaCards(QUICK_CHAIN).filter(card=>card.id!=='arb-burns'):own,groups=visibleGroups(cards),c=chainById(chainId);
 if(!groups.some(([id])=>id===group))group='all';
 $('chips').replaceChildren(...groups.map(([id,label])=>{const b=el('button',{type:'button','aria-pressed':String(id===group),'data-group':id},label);b.addEventListener('click',()=>{group=id;renderIdeas();});return b;}));
 $('chips').hidden=!cards.length;
 $('cards').replaceChildren(...cards.map(card=>{
  const off=card.kit==='range'&&!rangeOn(offChain?QUICK_CHAIN:chainId);
  const btn=el('button',{type:'button',class:'qq-launch-card','data-launch':card.id,'aria-label':'Use kit: '+card.name,'aria-pressed':String(pick?.id===card.id),disabled:off},off?'Unavailable':'Use kit');btn.addEventListener('click',()=>launchCard(card.id));
  const blocks=card.blocks.length?el('div',{class:'qq-blocks'},...card.blocks.map(icon)):el('div',{class:'qq-blocks qq-blocks-none'},el('span',{},'No extra rules'));
  return tapCard(el('article',{class:'qq-card','data-card':card.id,'data-group':card.group,hidden:group!=='all'&&card.group!==group},
   el('div',{class:'qq-kit-main'},el('h3',{},card.name),card.chip?el('span',{class:'qq-chip'},card.chip):null,el('p',{class:'qq-kit-tradeoff'},kitTradeoff(card)),kitDetails(card,el('p',{class:'qq-what'},card.what),el('p',{class:'qq-why'},card.why),blocks,off?el('p',{class:'qq-why qq-off-note'},'Adaptive liquidity isn’t set up on '+(c?.name||'this chain')+' yet.'):null)),btn),btn);
 }),...[saleKit(group)].filter(Boolean));
 // Off Robinhood Chain the cards stay visible (lead, 2026-11-08); "Launch this" switches the chain first.
 $('none').hidden=!offChain;$('use-robinhood').hidden=true;$('open').hidden=false;
 if(offChain)$('none-text').textContent='One-tap launches run on Robinhood Chain';
 if(pick&&!ideaCard(chainId,pick.id))pick=null;
 chainPresentation(offChain?'unavailable':'evm');if(!offChain)restoreBannerReference();
}

// A card picked while another chain is selected: switch the page to Robinhood Chain, then open that card.
// Sale first as a kit: only on chains where the Sale first card (qx-sale-create.mjs) found QSaleLaunch code.
// Tapping anywhere on an idea picks it, like its button (Randall 2026-11-12: the panel under the ideas has to follow the pick).
function tapCard(card,btn){card.addEventListener('click',e=>{if(e.target.closest('button,a,input,select,label,textarea,summary,details')||btn.disabled)return;btn.click();});return card;}
// One panel under the ideas follows the pick: Quick launch for an idea, the sale form (qx-sale-create.mjs) for Sale first.
const announcePick=id=>document.dispatchEvent(new CustomEvent('qq:pick',{detail:{id}}));
function saleKit(group){
 const ready=window.__qsfChains;if(!ready||!ready.includes(String(chainId)))return null;
 const btn=el('button',{type:'button',class:'qq-launch-card','data-launch':'sale-first'},'Set up the sale');
 btn.addEventListener('click',()=>{pick=null;$('quick').hidden=true;announcePick('sale-first');for(const a of document.querySelectorAll('#qq-cards [data-launch]'))a.setAttribute('aria-pressed',String(a.dataset.launch==='sale-first'));const r=document.getElementById('qsf-root'),s=document.getElementById('qsf-chain');if(s&&[...s.options].some(o=>o.value===String(chainId))){s.value=String(chainId);s.dispatchEvent(new Event('change',{bubbles:true}));}r?.scrollIntoView({block:'start'});document.getElementById('qsf-name')?.focus({preventScroll:true});});
 return tapCard(el('article',{class:'qq-card','data-card':'sale-first','data-group':'kits',hidden:group!=='all'&&group!=='kits'},
  el('div',{class:'qq-kit-main'},el('h3',{},'Sale first'),el('p',{class:'qq-kit-tradeoff'},kitTradeoff({id:'sale-first'})),kitDetails({id:'sale-first'},el('p',{class:'qq-what'},'A fair sale before trading opens, at a fixed or falling price. Under the minimum, everyone gets a full refund.'),
  el('p',{class:'qq-why'},'Everyone pays the same price, so there is nothing to snipe, and the pool opens with the money raised on both sides.'),el('div',{class:'qq-blocks qq-blocks-none'},el('span',{},'1 transaction to open')))),btn),btn);
}
document.addEventListener('qsf:ready',()=>{if(document.getElementById('qq-cards'))renderIdeas();});
function launchCard(id){
 if(simpleDefault){simpleDefault=false;pqOptOut=false;}
 const custom=document.getElementById('cr5-customize');if(custom)custom.open=true;
 if(!ideaCards(currentChain()).length){setQuickChain(QUICK_CHAIN);}
 openQuick(id,{scroll:true});
}

// ---- Starting market cap (start-cap generation only; DESIGN.md §6) ----
// Standard keeps today's start. A higher start costs bundlers and snipers more; the price can't fall below it.
// Randall 2026-11-08: Elysium launches default to the Floor start (~$20K).
const DEFAULT_TIER={'99901':'floor'};
// QCaster's "Review in Create" link may carry ?start=standard|floor|high (2026-11-12). The person still sees and can change it.
const URL_TIER=(()=>{try{const v=new URLSearchParams(location.search).get('start');return ['standard','floor','high'].includes(v)?v:null;}catch{return null;}})();
let startTier='standard',customUsd='',startSteps=0,startBase=null,startRun=0,startRetry=null;
/// Floor/High are USD targets: without a live USD price their steps can't be known, so launching waits ("Refreshing price…").
const priceBlocked=()=>{if(!startCapOn())return true;if(!startBase?.usd)return true;try{selectedStart({tier:startTier,steps:startSteps,customUsd,standardUsd:startBase.usd});return false;}catch{return true;}};
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
const curPair=()=>pairIdx&&pick&&pick.style!=='flywheel'&&!isRangeKit()&&(multiLive(chainId)||pairsLive(chainId))?offeredPairs().find(q=>q.index===pairIdx)||null:null;
const pairFactory=()=>multiLive(chainId)?multiFactory(chainId):pairsFactory(chainId);
const launchFactory=()=>multiOn()?multiFactory(chainId):curPair()?pairFactory():quickFactory(chainId);
const pqOnChain=()=>multiOn()||!!curPair()||pqFactory(chainId);
// ---- Team buy (2026-11-21, Randall approved): optional first buy in the launch call (paid with its value on wrapped-native
// chains, before the launch blocks exist), then one plain token transfer per team wallet, sent by the creator. ----
const teamEvm=mountTeamBuy({chain:'evm',creator:()=>hub.snapshot().current?.owner||null,onChange:()=>{renderQuick();costSoon();}});
const buyInput=el('input',{id:'qq-buy',inputmode:'decimal',autocomplete:'off',value:'0','aria-describedby':'qq-buy-note'}),buyHint=el('p',{class:'qxc-fine',id:'qq-buy-pct',role:'status'}),buyUnit=el('span',{});
const firstBuyBox=el('div',{id:'qq-firstbuy',class:'qq-firstbuy',hidden:''},el('label',{},el('span',{},'Your optional first buy · '),buyUnit,buyInput),el('p',{class:'qxc-fine',id:'qq-buy-note'},'Included in the launch transaction, before the anti-snipe rules start. Leave 0 to launch without buying.'),buyHint,teamEvm.node);
const firstBuyOk=()=>TEAM_BUY_LIVE&&!!pick&&TEAM_NATIVE_CHAINS.includes(String(chainId))&&!curPair()&&!multiOn()&&!isRangeKit();
function firstBuyWei(){if(!firstBuyOk())return 0n;const v=String(buyInput.value||'0').trim();if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,18})?$/.test(v))return -1n;const [w,f='']=v.split('.');return BigInt(w)*10n**18n+BigInt((f+'0'.repeat(18)).slice(0,18));}
function teamDraft(){if(!firstBuyOk())return null;try{const t=teamEvm.value();if(t&&firstBuyWei()<=0n)return {__error:'Add a first buy to share with your team.'};return t;}catch(e){return {__error:e.message};}}
let buyPctTimer=null,buyPctKey='';
function paintBuyPct(){const wei=firstBuyWei(),f=launchFactory();if(wei<=0n||!f){clearTimeout(buyPctTimer);buyPctKey='';buyHint.textContent='';return;}const k=[chainId,f,startCapOn()?startSteps:0,wei].join('|');if(k===buyPctKey)return;clearTimeout(buyPctTimer);buyPctKey=k;buyHint.textContent='';
 buyPctTimer=setTimeout(async()=>{try{const q=new URLSearchParams({chain:String(chainId),factory:f,buy:wei.toString(),steps:String(startCapOn()?startSteps:0),pq:pqOnChain()?'1':'0',startCap:startCapOn()?'1':'0'}),r=await fetch('/api/team-buy/evm-quote?'+q),j=await r.json();if(k===buyPctKey)buyHint.textContent=r.ok?TEAM_TEXT.supply(Number((j.supplyBps/100).toFixed(2))):'';}catch{}},400);}
buyInput.addEventListener('input',()=>{renderQuick();costSoon();});
let teamPendingEvm=null;try{teamPendingEvm=JSON.parse(localStorage.getItem('qhooks:team-buy:pending:evm')||'null');}catch{}
const saveTeamPending=()=>{try{if(teamPendingEvm)localStorage.setItem('qhooks:team-buy:pending:evm',JSON.stringify(teamPendingEvm));else localStorage.removeItem('qhooks:team-buy:pending:evm');}catch{}};
function paintTeamSendEvm(){$('team-send')?.remove();const p=teamPendingEvm;if(!p||String(p.chainId)!==String(chainId))return;const b=el('button',{id:'qq-team-send',type:'button',class:'qxc-primary'},TEAM_TEXT.send(p.team.wallets.length));b.disabled=busy;b.addEventListener('click',()=>void sendTeamEvm());
 // Right after the launch it sits under "Open your market"; after a reload (an unsent distribution) above the cost box.
 const done=$('done');if(done&&!done.hidden&&$('open-market'))$('open-market').after(b);else $('launch')?.before(b);}
async function sendTeamEvm(){const p=teamPendingEvm;if(!p||busy)return;const conn=hub.snapshot().current;
 if(!conn||conn.owner.toLowerCase()!==p.owner.toLowerCase()){note('Connect the wallet that launched the token to send team shares.',true);return;}
 if(conn.chainId!==p.chainId){note('Switch your wallet to '+chainById(p.chainId).name+' to send team shares.',true);return;}
 busy=true;renderQuick();try{
  // The shares are fixed from the first-buy tokens once, before the first transfer, so a resumed send never re-splits.
  if(!p.split){const bal=BigInt(await callAt({to:p.token,data:'0x70a08231'+p.owner.slice(2).toLowerCase().padStart(64,'0')}));p.split=teamSplit(bal,p.team.wallets).map(w=>({address:w.address,amount:w.amount.toString()}));p.sent=[];saveTeamPending();}
  for(let i=p.sent.length;i<p.split.length;i++){const w=p.split[i];note('Approve team transfer '+(i+1)+' of '+p.split.length+' in your wallet.');
   const r=await sendOne(conn.entry.provider,conn.owner,{to:p.token,data:'0xa9059cbb'+w.address.slice(2).padStart(64,'0')+BigInt(w.amount).toString(16).padStart(64,'0')});p.sent.push(r.transactionHash);saveTeamPending();}
  if(p.team.disclosed){const r=await fetch('/api/team-buy/record',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chain:String(p.chainId),token:p.token,txs:p.sent})});if(!r.ok)throw Error('Team shares sent. The disclosure record is refreshing; tap again to retry it.');}
  teamPendingEvm=null;saveTeamPending();teamEvm.clear();note(TEAM_TEXT.sent);
 }catch(e){note(launchError(e),true);}finally{busy=false;renderQuick();paintTeamSendEvm();}}

const RISK={stable:s=>s+' is a dollar stablecoin. Its issuer can freeze any address, this pool included, and can pause it. Either one stops trading in this pool.',
 stock:s=>s+' is a Robinhood stock token. Its issuer can block any address, this pool included, pause the token, burn from any holder, and apply splits. Blocking or pausing stops trading in this pool. Stock tokens are not offered to US persons.'};
function renderPair(){
 readGeo();let box=$('pair');const list=offeredPairs(),hiddenStocks=geo.country==='US'&&pairQuotes(chainId).some(q=>q.risk==='stock');
 if(!pick||!list.length||!multiLive(chainId)&&!pairsLive(chainId)){box?.remove();renderPools();return;}
 if(!box){box=el('div',{id:'qq-pair',class:'qq-startcap qq-pair'});$('pools').before(box);}
 if(pick.style==='flywheel'){box.replaceChildren(el('p',{class:'qq-start-k'},'Pair with'),el('p',{class:'qq-start-note'},'Stakers’ share launches pair with ETH. Pick another idea to pair with USDG or a stock token.'));renderPools();return;}
 if(isRangeKit()){box.replaceChildren(el('p',{class:'qq-start-k'},'Pair with'),el('p',{class:'qq-start-note'},'Adaptive liquidity launches use one '+chainById(chainId).quote.symbol.replace(/^W/,'')+' pool.'));renderPools();return;}
 const opt=(idx,label)=>{const b=el('button',{type:'button',class:'qq-start-opt','aria-pressed':String(idx===pairIdx),'data-pair':String(idx)},label+(idx===pairIdx&&multiLive(chainId)&&extraPools.length?' · '+poolWeights(extraPools.length)[0]/100+'%':''));
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
  const p=curPair(),quote=p||c.quote,reference=await readFactoryStart({chainId,quote,factory:p?pairFactory():multiLive(chainId)?multiFactory(chainId):startCapFactory(chainId),steps:0,request:rpc});
  const cap=Number(reference.startCapWei)/10**quote.decimals;
  if(run===startRun)startBase={cap,unit:quote.symbol.replace(/^W/,''),usd:reference.capUsd,quoteUsd:reference.quoteUsd};
 }catch{}
 if(run===startRun){const was=startSteps;renderStart();renderQuick();if(startSteps!==was)costSoon(); // a USD tier's steps are known only now: re-price so one tap is enough
  // A USD tier (Floor/High) never silently becomes the standard start: keep reading the price until it answers.
  clearTimeout(startRetry);if(startCapOn()&&!startBase?.usd)startRetry=setTimeout(()=>{if(run===startRun&&pick)void readStartBase().then(()=>{startSteps=tierSteps(startTier);renderStart();renderQuick();costSoon();});},10000);}
}
// A stock token's USD price from its USDG pool (StateView.getSlot0 on the chain's own pool), for the start-cap tiers.
async function stockUsd(p){const c=chainById(chainId),usdg=pairQuotes(chainId).find(q=>q.risk==='stable')?.address;
 const r=await rpc('eth_call',[{to:c.contracts.stateView,data:'0xc815641c'+p.usdPool.slice(2)},'latest']);return usdg?usdFromSqrt('0x'+r.slice(2,66),p.address,usdg):null;}
// ---- Extra pools (v4 only, opt-in; prices and table bounds are read before enabling a chip) ----
let extraPools=[],poolPrices=null,poolRun=0,poolReadKey='',poolDefaults=new Map(),anyQuotes=new Map(),anyPicker=null,anyPanel=null;
const multiOn=()=>!!pick&&pick.style!=='flywheel'&&!isRangeKit()&&multiLive(chainId)&&extraPools.length>0;
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
 extraPools=[...extraPools,q.index];poolDefaults.set(poolChoice(),[...extraPools]);poolPrices=null;poolReadKey='';poolRun++;costRun++;cost=null;renderPair();renderPq();renderQuick();costSoon();
}
async function readAnyQuote(q){
 if(q.usd>0&&Date.now()-q.checkedAt<600000)return q.usd;
 const r=await fetch('/api/launch/quote-check?'+new URLSearchParams({chain:chainId,token:q.address}),{cache:'no-store'}),check=r.ok?await r.json():null;
 if(check?.ok!==true){q.usd=null;return null;}Object.assign(q,{symbol:check.symbol,decimals:check.decimals,usd:check.usd,checkedAt:Date.now()});return q.usd;
}
// Newcomer walk (2026-11-12): a Plain token starts with one pool (its own default key), and the pair, extra pools and
// the post-quantum key fold under one Advanced row whose line says what is set. The key stays on by default (product
// rule, 2026-11-09); the fold opens by itself when the key is what stands between a connected wallet and the launch.
const poolChoice=()=>chainId+':'+pairIdx+(pick?.id==='plain'?':plain':'');
let advAuto=false;
function renderAdv(){
 const adv=$('adv');if(!adv)return;
 const pair=$('pair'),pools=$('pools'),pq=$('pq'),poolsOn=!!pools&&!pools.hidden;
 adv.hidden=!pick||!(pair||poolsOn||pq);if(adv.hidden)return;
 const sym=q=>String(q?.symbol||'').replace(/^W(ETH|BNB|MON|HYPE)$/,'$1'),lines=[];
 if(pair||poolsOn){const list=allPoolQuotes(),main=sym(mainQuote());
  if(multiOn()){const w=poolWeights(extraPools.length);lines.push([main,...extraPools.map(i=>sym(list.find(q=>q.index===i)))].map((s,i)=>s+' '+w[i]/100+'%').join(' · '));}
  else lines.push('One '+main+' pool');}
 if(pq)lines.push(pqOn?'Post-quantum key on: changing where your fees go needs a second key.':'Post-quantum key off.');
 const sum=$('adv-sum');sum.replaceChildren(...lines.map(t=>el('span',{},t)));
}
function renderPools(){
 const box=$('pools');if(!box)return;
 const show=!!pick&&pick.style!=='flywheel'&&!isRangeKit()&&multiLive(chainId)&&multiQuotes(chainId).length>0;box.hidden=!show;
 if(!show){if(pick?.style==='flywheel'||isRangeKit())extraPools=[];return;}
 const list=allPoolQuotes().filter(q=>q.address.toLowerCase()!==mainQuote().address.toLowerCase()),choice=poolChoice();
 if(!poolDefaults.has(choice)){poolDefaults.set(choice,pick.id==='plain'?[]:[pairIdx===0?multiQuotes(chainId)[0].index:0]);costRun++;cost=null;}
 extraPools=poolDefaults.get(choice).filter(i=>list.some(q=>q.index===i));
 const weights=poolWeights(extraPools.length),fresh=pricesFresh();
 const chips=list.map(q=>{const r=fresh?poolPrices.rows.find(r=>r.index===q.index):null,selected=extraPools.includes(q.index),duplicate=extraPools.some(i=>i!==q.index&&list.find(p=>p.index===i)?.address.toLowerCase()===q.address.toLowerCase()),full=!selected&&extraPools.length>=6;
  const note=duplicate?'This pool is already selected.':full?'The 70/30 split fits up to six extra pools.':r&&!r.ok?r.tick!=null?"Can't open this pool at today's price.":"Couldn't read this pool's price.":!r?'Reading price…':'';
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
// Robinhood reads go through the same-origin RPC proxy: the public RH RPC intermittently sends a doubled CORS header.
const readRpcUrl=id=>String(id)==='4663'?'/api/rpc/4663':chainById(id).rpc;
async function rpcMany(calls){const r=await fetch(readRpcUrl(chainId),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(calls.map(([method,params],id)=>({jsonrpc:'2.0',id,method,params})))}),j=await r.json();if(!Array.isArray(j))throw Error('RPC error');return calls.map((_,id)=>j.find(r=>r.id===id)?.result||'0x');}
function tierSteps(t){if(t==='custom'&&customUsd&&startBase?.usd){try{return selectedStart({tier:t,steps:startSteps,customUsd,standardUsd:startBase.usd}).steps;}catch{return startSteps;}}const tier=START_TIERS.find(x=>x[0]===t);if(!tier||tier[2]===null)return startSteps;if(!tier[2])return 0;return startBase?.usd?stepsForUsd(tier[2],startBase.usd):0;}
function capText(steps){if(!startBase)return '';const text=startCapText(startBase.usd,steps);return text?text:+capAtSteps(startBase.cap,steps).toPrecision(3)+' '+startBase.unit;}
function renderStart(){
 let box=$('startcap');
 if(!startCapOn()){box?.remove();startSteps=0;startTier='standard';return;}
 if(!box){box=el('div',{id:'qq-startcap',class:'qq-startcap'});($('adv')||$('style-blocks')).before(box);}
 startSteps=tierSteps(startTier);
 const radios=START_TIERS.map(([id,label])=>{const b=el('button',{type:'button',class:'qq-start-opt','aria-pressed':String(id===startTier)},startTierLabel(id,startBase?.usd));
  b.addEventListener('click',()=>{startTier=id;if(id==='custom'&&!startSteps)startSteps=tierSteps('floor');renderStart();renderQuick();costSoon();});return b;});
 const kids=[el('p',{class:'qq-start-k'},'Starting market cap'),el('div',{class:'qq-start-opts',role:'group','aria-label':'Starting market cap'},...radios)];
 if(startTier==='custom'){const r=el('input',{type:'range',min:'0',max:String(START_STEPS_MAX),step:'1',value:String(startSteps),'aria-label':'Starting market cap'});
  r.addEventListener('input',()=>{customUsd='';input.value='';startSteps=Number(r.value);out.textContent=capText(startSteps);renderPools();renderQuick();costSoon();});
  const out=el('span',{class:'qq-start-val'},capText(startSteps)),input=el('input',{type:'text',inputMode:'decimal',maxLength:32,value:customUsd,placeholder:'Market cap in USD','aria-label':'Custom starting market cap in USD'});
  input.addEventListener('input',()=>{customUsd=input.value;startSteps=tierSteps('custom');r.value=String(startSteps);out.textContent=capText(startSteps);renderPools();renderQuick();costSoon();});
  kids.push(el('div',{class:'qq-start-custom'},input,r,out));}
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
 if(!box){box=el('div',{id:'qq-pq',class:'qq-pq'});$('adv-body').append(box);}
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

// One line: how much of the LP fees stays as liquidity (the rest goes to the creator's wallet).
function renderRangeShare(){
 let box=$('rangeshare');
 if(!isRangeKit()){box?.remove();return;}
 if(!box){box=el('div',{id:'qq-rangeshare',class:'qq-startcap qq-rangeshare'});$('style-blocks').after(box);}
 const opts=RANGE_SHARES.map(([v,label])=>{const b=el('button',{type:'button',class:'qq-start-opt','aria-pressed':String(v===rangeBps),disabled:busy,'data-range-bps':String(v)},label);
  b.addEventListener('click',()=>{if(busy)return;rangeBps=v;renderRangeShare();renderQuick();});return b;});
 box.replaceChildren(el('p',{class:'qq-start-k'},'LP fees kept as liquidity'),el('div',{class:'qq-start-opts',role:'group','aria-label':'LP fees kept as liquidity'},...opts),
  el('p',{class:'qq-start-note'},rangeBps===10000?'All of your LP fees become liquidity around the price.':'The other '+(100-rangeBps/100)+'% of your LP fees comes to your wallet.'));
}
function openQuick(id,{scroll=false}={}){
 const card=ideaCard(chainId,id)||ideaCard(chainId,'fair');if(!card)return;pick=card;$('quick').hidden=false;announcePick(card.id);
 renderPair();customUsd='';startTier=simpleDefault?QUICK_LAUNCH_DEFAULTS.startTier:card.startUsd?'custom':URL_TIER||DEFAULT_TIER[chainId]||'standard';startSteps=0;if(startCapOn()){void readStartBase().then(()=>{if(card.startUsd&&startBase?.usd){startSteps=stepsForUsd(card.startUsd,startBase.usd);renderStart();renderQuick();costSoon();}});}renderStart();
 renderPq();$('style-name').textContent=card.name;$('style-line').textContent=card.what;
 $('style-blocks').replaceChildren(...card.blocks.map(icon));renderRangeShare();
 for(const a of document.querySelectorAll('#qq-cards [data-launch]'))a.setAttribute('aria-pressed',String(a.dataset.launch===card.id));
 if(!$('done').hidden){$('done').hidden=true;$('launch').hidden=false;$('name').value='';$('symbol').value='';note('');}
 cost=null;renderQuick();void refreshCost();
 if(scroll){$('quick').scrollIntoView({block:'start',behavior:'auto'});$('name').focus({preventScroll:true});}
}

const costKey=v=>JSON.stringify(v,(_k,value)=>typeof value==='bigint'?value.toString():value);
// Team buy: the first buy is part of the launch call's value and of the total shown.
const withBuy=(c,buy)=>({...c,buyWei:buy.toString(),totalWei:(BigInt(c.totalWei)+buy).toString(),valueWei:(BigInt(c.valueWei)+buy).toString()});
function fields(){return {name:$('name').value,symbol:$('symbol').value,image,banner,description:$('description')?.value||'',x:$('x')?.value||'',telegram:$('telegram')?.value||'',website:$('website')?.value||'',buyQuote:firstBuyWei(),teamBuy:teamDraft()};}
function quickReadinessHost(){let host=$('readiness');if(!host){host=el('div',{id:'qq-readiness',class:'qq-readiness',role:'status','aria-live':'polite','aria-atomic':'true'});$('launch').before(host);$('launch').setAttribute('aria-describedby','qq-readiness');}return host;}
function renderQuick(){
 mountLaunchTickerInput($('symbol')).paint();
 if(!pick)return;const c=chainById(chainId),conn=hub.snapshot().current;
 if(!firstBuyBox.isConnected)$('launch')?.before(firstBuyBox);firstBuyBox.hidden=!firstBuyOk();buyUnit.textContent=c.native+' ';teamEvm.setAvailable(firstBuyOk());buyInput.disabled=busy;paintBuyPct();paintTeamSendEvm();
 let validationError='';try{validateQuick(fields());}catch(e){validationError=e.message;}
 const box=$('cost');
 const keyReady=!validationError&&!priceBlocked()&&!poolsBlocked()&&!pqBlocked();
 const reviewKey=keyReady?costKey([fields(),pick.style,pick.snipe,startCapOn()?startSteps:0,pqOnChain()?pqKeyHex():null,launchFactory(),curPair()?.index||0,multiFields()]):null;
 feeKey=costKey([chainId,pick.id,startSteps,pairIdx,extraPools,fields()]);
 const expired=!!cost?.live&&Number(cost.quote?.expiresAt)<=Date.now(),bound=!!cost?.live&&cost.owner===conn?.owner&&cost.key===reviewKey&&!expired;
 const displayCost=cost&&(!cost.live||bound)?cost:null;
 const feeView=feePresentation.observe({key:feeKey,generation:costRun,available:!!displayCost,error:expired?'Fee estimate expired. Retry.':costError,errorCurrent:expired,expiresAt:displayCost?.live?Number(displayCost.quote.expiresAt):0,busy});
 const preview=evmPreview();preview?.update(evmModel({chain:c,card:pick,baseFee:QUICK_PRESET.fee,antiSnipe:pick.blocks?.some(b=>b.id==='antiSnipe')}));preview?.setFeeStatus(feeView,retryFeePreview);
 if(!displayCost)box.replaceChildren(el('p',{class:'qq-total'},feeView.message));
 else{const line=(k,v)=>el('div',{class:'qxc-summary-line'},el('span',{},k),el('b',{class:'qxc-number'},v));
  const rangeWei=isRangeKit()&&cost.gasPriceWei?BigInt(RANGE_GAS.make+(pqOnChain()&&pqKeyHex()?RANGE_GAS.pointPq:RANGE_GAS.point))*BigInt(cost.gasPriceWei):0n,totalWei=BigInt(cost.totalWei)+rangeWei;
  const dollars=usd?' · about $'+(Number(totalWei)/1e18*usd).toFixed(2):'';
  box.replaceChildren(el('p',{class:'qq-total qxc-number'},ethText(totalWei)+' '+c.native+dollars),
   line('Launch fee',ethText(cost.feeWei)+' '+c.native),...(BigInt(cost.buyWei||0)>0n?[line('First buy',ethText(cost.buyWei)+' '+c.native)]:[]),line('Network gas · up to',ethText(cost.networkWei)+' '+c.native),...(rangeWei?[line('Range setup gas · about',ethText(rangeWei)+' '+c.native)]:[]),
   ...(cost.live&&!cost.quote.funded?[el('p',{class:'qxc-fine qq-short','data-error':'true'},'Add '+ethText(BigInt(cost.quote.requiredBalance)-BigInt(cost.quote.balance))+' '+c.native+' on '+c.name+' to launch.')]:[]),el('p',{class:'qxc-fine'},isRangeKit()?(cost.live?'Priced for this launch from your wallet’s estimate. ':'Planning estimate. Connect a wallet for this launch’s own estimate. ')+'Launch, create its range, point its LP fees there: one approval where your wallet can batch, otherwise three.':cost.live?'Priced for this launch from your wallet’s estimate. One transaction, one confirmation.':'Planning estimate. Connect a wallet for this launch’s own estimate. One transaction, one confirmation.'));}
 appendArbRecaptureLine(box,c,pick.blocks||[],launchFactory());
 box.append(splitPreviewNode(quickSplitPreview(isRangeKit()?rangeBps:0),{quick:true}));
 for(const id of ['name','symbol','image','banner','description','x','telegram','website'])if($(id))$(id).disabled=busy;
 const b=$('launch');
 // A token image is required (2026-11-10): no launch, or chain switch for one, until the image is ready.
 const needImage=!image,needBanner=!banner;$('need-image').hidden=true;$('need-banner').hidden=!image||!needBanner||busy;
 const readiness=launchReadiness({available:CREATE_EXECUTION_ENABLED&&!!quickFactory(chainId),hold:CREATE_EXECUTION_HOLD,busy,image,name:$('name').value,symbol:$('symbol').value,banner,bannerMessage:$('need-banner').textContent,validationError,taken:!!taken,wallet:!!conn,wrongChain:!!conn&&conn.chainId!==chainId,chainMessage:'Switch your wallet to '+c.name+' to review the launch cost.',chainLabel:'Switch to '+c.short+' and launch',priceBlocked:priceBlocked(),poolsBlocked:poolsBlocked(),keyBlocked:pqBlocked(),cost:bound,costError:feeView.phase==='unavailable'?feeView.message:costError,funded:cost?.live?cost.quote.funded:null,balanceMessage:box.querySelector('.qq-short')?.textContent});
 b.disabled=readiness.disabled;b.textContent=readiness.label;paintLaunchReadiness(quickReadinessHost(),readiness);
 const total=document.getElementById('cr5-total');if(total)total.textContent=displayCost?(cost.live?'Wallet estimate · ':'Planning estimate · ')+ethText(BigInt(cost.totalWei)+(isRangeKit()&&cost.gasPriceWei?BigInt(RANGE_GAS.make+(pqOnChain()&&pqKeyHex()?RANGE_GAS.pointPq:RANGE_GAS.point))*BigInt(cost.gasPriceWei):0n))+' '+c.native:feeView.phase==='reading'?'Reading fees…':'Fees unavailable · retry below';
 const defaults=document.getElementById('cr5-defaults');if(defaults){
  defaults.replaceChildren(document.createTextNode(pick.name+' · '));
  const label=el('span',{},startSteps?'Custom start':'Standard start');
  // Only the authored Standard start label is a definition target. The custom
  // tier’s displayed estimate is not an exact factory read for that tier.
  if(!startSteps){label.dataset.glossaryTerm='standard-start';label.dataset.glossaryOwned='';}
  defaults.append(label,document.createTextNode(' · 100% in pool · LP locked'));
  setGlossaryContext(defaults,{kind:'draft',start:{standardUsd:startBase?.usd??null,actualUsd:startSteps?null:startBase?.usd??null,chainId:String(chainId),quoteSymbol:startBase?.unit??null,steps:startSteps}});
 }
 renderAdv();const adv=$('adv');if(!pqBlocked())advAuto=false;else if(adv&&!adv.hidden&&conn&&conn.chainId===chainId&&!advAuto){advAuto=true;adv.open=true;const custom=document.getElementById('cr5-customize');if(custom)custom.open=true;}
}

async function rpc(method,params){const c=chainById(chainId);const r=await fetch(String(chainId)==='4663'?'/api/rpc/4663':c.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const j=await r.json();if(j.error||typeof j.result!=='string')throw Error(j.error?.message||'RPC error');return j.result;}
async function readFee(){
 const key=chainId+':'+launchFactory();if(!feeRead.has(key))feeRead.set(key,rpc('eth_call',[{to:launchFactory(),data:'0xc763e5a1'},'latest']).then(r=>launchFeeWei(r,chainId)).catch(()=>{feeRead.delete(key);return launchFeeWei(null,chainId);}));
 return feeRead.get(key);
}
// Cost shown before any wallet prompt. With a connected wallet on the right chain and valid fields, the guided flow's
// own fee quote (quoteNextChain: wallet estimate +25%, 2 x base fee + tip, review caps) prices this exact transaction,
// and that quoted transaction is what gets sent after a recheck. Otherwise: planning gas x the public gas price.
const walletRequest=conn=>(method,params)=>conn.entry.provider.request({method,params});
// Checks whether this chain's clean-token launch contract has code (cached; see qx-quick-launch-core primeCleanFactory).
const getCodeOn=id=>a=>fetch(String(id)==='4663'?'/api/rpc/4663':chainById(id).rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getCode',params:[a,'latest']})}).then(r=>r.json()).then(j=>j.result);
const primeClean=(id,o)=>primeCleanFactory(id,getCodeOn(id),o),primePairs=(id,o)=>primePairsFactory(id,getCodeOn(id),o),primeMulti=(id,o)=>primeMultiFactory(id,getCodeOn(id),o);
// Multi-only chains have no cards until code exists, so probe them before they can enter the picker.
async function probeQuickChains(){
 const requested=urlChain();
 await Promise.all(visibleChains().filter(c=>multiFactory(c.id)&&!quickFactory(c.id)).map(async c=>{
  const result=await primeMulti(c.id).catch(()=>null);if(!result?.changed||busy)return;
  if(requested===c.id&&urlChain()===requested){quickChain=c.id;pick=null;extraPools=[];poolPrices=null;pairIdx=0;}
  renderIdeas();
  if(requested===c.id&&urlChain()===requested){const hash=/^#quick(?:-([a-z-]+))?$/.exec(location.hash||'');if(hash)openQuick(hash[1]||'fair',{scroll:true});else if(!pick)openQuick(QUICK_LAUNCH_DEFAULTS.cardId);}
 }));
}
async function refreshCost(){
 if(!pick||!quickFactory(chainId))return null;
 renderPools();if(poolsBlocked()){cost=null;renderQuick();return null;}
 // The launch contract must be settled before the price of the exact transaction is read.
 await primeClean(chainId,{background:true}).catch(()=>{});const run=++costRun,style=pick.style,snipe=pick.snipe,steps=startCapOn()?startSteps:0,pqKey=pqOnChain()?pqKeyHex():null,pair=curPair(),quoteIndex=pair?pair.index:0;
 try{
  const conn=hub.snapshot().current,fee=await readFee();let next=null;
  if(conn&&conn.chainId===chainId&&!pqBlocked()){let f=null;try{f=fields();validateQuick(f);}catch{f=null;}
   if(f){const salt=randomSalt(),data=encodeQuickLaunch({...f,style,snipe,salt,steps,startCap:startCapOn(),pq:pqOnChain(),pqKey,quoteIndex,...multiFields()}),call={to:launchFactory(),data,value:'0x'+(fee+BigInt(f.buyQuote||0)).toString(16)};
    const quote=await quoteCall({chainId,request:walletRequest(conn),owner:conn.owner,call});
    next={...withBuy(quickCost({feeWei:fee,gas:quote.gas,gasPriceWei:BigInt(quote.transaction.maxFeePerGas),dataFeeWei:quote.dataFeeWei||0}),BigInt(f.buyQuote||0)),live:true,quote,owner:conn.owner,key:costKey([f,style,snipe,steps,pqKey,call.to,quoteIndex,multiFields()])};}}
  if(!next){const price=await rpc('eth_gasPrice',[]),buy=firstBuyWei();next={...withBuy(quickCost({feeWei:fee,gas:Math.ceil(PLANNING_GAS[style]*1.25),gasPriceWei:2n*BigInt(price)}),buy>0n?buy:0n),live:false};}
  if(run!==costRun)return cost;cost=next;
 }catch(e){if(run===costRun){cost=null;costError=/insufficient|exceeds balance/i.test(String(e?.message))?launchError(e):/review limit/i.test(String(e?.message))?launchError(e):'Reading network fees. Trying again in a few seconds.';clearTimeout(costTimer);costTimer=setTimeout(()=>void refreshCost(),10000);}}
 if(run===costRun){if(cost)costError='';renderQuick();}return cost;
}
let costTimer=null;const costSoon=()=>{clearTimeout(costTimer);costTimer=setTimeout(()=>void refreshCost(),400);};

// Downscale the picked image to a small square JPEG that fits inside the token's on-chain meta (4 KB).
async function thumbnail(file){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Choose a PNG, JPEG or WebP image.');
 if(file.size>8e6)throw Error('Choose an image under 8 MB.');
 const bitmap=await createImageBitmap(file);try{const side=Math.min(bitmap.width,bitmap.height);
 for(const [px,q] of [[96,.82],[80,.78],[64,.74],[64,.6],[48,.6]]){
  const canvas=el('canvas',{width:px,height:px}),ctx=canvas.getContext('2d');ctx.fillStyle='#fbf9f4';ctx.fillRect(0,0,px,px);
  ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,px,px);
  const url=canvas.toDataURL('image/jpeg',q);if(url.length<=LAUNCH_ICON_LIMIT)return url;
 }
 throw Error('That image is too detailed to store. Try a simpler one.');
 }finally{bitmap.close();}
}

const rememberLast=v=>{try{localStorage.setItem(LAST,JSON.stringify(v));}catch{/* the receipt is still shown on this page */}};
function showDone(token,hash,kit=null){
 const c=chainById(chainId);paintQuickLaunchResult({chain:c,name:$('name').value,symbol:$('symbol').value,image,token,hash});const fl=$('floor-next');if(fl)fl.remove();if(pick?.kit==='floor'){const a=el('a',{id:'qq-floor-next',class:'qxc-primary',href:'/floor?chain='+chainId+'&token='+token},'Next: turn fees into a buy wall →');$('open-market').after(a);}
 $('range-next')?.remove();$('range-line')?.remove();if(kit?.range){const a=el('a',{id:'qq-range-next',class:kit.ok?'qxc-secondary':'qxc-primary',href:'/range?chain='+chainId+'&token='+token},kit.ok?'See your range →':'Finish the range →');$('open-market').after(a);
  if(kit.ok)a.before(el('p',{id:'qq-range-line',class:'qxc-fine'},'LP fees go to its range '+kit.range.slice(0,6)+'…'+kit.range.slice(-4)+'. Liquidity starts after four price checks, 15 minutes apart.'));}
 $('done').focus?.();
}
async function receipt(provider,hash){
 for(let i=0;i<240;i++){
  const r=await provider.request({method:'eth_getTransactionReceipt',params:[hash]}).catch(()=>null);
  if(r)return r;await new Promise(res=>setTimeout(res,i<20?750:2000));
 }
 throw Error('The network took too long to confirm. Your transaction may still land; check it with the link below.');
}
// ---- Auto-range kit: launch + make the range + point the LP fees at it ----
const callAt=tx=>rpc('eth_call',[tx,'latest']);
/// One plain transaction after the launch (make or point): simulated, gas from the network's estimate, fees like /range.
async function sendOne(provider,from,call){
 const tx={from,to:call.to,data:call.data,value:call.value||'0x0'};
 try{await callAt(tx);tx.gas='0x'+(BigInt(await rpc('eth_estimateGas',[tx]))*13n/10n).toString(16);}catch{throw Error('This step would fail right now. Nothing was sent.');}
 try{const b=JSON.parse(await fetch(readRpcUrl(chainId),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['latest',false]})}).then(r=>r.text())).result,tip=BigInt(await provider.request({method:'eth_maxPriorityFeePerGas'}).catch(()=>'0x0'));
  if(b?.baseFeePerGas){tx.maxPriorityFeePerGas='0x'+tip.toString(16);tx.maxFeePerGas='0x'+(BigInt(b.baseFeePerGas)*2n+tip).toString(16);}}catch{}
 const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
 const r=await receipt(provider,hash);if(r.status!=='0x1')throw Error('The network refused this step. Only network gas was spent.');return r;
}
async function launchWithRange(conn,sent,factory,f){
 const provider=conn.entry.provider,from=conn.owner,native=chainById(chainId).native,pq=pqOnChain()?pqKeyHex():null;
 note('Working out your range address…');
 const plan=await planRange({call:callAt,tx:sent,owner:from,bps:rangeBps});
 let until=0n,point;
 if(pq){note('Signing the fee step with your quantum key…');until=BigInt(Math.floor(Date.now()/1000)+840);point=pointCallPq(plan,{signer:pqSigner,chainId,nonce:0n,until});}
 else point=pointCall(plan);
 if(hub.snapshot().current!==conn)throw Error('Your wallet changed. Review your launch again.');
 const calls=[{to:sent.to,data:sent.data,value:sent.value},makeCall(plan),point];
 let hash=null,token=null,rangeErr='';
 const receipts=await sendBatch(provider,{from,chainId,calls,onStatus:t=>{note(t);if(/^Sent/.test(t))$('waiting').hidden=false;}});
 if(receipts){
  hash=receipts.find(r=>r.transactionHash)?.transactionHash||null;token=launchedToken({logs:receipts.flatMap(r=>r.logs||[])},factory);
  if(!token)throw Error('The launch confirmed, but its token could not be read. Check your wallet activity.');
 }else{
  // One by one: the launch first (as any one-tap launch), then the two range steps.
  note('Step 1 of 3: confirm '+ethText(cost.totalWei)+' '+native+' or less in your wallet: the launch fee plus network gas.');
  hash=await provider.request({method:'eth_sendTransaction',params:[sent]});
  rememberLast({chainId,hash,name:f.name.trim(),symbol:f.symbol.trim().toUpperCase(),at:Date.now()});
  $('tx-wait').href=chainById(chainId).explorer+'/tx/'+hash;$('waiting').hidden=false;note('Sent. Waiting for the network to confirm…');
  const r=await receipt(provider,hash);
  if(r.status!=='0x1')throw Error('The network refused this launch. Nothing was created; only network gas was spent.');
  token=launchedToken(r,factory);if(!token)throw Error('The launch confirmed, but its token could not be read. Open the transaction link to see it.');
  try{
   note('Step 2 of 3: create the range. Confirm in your wallet.');await sendOne(provider,from,makeCall(plan));
   let p3=point;
   if(pq){until=BigInt(Math.floor(Date.now()/1000)+840);p3=pointCallPq(plan,{signer:pqSigner,chainId,nonce:0n,until});
    if(!(await checkPqMessage({call:callAt,plan,until,messageHex:p3.messageHex})))throw Error('The signed message did not match the contract. Nothing was sent.');}
   note('Step 3 of 3: point your LP fees at the range. Confirm in your wallet.');await sendOne(provider,from,p3);
  }catch(e){rangeErr=launchError(e);}
 }
 rememberLast({chainId,hash,token,name:f.name.trim(),symbol:f.symbol.trim().toUpperCase(),at:Date.now()});
 fetch('/api/range/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chain:chainId,range:plan.range})}).catch(()=>{});
 const pays=rangeErr?'':await payoutOf({call:callAt,plan}).catch(()=>'');
 $('waiting').hidden=true;
 const ok=pays===plan.range;
 note(ok?'Your token launched. Its LP fees go to its range.':'Your token launched. '+(rangeErr||'The range step did not finish.')+' Finish it on the range page.',!ok);
 showDone(token,hash||'',{range:plan.range,ok});
}
async function launch(){
 if(busy||!pick||!quickFactory(chainId))return;if(!CREATE_EXECUTION_ENABLED){note(CREATE_EXECUTION_HOLD,true);return;}
 let conn=hub.snapshot().current;if(!conn){hub.open();return;}
 let f;try{f=fields();validateQuick(f);}catch(e){note(e.message,true);return;}
 try{await assertTickerFree({symbol:f.symbol,chainId,creator:conn.owner});}catch(e){if(e instanceof TickerTaken){showTaken(e.result);renderQuick();return;}throw e;}
 busy=true;note('');renderQuick();
 try{
  if(conn.chainId!==chainId){note('Switching your wallet to '+chainById(chainId).name+'…');conn=await hub.switchChain(chainId);busy=false;await refreshCost();note('Check the cost, then launch.');return;}
  if(pqBlocked()){busy=false;note('Unlock your quantum key, or turn the post-quantum key off, then launch.',true);return;}
  if(priceBlocked()||poolsBlocked()){if(poolsBlocked())void readPoolPrices();busy=false;note('Refreshing price… The starting market cap needs a live price. Try again in a moment, or choose Standard.',true);return;}
  const startReviewKey=JSON.stringify([startTier,startSteps,customUsd,startBase]);
  const key=costKey([f,pick.style,pick.snipe,startCapOn()?startSteps:0,pqOnChain()?pqKeyHex():null,launchFactory(),curPair()?.index||0,multiFields()]);
  // The person must have seen the price of this exact transaction before the wallet opens.
  if(!cost?.live||cost.key!==key||cost.owner!==conn.owner){busy=false;await refreshCost();note('Check the cost, then launch.');return;}
  const tx=await recheckCall(chainId,{request:walletRequest(conn),quote:cost.quote}).catch(async e=>{busy=false;await refreshCost();throw e;});
  const factory=String(tx.to).toLowerCase(),sent={from:conn.owner,to:tx.to,data:tx.data,value:tx.value,gas:tx.gas,maxFeePerGas:tx.maxFeePerGas,maxPriorityFeePerGas:tx.maxPriorityFeePerGas};
  const shownCapUsd=capAtSteps(startBase?.usd,startSteps);
  const selectedCapUsd=selectedStart({tier:startTier,steps:startSteps,customUsd,standardUsd:startBase?.usd}).selectedCapUsd;
  await assertQuickStart({chainId,transaction:sent,expectedFactory:launchFactory(),expectedSteps:startSteps,expectedQuoteIndex:curPair()?.index||0,shownCapUsd,selectedCapUsd,quoteUsd:startBase?.quoteUsd,request:walletRequest(conn)});
  if(startReviewKey!==JSON.stringify([startTier,startSteps,customUsd,startBase])||priceBlocked()||poolsBlocked()||key!==costKey([fields(),pick.style,pick.snipe,startCapOn()?startSteps:0,pqOnChain()?pqKeyHex():null,launchFactory(),curPair()?.index||0,multiFields()])||hub.snapshot().current!==conn)throw Error(START_PRICE_HOLD);
  if(await uploadTokenBanner(bannerData)!==f.banner||hub.snapshot().current!==conn)throw Error('Your banner changed. Review your launch again.');
  if(isRangeKit()){await launchWithRange(conn,sent,factory,f);return;}
  note('Confirm '+ethText(cost.totalWei)+' '+chainById(chainId).native+' or less in your wallet: the launch fee'+(BigInt(cost.buyWei||0)>0n?', your first buy':'')+' plus network gas.');
  const hash=await conn.entry.provider.request({method:'eth_sendTransaction',params:[sent]});
  rememberLast({chainId,hash,name:f.name.trim(),symbol:f.symbol.trim().toUpperCase(),at:Date.now()});
  $('tx-wait').href=chainById(chainId).explorer+'/tx/'+hash;$('waiting').hidden=false;note('Sent. Waiting for the network to confirm…');
  const r=await receipt(conn.entry.provider,hash);
  if(r.status!=='0x1')throw Error('The network refused this launch. Nothing was created; only network gas was spent.');
  const token=launchedToken(r,factory);if(!token)throw Error('The launch confirmed, but its token could not be read. Open the transaction link to see it.');
  rememberLast({chainId,hash,token,name:f.name.trim(),symbol:f.symbol.trim().toUpperCase(),at:Date.now()});
  $('waiting').hidden=true;note('Your token launched.');showDone(token,hash);
  if(f.teamBuy?.wallets?.length&&!f.teamBuy.__error){teamPendingEvm={chainId,token,owner:conn.owner,team:f.teamBuy};saveTeamPending();paintTeamSendEvm();}
 }catch(e){note(launchError(e),true);}
 finally{busy=false;renderQuick();}
}

// QCaster's "Review in Create" (?art=<banner sha256>): the image and banner made or picked there. readHandoff re-checks the
// formats and that the banner bytes hash to the reference; the launch still re-uploads the banner and re-checks it.
async function applyArtHandoff(){
 const ref=new URLSearchParams(location.search).get('art');if(!ref)return;
 const art=await readHandoff(ref).catch(()=>null);if(!art)return;
 ++imageRevision;++bannerRevision;
 bannerSource='handoff';image=art.image;$('preview').src=image;$('preview').hidden=false;$('image-status').textContent='Image ready.';
 banner=art.banner;bannerData=art.bannerData;$('banner-preview').src=bannerData;$('banner-preview').hidden=false;$('banner-status').textContent='Banner ready.';
 cost=null;renderQuick();costSoon();keepDraft();
}
async function generateBanner(file,imageRev){
 const rev=++bannerRevision;bannerSource='auto';banner='';bannerData='';cost=null;costRun++;$('banner-retry').hidden=true;$('banner-status').textContent='Making a banner from your image…';$('need-banner').textContent='Preparing your banner…';renderQuick();
 try{const data=await prepareTokenBanner(file,{blur:true});if(rev!==bannerRevision||imageRev!==imageRevision)return;const hash=await uploadTokenBanner(data);if(rev!==bannerRevision||imageRev!==imageRevision)return;banner=hash;bannerData=data;$('banner-preview').src=data;$('banner-preview').hidden=false;$('banner-status').textContent='Made from your image. Edit it here or on your token page.';}
 catch(e){if(rev!==bannerRevision||imageRev!==imageRevision)return;$('banner-status').textContent=e.message;$('need-banner').textContent='Your banner did not save. Retry under Customize launch.';$('banner-retry').hidden=false;}
 renderQuick();costSoon();keepDraft();
}
function mount(){
 if(!$('ideas'))return;
 const savedIdentity=identityDraft.get(),prefill=readLaunchPrefill(location),entry=quickLaunchEntry({chain:urlChain()||savedIdentity?.chain,style:prefill?.style,start:URL_TIER,hash:location.hash});
 simpleDefault=entry.simple;pqOptOut=simpleDefault;quickChain=entry.chain;
 const draftNotice=el('p',{id:'qq-draft-notice',class:'qxc-message',role:'status',hidden:true});$('image-status').after(draftNotice);
 if(savedIdentity)restoreDraft(savedIdentity);else if(entry.chain==='solana'){try{const old=JSON.parse(localStorage.getItem('qhooks:sol-launch:draft')||'null'),profile=editableTokenProfileDraft('solana');restoreDraft({name:old?.name||'',symbol:old?.symbol||'',...profile,banner:'',bannerData:profile.banner,bannerSource:profile.banner?'custom':'',x:profile.links?.x,telegram:profile.links?.telegram,website:profile.links?.website});}catch{}}
 renderIdeas();
 chainSelect?.addEventListener('change',()=>{if(!busy&&chainSelect.value!=='solana'&&chainSelect.value!==currentChain())setQuickChain(chainSelect.value);});
 $('use-robinhood')?.addEventListener('click',()=>setQuickChain('4663'));
 $('open').addEventListener('click',()=>launchCard(pick?.id||'fair'));
 for(const id of ['name','symbol'])$(id).addEventListener('input',()=>{if(id==='symbol'){$('symbol').value=$('symbol').value.toUpperCase();checkTickerSoon();}renderQuick();costSoon();keepDraft();});
 $('image').addEventListener('change',async()=>{const file=$('image').files?.[0];if(!file)return;lastImageFile=file;const rev=++imageRevision;image='';cost=null;costRun++;if(bannerSource!=='custom'&&bannerSource!=='handoff'){banner='';bannerData='';bannerRevision++;}renderQuick();
  try{const data=await thumbnail(file);if(rev!==imageRevision)return;image=data;$('preview').src=image;$('preview').hidden=false;$('image-status').textContent='Image ready.';if(bannerSource!=='custom'&&bannerSource!=='handoff')void generateBanner(file,rev);}
  catch(e){if(rev!==imageRevision)return;image='';$('preview').hidden=true;$('image-status').textContent=e.message;}renderQuick();costSoon();keepDraft();});
 $('banner-retry')?.addEventListener('click',()=>{if(!busy){if(lastImageFile)void generateBanner(lastImageFile,imageRevision);else restoreBannerReference();}});
 $('banner').addEventListener('change',async()=>{const file=$('banner').files?.[0];if(!file)return;const rev=++bannerRevision;bannerSource='custom';banner='';bannerData='';cost=null;costRun++;renderQuick();$('banner-status').textContent='Preparing your banner…';
  try{const data=await prepareTokenBanner(file);if(rev!==bannerRevision)return;$('banner-preview').src=data;$('banner-preview').hidden=false;const hash=await uploadTokenBanner(data);if(rev!==bannerRevision)return;banner=hash;bannerData=data;$('banner-status').textContent='Banner ready.';}
  catch(e){if(rev!==bannerRevision)return;banner='';$('banner-preview').hidden=true;$('banner-status').textContent=e.message;}renderQuick();costSoon();keepDraft();});
 $('launch').addEventListener('click',()=>void launch());
 $('change').addEventListener('click',()=>{const custom=document.getElementById('cr5-customize');if(custom)custom.open=true;$('ideas').scrollIntoView({block:'start'});});
 for(const id of ['description','x','telegram','website'])$(id)?.addEventListener('input',()=>{renderQuick();costSoon();keepDraft();});
 const idea=document.getElementById('cr5-idea');const ideaLink=()=>{if(idea){const f=fields(),q=['Help me design a token',f.name&&'called '+f.name,f.symbol&&'($'+f.symbol+')',f.description].filter(Boolean).join(' ');idea.href='/qcaster?q='+encodeURIComponent(q)+'#design';}};
 for(const id of ['name','symbol','description'])$(id)?.addEventListener('input',ideaLink);ideaLink();
 hub.subscribe(()=>{void pqControl?.refresh();renderQuick();if(pick)costSoon();checkTickerSoon();});
 readUsd();
 if(prefill){
  if(prefill.chain&&ideaCards(prefill.chain).length){quickChain=prefill.chain;renderIdeas();}
  if(prefill.name!==undefined)$('name').value=prefill.name;
  if(prefill.ticker!==undefined)$('symbol').value=prefill.ticker;
  openQuick(prefill.style,{scroll:true});checkTickerSoon();costSoon();
 }else{openQuick(entry.card);if(!simpleDefault&&chainId!=='solana'){const custom=document.getElementById('cr5-customize');if(custom)custom.open=true;}}
 ideaLink();
 if(!pick&&chainId!=='solana')chainPresentation('unavailable');
 keepDraft();if(chainId==='solana')document.dispatchEvent(new CustomEvent('qhooks:sol-create',{detail:{chain:'solana',quick:true}}));
 void applyArtHandoff();
 void probeQuickChains();
}
mount();
