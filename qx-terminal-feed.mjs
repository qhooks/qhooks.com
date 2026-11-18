import{hasVisibleTerminalDialog}from'./qx-terminal-selection.mjs';
import {reportHotEvent, createHotLoader} from './qx-hot-client.mjs';
import {HOT_WINDOWS} from './qx-hot-core.mjs';
import{feedRowPriceView}from'./qx-feed-row-price-view.mjs';
import {createDiscoveryLivenessView} from './qx-discovery-liveness-view.mjs';
import{defaultTrendingMode,projectTrendingContracts,discoveryContractKey}from'./qx-discovery-groups.mjs';
import{publicReadFetch}from'./qx-public-read.mjs';
import{quickBuyPlan}from'./qx-quick-buy-plan.mjs';
import{FUND_TOKENS,fundRow}from'./qx-fund-catalog.mjs';
import {isQhooksPriceAsset,priceState} from './qx-price-state.mjs';
import {mountDiscoveryNext} from './qx-discovery-next.mjs';
import {discoveryBadges} from './qx-discovery-badges.mjs';
import {evidenceMetrics,rowEvidence} from './qx-discovery-evidence.mjs';
import {SAFE_START,safeStartSelection,SAFE_START_LABELS,safeStartFacts,markSafeStart,filterOwner,readDiscoveryFilters,writeDiscoveryFilters} from './qx-safe-start.mjs';
import {hiddenByFilters,viewFilters,bypassKey} from './qx-filter-bypass.mjs';
import {mountPulseBoard} from './qx-pulse-board.mjs';
import {createFeedPriceCache} from './qx-feed-price-cache.mjs';
import{openQuickAmountSettings}from'./qx-quick-amount-settings.mjs';
import {mountTokenLibrary} from './qx-token-library.mjs';
import {bindTokenAvatar} from './qx-token-avatar.mjs';
import {WINDOWS,filterDiscovery,createMarketViews,validateDiscoveryFilters} from './qx-discovery-model.mjs';
import {discoveryCandidate} from './qx-discovery-rank.mjs';
import {createDiscoveryUpdates} from './qx-discovery-updates.mjs';
import {createPollScheduler,flipMeasure,flipPlay,markArrived,installLiveStyles} from './qx-feed-live.mjs';
import {plainMarketError} from './qx-terminal-data.mjs';
import {fetchDexPairs,pickPair,rowPatch,applyRowPatch,DEX_CHAINS} from './qx-dex-live.mjs';
import {renderFeedFeedback,feedFeedbackStatus,feedFeedbackSource} from './qx-terminal-feed-presentation.mjs';
import {browserFeed,browserSearch,readCachedFeed,writeCachedFeed} from './qx-browser-market.mjs';
import {applyTokenQuery} from './qx-tg-prefill.mjs';
import {classifyQuery, createWalletLookup, renderWalletPanel, knownWallet, lastWalletView} from './qx-wallet-lookup.mjs';
import {outsideCosts} from './qx-wallet-pnl.mjs';
import {tokenFacts} from './qx-token-venue.mjs';
import {readDiscoveryLink,syncDiscoveryLink} from './qx-discovery-link.mjs';
import {applyColumnVisibility,newPairsOnly,paintFirstTradePending,paintPromotion} from './qx-discovery-rows.mjs';
globalThis.__qxTokenQuery = globalThis.__qxTokenQuery || applyTokenQuery();
import {
  CHAINS, TABS, SORT_KEYS, DASH, rowViewModel, sortRows, launchRow, searchRow,
  preferences, savePreference, hasTokenHash, createFeedLoader, age,
} from './qx-terminal-feed-core.mjs';

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  node.append(...children.filter(x => x !== null));
  return node;
};
const button = (label, attrs = {}) => el('button', { type: 'button', ...attrs }, label);
const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
let storage;
try { storage = window.localStorage; } catch {}
const prefs = preferences(storage);
const state = { ...prefs, tab: prefs.tab === 'launches' ? 'trending' : prefs.tab, markets: [], data: null,
  loading: false, error: null, query: '', hits: [], searching: false, searchError: null, wallet: null };
let knownFeedRows = [];
try { state.hotWindow = storage?.getItem('qxt:hot:window') === '1h' ? '1h' : '24h'; } catch { state.hotWindow = '24h'; }
const lookupWallet = createWalletLookup({costs: outsideCosts()}); // walletpnl: outside-token P&L from the wallet's own chain history
let filterWallet=null;
function savedFilters(){try{return validateDiscoveryFilters(readDiscoveryFilters(storage,filterWallet)||{});}catch{return validateDiscoveryFilters();}}
function persistFilters(){return writeDiscoveryFilters(storage,filterWallet,state.filters);}
const discoveryFilterFacts=row=>({...evidenceMetrics(row),...safeStartFacts(row,rowEvidence(row))});
let savedWindow;try{savedWindow=storage?.getItem('qxt:discover:window');}catch{}state.window=WINDOWS.some(([k])=>k===savedWindow)?savedWindow:'h6'; /* first open: 6h (Randall, 2026-11-09) */state.filters=savedFilters();
if(WINDOWS.some(([key])=>key===state.sort.key)){state.window=state.sort.key;state.sort={...state.sort,key:'move'};savePreference(storage,'window',state.window);savePreference(storage,'sort',state.sort);}
const savedViews=createMarketViews(storage);
try{state.layout=storage?.getItem('qhooks:discovery:layout:v1')==='pulse'?'pulse':'list';}catch{state.layout='list';}
let pulse=null,livePoll=null,filteredPollAt=0,lastFullLoadAt=Date.now();const pulseMode=()=>state.tab!=='hot'&&state.layout==='pulse'&&!state.query&&!state.wallet;
const discoveryPrices=createFeedPriceCache({storage});
if(['trending','funds'].includes(new URLSearchParams(location.search).get('discover'))){state.layout='list';state.tab=new URLSearchParams(location.search).get('discover');state.chain='all';}
let wantedLaunch = prefs.tab === 'launches', api = null, quickRow = null, quickHome = null;
// A shared link (?tab=&chain=&window=&view=) sets this visit's view without touching the saved choices.
{const link=readDiscoveryLink(location.search,{tabs:['launches',...TABS.map(([id])=>id)],chains:CHAINS,windows:WINDOWS});if(link.chain)state.chain=link.chain;if(link.window)state.window=link.window;if(link.layout)state.layout=link.layout;if(link.tab){wantedLaunch=link.tab==='launches';state.tab=wantedLaunch?'trending':link.tab;}}
let focusedKey = null, savedScroll = 0, savedWindowScroll = 0, opening = false, searchGeneration = 0;
let searchTimer, searchController, tokenLibraryUI, lastLibrarySearch = '';
const main = document.getElementById('qxt-main');
const search = document.getElementById('qxt-search');
for(const href of ['/qx-pulse.css','/qx-discovery-badges.css','/qx-discovery-groups.css','/qx-discovery-columns.css'])if(!document.querySelector('link[href="'+href+'"]'))document.head.append(el('link',{rel:'stylesheet',href}));
const columns = [
  ['token', 'Token'], ['price', 'Price'], ['move', 'Change'],
  ['volume', 'Volume 24h'], ['liquidity', 'Liquidity'], ['mcap', 'MCap'],
  ['holders','Holders'], ['txns', 'B / S · 24h'], ['makers', 'Wallet activity'], ['top10','Top 10'], ['dev','Dev'], ['riskgrid','Holder checks'], ['safety', 'Safety'], ['buy', 'Buy'],
];
const nodes = new Map();
let renderMode={},orderFrozen=false;installLiveStyles(document);
const livenessView=createDiscoveryLivenessView();
const expandedContracts=new Set();let contractProjection={active:false},contractContext='';
const layoutControls=el('div',{class:'qxfd-layout-controls',role:'group','aria-label':'Token layout'});
for(const [id,label]of[['list','List'],['pulse','Pulse']]){const b=button(label,{'data-layout':id,'aria-pressed':String(state.layout===id)});b.addEventListener('click',()=>{if(state.layout===id)return;loader.cancel();state.layout=id;state.loading=false;try{storage?.setItem('qhooks:discovery:layout:v1',id);}catch{}renderRows();refresh();});layoutControls.append(b);}
const root = el('section', { class: 'qxfd qxfd-price-visible', id: 'qxt-discover', 'aria-label': 'Tokens' });
const tabs = el('div', { class: 'qxfd-tabs', role: 'tablist', 'aria-label': 'Token lists' });
const chainGroup = el('div', { class: 'qxfd-chains', role: 'group', 'aria-label': 'Token chains' });
const status = el('span', { class: 'qxfd-status', role: 'status', 'aria-live': 'polite' });
const windows=el('div',{class:'qxfd-windows',role:'group','aria-label':'Price change window'},...WINDOWS.map(([key,label])=>button(label,{'data-window':key,'aria-pressed':String(key===state.window)})));
const hotWindows=el('div',{class:'qxfd-windows qxfd-hot-windows',role:'group','aria-label':'Hot searches window',hidden:'',title:'Current hour or latest 24 hourly buckets'},...HOT_WINDOWS.map(([key,label])=>button(label,{'data-hot-window':key,'aria-pressed':String(key===state.hotWindow)})));
hotWindows.addEventListener('click',event=>{const key=event.target.closest('[data-hot-window]')?.dataset.hotWindow;if(!HOT_WINDOWS.some(([id])=>id===key)||key===state.hotWindow)return;state.hotWindow=key;state.data=null;try{storage?.setItem('qxt:hot:window',key);}catch{}for(const b of hotWindows.children)b.setAttribute('aria-pressed',String(b.dataset.hotWindow===key));refresh();});
const pauseUpdates=button('Pause updates',{'aria-pressed':'false',class:'qxfd-update-toggle'});
const arrivals=el('span',{class:'qxfd-arrivals',role:'status','aria-live':'polite'});
const quickSlot = el('div', { class: 'qxfd-quick-slot' });
const sortSelect = el('select', { 'aria-label': 'Sort tokens', class: 'qxfd-sort-select' },
  el('option', { value: '' }, 'Default order'), el('option',{value:'hot:desc'},'Hot now'), ...columns.filter(([key]) => SORT_KEYS.includes(key)).flatMap(([key, label]) => [
    el('option', { value: key + ':desc' }, label + ' ↓'), el('option', { value: key + ':asc' }, label + ' ↑'),
  ]));
const sortHint=el('span',{class:'qxfd-sort-hint',id:'qxfd-sort-hint'},'Sort this list');
const trendingNote=el('p',{class:'qxfd-trending-note',id:'qxfd-trending-note'},'Search and selected sorts show the original received matches. Your custom filters still apply.');
sortSelect.setAttribute('aria-describedby','qxfd-sort-hint qxfd-trending-note');
sortSelect.title='Hot now ranks fresh momentum, then observed 24h volume and activity.';
const filterFields={};
const filterDetails=el('details',{class:'qxfd-filter-details'},el('summary',{},'Filters'));
const filterGrid=el('div',{class:'qxfd-filter-grid'});
for(const [key,label] of [['liquidityMin','Min liquidity, $'],['liquidityMax','Max liquidity, $'],['capMin','Min cap / FDV, $'],['capMax','Max cap / FDV, $'],['volumeMin','Min 24h volume, $'],['transactionsMin','Min 24h transactions'],['ageMinHours','Min age, hours'],['ageMaxHours','Max age, hours'],['devMaxPct','Max dev holding, %'],['top10MaxPct','Max top-10 holding, %'],['venue','Venue']]){
 const input=el('input',{type:'text',inputmode:key==='venue'?'text':'decimal','aria-label':label,placeholder:key==='venue'?'Any venue':'Any'});filterFields[key]=input;filterGrid.append(el('label',{},el('span',{},label),input));
}
for(const [key,label]of [['hasSocials','Has social links'],['sameBlock','Snipers · entry signal'],['sharedFunding','Insiders · funding signal']]){const input=el('select',{'aria-label':label},el('option',{value:''},'Any'),el('option',{value:'yes'},key==='hasSocials'?'Has links':'Signal observed'));filterFields[key]=input;filterGrid.append(el('label',{},el('span',{},label),input));}
for(const [key,label]of Object.entries(SAFE_START_LABELS)){const input=el('select',{'aria-label':label},el('option',{value:''},'Off'),el('option',{value:'yes'},'On'));filterFields[key]=input;filterGrid.append(el('label',{},el('span',{},label),input));}
filterGrid.append(el('p',{class:'qxfd-filter-coverage'},'QProof Danger · pulled LP hides proven findings only. Unchecked tokens stay. Verified LP only uses recent checks for this exact pool and hides unknown.'));
filterGrid.append(el('p',{class:'qxfd-filter-coverage'},'Holder filters use recent Holder X-ray reads on this device. Unknown values are excluded. Entry and funding signals do not prove sniper or insider activity.'));
const applyFilters=button('Apply filters'),resetFilters=button('Reset'),viewName=el('input',{type:'text',maxlength:32,'aria-label':'Saved view name',placeholder:'Name this view'}),saveView=button('Save view'),removeView=button('Delete view');
const viewSelect=el('select',{'aria-label':'Saved market views'}),filterMessage=el('p',{role:'status','aria-live':'polite',class:'qxfd-filter-message'});
const renderViews=()=>{viewSelect.replaceChildren(el('option',{value:''},'Saved views'),...savedViews.list().map(v=>el('option',{value:v.name},v.name)));};renderViews();
filterDetails.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();filterDetails.open=false;listOptions.open=false;listOptions.querySelector('summary').focus();}});
filterDetails.append(el('div',{class:'qxfd-saved-views'},viewSelect,viewName,saveView,removeView),filterGrid,el('div',{class:'qxfd-filter-actions'},applyFilters,resetFilters),filterMessage);
const presetBar=el('div',{class:'qxfd-filter-actions','aria-label':'Market filter presets'});
const presetChips=[];
for(const [label,filters] of [['Active',{liquidityMin:'10000',volumeMin:'10000',transactionsMin:'20'}],['Today',{liquidityMin:'1000',volumeMin:'1000',transactionsMin:'10',ageMaxHours:'24'}]]){
 const preset=button(label,{'aria-pressed':'false'});presetChips.push({button:preset,filters:validateDiscoveryFilters(filters)});preset.addEventListener('click',()=>{const same=JSON.stringify(state.filters)===JSON.stringify(validateDiscoveryFilters(filters));state.filters=validateDiscoveryFilters(same?{}:filters);persistFilters();for(const [k,input]of Object.entries(filterFields))input.value=state.filters[k]||'';filterDetails.open=false;filterDetails.querySelector('summary').focus({preventScroll:true});filterMessage.textContent=same?'Filters cleared.':label+' filters applied.';renderRows();refresh();});presetBar.append(preset);
}
// Common presets live in the instant chip row.
function captureFilters(){return validateDiscoveryFilters(Object.fromEntries(Object.entries(filterFields).map(([k,v])=>[k,v.value])));}
function paintFilterFields(){for(const [key,input]of Object.entries(filterFields))input.value=state.filters[key]||'';}
paintFilterFields();
function updateWindow(){if(typeof windowChip!=='undefined')windowChip.value=state.window;for(const b of windows.children)b.setAttribute('aria-pressed',String(b.dataset.window===state.window));const label=WINDOWS.find(([k])=>k===state.window)?.[1]||'24h';const headButton=headers.get('move')?.querySelector('button');if(headButton){headButton.setAttribute('aria-label',label+' change');headButton.replaceChildren(el('span',{class:'qxfd-head-full'},label+' change'),el('span',{class:'qxfd-head-short','aria-hidden':'true'},label));}}
windows.addEventListener('click',event=>{const key=event.target.closest('[data-window]')?.dataset.window;if(!WINDOWS.some(([k])=>k===key)||key===state.window)return;state.window=key;savePreference(storage,'window',key);updateWindow();refresh();});
applyFilters.addEventListener('click',()=>{try{state.filters=captureFilters();const saved=persistFilters();filterDetails.open=false;filterDetails.querySelector('summary').focus({preventScroll:true});filterMessage.textContent=saved?'Filters saved for this wallet.':'Filters applied for this session. This device could not save them.';renderRows();refresh();}catch(error){filterMessage.textContent=error.message;}});
const widen=button('Widen filters',{class:'qxfd-widen'});widen.addEventListener('click',()=>resetFilters.click());
// Hidden-by-filters line: Show all pauses this view's filters in memory only; saved filters stay.
let filterBypass=null,hiddenCount=0;const hiddenText=el('span'),showAll=button('Show all',{class:'qxfd-show-all'}),hiddenLine=el('p',{class:'qxfd-hidden-line',hidden:''},hiddenText,showAll);
showAll.addEventListener('click',()=>{filterBypass=filterBypass===bypassKey(state)?null:bypassKey(state);renderRows();refresh();});
resetFilters.addEventListener('click',()=>{state.filters=validateDiscoveryFilters();persistFilters();paintFilterFields();filterMessage.textContent='Filters cleared.';renderRows();refresh();});
saveView.addEventListener('click',()=>{try{state.filters=captureFilters();persistFilters();savedViews.save({name:viewName.value,chain:state.chain,tab:state.tab,window:state.window,filters:state.filters,layout:state.layout,stage:pulse.stage()});renderViews();viewSelect.value=viewName.value.trim();filterMessage.textContent='View saved on this device.';renderRows();refresh();}catch(error){filterMessage.textContent=error.message;}});
removeView.addEventListener('click',()=>{try{if(!viewSelect.value)return;savedViews.remove(viewSelect.value);renderViews();filterMessage.textContent='View deleted.';}catch(error){filterMessage.textContent=error.message;}});
viewSelect.addEventListener('change',()=>{const v=savedViews.list().find(v=>v.name===viewSelect.value);if(!v)return;if(state.wallet)clearSearch();loader.cancel();state.layout=v.layout==='pulse'?'pulse':'list';try{storage?.setItem('qhooks:discovery:layout:v1',state.layout);}catch{}state.tab=v.tab;state.window=v.window;state.chain=CHAINS.some(([k])=>k===v.chain)?v.chain:'all';state.filters=v.filters;persistFilters();state.data=null;for(const [k,input]of Object.entries(filterFields))input.value=v.filters[k]||'';for(const b of chainGroup.children)b.setAttribute('aria-pressed',String(b.dataset.chain===state.chain));viewName.value=v.name;pulse.select(v.stage||'new');renderTabs();updateWindow();renderRows();refresh();});
const panel = el('div', { role: 'tabpanel', id: 'qxfd-panel', class: 'qxfd-panel' });
const noticeText = el('span');
const retry = button('Retry', { class: 'qxfd-retry' });
const notice = el('div', { class: 'qxfd-notice', role: 'status', hidden: '' }, noticeText, retry);
const scroll = el('div', { class: 'qxfd-scroll' });
const table = el('table', { class: 'qxfd-table qxfd-has-holders', 'aria-label': 'Tokens' });
const header = el('tr');
const headers = new Map();
for (const [key, label] of columns) {
  const th = el('th', { scope: 'col', class: 'qxfd-' + key });
  if (SORT_KEYS.includes(key)) {
    const short={mcap:'MC',volume:'Vol',liquidity:'Liq',holders:'Hold',move:'Change'}[key]||label;
    const sortButton=button('', { 'data-sort': key, title: 'Sort by ' + label,'aria-label':label });sortButton.append(el('span',{class:'qxfd-head-full'},label),el('span',{class:'qxfd-head-short','aria-hidden':'true'},short));th.append(sortButton);
    th.setAttribute('aria-sort', 'none');
    headers.set(key, th);
  } else th.textContent = label;
  header.append(th);
}
const tbody = el('tbody');
table.append(el('thead', {}, header), tbody);
scroll.append(table);
const emptyCopy=el('p',{class:'qxfd-empty-copy'}),empty = el('div', { class: 'qxfd-empty', hidden: '' },emptyCopy);
const nextSteps=mountDiscoveryNext({onTrending:()=>showTrending()});
const marketsEmpty=el('a',{class:'qa-btn qa-btn--quiet',href:'/markets#major-assets'},'Browse Markets →');
const walletPanel = el('div', {class: 'qxfd-wallet-slot', hidden: ''});
const count = el('span');
const source = el('span');
const heading = el('h1', {}, 'Tokens');
panel.append(notice, scroll, empty, walletPanel);
// While a wallet is shown, the list controls (tabs, chains, sort, windows) step aside so the wallet starts at the top.
const walletBack = button('← Tokens', { class: 'qxfd-wallet-back', hidden: '' });
const listOptions=el('details',{class:'qxfd-list-options'},el('summary',{},'Filters'));
listOptions.append(el('div',{class:'qxfd-list-options-body'},quickSlot,
 el('div',{class:'qxfd-filterbar'},chainGroup,el('div',{class:'qxfd-sort-tools'},sortHint,sortSelect)),
 trendingNote,presetBar,el('div',{class:'qxfd-viewbar'},windows,pauseUpdates,arrivals),filterDetails));
listOptions.addEventListener('toggle',()=>{if(listOptions.open)filterDetails.open=true;});
listOptions.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!e.isComposing&&e.keyCode!==229){e.preventDefault();listOptions.open=false;listOptions.querySelector('summary').focus();}});
const chainChip=el('select',{'aria-label':'Filter chain',class:'qxfd-chain-chip'},...CHAINS.map(([id,name])=>el('option',{value:id,title:name},({all:'All',solana:'SOL','4663':'RH','56':'BNB','99901':'Ely','1':'ETH','8453':'Base','42161':'ARB','143':'MON'})[id]||name)));
chainChip.value=state.chain;chainChip.addEventListener('change',()=>chainGroup.querySelector('[data-chain="'+chainChip.value+'"]')?.click());
const windowChip=el('select',{'aria-label':'Change window',class:'qxfd-window-chip'},...WINDOWS.map(([id,label])=>el('option',{value:id},label)));windowChip.value=state.window;windowChip.addEventListener('change',()=>windows.querySelector('[data-window="'+windowChip.value+'"]')?.click());
const settings=button('',{'aria-label':'Trade settings',class:'qxfd-settings'}),quickChip=button('0.01 ETH',{'aria-label':'Quick-buy amounts in Trade settings',class:'qxfd-quick-chip','data-icon':'bolt'});
const settingsChain=()=>state.chain==='all'?'4663':state.chain;
// One shared amount is shown only when it is true for every visible quick-buy row.
const paintQuickPreset=models=>{const labels=new Set(models.filter(vm=>vm.quick.supported&&!vm.quick.stock).map(vm=>vm.quick.value+' '+vm.quick.unit)),plan=quickBuyPlan({chainId:settingsChain(),kind:'launch'},api?.quickForChain?.(settingsChain())||api?.state.quick||{}),mixed=state.chain==='all'&&labels.size>1;const caption=mixed?'Amounts':labels.size===1?[...labels][0]:plan.payment?plan.value+' '+plan.unit:'Trade settings';text(quickChip,caption);quickChip.setAttribute('aria-label',quickChip.textContent+' · Trade settings');quickChip.title=mixed?'Quick-buy amounts vary by chain. Open Trade settings.':'Quick buy: '+caption;};

for(const control of[settings,quickChip])control.addEventListener('click',()=>openQuickAmountSettings({chainId:settingsChain(),opener:control}));
const hotNow=button('Hot now',{class:'qxfd-hot-now','aria-pressed':'false',title:'Sort by fresh momentum and observed 24h volume'});hotNow.addEventListener('click',()=>setSort('hot','desc'));
const instant=el('div',{class:'qxfd-instant'},chainChip,windowChip,hotNow,...presetChips.map(p=>p.button),listOptions,settings);
const searchToggle=button('⌕',{'aria-label':'Search tokens',class:'qxfd-search-toggle','aria-expanded':'false','aria-controls':'qxt-search'});
searchToggle.addEventListener('click',()=>{root.classList.toggle('qxfd-search-open');searchToggle.setAttribute('aria-expanded',String(root.classList.contains('qxfd-search-open')));if(root.classList.contains('qxfd-search-open'))search.focus({preventScroll:true});});
search.addEventListener('focus',()=>{root.classList.add('qxfd-search-open');searchToggle.setAttribute('aria-expanded','true');});
search.addEventListener('blur',()=>{if(!search.value){root.classList.remove('qxfd-search-open');searchToggle.setAttribute('aria-expanded','false');}});
let proRows=false;try{proRows=storage?.getItem('qhooks:discovery:pro-rows:v1')==='true';}catch{}
root.classList.toggle('qxfd-pro-rows',proRows);
const proToggle=button('Pro rows',{'aria-pressed':String(proRows),class:'qxfd-pro-toggle'});
proToggle.addEventListener('click',()=>{proRows=!proRows;root.classList.toggle('qxfd-pro-rows',proRows);proToggle.setAttribute('aria-pressed',String(proRows));try{storage?.setItem('qhooks:discovery:pro-rows:v1',String(proRows));}catch{}});
const presetControls=el('div',{class:'qxfd-preset-controls',role:'group','aria-label':'Instant filter presets'},...presetChips.map(p=>p.button));
listOptions.querySelector('.qxfd-list-options-body').prepend(presetControls);
instant.insertBefore(proToggle,listOptions);instant.append(hotWindows,status);
const listControls=[el('div',{class:'qxfd-toolbar'},layoutControls,searchToggle,tabs),instant];
for(const control of[applyFilters,resetFilters,...presetChips.map(p=>p.button)])control.addEventListener('click',()=>{listOptions.open=false;listOptions.querySelector('summary').focus({preventScroll:true});});
document.addEventListener('pointerdown',event=>{if(listOptions.open&&!listOptions.contains(event.target))listOptions.open=false;});

root.append(
  el('div', { class: 'qxfd-heading' }, walletBack, heading),
  ...listControls,
  panel,
  el('div', { class: 'qxfd-footer' }, count, source,
    el('span', { class: 'qxfd-hint' }, '↑ ↓ Navigate · Enter Open · / Search · Esc Tokens')),
);
main.prepend(root);
const loaderOptions=changed=>({fetcher:publicReadFetch,timeout:25000,serverTimeout:12000,browserDelay:600,storage,browser:opts=>browserFeed(opts),cacheRead:readCachedFeed,cacheWrite:writeCachedFeed,priceCache:discoveryPrices,changed});
pulse=mountPulseBoard({livenessView,host:panel,el,storage,makeLoader:({changed})=>createFeedLoader(loaderOptions(changed)),makeRow,updateRow,
 onTrending:()=>showTrending(),context:()=>({chain:state.chain,window:state.window,filters:state.filters,factsOf:discoveryFilterFacts}),visible:()=>!document.hidden&&!root.hidden&&pulseMode(),
 viewModels:rows=>sortRows(rows.filter(discoveryCandidate).map(r=>rowViewModel(r,{quick:api?.quickForChain?.(r.chainId)||api?.state.quick||{},window:state.window})),state.sort),
 onModels:models=>{if(!pulseMode())return;paintQuickPreset(models);text(count,models.length+' tokens in Pulse');text(source,'New · Near bond ≥50% · Migrated with a destination');}
});

// Shared metric labels sit above each live Pulse column, not in every card.
for(const pulseTable of pulse.root.querySelectorAll('table.qxfd-table')){
 const row=el('tr',{},...['MC','Vol 24h','Liquidity','Change','Buys / sells'].map((label,i)=>el('th',{scope:'col','data-metric':String(i)},label)));
 pulseTable.prepend(el('thead',{},row));
}

const back = button('← Tokens', { class: 'qxfd-back', 'aria-label': 'Back to tokens' });
document.getElementById('qxt-head').prepend(back);

// QHooks launches on every chain, read by Discover itself: the rail's list (state.markets) follows the rail's own chain,
// so the tab showed one chain's launches, or none (2026-11-10). Falls back to the rail list until this answers.
let allLaunches = null;
async function loadLaunches() {
  try {
    const r = await publicReadFetch('/api/terminal/feed?chain=all', { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (Array.isArray(j?.markets)) { allLaunches = j.markets; renderTabs(); renderRows(); setTimeout(() => { void refreshLiveRows(); }, 500); }
  } catch {}
}
const launchMarkets = () => allLaunches || state.markets;
const availableTabs = () => [['launches','QHooks launches'],...TABS];
function renderTabs() {
  trendingNote.hidden=state.tab!=='trending';
  hotWindows.hidden=state.tab!=='hot';
  sortSelect.disabled=state.tab==='hot';
  for(const th of headers.values())th.querySelector('button').disabled=state.tab==='hot';
  updateSort();
  const active = document.activeElement?.dataset.tab;
  tabs.replaceChildren(...availableTabs().map(([id, label]) => button(label, {
    role: 'tab', id: 'qxfd-tab-' + id, 'data-tab': id, 'aria-controls': 'qxfd-panel',
    'aria-selected': String(state.tab === id), tabindex: state.tab === id ? 0 : -1,
  })));
  panel.setAttribute('aria-labelledby', 'qxfd-tab-' + state.tab);
  if (active) (tabs.querySelector(`[data-tab="${active}"]`) || tabs.querySelector('[aria-selected="true"]'))?.focus({ preventScroll: true });
}

for (const [id, name, icon] of CHAINS) {
  const b = button('', { 'data-chain': id, 'aria-pressed': String(state.chain === id) });
  if (icon) b.append(el('img', { src: '/chain-symbol-icons/' + icon + '.svg', alt: '', width: 14, height: 14 }));
  b.append(name);
  chainGroup.append(b);
}

function updateSort() {
  const defaultOrder=!state.sort.key||state.sort.key==='hot'&&state.sort.direction!=='asc';
  const sortName={price:'Price',volume:'Vol 24h',liquidity:'Liq',mcap:'MC',move:'Change',txns:'Trades',makers:'Wallets',holders:'Holders',hot:'Hot now'}[state.sort.key]||WINDOWS.find(([id])=>id===state.sort.key)?.[1]||'Sort';
  // A remembered manual sort must be visible; it must not look like default
  // Trending while intentionally exposing the original received matches.
  text(hotNow,defaultOrder?'Hot now':sortName+' '+(state.sort.direction==='asc'?'↑':'↓'));
  hotNow.title=defaultOrder?'Default Trending rules':'Selected sort · tap to return to default Trending';
  hotNow.setAttribute('aria-pressed',String(defaultOrder&&state.tab==='trending'));
  sortSelect.options[0].textContent=state.tab==='trending'?'Hot now (default)':'Feed order';
  for (const [key, th] of headers) th.setAttribute('aria-sort', state.tab!=='hot'&&state.sort.key === key ? (state.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
  sortSelect.value = state.sort.key ? state.sort.key + ':' + state.sort.direction : '';
}
function setSort(key, direction) {
  state.sort = { key, direction };
  savePreference(storage, 'sort', state.sort);
  updateSort(); renderRows();
}
header.addEventListener('click', event => {
  const key = event.target.closest('button')?.dataset.sort;
  if (key) setSort(key, state.sort.key === key && state.sort.direction === 'desc' ? 'asc' : 'desc');
});
sortSelect.addEventListener('change', () => {
  const [key, direction] = sortSelect.value.split(':');
  setSort(key || null, direction || 'desc');
});

function visibleRows() {
  const quickByChain=new Map(),quickFor=id=>{if(!quickByChain.has(id))quickByChain.set(id,api?.quickForChain?.(id)||api?.state.quick||{});return quickByChain.get(id);};
  const seenLaunch = new Set(), launches = launchMarkets().filter(m => m.live && !seenLaunch.has(m.chainId + ':' + m.controller) && seenLaunch.add(m.chainId + ':' + m.controller)).map(launchRow).map(r => { const p = livePatches.get(launchKey(r)); return p && Date.now() - p.observedAt < 120000 && r.priceUsd == null ? applyRowPatch(r, p) : r; });
  let rows = state.tab === 'launches' ? launches : state.data?.rows || [];
  const q = state.query.toLowerCase();
  // The tab's own filter (Gainers needs a positive move in the chosen window, etc.) applies to the list, never to search
  // hits: a hit carries only a 24 h change, so on Gainers 6h every pasted contract read "No tokens match" (2026-11-10).
  const base=rows,shown=viewFilters(state,filterBypass);
  rows = filterDiscovery(rows,{tab:state.tab,window:state.window,filters:shown,factsOf:discoveryFilterFacts});
  if (state.tab === 'new') rows = newPairsOnly(rows);
  if (q) {
    rows = [...rows, ...launches].filter(r => [r.token?.symbol, r.token?.name, r.token?.address, r.launch?.controller]
      .some(value => typeof value === 'string' && value.toLowerCase().includes(q)));
    rows.push(...state.hits.map(searchRow));
    const seen = new Set();
    rows = rows.filter(r => {
      const address = r.token?.address || '', key = r.chainId + ':' + (r.chainId === 'solana' ? address : address.toLowerCase());
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  else if(state.tab!=='launches'&&state.tab!=='hot') rows=rows.filter(discoveryCandidate);
  if(shown.hideQproofDanger||shown.verifiedLiquidityOnly)rows=filterDiscovery(rows,{tab:'trending',window:state.window,filters:{hideQproofDanger:shown.hideQproofDanger,verifiedLiquidityOnly:shown.verifiedLiquidityOnly},factsOf:discoveryFilterFacts});
  hiddenCount=q||state.tab==='launches'?0:state.tab==='hot'?base.filter(r=>state.chain==='all'||String(r.chainId)===state.chain).length-rows.filter(r=>state.chain==='all'||String(r.chainId)===state.chain).length:hiddenByFilters(base,{state,factsOf:discoveryFilterFacts});
  const context=JSON.stringify([state.tab,state.chain,state.window,state.query,state.filters,state.sort]);if(context!==contractContext){expandedContracts.clear();contractContext=context;}
  contractProjection=projectTrendingContracts(rows.filter(r=>state.chain==='all'||String(r.chainId)===state.chain),{...state,expanded:expandedContracts});
  const models=contractProjection.rows.map(r=>{const vm=rowViewModel(r,{quick:quickFor(r.chainId),window:state.window});return{...vm,contractGroup:contractProjection.metadata.get(discoveryContractKey(r))};});
  if(state.tab==='hot'&&!q)return models;
  if(!contractProjection.active)return sortRows(models,state.sort);
  if(defaultTrendingMode(state))return models;
  // Manual ordering applies to eligible representatives; expanded contracts
  // remain adjacent to their own group and retain their exact actions.
  const membersByGroup=new Map();
  for(const vm of models)if(vm.contractGroup&&!vm.contractGroup.isRepresentative){const list=membersByGroup.get(vm.contractGroup.id)||[];list.push(vm);membersByGroup.set(vm.contractGroup.id,list);}
  const representatives=models.filter(vm=>!vm.contractGroup||vm.contractGroup.isRepresentative);
  return sortRows(representatives,state.sort).flatMap(vm=>[vm,...(membersByGroup.get(vm.contractGroup?.id)||[])]);
}

function makeRow(vm) {
  const tr = el('tr', { 'data-key': vm.key });
  const cells = {};
  for (const [key, label] of columns) {
    cells[key] = el('td', { class: 'qxfd-' + key, 'data-label': label });
    tr.append(cells[key]);
  }
  const avatar = el('span', { class: 'qxfd-avatar', 'aria-hidden': 'true' });
  const letter = el('span');
  const logo = el('img', { alt: '', width: 26, height: 26, referrerpolicy: 'no-referrer', hidden: '' });
  avatar.append(letter, logo);
  const symbol = el('b'), name = el('span', { class: 'qxfd-name' }), rowAge = el('span', { class: 'qxfd-age' }), boost = el('small', { class: 'qxfd-boost', hidden: '', title: 'A paid DexScreener boost, not a ranking' }, 'Boosted');
  const hotCount=el('small',{class:'qxfd-hot-count',hidden:''});
  const chain = el('img', { class: 'qxfd-chain-icon', width: 13, height: 13, alt: '' });
  const open = el('a', { class: 'qxfd-open', tabindex: '-1', href:'#' });
  open.append(avatar, el('span', { class: 'qxfd-identity' }, el('span', { class: 'qxfd-symline' }, symbol, boost, hotCount), name), chain, rowAge);
  const watch=button('☆',{class:'qxfd-watch','aria-pressed':'false','aria-label':'Add token to watchlist'});
  watch.addEventListener('click',async event=>{event.stopPropagation();if(!api?.library||!tr.isConnected)return;watch.disabled=true;watch.dataset.pending='true';try{const asset=libraryAsset(tr.__tokenVM);await api.library.watch(asset,!api.library.has(asset));}catch(error){notice.hidden=false;text(noticeText,error.message||'Could not save this token.');}finally{delete watch.dataset.pending;watch.disabled=false;}});
  watch.addEventListener('keydown',event=>{if(event.key!=='Tab')event.stopPropagation();});
  const groupToggle=button('',{class:'qxfd-group-toggle',hidden:''}),groupCount=el('span',{class:'qxfd-group-count'}),groupWord=el('span',{class:'qxfd-group-word'},' similar'),contractAddress=el('code',{class:'qxfd-contract-address'}),contractName=el('b'),contractDetail=el('td',{class:'qxfd-contract-detail',colspan:String(columns.length),hidden:''},contractName,contractAddress);tr.append(contractDetail);
  groupToggle.append(groupCount,groupWord);
  groupToggle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const group=tr.__tokenVM?.contractGroup;if(!group?.isRepresentative)return;expandedContracts.has(group.id)?expandedContracts.delete(group.id):expandedContracts.add(group.id);renderRows();});
  groupToggle.addEventListener('keydown',event=>{if(event.key!=='Tab')event.stopPropagation();});
  cells.token.append(watch,open,groupToggle);
  const priceValue=el('span',{class:'qxfd-price-value'}),priceStatus=el('small',{class:'qxfd-price-status'});cells.price.append(priceValue,priceStatus);
  const capNumber=el('span',{class:'qxfd-cap-number'}),capUnit=el('span',{class:'qxfd-cap-unit'}),cap=el('span',{},capNumber,capUnit),capKind=el('small',{class:'qxfd-cap-kind'});
  cells.mcap.append(cap, capKind);
  const buys = el('span', { class: 'up' }), sells = el('span', { class: 'down' });
  cells.txns.append(buys, el('span', { class: 'qxfd-divider', 'aria-hidden': 'true' }, ' / '), sells);
  const safe = el('span', { class: 'qxfd-safety-mark' });
  const riskFields=new Map();
  for(const [id,label]of[['top10','Top 10'],['dev','Dev'],['snipers','Snipers'],['insiders','Insiders'],['bundlers','Bundlers'],['holders','Holders']]){
    const value=el('b',{},DASH),item=el('span',{'data-risk-field':id},el('span',{},label),value);cells.riskgrid.append(item);riskFields.set(id,value);
  }
  const tip = el('span', { class: 'qxfd-tooltip', role: 'tooltip' });
  cells.safety.classList.add('qxfd-evidence');cells.evidence=cells.safety;
  const buy = button('', { class: 'qxfd-buy' }), buyValue=el('span',{class:'qxfd-buy-value'}),buyUnit=el('span',{class:'qxfd-buy-unit'});buy.append(buyValue,' ',buyUnit);
  const blocked = el('span', { class: 'qxfd-blocked', hidden: '' }, 'not tradable here');
  cells.buy.append(buy, blocked);
  return { tr, cells, avatar, letter, logo, symbol, boost, hotCount, name, rowAge, chain, open, watch, groupToggle, groupCount, contractAddress, contractName, contractDetail, priceValue, priceStatus, cap, capNumber, capUnit, capKind, buys, sells, safe, tip, riskFields, buy, buyValue, buyUnit, blocked, vm: null };
}

function updateRow(node, vm, {refreshing=!!(state.loading||state.data?.stale||state.error||state.searchError||vm.row.stale)}={}) {
  const old = node.vm;
  const group=vm.contractGroup;node.tr.classList.toggle('qxfd-contract-group',!!group?.isRepresentative);node.tr.classList.toggle('qxfd-contract-expanded',!!group?.expanded);node.tr.classList.toggle('qxfd-contract-member',!!group&&!group.isRepresentative);
  node.groupToggle.hidden=!group?.isRepresentative;if(group?.isRepresentative){text(node.groupCount,'+'+(group.members.length-1));node.groupToggle.setAttribute('aria-expanded',String(group.expanded));node.groupToggle.setAttribute('aria-label','+'+(group.members.length-1)+' similar contracts; same name and ticker '+vm.symbol+' on '+vm.chainName+'; '+group.members.length+' total; '+(group.expanded?'collapse':'expand'));node.groupToggle.title='Same name and ticker · '+group.members.length+' contracts. Separate token addresses, not a shared asset or issuer.';}
  node.contractDetail.hidden=!group?.expanded;if(group?.expanded){text(node.contractName,(group.isRepresentative?'Same name and ticker · '+group.members.length+' contracts · ':'')+(vm.name||vm.symbol));text(node.contractAddress,vm.address);node.contractAddress.title=vm.address;}
  const evidence=discoveryBadges(vm.row,{h:el,compact:true});
  // Keep canonical verdicts, links and descriptions; only their row presentation is compact.
  for(const badge of evidence.querySelectorAll('.qxd-badge')){
    const label=badge.textContent;badge.setAttribute('aria-label',label);badge.dataset.label=label;
    text(badge,/^LP/.test(label)?'LP':/^Anti/.test(label)?'AS':/^Agent/.test(label)?'A':'P');
  }
  const summary=evidence.querySelector('summary');if(summary){summary.title=summary.textContent+' · Safety checks';summary.setAttribute('aria-label',summary.textContent+' · Safety checks');text(summary,'◇');}
  const evidenceKey=evidence.outerHTML;if(node.evidenceKey!==evidenceKey){node.evidenceKey=evidenceKey;const prior=node.cells.evidence.querySelector('details'),focused=prior?.contains(document.activeElement);if(prior?.open)evidence.querySelector('details').open=true;node.cells.evidence.replaceChildren(evidence);if(focused)evidence.querySelector('summary').focus({preventScroll:true});}
  node.tr.classList.toggle("qxfd-fund-row",!!vm.fund);
  node.vm = vm; node.tr.__tokenVM=vm;node.watch.disabled=!api?.library||node.watch.dataset.pending==='true';
  node.hotCount.hidden=state.tab!=='hot'||!!state.query||!vm.row.hotCount;text(node.hotCount,(vm.row.hotCount||0).toLocaleString()+' searches / opens');
  const watching=!!api?.library?.has(libraryAsset(vm));
  text(node.watch,watching?'★':'☆');node.watch.setAttribute('aria-pressed',String(watching));node.watch.setAttribute('aria-label',(watching?'Remove ':'Add ')+vm.symbol+(watching?' from':' to')+' watchlist');
  text(node.letter, vm.letter); text(node.symbol, vm.symbol); text(node.name, (vm.fund?'Index fund token · ':'')+vm.name + (founding.slots.has(vm.chainId+':'+(vm.chainId==='solana'?String(vm.address):String(vm.address).toLowerCase())) ? ' · Founding #' + founding.slots.get(vm.chainId+':'+(vm.chainId==='solana'?String(vm.address):String(vm.address).toLowerCase())) : '')); text(node.rowAge, vm.lifecycle.stage==='bonding'?'Bond '+Math.round(vm.lifecycle.progress*100)+'%':vm.lifecycle.stage==='migrated'?'Migrated · '+vm.age:vm.age);node.rowAge.dataset.stage=vm.lifecycle.stage;
  node.name.title = vm.name;
  if(state.tab==='hot'&&!vm.name){text(node.name,vm.address);node.name.title=vm.address;}
  paintPromotion(node.boost, vm); paintFirstTradePending(node, vm, el);
  node.open.setAttribute('aria-label', `Open ${vm.symbol}, ${vm.name || vm.address}, on ${vm.chainName}`);
  const href=vm.row.launch?.controller?'#m='+vm.chainId+':'+vm.row.launch.controller:'#t='+vm.chainId+':'+vm.address;
  node.open.setAttribute('href',href);node.tr.dataset.href=href;
  const metrics=evidenceMetrics(vm.row),pct=n=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(1).replace(/\.0$/,'')+'%':DASH;
  text(node.cells.top10,pct(metrics.top10Pct));text(node.cells.dev,pct(metrics.devPct));
  for(const [id,value]of Object.entries({top10:pct(metrics.top10Pct),dev:pct(metrics.devPct),snipers:metrics.sameBlock===true?'Signal':DASH,insiders:metrics.sharedFunding===true?'Signal':DASH,bundlers:DASH,holders:vm.holders})){
    text(node.riskFields.get(id),value);node.riskFields.get(id).parentElement.title=value===DASH?'Unknown · no fresh observation':id==='snipers'?'Same-block entry signal; not a percentage or proof of sniper activity':id==='insiders'?'Shared funding signal; not a percentage or proof of insider activity':metrics.source||'Received provider observation';
  }
  node.cells.riskgrid.setAttribute('aria-label','Holder checks. Missing observations are unknown. Entry and funding signals are not percentages.');

  node.chain.hidden = !vm.chainIcon;
  if (vm.chainIcon) {
    node.chain.setAttribute('src', '/chain-symbol-icons/' + vm.chainIcon + '.svg');
    node.chain.alt = vm.chainName;
  }
  if(JSON.stringify(old?.avatarSources)!==JSON.stringify(vm.avatarSources)){node.unbindAvatar?.();node.unbindAvatar=bindTokenAvatar(node.logo,{},vm.avatarSources);}
  for (const key of ['move', 'volume', 'liquidity', 'makers','holders']) text(node.cells[key], vm[key]);
  const priceView=feedRowPriceView(vm,{refreshing});
  text(node.priceValue,priceView.text);text(node.priceStatus,priceView.status);node.cells.price.title=priceView.title;node.cells.price.dataset.priceAt=priceView.at??'';node.cells.price.dataset.unit=priceView.unit||'';node.cells.price.dataset.refreshing=String(priceView.refreshing);
  node.cells.liquidity.dataset.known = String(vm.liquidity !== DASH);
  node.cells.holders.dataset.known=String(vm.numeric.holders!==null);
  node.cells.price.dataset.slickPrice='';node.cells.price.dataset.slickKey=vm.key;node.cells.price.dataset.slickValue=vm.numeric.price===null?'':String(vm.numeric.price);
  node.cells.price.style.opacity=vm.priceRefreshing||vm.row.pricesCached?'.65':'1';node.cells.mcap.style.opacity=vm.capsRefreshing||vm.row.capsCached?'.65':'1';
  node.cells.holders.title=vm.numeric.holders===null?'The source has not provided a global holder count.':('Global holder count'+(vm.holderAge?' · updated '+vm.holderAge+' ago':''));
  for (const key of ['move']) {
    node.cells[key].classList.toggle('up', vm.numeric[key] > 0);
    node.cells[key].classList.toggle('down', vm.numeric[key] < 0);
  }
  node.cells.move.setAttribute('data-label',(WINDOWS.find(([k])=>k===state.window)?.[1]||'24h')+' change');node.cells.move.setAttribute('data-window',WINDOWS.find(([k])=>k===state.window)?.[1]||'24h');
  const capUnit=priceView.capUnit&&priceView.capUnit!=='USD'?priceView.capUnit:null;const capNumber=capUnit&&priceView.cap.endsWith(' '+capUnit)?priceView.cap.slice(0,-capUnit.length-1):priceView.cap;text(node.capNumber,capNumber);text(node.capUnit,capUnit?' '+capUnit:'');text(node.capKind,priceView.cap===DASH?'syncing':priceView.capKind==='FDV'?'FDV':'');
  node.cells.mcap.setAttribute('data-label',priceView.capKind);node.cells.mcap.dataset.unit=priceView.capUnit||'';node.cells.mcap.removeAttribute('data-refreshing');node.cells.mcap.dataset.capState=priceView.cap===DASH?'syncing':'known';
  // Bind only after insertion. The source getter never substitutes an arrival,
  // cache or canonical-price clock for the original row/cap observation.
  node.discoveryRefreshing=refreshing;node.discoveryPriceAvailable=priceView.available;node.discoveryPriceAt=priceView.at;node.discoveryCapAvailable=priceView.cap!==DASH;
  const hidden=()=>root.hidden||!!node.tr.closest('[hidden]');
  const stopPrice=livenessView.bind(node.priceStatus,{get:()=>({row:node.vm.row,failed:hidden()||node.discoveryRefreshing||!node.discoveryPriceAvailable||priceState(node.discoveryPriceAt).refreshing||node.discoveryPriceAt>Date.now()}),paint:(label,live)=>{text(label,node.discoveryPriceAvailable?live.label:'Price syncing');node.cells.price.dataset.refreshing=String(live.refreshing);}});
  const stopCap=livenessView.bind(node.cells.mcap,{get:()=>{const row=node.vm.row;return {row:{observedAt:Object.hasOwn(row,'capAt')?row.capAt:row.observedAt,stale:row.stale},failed:hidden()||node.discoveryRefreshing||!node.discoveryCapAvailable||!!row.capsRefreshing};},paint:(cell,live)=>{cell.title=live.label;},fallback:(cell,live)=>{cell.title=live.label;}});
  node.unbindLiveness=()=>{stopPrice();stopCap();};
  text(node.buys, vm.buys); text(node.sells, vm.sells);
  node.cells.txns.setAttribute('aria-label', `${vm.buys === DASH ? 'Unknown' : vm.buys} buys, ${vm.sells === DASH ? 'unknown' : vm.sells} sells in 24 hours`);
  node.cells.makers.title=vm.row.makersKind==='unique_wallets'?'Unique wallets in the received 24h swaps.':'Provider buyer and seller activity; a wallet may be counted on both sides.';
  text(node.safe, vm.safety.label);
  node.cells.safety.removeAttribute('data-flag');node.cells.safety.removeAttribute('title');node.cells.safety.removeAttribute('aria-label');node.cells.safety.tabIndex=-1;
  text(node.tip, vm.safety.title);
  const label = `${vm.quick.value} ${vm.quick.unit}`; // auditC: the bolt is a line icon drawn by CSS (.qxfd-buy::before), not an emoji
  text(node.buyValue,vm.quick.value);text(node.buyUnit,vm.quick.unit);
  node.buy.setAttribute('aria-label', vm.quick.supported ? `Buy ${vm.symbol} with ${vm.quick.value} ${vm.quick.unit}` : `Open ${vm.symbol} in the trade ticket; quick buy is unavailable`);
  node.buy.title = vm.quick.supported ? `Buy ${vm.symbol} with ${vm.quick.value} ${vm.quick.unit}` : 'Open the trade ticket; quick buy is unavailable for this token';
  node.buy.hidden = vm.quick.stock || !vm.quick.supported; // no button where quick buy can't run (outside Elysium tokens)
  node.blocked.hidden = !vm.quick.stock;
  const p = vm.numeric.price ?? vm.row.quoteAmounts?.price;
  const before = old?.numeric.price ?? old?.row.quoteAmounts?.price;
  if (old && typeof p === 'number' && typeof before === 'number' && p !== before) {
    node.cells.price.classList.remove('qxfd-flash-up', 'qxfd-flash-down');
    node.cells.price.classList.add(p > before ? 'qxfd-flash-up' : 'qxfd-flash-down');
    node.cells.price.onanimationend = () => node.cells.price.classList.remove('qxfd-flash-up', 'qxfd-flash-down');
    // System A: the whole row washes once in the move's colour (a real price change from the list's own refresh).
    node.tr.classList.remove('qxfd-tick-up', 'qxfd-tick-down'); void node.tr.offsetWidth;
    node.tr.classList.add(p > before ? 'qxfd-tick-up' : 'qxfd-tick-down');
    clearTimeout(node.tickTimer); node.tickTimer = setTimeout(() => node.tr.classList.remove('qxfd-tick-up', 'qxfd-tick-down'), 1500);
  }
}

function skeleton() {
  for(const node of nodes.values())node.unbindLiveness?.();
  nodes.clear();
  tbody.replaceChildren(...Array.from({ length: 24 }, () => el('tr', { class: 'qxfd-skeleton', 'aria-hidden': 'true' },
    ...columns.map(([key]) => el('td', { class: 'qxfd-' + key }, el('span', { class: 'qxfd-placeholder' }))))));
}

// Founding Launchers (2026-11-10): a pinned row to /founding on the QHooks launches tab, and "Founding #N" by name.
const founding = {status: null, left: 0, slots: new Map(), launches: []}, foundingTr = el('tr', {class: 'qxfd-founding'});
async function loadFounding() {
  try { const r = await publicReadFetch('/api/founding', {cache: 'no-store'}), d = r.ok ? await r.json() : null; if (!d) return;
    founding.status = d.status; founding.left = d.spotsLeft; founding.launches=(d.launches||[]).filter(l=>l.chainId==='solana'); founding.slots = new Map((d.launches || []).map(l => [l.chainId+':'+(l.chainId==='solana'?String(l.token):String(l.token).toLowerCase()), l.slot])); renderTabs(); renderRows(); } catch {}
}
function pinFounding() {
  if (state.tab !== 'launches' || (founding.status !== 'open' && founding.status !== 'full')) { foundingTr.remove(); return; }
  foundingTr.replaceChildren(el('td', {colspan: String(columns.length)}, el('a', {href: '/founding'}, el('b', {}, 'Founding Launchers'), ' · ',
    founding.status === 'full' ? 'All 50 spots taken · see the founding launches' : founding.left + ' of 50 spots left · launch now and earn on your volume for 90 days')));
  const cell=foundingTr.firstChild;
  for(const l of founding.launches.filter(l=>state.chain==='all'||state.chain==='solana'))cell.append(el('a',{class:'qxfd-founding-sol',href:'#t=solana:'+l.token},'Founding #'+l.slot+' · Solana · '+(l.symbol||l.token.slice(0,6)+'…'+l.token.slice(-4))));
  if (tbody.firstChild !== foundingTr) tbody.insertBefore(foundingTr, tbody.firstChild);
}
function renderRows() {
  root.classList.toggle('qxfd-hot-mode',state.tab==='hot');
  syncDiscoveryLink({tab:state.tab,chain:state.chain,window:state.window,layout:state.layout},{windows:WINDOWS});
  for(const b of layoutControls.children)b.setAttribute('aria-pressed',String(b.dataset.layout===state.layout));
  const isPulse=pulseMode();pauseUpdates.hidden=isPulse;arrivals.hidden=isPulse;pulse?.setActive(isPulse&&!root.hidden&&!document.hidden);
  chainChip.value=state.chain;windowChip.value=state.window;for(const p of presetChips)p.button.setAttribute('aria-pressed',String(JSON.stringify(state.filters)===JSON.stringify(p.filters)));const quickChain=settingsChain(),quick=api?.quickForChain?.(quickChain)||api?.state.quick||{},unit=quickChain==='56'?'bnb':quickChain==='99901'?'hype':quickChain==='solana'?'usd':'eth';paintQuickPreset([]);
  const wallet = state.wallet;layoutControls.hidden=!!wallet||state.tab==='hot';quickChip.hidden=!!wallet;
  walletPanel.hidden = !wallet;
  scroll.hidden = !!wallet;
  walletBack.hidden = !wallet;
  for (const bar of listControls) bar.hidden = !!wallet;
  root.querySelector('.qxfd-footer').hidden = !!wallet;
  if (wallet) {
    empty.hidden = true; notice.hidden = true;
    text(heading, 'Wallet'); text(status, wallet.loading ? 'Loading…' : '');
    status.dataset.delayed = 'false';
    panel.setAttribute('aria-busy', String(!!wallet.loading));
    return;
  }
  const activeFilters=Object.values(state.filters).filter(x=>x!=='').length;filterDetails.querySelector('summary').textContent=activeFilters?'Advanced filters · '+activeFilters:'Advanced filters';listOptions.querySelector('summary').textContent=activeFilters?'Filters · '+activeFilters:'Filters';
  root.classList.toggle('qxfd-pulse-mode',isPulse);root.classList.toggle('qxfd-wallet-mode',!!wallet);
  if(isPulse){root.querySelector('.qxfd-toolbar').hidden=false;if(quickChip.parentNode!==listControls[0])listControls[0].append(quickChip);scroll.hidden=true;empty.hidden=true;notice.hidden=true;text(heading,'Tokens');text(status,'');tabs.hidden=true;panel.removeAttribute('aria-labelledby');panel.setAttribute('aria-label','Pulse');panel.setAttribute('aria-busy','false');pulse?.render();return;}
  root.querySelector('.qxfd-toolbar').hidden=false;if(quickChip.parentNode!==listControls[0])listControls[0].append(quickChip);tabs.hidden=false;panel.removeAttribute('aria-label');panel.setAttribute('aria-labelledby','qxfd-tab-'+state.tab);
  const mode=renderMode;renderMode={};
  let rows = visibleRows();
  // D4: while the pointer, a press or keyboard focus is on the list, a live poll changes numbers in place only:
  // rows keep their places, new tokens wait, and the order catches up when the hold ends.
  // orderFrozen lasts until the hold ends, so any other render meanwhile (live price patches, launches) keeps it too.
  if(orderFrozen&&nodes.size){
    const at=new Map([...tbody.children].map((tr,i)=>[tr.dataset.key,i])),byKey=new Map(rows.map(vm=>[vm.key,vm]));
    rows=[...nodes.keys()].filter(k=>at.has(k)).sort((a,b)=>at.get(a)-at.get(b)).map(k=>byKey.get(k)||nodes.get(k).vm).filter(Boolean);
  }
  const motion=(mode.live||mode.released)&&!orderFrozen&&nodes.size>0&&!root.hidden,before=motion?flipMeasure(nodes):null;
  text(trendingNote,contractProjection.active?'Trending: $1K liquidity · $500 in 24h volume · 10 observed trades · drops over 90% excluded. Similar names and tickers can expand. Search or a selected sort shows the original matches.':'Search and selected sorts show the original received matches. Your custom filters still apply.');
  paintQuickPreset(rows);
  if(rows.length||state.data&&!state.loading){table.classList.toggle('qxfd-has-holders',rows.some(vm=>vm.numeric.holders!==null));applyColumnVisibility(table,rows);}
  const previousFocus = document.activeElement;
  const previousIndex = [...nodes.keys()].indexOf(focusedKey);
  const y = scroll.scrollTop, pageY = window.scrollY;
  if (!nodes.size) tbody.replaceChildren();
  const keep = new Set(rows.map(vm => vm.key));
  for (const [key, node] of nodes) if (!keep.has(key)) { node.unbindLiveness?.();node.tr.remove(); nodes.delete(key); }
  const arrived=[];
  rows.forEach((vm, index) => {
    let node = nodes.get(vm.key);
    if (!node) { node = makeRow(vm); nodes.set(vm.key, node); if(before)arrived.push(node.tr); }
    if (tbody.children[index] !== node.tr) tbody.insertBefore(node.tr, tbody.children[index] || null);
    updateRow(node, vm);
  });
  pinFounding();
  if (!keep.has(focusedKey)) focusedKey = rows[Math.max(0, Math.min(rows.length - 1, previousIndex))]?.key || null;
  for (const [key, node] of nodes) node.open.tabIndex = key === focusedKey ? 0 : -1;
  if (!root.hidden && previousFocus !== document.body && !previousFocus.isConnected && previousFocus.closest?.('tr[data-key]')) nodes.get(focusedKey)?.open.focus({ preventScroll: true });
  else if (!root.hidden && previousFocus.isConnected && document.activeElement !== previousFocus) previousFocus.focus({ preventScroll: true });
  const initialLoading = state.tab !== 'launches' && !state.data && state.loading && !state.query;
  if (initialLoading) skeleton();
  empty.hidden = !!rows.length || initialLoading;
  const missingWindow=['gainers','losers'].includes(state.tab)&&state.data?.rows?.length&&!state.data.rows.some(r=>Number.isFinite(r.change?.[state.window]));
  const emptyText = !state.query&&state.tab==='trending'&&!state.error?(contractProjection.active?'No tokens meet the default Trending activity and liquidity rules in this received set. Try another chain, New pairs or custom filters.':activeFilters?'No tokens match these filters.':'No tokens meet Trending’s liquidity and drawdown filters in this view. Try another chain or adjust filters.'):!state.query&&missingWindow?'No '+(WINDOWS.find(([k])=>k===state.window)?.[1]||'selected-window')+' history is available for this received set yet.':activeFilters&&!state.query?'No tokens match these filters.':!state.query&&['bonding','migrated'].includes(state.tab)&&!state.error?'No confirmed '+(state.tab==='bonding'?'curves at 50%+ graduation':'migrations')+' in the received market set.':state.query ? (state.searching ? 'Searching tokens…' : 'No tokens match this search.') : state.error ? 'The token feed could not be loaded. Retry above.' : state.tab==='launches'?'No QHooks launches in this view yet.':'No tokens in this list yet. Try another chain or tab.';
  // Honest count (discofeed): the server's matched total when it cut the list at its top 100.
  const matched = state.tab !== 'launches' && !state.query && Number.isFinite(state.data?.total) && state.data.total > rows.length ? state.data.total : null;
  text(count, initialLoading ? 'Loading tokens…' : contractProjection.active?`${contractProjection.listingCount} listing${contractProjection.listingCount===1?'':'s'} · ${contractProjection.receivedContracts} received contracts`:`${rows.length}${matched ? ' of ' + matched : ''} token${(matched || rows.length) === 1 ? '' : 's'} · ${rows.filter(r=>r.numeric.move!==null).length} with ${WINDOWS.find(([k])=>k===state.window)?.[1]} history`);
  panel.setAttribute('aria-busy', String(state.loading || state.searching));
  renderFeedFeedback({state,heading,status,notice,noticeText,empty,emptyMessage:emptyCopy,retry,emptyText});
  if(state.tab==='hot'&&!state.query){text(heading,'Hot searches');if(!state.loading&&!state.error&&!rows.length&&!activeFilters)text(emptyCopy,'No searches yet in this window');text(count,rows.length+' tokens · '+state.hotWindow);}
  livenessView.bind(status,{get:()=>{const input=feedFeedbackSource(state);return {...input,row:state.wallet||pulseMode()||state.tab==='launches'||state.query||!state.data?.rows?.length?null:input.row};},paint:(label,live)=>{if(state.wallet||pulseMode())return;const view=feedFeedbackStatus(state,live);label.setAttribute('aria-live',live.live?'off':'polite');text(label,view.label);label.dataset.delayed=String(view.delayed);}});
  // Never a dead-empty filter result: offer to widen (clears the filters and reloads the whole list).
  const paused=!!activeFilters&&filterBypass===bypassKey(state);hiddenLine.hidden=!!state.query||!paused&&!(activeFilters&&hiddenCount>0);text(hiddenText,paused?'Filters paused · ':hiddenCount+' hidden by your filters · ');text(showAll,paused?'Use my filters':'Show all');if(hiddenLine.parentNode!==panel||hiddenLine.nextSibling!==scroll)panel.insertBefore(hiddenLine,scroll);
  if (!rows.length && activeFilters && hiddenLine.hidden && !state.query && !initialLoading && !state.loading) { empty.hidden = false; empty.append(widen); }else widen.remove();
  nextSteps.update({count:rows.length,loading:initialLoading||state.searching,failed:!!(state.error||state.searchError),filtered:!!activeFilters||!!state.query,kind:state.tab==='launches'?'launches':'feed',compact:!rows.length});
  if(!nextSteps.element.hidden){if(rows.length){scroll.append(nextSteps.element);}else{empty.append(nextSteps.element);empty.hidden=false;scroll.hidden=true;}}
  if(!rows.length&&!initialLoading&&!state.loading&&!state.query&&state.tab==='trending'&&!state.error)empty.append(marketsEmpty);else marketsEmpty.remove();
  text(source, state.tab === 'launches' ? '' : [state.data?.source,state.data?.coverage?.description].filter(Boolean).join(' · '));
  scroll.scrollTop = y;
  if (window.scrollY !== pageY) window.scrollTo({ top: pageY, behavior: 'instant' });
  if(before){flipPlay(nodes,before);for(const tr of arrived)markArrived(tr);}
}

// Live rows: the visitor's browser refreshes the on-screen rows from DexScreener every 30 s (30 per call, per chain).
// A server reload keeps any newer live numbers instead of going back to an older copy.
const launchKey = r => 'launch:' + r.chainId + ':' + String(r.token?.address || '').toLowerCase();
const livePatches = new Map(), rowKey = r => r.chainId + ':' + (r.chainId === 'solana' ? r.pool : String(r.pool || '').toLowerCase());
function withLive(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => { const p = livePatches.get(rowKey(r)); return p && Date.now() - p.observedAt < (state.tab==='funds'?3600000:90000) && !(Number(r.observedAt) > p.observedAt) ? applyRowPatch(r, p) : r; });
}
let liveRowsBusy = false;
async function refreshLiveRows() {
  if(pulseMode())return;
  if (liveRowsBusy || discoveryUpdates.held || document.hidden || root.hidden || state.wallet || (state.tab !== 'launches' && !state.data?.rows?.length)) return;
  liveRowsBusy = true;
  try {
    const shown = visibleRows().map(v => v?.row || v).filter(r => !isQhooksPriceAsset(r.chainId,r.token?.address)&&(!r.launch || r.priceUsd == null) && DEX_CHAINS[r.chainId] && r.token?.address).slice(0, 60), byChain = new Map();
    for (const r of shown) { const list = byChain.get(r.chainId) || []; if (list.length < 30) list.push(r); byChain.set(r.chainId, list); }
    let changed = false;
    for (const [chainId, rows] of byChain) {
      const pairs = await fetchDexPairs(chainId, rows.map(r => r.token.address)); if (!pairs) continue;
      for (const r of rows) { const patch = rowPatch(pickPair(state.tab==='funds'?pairs.filter(p=>p.chainId===DEX_CHAINS[chainId]&&p.quoteToken?.address?.toLowerCase()===r.quote?.address):pairs, chainId, r.token.address, r.launch ? null : r.pool)); if (patch) { livePatches.set(r.launch ? launchKey(r) : rowKey(r), patch); changed = true; } }
    }
    if (changed && state.data?.rows) state.data = { ...state.data, rows: withLive(state.data.rows) };
    if (changed) renderRows();
  } finally { liveRowsBusy = false; }
}
function repeatTokenTask(task, delay) {
  const tick = async () => {
    try { if (!document.hidden && !root.hidden && !state.wallet) await task(); }
    finally { setTimeout(tick, delay); }
  };
  setTimeout(tick, delay);
}
repeatTokenTask(refreshLiveRows, 30000);
const discoveryUpdates=createDiscoveryUpdates({apply:update=>{
  if(state.tab==='hot'&&!update.key?.startsWith('hot:')||state.tab!=='hot'&&update.key?.startsWith('hot:'))return;
  if(update?.data?.rows&&!update.data.hot)knownFeedRows=update.data.rows;
  if (update?.data?.rows) update = { ...update, data: { ...update.data, rows: withLive(update.data.rows) } };
  const {live,frozen,released,...fields}=update;renderMode={live:!!live,frozen:!!frozen,released:!!released};orderFrozen=!!frozen;
  Object.assign(state, fields); renderRows();
  if (!livePatches.size && update?.data?.rows?.length) setTimeout(() => { void refreshLiveRows(); }, 1500);
},changed:info=>{
  pauseUpdates.setAttribute('aria-pressed',String(info.manual));
  text(pauseUpdates,info.manual?'Resume updates':'Pause updates');
  text(arrivals,info.newTokens?info.newTokens+' new · '+(info.manual?'resume to show':'waiting'):info.manual?'Updates paused':'');
}});
pauseUpdates.addEventListener('click',()=>discoveryUpdates.hold('manual',pauseUpdates.getAttribute('aria-pressed')!=='true'));
scroll.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'&&!state.loading)discoveryUpdates.hold('pointer',true);});
scroll.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'&&!state.loading)discoveryUpdates.hold('pointer',true);});
scroll.addEventListener('pointerdown',()=>discoveryUpdates.hold('press',true));
scroll.addEventListener('click',()=>setTimeout(()=>discoveryUpdates.hold('press',false),0),{capture:true});
scroll.addEventListener('pointercancel',()=>discoveryUpdates.hold('press',false));
scroll.addEventListener('pointerleave',()=>{discoveryUpdates.hold('pointer',false);discoveryUpdates.hold('press',false);});
scroll.addEventListener('focusin',()=>discoveryUpdates.hold('focus',true));
scroll.addEventListener('focusout',event=>{if(!scroll.contains(event.relatedTarget))discoveryUpdates.hold('focus',false);});
const loader = createFeedLoader(loaderOptions(update=>discoveryUpdates.receive(update)));
const hotLoader=createHotLoader({fetcher:publicReadFetch,knownRows:()=>[...launchMarkets().map(launchRow),...knownFeedRows,...state.hits.map(searchRow)],changed:update=>discoveryUpdates.receive({...update,key:'hot:'+state.chain+':'+state.hotWindow})});
// CSS and fonts can settle after the first cached Funds paint. Keep its selected tab visible.
function revealFundsTab(){if(root.hidden||state.tab!=='funds')return;const chosen=tabs.querySelector('[data-tab=funds]');if(chosen&&tabs.clientWidth){const r=chosen.getBoundingClientRect(),box=tabs.getBoundingClientRect();if(r.left<box.left||r.right>box.right)tabs.scrollLeft+=r.left-box.left;}}
if(typeof ResizeObserver==='function')new ResizeObserver(revealFundsTab).observe(tabs);
document.fonts?.addEventListener('loadingdone',revealFundsTab);
function refresh() {
  if(state.tab!=='hot')hotLoader.cancel();
  // Only while the token list is on screen: a token page must not keep reading list providers in the background.
  if (document.hidden || root.hidden || state.wallet) return;
  if(pulseMode()){pulse.configure();void pulse.refreshNext();return;}
  if(state.tab==='hot'){void hotLoader.load(state.hotWindow,state.chain);return;}
  if(state.tab==='funds'){const first=!state.data;const rows=withLive(FUND_TOKENS.map(fundRow));state.data={version:1,rows,observedAt:rows.every(r=>r.observedAt)?Math.min(...rows.map(r=>r.observedAt)):null,source:'Goldstein Group · Index fund tokens'};state.loading=false;state.error=null;renderRows();revealFundsTab();requestAnimationFrame(revealFundsTab);if(first)void refreshLiveRows();return;}
  if (state.tab === 'launches') { state.loading = false; state.data = null; state.error = null; renderRows(); }
  else {loader.load(state.tab, state.chain, state.window, viewFilters(state,filterBypass));lastFullLoadAt=Date.now();}updateWindow();
  livePoll?.reset();
}
function showTrending(){loader.cancel();clearTimeout(searchTimer);searchController?.abort();searchGeneration++;search.value='';state.query='';state.hits=[];state.searchError=null;state.searching=false;state.wallet=null;lastLibrarySearch='';walletPanel.replaceChildren();state.layout='list';state.tab='trending';state.chain='all';state.filters=savedFilters();state.data=null;state.error=null;state.loading=true;filterDetails.open=false;listOptions.open=false;paintFilterFields();for(const b of chainGroup.children)b.setAttribute('aria-pressed',String(b.dataset.chain==='all'));renderTabs();renderRows();tabs.querySelector('[data-tab=trending]')?.focus({preventScroll:true});refresh();}
function setTab(tab) {
  if (!availableTabs().some(([id]) => id === tab)) return;
  wantedLaunch = false;
  if (state.tab === tab) return;
  if (state.wallet) clearSearch();
  loader.cancel();
  state.tab = tab; state.data = null; state.error = null;
  savePreference(storage, 'tab', tab);
  scroll.scrollTop = 0;
  renderTabs(); refresh();
  if (tab === 'launches') setTimeout(() => { void refreshLiveRows(); }, 300); // launch rows without server stats get live numbers now
}
tabs.addEventListener('click', event => setTab(event.target.closest('[data-tab]')?.dataset.tab));
tabs.addEventListener('keydown', event => {
  const list = availableTabs(), index = list.findIndex(([id]) => id === state.tab);
  let next;
  if (event.key === 'ArrowRight') next = (index + 1) % list.length;
  if (event.key === 'ArrowLeft') next = (index + list.length - 1) % list.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = list.length - 1;
  if (next === undefined) return;
  event.preventDefault(); setTab(list[next][0]);
  tabs.querySelector('[aria-selected="true"]')?.focus();
});
chainGroup.addEventListener('click', event => {
  const chain = event.target.closest('[data-chain]')?.dataset.chain;
  if (!chain || chain === state.chain) return;
  const hadWallet = !!state.wallet;
  if (hadWallet) clearSearch();
  state.chain = chain; state.data = null; state.error = null;
  savePreference(storage, 'chain', chain);
  for (const b of chainGroup.children) b.setAttribute('aria-pressed', String(b.dataset.chain === chain));
  scroll.scrollTop = 0;
  refresh(); if (!hadWallet) scheduleSearch();
});
retry.addEventListener('click', () => { refresh(); if (state.query.length >= 2) runSearch(); });

// Keep the original search field. Discover owns its input only while visible; the token desk keeps
// its existing search handler. Results use the terminal's existing read-only search endpoint.
// A complete pasted contract opens when its selected chain answers symbol(), or search identifies one chain.
const PASTED_EVM = /^0x[0-9a-fA-F]{40}$/;
function openPasted(chainId, address) {
  reportHotEvent(chainId,address,'search');
  const hash = '#t=' + chainId + ':' + (chainId === 'solana' ? address : address.toLowerCase());
  if (location.hash === hash) return;
  location.hash = hash;
}
function scheduleSearch({restoreFeed = true} = {}) {
  clearTimeout(searchTimer); searchController?.abort(); searchGeneration++;
  const wasWallet = !!state.wallet;
  state.wallet = null; walletPanel.replaceChildren();
  state.query = search.value.trim(); if(!state.query)lastLibrarySearch=''; state.hits = []; state.searchError = null;
  state.searching = state.query.length >= 2;
  renderRows();
  if (wasWallet && !state.query && restoreFeed) refresh();
  if (state.searching && !document.hidden) searchTimer = setTimeout(runSearch, 350);
}
walletBack.addEventListener('click', () => { search.value = ''; scheduleSearch(); });
function clearSearch() {
  search.value = ''; scheduleSearch({restoreFeed: false});
}
function showWallet(wallet) {
  state.wallet = wallet;
  renderWalletPanel(walletPanel, wallet.view, {
    loading: wallet.loading, error: wallet.error, storage,
    onRetry: () => runSearch({walletOnly: true}),
    onOpen: ({chainId, controller}) => openSelection({chainId, controller}),
  });
  renderRows();
}
// walletpnl (2026-11-12): a wallet opened here before paints its last view at once ("Refreshing") while the read runs; a
// refreshing server answer is replaced once its refresh lands (onFresh), as long as this wallet is still the one shown.
async function loadWallet(address, controller, mine) {
  loader.cancel();
  const kept = lastWalletView(address, storage);
  showWallet(kept ? {address, view: {...kept, refreshing: true}} : {address, loading: true});
  const timer = setTimeout(() => controller.abort(), 12000);
  const current = () => mine === searchGeneration && state.wallet?.address === address;
  try {
    const view = await lookupWallet(address, {signal: controller.signal, onFresh: next => { if (current()) showWallet({address, view: next}); }});
    if (mine === searchGeneration) showWallet({address, view});
  } catch {
    if (mine === searchGeneration && !kept) showWallet({address, error: true});
  } finally { clearTimeout(timer); }
}
// mktsearch (2026-11-12): a pasted contract is a token when symbol() and decimals() answer on a supported chain. The
// chain the visitor is on is asked first, then every other EVM chain at once; each read is capped at 4 s. Only an address
// that is no token anywhere opens the wallet view (Randall pasted ROOQ, AEON, BULW and got "Wallet · $0.00").
const EVM_CHAINS = CHAINS.map(([id]) => id).filter(id => id !== 'all' && id !== 'solana');
function capped(promise, ms, signal) {
  return new Promise(resolve => {
    const done = v => { clearTimeout(timer); signal?.removeEventListener('abort', stop); resolve(v); }, stop = () => done(null);
    const timer = setTimeout(stop, ms); signal?.addEventListener('abort', stop, {once: true});
    Promise.resolve(promise).then(done, () => done(null));
  });
}
async function tokenChain(address, chain, signal) {
  const probe = id => capped(tokenFacts(id, address, {signal}), 4000, signal).then(f => f ? id : null);
  let rest = EVM_CHAINS;
  if (EVM_CHAINS.includes(chain)) { if (await probe(chain)) return chain; rest = EVM_CHAINS.filter(id => id !== chain); }
  if (signal.aborted) return null;
  // The first chain that answers wins; null once every chain has answered or timed out.
  return new Promise(resolve => { let left = rest.length; if (!left) resolve(null); for (const id of rest) probe(id).then(hit => { if (hit) resolve(hit); else if (--left === 0) resolve(null); }); });
}
async function runSearch({walletOnly = false} = {}) {
  if (state.query.length < 2 || document.hidden) return;
  searchController?.abort();
  const controller = new AbortController(), mine = ++searchGeneration;
  searchController = controller;
  const query = state.query, chain = state.chain, kind = classifyQuery(query);
  state.searching = true; renderRows();
  const ceiling = setTimeout(() => controller.abort(), 12000);
  try {
    // walletpnl: a wallet this device knows (connected, tracked or opened here before) is no token: open it at once.
    if (kind !== 'text' && !walletOnly && knownWallet(query, storage)) {
      clearTimeout(ceiling);
      await loadWallet(query, controller, mine);
      return;
    }
    if (kind === 'evm' && !walletOnly) {
      const found = await tokenChain(query, chain, controller.signal);
      if (mine !== searchGeneration) return;
      if (found) { clearTimeout(ceiling); clearSearch(); openPasted(found, query); return; }
    }
    if (walletOnly || (kind === 'evm' && chain !== 'all' && chain !== 'solana')) {
      clearTimeout(ceiling);
      await loadWallet(query, controller, mine);
      return;
    }
    // Server search first; when it fails or finds nothing, the browser searches the providers itself.
    let results = [];
    try {
      const response = await fetch('/api/terminal/x/search?' + new URLSearchParams({ q: state.query, ...(state.chain === 'all' ? {} : { chain: state.chain }) }), { cache: 'no-store', signal: controller.signal });
      const body = response.ok ? await response.json() : null;
      results = Array.isArray(body?.results) ? body.results : [];
    } catch (error) { if (controller.signal.aborted) throw error; }
    if (mine !== searchGeneration) return;
    if (!results.length) results = await browserSearch({ q: state.query, chain: state.chain, signal: controller.signal });
    if (mine !== searchGeneration) return;
    state.hits = results.filter(hit => typeof hit?.address === 'string' && CHAINS.some(([id]) => id !== 'all' && id === String(hit.chainId)));
    if (PASTED_EVM.test(state.query)) {
      const exact = state.hits.filter(hit => hit.address.toLowerCase() === state.query.toLowerCase()), chains = [...new Set(exact.map(hit => String(hit.chainId)))];
      if (chains.length === 1) { const a = state.query; search.value = ''; state.query = ''; state.hits = []; openPasted(chains[0], a); }
    }
    state.searchError = null;
    if (kind !== 'text' && state.query && !visibleRows().length) {
      clearTimeout(ceiling);
      await loadWallet(query, controller, mine);
    }
  } catch (error) {
    if (mine !== searchGeneration) return;
    if (kind !== 'text') {
      clearTimeout(ceiling);
      if (controller.signal.aborted) showWallet({address: query, error: true});
      else await loadWallet(query, controller, mine);
    } else state.searchError = error.name === 'AbortError' ? 'Token search timed out. Try again.' : plainMarketError();
  } finally {
    clearTimeout(ceiling);
    if (mine === searchGeneration) { state.searching = false; renderRows(); rememberSearchResults(); }
  }
}
search.addEventListener('input', event => {
  if (root.hidden) return;
  event.stopImmediatePropagation(); scheduleSearch();
}, true);

function showTokens({ restore = true, clearHash = true } = {}) {
  root.hidden = false;
  document.body.classList.add('qxt-discover-mode');
  renderRows();refresh();
  if (quickRow) quickSlot.append(quickRow);
  if (clearHash && hasTokenHash(location.hash)) history.replaceState(history.state, '', location.pathname + location.search);
  if (search.value.trim() !== state.query) scheduleSearch();
  scroll.scrollTop = savedScroll;
  if (restore) {
    ((pulseMode()?pulse.getNode(focusedKey)?.open:null) || nodes.get(focusedKey)?.open || tabs.querySelector('[aria-selected="true"]'))?.focus({ preventScroll: true });
    window.scrollTo({ top: savedWindowScroll, behavior: 'instant' });
  }
}
function showToken() {
  if (!root.hidden) { savedScroll = scroll.scrollTop; savedWindowScroll = window.scrollY; }
  root.hidden = true;pulse?.setActive(false);loader.cancel();hotLoader.cancel();
  document.body.classList.remove('qxt-discover-mode');
  if (quickRow && quickHome) quickHome.append(quickRow);
}
back.addEventListener('click', () => showTokens());
document.addEventListener('qxt:token', showToken);
document.addEventListener('qxt:discover', () => showTokens({ restore: false }));
document.addEventListener('qxt:search', event => {
  showTokens({ restore: false, clearHash: false });
  event.detail.handled = true;
});
window.addEventListener('hashchange', () => hasTokenHash(location.hash) ? showToken() : showTokens());

async function openSelection({chainId, address, controller, symbol, stock = false, key}, buy = false, control) {
  if (!api || opening) {
    if (!api) { notice.hidden = false; text(noticeText, 'The trading terminal is still loading. Retry in a moment.'); }
    return;
  }
  if (buy && stock) return;
  if(state.query)reportHotEvent(chainId,address,'search');
  if (key) focusedKey = key;
  opening = true; if (control) control.disabled = true;
  try {
    if (buy) await api.quickBuyExternal(chainId, address, {symbol, controller});
    else {
      // Use the existing guarded hash controller so A -> B creates a history
      // entry. Re-selecting A still needs to dismiss the discovery surface.
      const hash = controller ? '#m=' + chainId + ':' + controller : '#t=' + chainId + ':' + address;
      if (location.hash === hash) showToken();
      else location.hash = hash;
    }
  } catch (error) {
    document.getElementById('qxt-sync').textContent = error.message || 'Could not open this token. Try again.';
  } finally { opening = false; if (control) control.disabled = false; }
}
function openRow(node, buy = false) {
  const vm = node.vm;
  return openSelection({chainId: vm.chainId, address: vm.address, controller: vm.row.launch?.controller, symbol: vm.symbol, stock: vm.quick.stock, key: vm.key}, buy, node.buy);
}
root.addEventListener('click', event => {
  if (event.target.closest('.qxfd-safety, .qxfd-blocked, .qxfd-watch, .qxfd-evidence')) return;
  const tr = event.target.closest('tr[data-key]');
  if(event.target.closest('a.qxfd-open')){const vm=tr?.__tokenVM;if(state.query&&vm)reportHotEvent(vm.chainId,vm.address,'search');if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button)return;event.preventDefault();}
  if (tr&&tr.closest('.qxfd-table')){const node=pulseMode()?pulse.getNode(tr.dataset.key):nodes.get(tr.dataset.key);if(node)openRow(node,!!event.target.closest('.qxfd-buy'));}
});
root.addEventListener('focusin', event => {
  const tr = event.target.closest('tr[data-key]');
  if (!tr) return;
  focusedKey = tr.dataset.key;if(pulseMode()){pulse.focusKey(focusedKey,tr);return;}
  for (const [key, node] of nodes) node.open.tabIndex = key === focusedKey ? 0 : -1;
});
function focusRow(delta) {
  if(pulseMode()){pulse.focusRow(delta);return;}
  if (state.wallet) { walletPanel.querySelector('[aria-selected="true"]')?.focus(); return; }
  const list = [...tbody.querySelectorAll('tr[data-key]')];
  if (!list.length) return;
  const current = list.findIndex(tr => tr.contains(document.activeElement));
  const index = current < 0 ? 0 : Math.max(0, Math.min(list.length - 1, current + delta));
  const node = nodes.get(list[index].dataset.key);
  node.open.focus({ preventScroll: true });
  node.tr.scrollIntoView({ block: 'nearest' });
}
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || hasVisibleTerminalDialog(document)) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (root.hidden) showTokens();
    else if (document.activeElement === search || state.query) { search.value = ''; scheduleSearch(); focusRow(0); }
    return;
  }
  if (root.hidden) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
  if (typing) {
    if (event.target === search && event.key === 'Enter') { event.preventDefault(); focusRow(0); }
    return;
  }
  const key = event.key.toLowerCase();
  if (key === '/') { event.preventDefault(); root.classList.add('qxfd-search-open');searchToggle.setAttribute('aria-expanded','true');search.focus(); }
  else if (['arrowdown', 'arrowup', 'j', 'k'].includes(key)) { event.preventDefault(); focusRow(key === 'arrowdown' || key === 'j' ? 1 : -1); }
  else if(pulseMode()&&/^[1-3]$/.test(key)){event.preventDefault();pulse.select(['new','bonding','migrated'][Number(key)-1]);}
  else if (/^[1-5]$/.test(key)) { event.preventDefault(); setTab(availableTabs()[Number(key) - 1]?.[0]); }
});

function libraryAsset(vm){return vm?{kind:vm.row?.launch?.controller?'launch':'external',chainId:String(vm.chainId),token:vm.address,controller:vm.row?.launch?.controller,symbol:vm.symbol,name:vm.name,priceUsd:vm.row?.priceUsd,change24:vm.row?.change?.h24,observedAt:vm.row?.observedAt||vm.row?.launch?.synced?.at,stale:vm.row?.stale||vm.priceRefreshing}:null;}
function rememberSearchResults(){
 const key=state.chain+':'+state.query;if(!state.query){lastLibrarySearch='';return;}
 if(!api?.library||state.wallet||state.searching||state.query.length<2||key===lastLibrarySearch)return;
 const rows=visibleRows().slice(0,8).map(libraryAsset);if(rows.length){api.library.rememberSearch(rows);lastLibrarySearch=key;}
}
document.addEventListener('qxt:discovery-evidence',()=>{if(!root.hidden)renderRows();});
document.addEventListener('qhooks:first-run-owner',event=>{
 const owner=event.detail?.owner||null;
 if(filterOwner(owner)===filterOwner(filterWallet))return;
 const prior=JSON.stringify(state.filters);filterWallet=owner;state.filters=savedFilters();paintFilterFields();renderRows();if(JSON.stringify(state.filters)!==prior)refresh();
});
document.addEventListener('qhooks:discovery-apply-safe-start',event=>{
 const request=event.detail;
 if(!request||filterOwner(request.owner)!==filterOwner(filterWallet)||filterOwner(filterWallet)==='guest')return;
 try{
  const next=validateDiscoveryFilters(safeStartSelection(state.filters));
  if(!writeDiscoveryFilters(storage,filterWallet,markSafeStart(next)))throw Error('This device could not save these filters. You can still skip.');
  state.filters=next;paintFilterFields();filterMessage.textContent='Safe-start filters saved for this wallet.';
  renderRows();refresh();request.result={applied:true,filters:{...next},owner:filterWallet};
 }catch(error){request.error=error.message;}
});
window.dispatchEvent(new Event('qhooks:first-run-context-request'));
document.addEventListener('qxt:library',()=>{if(pulseMode())pulse.render();for(const node of nodes.values())if(node.vm){const watched=!!api?.library?.has(libraryAsset(node.vm));text(node.watch,watched?'★':'☆');node.watch.setAttribute('aria-pressed',String(watched));node.watch.setAttribute('aria-label',(watched?'Remove ':'Add ')+node.vm.symbol+(watched?' from':' to')+' watchlist');}});
function connectTerminal() {
  if (api || !window.qxTerminal) return;
  api = window.qxTerminal;
  tokenLibraryUI=mountTokenLibrary(api,{discoveryHeading:root.querySelector('.qxfd-heading'),marketRows:()=>(pulseMode()?pulse.getModels().map(libraryAsset):[...nodes.values()].map(n=>libraryAsset(n.vm))).filter(Boolean)});
  const access=root.querySelector('.qtl-discovery-access');if(access)instant.insertBefore(access,proToggle);
  rememberSearchResults();
  quickRow = document.querySelector('.qxt-quick'); quickHome = quickRow?.parentElement;
  if (quickRow) {
    quickRow.addEventListener('input', () => renderRows());
    if (!root.hidden) quickSlot.append(quickRow);
  }
  api.onMarkets(markets => {
    state.markets = markets || [];
    const hasLaunches = state.markets.some(m => m.live);
    if (wantedLaunch && hasLaunches) { wantedLaunch = false; setTab('launches'); }
    else if (state.tab === 'launches' && !hasLaunches) setTab('trending');
    renderTabs(); renderRows();
  });
}
document.addEventListener('qhooks:quick-settings',()=>renderRows());
document.addEventListener('qxt:ready', connectTerminal);
renderTabs(); updateSort();
if (hasTokenHash(location.hash)) showToken();
else showTokens({ restore: false, clearHash: false });
connectTerminal(); refresh(); void loadLaunches();
if (globalThis.__qxTokenQuery?.search && !hasTokenHash(location.hash)) { search.value = globalThis.__qxTokenQuery.search; scheduleSearch(); }
// D4: the list on screen re-reads every 10 s (30 s after 3 unchanged reads), conditional on the server's ETag; the
// 30 s task keeps the other views (launches, hot, funds), launches and search.
const LIVE_TABS=new Set(['trending','new','gainers','losers','volume','bonding','migrated']);
const liveView=()=>!document.hidden&&!root.hidden&&!state.wallet&&!state.query&&pauseUpdates.getAttribute('aria-pressed')!=='true'&&(pulseMode()||LIVE_TABS.has(state.tab));
livePoll=createPollScheduler({isActive:liveView,poll:async()=>{
  if(pulseMode())return pulse.pollNext?await pulse.pollNext():'skip';
  if(state.loading)return 'busy';
  // Every 2 min a full load still runs, so lists that lean on browser-read rows (thin server answers) refresh those too.
  if(Date.now()-lastFullLoadAt>120000){refresh();return 'busy';}
  // Custom server filters make a key few others share (no colo cache reuse): those views re-read every 30 s.
  const filters=viewFilters(state,filterBypass),custom=['liquidityMin','liquidityMax','capMin','capMax','volumeMin','transactionsMin','ageMinHours','ageMaxHours','venue','hasSocials'].some(k=>filters?.[k]!==''&&filters?.[k]!=null);
  if(custom&&Date.now()-filteredPollAt<29000)return 'skip';if(custom)filteredPollAt=Date.now();
  return loader.poll(state.tab,state.chain,state.window,filters);
}});
repeatTokenTask(() => { if(!liveView())refresh(); void loadLaunches(); if (state.query.length >= 2 && classifyQuery(state.query) === 'text') void runSearch(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pulse?.setActive(false);loader.cancel();hotLoader.cancel(); searchController?.abort(); clearTimeout(searchTimer); searchGeneration++; if (state.wallet?.loading) showWallet({address: state.wallet.address, error: true}); }
  else { refresh(); if (state.query.length >= 2 && !state.wallet) runSearch(); }
});
loadFounding(); repeatTokenTask(loadFounding, 300000);
