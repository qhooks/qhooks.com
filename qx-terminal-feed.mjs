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
  loading: false, error: null, query: '', hits: [], searching: false, searchError: null };
let wantedLaunch = prefs.tab === 'launches', api = null, quickRow = null, quickHome = null;
let focusedKey = null, savedScroll = 0, savedWindowScroll = 0, opening = false, searchGeneration = 0;
let searchTimer, searchController;
const main = document.getElementById('qxt-main');
const search = document.getElementById('qxt-search');
const columns = [
  ['token', 'Token'], ['price', 'Price'], ['m5', '5m'], ['h1', '1h'], ['h24', '24h'],
  ['volume', 'Volume 24h'], ['liquidity', 'Liquidity'], ['mcap', 'MCap'],
  ['txns', 'Txns 24h'], ['makers', 'Makers'], ['safety', 'Safety'], ['buy', '⚡ Buy'],
];
const nodes = new Map();
const root = el('section', { class: 'qxfd', id: 'qxt-discover', 'aria-label': 'Tokens' });
const tabs = el('div', { class: 'qxfd-tabs', role: 'tablist', 'aria-label': 'Token lists' });
const chainGroup = el('div', { class: 'qxfd-chains', role: 'group', 'aria-label': 'Token chains' });
const status = el('span', { class: 'qxfd-status', role: 'status', 'aria-live': 'polite' });
const quickSlot = el('div', { class: 'qxfd-quick-slot' });
const sortSelect = el('select', { 'aria-label': 'Sort tokens', class: 'qxfd-sort-select' },
  el('option', { value: '' }, 'Feed order'), ...columns.filter(([key]) => SORT_KEYS.includes(key)).flatMap(([key, label]) => [
    el('option', { value: key + ':desc' }, label + ' ↓'), el('option', { value: key + ':asc' }, label + ' ↑'),
  ]));
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
const count = el('span');
const source = el('span');
panel.append(notice, scroll, empty);
root.append(
  el('div', { class: 'qxfd-heading' }, el('h1', {}, 'Tokens'), status),
  el('div', { class: 'qxfd-toolbar' }, tabs, quickSlot),
  el('div', { class: 'qxfd-filterbar' }, chainGroup, sortSelect),
  panel,
  el('div', { class: 'qxfd-footer' }, count, source,
    el('span', { class: 'qxfd-hint' }, '↑ ↓ Navigate · Enter Open · / Search · Esc Tokens')),
);
main.prepend(root);
const back = button('← Tokens', { class: 'qxfd-back', 'aria-label': 'Back to tokens' });
document.getElementById('qxt-head').prepend(back);

const availableTabs = () => state.markets.some(m => m.live) ? [['launches', 'QHooks launches'], ...TABS] : TABS;
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
  const launches = state.markets.filter(m => m.live).map(launchRow);
  let rows = state.tab === 'launches' ? launches : state.data?.rows || [];
  const q = state.query.toLowerCase();
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
    .map(r => rowViewModel(r, { quick: api?.state.quick || {} })), state.sort);
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
  logo.addEventListener('error', () => { logo.hidden = true; });
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
  text(node.letter, vm.letter); text(node.symbol, vm.symbol); text(node.name, vm.name); text(node.rowAge, vm.age);
  node.name.title = vm.name;
  node.open.setAttribute('aria-label', `Open ${vm.symbol}, ${vm.name || vm.address}, on ${vm.chainName}`);
  node.chain.hidden = !vm.chainIcon;
  if (vm.chainIcon) {
    node.chain.setAttribute('src', '/chain-symbol-icons/' + vm.chainIcon + '.svg');
    node.chain.alt = vm.chainName;
  }
  if (old?.logo !== vm.logo) {
    node.logo.hidden = !vm.logo;
    if (vm.logo) node.logo.src = vm.logo;
    else node.logo.removeAttribute('src');
  }
  for (const key of ['price', 'm5', 'h1', 'h24', 'volume', 'liquidity', 'makers']) text(node.cells[key], vm[key]);
  for (const key of ['m5', 'h1', 'h24']) {
    node.cells[key].classList.toggle('up', vm.numeric[key] > 0);
    node.cells[key].classList.toggle('down', vm.numeric[key] < 0);
  }
  text(node.cap, vm.mcap); text(node.capKind, vm.capKind);
  text(node.buys, vm.buys); text(node.sells, vm.sells);
  node.cells.txns.setAttribute('aria-label', `${vm.buys === DASH ? 'Unknown' : vm.buys} buys, ${vm.sells === DASH ? 'unknown' : vm.sells} sells in 24 hours`);
  const labels = { ok: 'No flags', warn: 'Caution', danger: 'Danger' };
  text(node.safe, vm.safety.flag ? labels[vm.safety.flag] : DASH);
  node.cells.safety.dataset.flag = vm.safety.flag || '';
  node.cells.safety.title = vm.safety.title;
  node.cells.safety.setAttribute('aria-label', vm.safety.title);
  node.cells.safety.tabIndex = vm.safety.flag ? 0 : -1;
  text(node.tip, vm.safety.title);
  const label = `⚡ ${vm.quick.value} ${vm.quick.unit}`;
  text(node.buy, label);
  node.buy.setAttribute('aria-label', vm.quick.supported ? `Buy ${vm.symbol} with ${vm.quick.value} ${vm.quick.unit}` : `Open ${vm.symbol} in the trade ticket; quick buy is unavailable`);
  node.buy.title = vm.quick.supported ? `Buy ${vm.symbol} with ${vm.quick.value} ${vm.quick.unit}` : 'Open the trade ticket; quick buy is unavailable for this token';
  node.buy.hidden = vm.quick.stock;
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

function renderRows() {
  const rows = visibleRows();
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
  if (!keep.has(focusedKey)) focusedKey = rows[Math.max(0, Math.min(rows.length - 1, previousIndex))]?.key || null;
  for (const [key, node] of nodes) node.open.tabIndex = key === focusedKey ? 0 : -1;
  if (!root.hidden && previousFocus !== document.body && !previousFocus.isConnected && previousFocus.closest?.('tr[data-key]')) nodes.get(focusedKey)?.open.focus({ preventScroll: true });
  else if (!root.hidden && previousFocus.isConnected && document.activeElement !== previousFocus) previousFocus.focus({ preventScroll: true });
  const initialLoading = state.tab !== 'launches' && !state.data && state.loading && !state.query;
  if (initialLoading) skeleton();
  empty.hidden = !!rows.length || initialLoading;
  text(empty, state.query ? (state.searching ? 'Searching tokens…' : 'No tokens match this search.') : state.error ? 'The token feed could not be loaded. Retry above.' : 'No tokens in this list yet. Try another chain or tab.');
  text(count, initialLoading ? 'Loading tokens…' : `${rows.length} token${rows.length === 1 ? '' : 's'}`);
  panel.setAttribute('aria-busy', String(state.loading || state.searching));
  const error = state.searchError || state.error;
  notice.hidden = !error;
  text(noticeText, error ? `${state.data?.rows?.length ? 'Showing the last loaded feed. ' : ''}${error}` : '');
  text(status, error ? 'Could not refresh' : state.searching ? 'Searching…' : state.loading ? 'Refreshing…' : state.data?.stale && state.tab !== 'launches' ? 'data delayed' : state.tab === 'launches' ? 'QHooks launches' : 'Updates every 30s');
  status.dataset.delayed = String(!!error || !!state.data?.stale);
  text(source, state.tab === 'launches' ? '' : [state.data?.source, state.data?.generatedAt ? 'Updated ' + age(state.data.generatedAt) + ' ago' : null].filter(Boolean).join(' · '));
  scroll.scrollTop = y;
  if (window.scrollY !== pageY) window.scrollTo({ top: pageY, behavior: 'instant' });
}

const loader = createFeedLoader({ fetcher: (...args) => fetch(...args), changed: update => {
  Object.assign(state, update); renderRows();
} });
function refresh() {
  if (document.hidden) return;
  if (state.tab === 'launches') { state.loading = false; state.data = null; state.error = null; renderRows(); }
  else loader.load(state.tab, state.chain);
}
function setTab(tab) {
  if (!availableTabs().some(([id]) => id === tab)) return;
  wantedLaunch = false;
  if (state.tab === tab) return;
  loader.cancel();
  state.tab = tab; state.data = null; state.error = null;
  savePreference(storage, 'tab', tab);
  scroll.scrollTop = 0;
  renderTabs(); refresh();
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
  state.chain = chain; state.data = null; state.error = null;
  savePreference(storage, 'chain', chain);
  for (const b of chainGroup.children) b.setAttribute('aria-pressed', String(b.dataset.chain === chain));
  scroll.scrollTop = 0;
  refresh(); scheduleSearch();
});
retry.addEventListener('click', () => { refresh(); if (state.query.length >= 2) runSearch(); });

// Keep the original search field. Discover owns its input only while visible; the token desk keeps
// its existing search handler. Results use the terminal's existing read-only search endpoint.
function scheduleSearch() {
  clearTimeout(searchTimer); searchController?.abort(); searchGeneration++;
  state.query = search.value.trim(); state.hits = []; state.searchError = null;
  state.searching = state.query.length >= 2;
  renderRows();
  if (state.searching && !document.hidden) searchTimer = setTimeout(runSearch, 350);
}
async function runSearch() {
  if (state.query.length < 2 || document.hidden) return;
  searchController?.abort();
  const controller = new AbortController(), mine = ++searchGeneration;
  searchController = controller;
  state.searching = true; renderRows();
  const ceiling = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('/api/terminal/x/search?' + new URLSearchParams({ q: state.query, ...(state.chain === 'all' ? {} : { chain: state.chain }) }), { cache: 'no-store', signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Token search unavailable');
    if (mine !== searchGeneration) return;
    state.hits = (Array.isArray(body.results) ? body.results : []).filter(hit => typeof hit?.address === 'string' && CHAINS.some(([id]) => id !== 'all' && id === String(hit.chainId)));
    state.searchError = null;
  } catch (error) {
    if (mine !== searchGeneration) return;
    state.searchError = error.name === 'AbortError' ? 'Token search timed out' : error.message;
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

async function openRow(node, buy = false) {
  if (!api || opening) {
    if (!api) { notice.hidden = false; text(noticeText, 'The trading terminal is still loading. Retry in a moment.'); }
    return;
  }
  const vm = node.vm;
  if (buy && vm.quick.stock) return;
  focusedKey = vm.key;
  opening = true; node.buy.disabled = true;
  try {
    if (buy) await api.quickBuyExternal(vm.chainId, vm.address);
    else if (vm.row.launch) await api.select(vm.chainId, vm.row.launch.controller);
    else await api.selectExternal(vm.chainId, vm.address);
  } catch (error) {
    document.getElementById('qxt-sync').textContent = error.message || 'Could not open this token. Try again.';
  } finally { opening = false; node.buy.disabled = false; }
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
connectTerminal(); refresh();
setInterval(() => { if (!document.hidden) { refresh(); if (state.query.length >= 2) runSearch(); } }, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { loader.cancel(); searchController?.abort(); clearTimeout(searchTimer); searchGeneration++; }
  else { refresh(); if (state.query.length >= 2) runSearch(); }
});
