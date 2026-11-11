import {bindTokenAvatar} from './qx-token-avatar.mjs';
import {WINDOWS,filterDiscovery,createMarketViews,validateDiscoveryFilters} from './qx-discovery-model.mjs';
import {plainMarketError} from './qx-terminal-data.mjs';
import {fetchDexPairs,pickPair,rowPatch,applyRowPatch,DEX_CHAINS} from './qx-dex-live.mjs';
import {renderFeedFeedback} from './qx-terminal-feed-presentation.mjs';
import {browserFeed,browserSearch,readCachedFeed,writeCachedFeed} from './qx-browser-market.mjs';
import {applyTokenQuery} from './qx-tg-prefill.mjs';
import {classifyQuery, createWalletLookup, renderWalletPanel} from './qx-wallet-lookup.mjs';
import {ethCall} from './qx-chain.mjs';
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
const lookupWallet = createWalletLookup();
let savedWindow;try{savedWindow=storage?.getItem('qxt:discover:window');}catch{}state.window=WINDOWS.some(([k])=>k===savedWindow)?savedWindow:'h6'; /* first open: 6h (Randall, 2026-11-09) */state.filters=validateDiscoveryFilters();
if(WINDOWS.some(([key])=>key===state.sort.key)){state.window=state.sort.key;state.sort={...state.sort,key:'move'};savePreference(storage,'window',state.window);savePreference(storage,'sort',state.sort);}
const savedViews=createMarketViews(storage);
let wantedLaunch = prefs.tab === 'launches', api = null, quickRow = null, quickHome = null;
let focusedKey = null, savedScroll = 0, savedWindowScroll = 0, opening = false, searchGeneration = 0;
let searchTimer, searchController;
const main = document.getElementById('qxt-main');
const search = document.getElementById('qxt-search');
const columns = [
  ['token', 'Token'], ['price', 'Price'], ['move', 'Change'],
  ['volume', 'Volume 24h'], ['liquidity', 'Liquidity'], ['mcap', 'MCap'],
  ['txns', 'Swaps 24h'], ['makers', 'Wallet activity'], ['safety', 'Safety'], ['buy', '⚡ Buy'],
];
const nodes = new Map();
const root = el('section', { class: 'qxfd', id: 'qxt-discover', 'aria-label': 'Tokens' });
const tabs = el('div', { class: 'qxfd-tabs', role: 'tablist', 'aria-label': 'Token lists' });
const chainGroup = el('div', { class: 'qxfd-chains', role: 'group', 'aria-label': 'Token chains' });
const status = el('span', { class: 'qxfd-status', role: 'status', 'aria-live': 'polite' });
const windows=el('div',{class:'qxfd-windows',role:'group','aria-label':'Price change window'},...WINDOWS.map(([key,label])=>button(label,{'data-window':key,'aria-pressed':String(key===state.window)})));
const quickSlot = el('div', { class: 'qxfd-quick-slot' });
const sortSelect = el('select', { 'aria-label': 'Sort tokens', class: 'qxfd-sort-select' },
  el('option', { value: '' }, 'Feed order'), ...columns.filter(([key]) => SORT_KEYS.includes(key)).flatMap(([key, label]) => [
    el('option', { value: key + ':desc' }, label + ' ↓'), el('option', { value: key + ':asc' }, label + ' ↑'),
  ]));
const sortHint=el('span',{class:'qxfd-sort-hint',id:'qxfd-sort-hint'},'Sort this list');
sortSelect.setAttribute('aria-describedby','qxfd-sort-hint');
const filterFields={};
const filterDetails=el('details',{class:'qxfd-filter-details'},el('summary',{},'Filters'));
const filterGrid=el('div',{class:'qxfd-filter-grid'});
for(const [key,label] of [['liquidityMin','Min liquidity, $'],['capMin','Min cap / FDV, $'],['capMax','Max cap / FDV, $'],['volumeMin','Min 24h volume, $'],['transactionsMin','Min 24h transactions'],['ageMaxHours','Max age, hours'],['venue','Venue']]){
 const input=el('input',{type:'text',inputmode:key==='venue'?'text':'decimal','aria-label':label,placeholder:key==='venue'?'Any venue':'Any'});filterFields[key]=input;filterGrid.append(el('label',{},el('span',{},label),input));
}
const applyFilters=button('Apply filters'),resetFilters=button('Reset'),viewName=el('input',{type:'text',maxlength:32,'aria-label':'Saved view name',placeholder:'Name this view'}),saveView=button('Save view'),removeView=button('Delete view');
const viewSelect=el('select',{'aria-label':'Saved market views'}),filterMessage=el('p',{role:'status','aria-live':'polite',class:'qxfd-filter-message'});
const renderViews=()=>{viewSelect.replaceChildren(el('option',{value:''},'Saved views'),...savedViews.list().map(v=>el('option',{value:v.name},v.name)));};renderViews();
filterDetails.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();filterDetails.open=false;filterDetails.querySelector('summary').focus();}});
filterDetails.append(filterGrid,el('div',{class:'qxfd-filter-actions'},applyFilters,resetFilters),el('div',{class:'qxfd-saved-views'},viewSelect,viewName,saveView,removeView),filterMessage);
function captureFilters(){return validateDiscoveryFilters(Object.fromEntries(Object.entries(filterFields).map(([k,v])=>[k,v.value])));}
function updateWindow(){for(const b of windows.children)b.setAttribute('aria-pressed',String(b.dataset.window===state.window));const label=WINDOWS.find(([k])=>k===state.window)?.[1]||'24h';headers.get('move')?.querySelector('button')?.replaceChildren(label+' change');}
windows.addEventListener('click',event=>{const key=event.target.closest('[data-window]')?.dataset.window;if(!WINDOWS.some(([k])=>k===key)||key===state.window)return;state.window=key;savePreference(storage,'window',key);updateWindow();refresh();});
applyFilters.addEventListener('click',()=>{try{state.filters=captureFilters();filterMessage.textContent='Filters applied to this list.';renderRows();}catch(error){filterMessage.textContent=error.message;}});
resetFilters.addEventListener('click',()=>{state.filters=validateDiscoveryFilters();for(const input of Object.values(filterFields))input.value='';filterMessage.textContent='Filters cleared.';renderRows();});
saveView.addEventListener('click',()=>{try{state.filters=captureFilters();savedViews.save({name:viewName.value,chain:state.chain,tab:state.tab,window:state.window,filters:state.filters});renderViews();viewSelect.value=viewName.value.trim();filterMessage.textContent='View saved on this device.';renderRows();}catch(error){filterMessage.textContent=error.message;}});
removeView.addEventListener('click',()=>{try{if(!viewSelect.value)return;savedViews.remove(viewSelect.value);renderViews();filterMessage.textContent='View deleted.';}catch(error){filterMessage.textContent=error.message;}});
viewSelect.addEventListener('change',()=>{const v=savedViews.list().find(v=>v.name===viewSelect.value);if(!v)return;if(state.wallet)clearSearch();state.tab=v.tab;state.window=v.window;state.chain=CHAINS.some(([k])=>k===v.chain)?v.chain:'all';state.filters=v.filters;state.data=null;for(const [k,input]of Object.entries(filterFields))input.value=v.filters[k]||'';for(const b of chainGroup.children)b.setAttribute('aria-pressed',String(b.dataset.chain===state.chain));viewName.value=v.name;renderTabs();updateWindow();refresh();});
const panel = el('div', { role: 'tabpanel', id: 'qxfd-panel', class: 'qxfd-panel' });
const noticeText = el('span');
const retry = button('Retry', { class: 'qxfd-retry' });
const notice = el('div', { class: 'qxfd-notice', role: 'status', hidden: '' }, noticeText, retry);
const scroll = el('div', { class: 'qxfd-scroll' });
const table = el('table', { class: 'qxfd-table', 'aria-label': 'Tokens' });
const header = el('tr');
const headers = new Map();
for (const [key, label] of columns) {
  const th = el('th', { scope: 'col', class: 'qxfd-' + key });
  if (SORT_KEYS.includes(key)) {
    th.append(button(label, { 'data-sort': key, title: 'Sort by ' + label }));
    th.setAttribute('aria-sort', 'none');
    headers.set(key, th);
  } else th.textContent = label;
  header.append(th);
}
const tbody = el('tbody');
table.append(el('thead', {}, header), tbody);
scroll.append(table);
const empty = el('div', { class: 'qxfd-empty', hidden: '' });
const walletPanel = el('div', {class: 'qxfd-wallet-slot', hidden: ''});
const count = el('span');
const source = el('span');
const heading = el('h1', {}, 'Tokens');
panel.append(notice, scroll, empty, walletPanel);
// While a wallet is shown, the list controls (tabs, chains, sort, windows) step aside so the wallet starts at the top.
const walletBack = button('← Tokens', { class: 'qxfd-wallet-back', hidden: '' });
const listControls = [el('div', { class: 'qxfd-toolbar' }, tabs, quickSlot),
  el('div', { class: 'qxfd-filterbar' }, chainGroup, el('div',{class:'qxfd-sort-tools'},sortHint,sortSelect)),
  el('div',{class:'qxfd-viewbar'},windows,filterDetails)];
root.append(
  el('div', { class: 'qxfd-heading' }, walletBack, heading, status),
  ...listControls,
  panel,
  el('div', { class: 'qxfd-footer' }, count, source,
    el('span', { class: 'qxfd-hint' }, '↑ ↓ Navigate · Enter Open · / Search · Esc Tokens')),
);
main.prepend(root);
const back = button('← Tokens', { class: 'qxfd-back', 'aria-label': 'Back to tokens' });
document.getElementById('qxt-head').prepend(back);

// QHooks launches on every chain, read by Discover itself: the rail's list (state.markets) follows the rail's own chain,
// so the tab showed one chain's launches, or none (2026-11-10). Falls back to the rail list until this answers.
let allLaunches = null;
async function loadLaunches() {
  try {
    const r = await fetch('/api/terminal/feed?chain=all', { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (Array.isArray(j?.markets)) { allLaunches = j.markets; renderTabs(); renderRows(); setTimeout(() => { void refreshLiveRows(); }, 500); }
  } catch {}
}
const launchMarkets = () => allLaunches || state.markets;
const availableTabs = () => (launchMarkets().some(m => m.live) || founding.launches.length) ? [['launches', 'QHooks launches'], ...TABS] : TABS;
function renderTabs() {
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
  for (const [key, th] of headers) th.setAttribute('aria-sort', state.sort.key === key ? (state.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
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
  const seenLaunch = new Set(), launches = launchMarkets().filter(m => m.live && !seenLaunch.has(m.chainId + ':' + m.controller) && seenLaunch.add(m.chainId + ':' + m.controller)).map(launchRow).map(r => { const p = livePatches.get(launchKey(r)); return p && Date.now() - p.observedAt < 120000 && r.priceUsd == null ? applyRowPatch(r, p) : r; });
  let rows = state.tab === 'launches' ? launches : state.data?.rows || [];
  const q = state.query.toLowerCase();
  // The tab's own filter (Gainers needs a positive move in the chosen window, etc.) applies to the list, never to search
  // hits: a hit carries only a 24 h change, so on Gainers 6h every pasted contract read "No tokens match" (2026-11-10).
  rows = filterDiscovery(rows,{tab:state.tab,window:state.window,filters:state.filters});
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
  return sortRows(rows.filter(r => state.chain === 'all' || String(r.chainId) === state.chain)
    .map(r => rowViewModel(r, { quick: api?.state.quick || {},window:state.window })), state.sort);
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
  const logo = el('img', { alt: '', width: 26, height: 26, loading: 'lazy', referrerpolicy: 'no-referrer', hidden: '' });
  avatar.append(letter, logo);
  const symbol = el('b'), name = el('span', { class: 'qxfd-name' }), rowAge = el('span', { class: 'qxfd-age' });
  const chain = el('img', { class: 'qxfd-chain-icon', width: 13, height: 13, alt: '' });
  const open = button('', { class: 'qxfd-open', tabindex: '-1' });
  open.append(avatar, el('span', { class: 'qxfd-identity' }, symbol, name), chain, rowAge);
  cells.token.append(open);
  const cap = el('span'), capKind = el('small', { class: 'qxfd-cap-kind' });
  cells.mcap.append(cap, capKind);
  const buys = el('span', { class: 'up' }), sells = el('span', { class: 'down' });
  cells.txns.append(buys, el('span', { class: 'qxfd-divider', 'aria-hidden': 'true' }, ' / '), sells);
  const safe = el('span', { class: 'qxfd-safety-mark' });
  const tip = el('span', { class: 'qxfd-tooltip', role: 'tooltip' });
  cells.safety.append(safe, tip);
  const buy = button('', { class: 'qxfd-buy' });
  const blocked = el('span', { class: 'qxfd-blocked', hidden: '' }, 'not tradable here');
  cells.buy.append(buy, blocked);
  return { tr, cells, avatar, letter, logo, symbol, name, rowAge, chain, open, cap, capKind, buys, sells, safe, tip, buy, blocked, vm: null };
}

function updateRow(node, vm) {
  const old = node.vm;
  node.vm = vm;
  text(node.letter, vm.letter); text(node.symbol, vm.symbol); text(node.name, vm.name + (founding.slots.has(vm.chainId+':'+(vm.chainId==='solana'?String(vm.address):String(vm.address).toLowerCase())) ? ' · Founding #' + founding.slots.get(vm.chainId+':'+(vm.chainId==='solana'?String(vm.address):String(vm.address).toLowerCase())) : '')); text(node.rowAge, vm.lifecycle.stage==='bonding'?'Bond '+Math.round(vm.lifecycle.progress*100)+'%':vm.lifecycle.stage==='migrated'?'Migrated · '+vm.age:vm.age);node.rowAge.dataset.stage=vm.lifecycle.stage;
  node.name.title = vm.name;
  node.open.setAttribute('aria-label', `Open ${vm.symbol}, ${vm.name || vm.address}, on ${vm.chainName}`);
  node.chain.hidden = !vm.chainIcon;
  if (vm.chainIcon) {
    node.chain.setAttribute('src', '/chain-symbol-icons/' + vm.chainIcon + '.svg');
    node.chain.alt = vm.chainName;
  }
  if(JSON.stringify(old?.avatarSources)!==JSON.stringify(vm.avatarSources)){node.unbindAvatar?.();node.unbindAvatar=bindTokenAvatar(node.logo,{},vm.avatarSources);}
  for (const key of ['price', 'move', 'volume', 'liquidity', 'makers']) text(node.cells[key], vm[key]);
  for (const key of ['move']) {
    node.cells[key].classList.toggle('up', vm.numeric[key] > 0);
    node.cells[key].classList.toggle('down', vm.numeric[key] < 0);
  }
  node.cells.move.setAttribute('data-label',(WINDOWS.find(([k])=>k===state.window)?.[1]||'24h')+' change');
  text(node.cap, vm.mcap); text(node.capKind, vm.capKind);
  text(node.buys, vm.buys); text(node.sells, vm.sells);
  node.cells.txns.setAttribute('aria-label', `${vm.buys === DASH ? 'Unknown' : vm.buys} buys, ${vm.sells === DASH ? 'unknown' : vm.sells} sells in 24 hours`);
  node.cells.makers.title=vm.row.makersKind==='unique_wallets'?'Unique wallets in the received 24h swaps.':'Provider buyer and seller activity; a wallet may be counted on both sides.';
  text(node.safe, vm.safety.label);
  node.cells.safety.dataset.flag = vm.safety.flag || '';
  node.cells.safety.title = vm.safety.title;
  node.cells.safety.setAttribute('aria-label', vm.safety.title);
  node.cells.safety.tabIndex = vm.safety.flag ? 0 : -1;
  text(node.tip, vm.safety.title);
  const label = `⚡ ${vm.quick.value} ${vm.quick.unit}`;
  text(node.buy, label);
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
  }
}

function skeleton() {
  nodes.clear();
  tbody.replaceChildren(...Array.from({ length: 12 }, () => el('tr', { class: 'qxfd-skeleton', 'aria-hidden': 'true' },
    ...columns.map(([key]) => el('td', { class: 'qxfd-' + key }, el('span', { class: 'qxfd-placeholder' }))))));
}

// Founding Launchers (2026-11-10): a pinned row to /founding on the QHooks launches tab, and "Founding #N" by name.
const founding = {status: null, left: 0, slots: new Map(), launches: []}, foundingTr = el('tr', {class: 'qxfd-founding'});
async function loadFounding() {
  try { const r = await fetch('/api/founding', {cache: 'no-store'}), d = r.ok ? await r.json() : null; if (!d) return;
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
  const wallet = state.wallet;
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
  const rows = visibleRows(),activeFilters=Object.values(state.filters).filter(x=>x!=='').length;filterDetails.querySelector('summary').textContent=activeFilters?'Filters · '+activeFilters:'Filters';
  const previousFocus = document.activeElement;
  const previousIndex = [...nodes.keys()].indexOf(focusedKey);
  const y = scroll.scrollTop, pageY = window.scrollY;
  if (!nodes.size) tbody.replaceChildren();
  const keep = new Set(rows.map(vm => vm.key));
  for (const [key, node] of nodes) if (!keep.has(key)) { node.tr.remove(); nodes.delete(key); }
  rows.forEach((vm, index) => {
    let node = nodes.get(vm.key);
    if (!node) { node = makeRow(vm); nodes.set(vm.key, node); }
    updateRow(node, vm);
    if (tbody.children[index] !== node.tr) tbody.insertBefore(node.tr, tbody.children[index] || null);
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
  const emptyText = !state.query&&missingWindow?'No '+(WINDOWS.find(([k])=>k===state.window)?.[1]||'selected-window')+' history is available for this received set yet.':activeFilters&&!state.query?'No tokens match these filters.':!state.query&&['bonding','migrated'].includes(state.tab)&&!state.error?'No confirmed '+(state.tab==='bonding'?'curves above 80% graduation':'migrations')+' in the received market set.':state.query ? (state.searching ? 'Searching tokens…' : 'No tokens match this search.') : state.error ? 'The token feed could not be loaded. Retry above.' : 'No tokens in this list yet. Try another chain or tab.';
  text(count, initialLoading ? 'Loading tokens…' : `${rows.length} token${rows.length === 1 ? '' : 's'} · ${rows.filter(r=>r.numeric.move!==null).length} with ${WINDOWS.find(([k])=>k===state.window)?.[1]} history`);
  panel.setAttribute('aria-busy', String(state.loading || state.searching));
  renderFeedFeedback({state,heading,status,notice,noticeText,empty,retry,emptyText});
  text(source, state.tab === 'launches' ? '' : [state.data?.source,state.data?.coverage?.description].filter(Boolean).join(' · '));
  scroll.scrollTop = y;
  if (window.scrollY !== pageY) window.scrollTo({ top: pageY, behavior: 'instant' });
}

// Live rows: the visitor's browser refreshes the on-screen rows from DexScreener every 30 s (30 per call, per chain).
// A server reload keeps any newer live numbers instead of going back to an older copy.
const launchKey = r => 'launch:' + r.chainId + ':' + String(r.token?.address || '').toLowerCase();
const livePatches = new Map(), rowKey = r => r.chainId + ':' + (r.chainId === 'solana' ? r.pool : String(r.pool || '').toLowerCase());
function withLive(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => { const p = livePatches.get(rowKey(r)); return p && Date.now() - p.observedAt < 90000 ? applyRowPatch(r, p) : r; });
}
let liveRowsBusy = false;
async function refreshLiveRows() {
  if (liveRowsBusy || document.hidden || root.hidden || state.wallet || (state.tab !== 'launches' && !state.data?.rows?.length)) return;
  liveRowsBusy = true;
  try {
    const shown = visibleRows().map(v => v?.row || v).filter(r => (!r.launch || r.priceUsd == null) && DEX_CHAINS[r.chainId] && r.token?.address).slice(0, 60), byChain = new Map();
    for (const r of shown) { const list = byChain.get(r.chainId) || []; if (list.length < 30) list.push(r); byChain.set(r.chainId, list); }
    let changed = false;
    for (const [chainId, rows] of byChain) {
      const pairs = await fetchDexPairs(chainId, rows.map(r => r.token.address)); if (!pairs) continue;
      for (const r of rows) { const patch = rowPatch(pickPair(pairs, chainId, r.token.address, r.launch ? null : r.pool)); if (patch) { livePatches.set(r.launch ? launchKey(r) : rowKey(r), patch); changed = true; } }
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
const loader = createFeedLoader({ fetcher: (...args) => fetch(...args), timeout: 25000, serverTimeout: 12000, browserDelay: 1500, storage, browser: opts => browserFeed(opts), cacheRead: readCachedFeed, cacheWrite: writeCachedFeed, changed: update => {
  if (update?.data?.rows) update = { ...update, data: { ...update.data, rows: withLive(update.data.rows) } };
  Object.assign(state, update); renderRows();
  if (!livePatches.size && update?.data?.rows?.length) setTimeout(() => { void refreshLiveRows(); }, 1500);
} });
function refresh() {
  // Only while the token list is on screen: a token page must not keep reading list providers in the background.
  if (document.hidden || root.hidden || state.wallet) return;
  if (state.tab === 'launches') { state.loading = false; state.data = null; state.error = null; renderRows(); }
  else loader.load(state.tab, state.chain,state.window);updateWindow();
}
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
  const hash = '#t=' + chainId + ':' + (chainId === 'solana' ? address : address.toLowerCase());
  if (location.hash === hash) return;
  location.hash = hash;
}
function scheduleSearch({restoreFeed = true} = {}) {
  clearTimeout(searchTimer); searchController?.abort(); searchGeneration++;
  const wasWallet = !!state.wallet;
  state.wallet = null; walletPanel.replaceChildren();
  state.query = search.value.trim(); state.hits = []; state.searchError = null;
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
async function loadWallet(address, controller, mine) {
  loader.cancel();
  showWallet({address, loading: true});
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const view = await lookupWallet(address, {signal: controller.signal});
    if (mine === searchGeneration) showWallet({address, view});
  } catch {
    if (mine === searchGeneration) showWallet({address, error: true});
  } finally { clearTimeout(timer); }
}
async function isToken(chain, address, signal) {
  let timer;
  const abort = () => finish('');
  let finish;
  const stop = new Promise(resolve => {
    finish = resolve;
    timer = setTimeout(() => resolve(''), 3000);
    signal.addEventListener('abort', abort, {once: true});
  });
  try {
    const result = await Promise.race([ethCall(chain, address, '0x95d89b41').catch(() => ''), stop]);
    return typeof result === 'string' && /^0x[0-9a-f]+$/i.test(result) && /[1-9a-f]/i.test(result.slice(2));
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
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
    if (walletOnly || (kind === 'evm' && chain !== 'all' && chain !== 'solana')) {
      const token = !walletOnly && await isToken(chain, query, controller.signal);
      if (mine !== searchGeneration) return;
      clearTimeout(ceiling);
      if (token) { clearSearch(); openPasted(chain, query); }
      else await loadWallet(query, controller, mine);
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
    if (mine === searchGeneration) { state.searching = false; renderRows(); }
  }
}
search.addEventListener('input', event => {
  if (root.hidden) return;
  event.stopImmediatePropagation(); scheduleSearch();
}, true);

function showTokens({ restore = true, clearHash = true } = {}) {
  root.hidden = false;
  document.body.classList.add('qxt-discover-mode');
  refresh();
  if (quickRow) quickSlot.append(quickRow);
  if (clearHash && hasTokenHash(location.hash)) history.replaceState(history.state, '', location.pathname + location.search);
  if (search.value.trim() !== state.query) scheduleSearch();
  scroll.scrollTop = savedScroll;
  if (restore) {
    (nodes.get(focusedKey)?.open || tabs.querySelector('[aria-selected="true"]'))?.focus({ preventScroll: true });
    window.scrollTo({ top: savedWindowScroll, behavior: 'instant' });
  }
}
function showToken() {
  if (!root.hidden) { savedScroll = scroll.scrollTop; savedWindowScroll = window.scrollY; }
  root.hidden = true;
  document.body.classList.remove('qxt-discover-mode');
  if (quickRow && quickHome) quickHome.append(quickRow);
}
back.addEventListener('click', () => showTokens());
document.addEventListener('qxt:token', showToken);
document.addEventListener('qxt:discover', () => showTokens({ restore: false }));
window.addEventListener('hashchange', () => hasTokenHash(location.hash) ? showToken() : showTokens());

async function openSelection({chainId, address, controller, stock = false, key}, buy = false, control) {
  if (!api || opening) {
    if (!api) { notice.hidden = false; text(noticeText, 'The trading terminal is still loading. Retry in a moment.'); }
    return;
  }
  if (buy && stock) return;
  if (key) focusedKey = key;
  opening = true; if (control) control.disabled = true;
  try {
    if (buy) await api.quickBuyExternal(chainId, address);
    else if (controller) await api.select(chainId, controller);
    else await api.selectExternal(chainId, address);
  } catch (error) {
    document.getElementById('qxt-sync').textContent = error.message || 'Could not open this token. Try again.';
  } finally { opening = false; if (control) control.disabled = false; }
}
function openRow(node, buy = false) {
  const vm = node.vm;
  return openSelection({chainId: vm.chainId, address: vm.address, controller: vm.row.launch?.controller, stock: vm.quick.stock, key: vm.key}, buy, node.buy);
}
tbody.addEventListener('click', event => {
  if (event.target.closest('.qxfd-safety, .qxfd-blocked')) return;
  const tr = event.target.closest('tr[data-key]');
  if (tr) openRow(nodes.get(tr.dataset.key), !!event.target.closest('.qxfd-buy'));
});
tbody.addEventListener('focusin', event => {
  const tr = event.target.closest('tr[data-key]');
  if (!tr) return;
  focusedKey = tr.dataset.key;
  for (const [key, node] of nodes) node.open.tabIndex = key === focusedKey ? 0 : -1;
});
function focusRow(delta) {
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
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
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
  if (key === '/') { event.preventDefault(); search.focus(); }
  else if (['arrowdown', 'arrowup', 'j', 'k'].includes(key)) { event.preventDefault(); focusRow(key === 'arrowdown' || key === 'j' ? 1 : -1); }
  else if (/^[1-5]$/.test(key)) { event.preventDefault(); setTab(availableTabs()[Number(key) - 1]?.[0]); }
});

function connectTerminal() {
  if (api || !window.qxTerminal) return;
  api = window.qxTerminal;
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
document.addEventListener('qxt:ready', connectTerminal);
renderTabs(); updateSort();
if (hasTokenHash(location.hash)) showToken();
else showTokens({ restore: false, clearHash: false });
connectTerminal(); refresh(); void loadLaunches();
if (globalThis.__qxTokenQuery?.search && !hasTokenHash(location.hash)) { search.value = globalThis.__qxTokenQuery.search; scheduleSearch(); }
repeatTokenTask(() => { refresh(); void loadLaunches(); if (state.query.length >= 2 && classifyQuery(state.query) === 'text') void runSearch(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { loader.cancel(); searchController?.abort(); clearTimeout(searchTimer); searchGeneration++; if (state.wallet?.loading) showWallet({address: state.wallet.address, error: true}); }
  else { refresh(); if (state.query.length >= 2 && !state.wallet) runSearch(); }
});
loadFounding(); repeatTokenTask(loadFounding, 300000);
