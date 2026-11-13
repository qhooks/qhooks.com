import {profileUrl} from './qx-profile-address.mjs';
import {chainById} from './chains.mjs';
import {outsideCosts} from './qx-wallet-pnl.mjs';

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const short = address => address.slice(0, 6) + '…' + address.slice(-4);
const walletKey = address => EVM.test(address) ? address.toLowerCase() : address;
const TRACKED = 'qhooks:terminal:tracked';

export function classifyQuery(q) {
  const query = String(q ?? '').trim();
  return EVM.test(query) ? 'evm' : SOLANA.test(query) ? 'solana' : 'text';
}

export function buildWalletView(portfolio, activity) {
  const holdings = [], chains = [];
  for (const chain of portfolio?.chains || []) {
    const chainId = String(chain.chainId), name = chain.name || chainById(chainId)?.name || chainId;
    const add = (item, native = false) => {
      if (!item || item.spam === true) return;
      const units = native ? number(item.units) ?? Number(item.balance) / 10 ** (item.decimals ?? (chainId === 'solana' ? 9 : 18)) : number(item.units);
      // When the response has a price but no value, derive it; with no price at all keep a real balance (value —)
      // rather than reporting no holdings, but drop dust below a millionth of a unit.
      const valueUsd = number(item?.valueUsd) ?? (number(item?.priceUsd) !== null && units !== null ? units * item.priceUsd : null);
      if (valueUsd === null ? !(units >= 1e-6) : valueUsd < 0.01) return;
      holdings.push({
        address: native ? null : item.address, symbol: item.symbol || '—', name: item.name || item.symbol || '—',
        chainId, chainName: name, native, units: number(units), valueUsd,
        change24: number(item.change24), pnlUsd: number(item.cost?.pnlUsd), approximate: item.cost?.approximate === true,
        open: item.qhooks?.controller ? {chainId: String(item.qhooks.chainId ?? chainId), controller: item.qhooks.controller} : null,
      });
    };
    add(chain.native, true);
    for (const token of chain.tokens || []) add(token);
    chains.push({chainId, name, valueUsd: holdings.filter(row => row.chainId === chainId).reduce((sum, row) => sum + (row.valueUsd ?? 0), 0)});
  }
  // Priced rows by value; rows waiting on a price after them, QHooks tokens first, tiny native dust last.
  holdings.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || (a.valueUsd === null && b.valueUsd === null ? (!!b.open - !!a.open) || (a.native - b.native) : 0));
  const trades = classifyQuery(portfolio?.address) === 'solana' ? [] : (activity?.trades || []).map(trade => {
    const chainId = String(trade.chainId), explorer = chainById(chainId)?.explorer;
    return {...trade, chainId, side: Number(trade.buy) === 1 ? 'Buy' : 'Sell',
      open: trade.controller ? {chainId, controller: trade.controller} : null,
      txUrl: explorer && /^0x[0-9a-fA-F]{64}$/.test(trade.tx) ? explorer.replace(/\/$/, '') + '/tx/' + trade.tx : null};
  }).sort((a, b) => b.ts - a.ts);
  return {address: portfolio?.address || '', totalUsd: holdings.reduce((sum, row) => sum + (row.valueUsd ?? 0), 0), unpriced: holdings.some(row => row.valueUsd === null), refreshing: portfolio?.chains?.some(chain => chain.error === 'prices_refreshing') === true, chains, holdings, trades};
}

// Completed lookups are reused for a minute; cancellation never stores an incomplete response.
// walletpnl (2026-11-12, Randall: "My balances don't load quickly"): the server answers a wallet from its last reading at
// once and refreshes it in the background ("Refreshing"). When the caller passes onFresh, a Refreshing answer is read again
// once that refresh has had time to land (FOLLOW_MS, at most twice); onFresh and the minute cache get the new view.
// The last view per wallet is kept on this device, so a wallet seen before paints at once (lastWalletView).
const VIEW_KEY = 'qhooks:wallet-view:v1:', VIEW_DAYS = 7, FOLLOW_MS = [3500, 7000];
const defaultStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export function lastWalletView(address, storage = defaultStorage(), now = Date.now()) {
  try {
    const kept = JSON.parse(storage?.getItem(VIEW_KEY + walletKey(String(address).trim())) || 'null');
    return kept?.view && now - kept.at < VIEW_DAYS * 86400000 && Array.isArray(kept.view.holdings) ? kept.view : null;
  } catch { return null; }
}
function keepWalletView(storage, key, view, now) {
  try {
    storage?.setItem(VIEW_KEY + key, JSON.stringify({at: now, view}));
    const list = JSON.parse(storage?.getItem(VIEW_KEY + 'recent') || '[]').filter(k => k !== key);
    list.unshift(key);
    for (const old of list.splice(8)) storage?.removeItem(VIEW_KEY + old); // the 8 most recent wallets only
    storage?.setItem(VIEW_KEY + 'recent', JSON.stringify(list));
  } catch { /* private browsing: no kept view */ }
}
/// A wallet this device already knows (the connected one, a tracked one, or one opened here before): a pasted copy of
/// it opens the wallet view at once, without first asking every chain whether it is a token.
export function knownWallet(address, storage = defaultStorage()) {
  const key = walletKey(String(address ?? '').trim());
  if (!EVM.test(key) && !SOLANA.test(key)) return false;
  try {
    if (JSON.parse(storage?.getItem('qhooks:wallet-connection:v1') || 'null')?.owner === key) return true;
    if (Object.keys(JSON.parse(storage?.getItem(TRACKED) || '{}') || {}).some(value => walletKey(value) === key)) return true;
    return !!storage?.getItem(VIEW_KEY + key);
  } catch { return false; }
}
// The demand cache marks an answer it served from its last reading with this header (and refreshing:true in the body).
const refreshingAnswer = response => response.headers?.get?.('x-qhooks-cache') === 'refreshing';

export function createWalletLookup({fetcher = (...args) => fetch(...args), now = () => Date.now(), storage = defaultStorage(), followMs = FOLLOW_MS, costs = null, wait = (ms, signal) => new Promise(resolve => { const t = setTimeout(resolve, ms); signal?.addEventListener?.('abort', () => { clearTimeout(t); resolve(); }, {once: true}); })} = {}) {
  const cache = new Map();
  return async function lookup(address, {signal, onFresh} = {}) {
    const kind = classifyQuery(address), key = walletKey(address.trim());
    if (kind === 'text') throw new TypeError('A full wallet address is required.');
    signal?.throwIfAborted();
    const cached = cache.get(key);
    if (cached && now() - cached.at < 60000) return cached.view;
    let refreshing = false, last = null;
    const get = async (path, portfolio = false) => {
      const response = await fetcher(path, {signal, cache: 'no-store'});
      if (!response.ok) throw new Error('Could not load this wallet.');
      const body = await response.json();
      if (portfolio && refreshingAnswer(response)) refreshing = true;
      return body;
    };
    const read = async () => {
      refreshing = false;
      const [portfolio, activity] = await Promise.all([
        get('/api/portfolio/' + kind + '/' + encodeURIComponent(key), true),
        kind === 'evm' ? get('/api/terminal/activity?w=' + encodeURIComponent(key)) : null,
      ]);
      signal?.throwIfAborted();
      if (!Array.isArray(portfolio?.chains) || (kind === 'evm' && !Array.isArray(activity?.trades))) throw new Error('Could not load this wallet.');
      // outside-token costs this device already worked out (qx-wallet-pnl.mjs); a pass for the rest runs below
      if (kind === 'evm' && costs) costs.apply({...portfolio, address: key}); // mutates the answer's chains in place
      last = {portfolio, activity};
      const view = buildWalletView({...portfolio, address: key}, activity);
      if (refreshing) view.refreshing = true;
      keepWalletView(storage, key, view, now());
      cache.set(key, {at: now(), view}); // a follow-up read below replaces it with the refreshed view
      if (cache.size > 40) cache.delete(cache.keys().next().value);
      return view;
    };
    const view = await read();
    if (kind === 'evm' && costs && typeof onFresh === 'function') {
      const {portfolio, activity} = last, report = {...portfolio, address: key};
      void costs.refresh(report).then(changed => {
        if (!changed || signal?.aborted) return;
        const next = buildWalletView(report, activity);
        if (view.refreshing) next.refreshing = true;
        keepWalletView(storage, key, next, now()); cache.set(key, {at: now(), view: next}); onFresh(next);
      }, () => {});
    }
    if (refreshing && typeof onFresh === 'function') void (async () => {
      for (const ms of followMs) {
        await wait(ms, signal);
        if (signal?.aborted) return;
        try { const next = await read(); onFresh(next); if (!refreshing) return; } catch { return; }
      }
    })();
    return view;
  };
}

const usd = value => number(value) === null ? '—' : (value < 0 ? '−' : '') + '$' + Math.abs(value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const signedUsd = value => number(value) === null ? '—' : (value > 0 ? '+' : '') + usd(value);
const compact = value => number(value) === null ? '—' : value.toLocaleString('en-US', Math.abs(value) < 1 ? {maximumSignificantDigits: 4} : {notation: 'compact', maximumFractionDigits: 2});
const change = value => number(value) === null ? '—' : (value > 0 ? '+' : '') + (value * 100).toLocaleString('en-US', {maximumFractionDigits: 2}) + '%';
const tone = value => value > 0 ? 'up' : value < 0 ? 'down' : '';
const age = (ts, now) => {
  if (number(ts) === null) return '—';
  const seconds = Math.max(0, Math.floor(now / 1000 - ts));
  return seconds < 60 ? seconds + 's' : seconds < 3600 ? Math.floor(seconds / 60) + 'm' : seconds < 86400 ? Math.floor(seconds / 3600) + 'h' : Math.floor(seconds / 86400) + 'd';
};

export function renderWalletPanel(container, view, handlers = {}) {
  const doc = container.ownerDocument || document;
  const el = (tag, attrs = {}, ...children) => {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    node.append(...children.filter(value => value != null));
    return node;
  };
  const button = (label, attrs = {}) => el('button', {type: 'button', ...attrs}, label);
  const panel = el('section', {class: 'qxfd-wallet', 'aria-label': 'Wallet portfolio'});
  container.replaceChildren(panel);
  if (handlers.loading) {
    panel.setAttribute('aria-busy', 'true');
    panel.append(el('p', {class: 'qxfd-wallet-caption', role: 'status'}, 'Loading wallet…'),
      ...Array.from({length: 6}, () => el('div', {class: 'qxfd-wallet-skeleton', 'aria-hidden': 'true'}, el('span', {class: 'qxfd-placeholder'}), el('span', {class: 'qxfd-placeholder'}))));
    return;
  }
  if (handlers.error) {
    const retry = button('Retry');
    retry.addEventListener('click', () => handlers.onRetry?.());
    panel.append(el('div', {class: 'qxfd-wallet-error', role: 'status'}, el('span', {}, 'Could not load this wallet.'), retry));
    return;
  }
  const address = view.address, key = walletKey(address);
  const addressLabel = el('span', {class: 'qxfd-wallet-address', title: address, tabindex: '0', 'aria-label': address}, short(address));
  const feedback = el('span', {class: 'qxfd-wallet-caption', role: 'status', 'aria-live': 'polite'});
  const copy = button('Copy', {'aria-label': 'Copy wallet address'});
  copy.addEventListener('click', async () => {
    try { await (handlers.clipboard || globalThis.navigator?.clipboard).writeText(address); copy.textContent = 'Copied'; }
    catch { addressLabel.textContent = address; feedback.textContent = 'Could not copy. Select the address to copy it.'; }
  });
  let storage;
  try { storage = handlers.storage ?? globalThis.localStorage; } catch {}
  const readTracked = () => {
    try { const data = JSON.parse(storage?.getItem(TRACKED) || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; }
    catch { return {}; }
  };
  const tracked = readTracked(), isTracked = Object.keys(tracked).some(value => walletKey(value) === key);
  const track = button(isTracked ? 'Tracking' : 'Track', {'aria-pressed': String(isTracked)});
  track.addEventListener('click', () => {
    try {
      if (!storage) throw new Error('Storage unavailable');
      const current = readTracked();
      if (!Object.keys(current).some(value => walletKey(value) === key)) current[key] = ('Wallet ' + (EVM.test(key) ? key.slice(2, 6) : key.slice(0, 4))).slice(0, 24);
      storage.setItem(TRACKED, JSON.stringify(current));
      (handlers.events || globalThis.window)?.dispatchEvent(new CustomEvent('qhooks:tracked-set', {detail: {tracked: current}}));
      track.textContent = 'Tracking'; track.setAttribute('aria-pressed', 'true');
    } catch { feedback.textContent = 'Could not track this wallet on this device. Try again.'; }
  });
  // DOM append() prints null as the text "null" (Randall's "Wallet · $0.00 · null"): only real nodes go in.
  const parts = [el('header', {class: 'qxfd-wallet-header'}, addressLabel,
    el('div', {class: 'qxfd-wallet-actions'}, copy, track, el('a', {href: profileUrl({wallet:EVM.test(address)?address:'solana:'+address,handle:view.handle})}, 'Profile'))),
    el('div', {class: 'qxfd-wallet-total'}, el('span', {class: 'qxfd-wallet-caption'}, 'Portfolio value'), el('strong', {}, view.unpriced && !view.totalUsd ? '—' : usd(view.totalUsd)), view.refreshing || view.unpriced ? el('span', {class: 'qxfd-wallet-caption'}, view.refreshing ? 'Refreshing' : 'Some prices refreshing') : null),
    view.chains.some(chain => chain.valueUsd >= 0.01) ? el('div', {class: 'qxfd-wallet-chips', tabindex: '0', 'aria-label': 'Value by chain'}, ...view.chains.filter(chain => chain.valueUsd >= 0.01).map(chain =>
      el('span', {class: 'qxfd-wallet-chip'}, chain.name + ' ', el('b', {}, usd(chain.valueUsd))))) : null, feedback];
  panel.append(...parts.filter(node => node != null));

  const solana = classifyQuery(address) === 'solana';
  const tabs = el('div', {class: 'qxfd-wallet-tabs', role: 'tablist', 'aria-label': 'Wallet view'});
  const body = el('div', {class: 'qxfd-wallet-body', id: 'qxfd-wallet-content', role: 'tabpanel', tabindex: '0'});
  const caption = el('p', {class: 'qxfd-wallet-caption'}, solana ? 'History covers EVM wallets for now.' : 'Trades on QHooks markets.');
  const now = handlers.now?.() ?? Date.now();
  const metric = (label, value, cls = '') => el('span', {class: 'qxfd-wallet-metric ' + cls}, el('span', {class: 'qxfd-wallet-label'}, label), el('span', {}, value));
  const makeHolding = holding => {
    const row = el(holding.open ? 'button' : 'div', {class: 'qxfd-wallet-holding', ...(holding.open ? {type: 'button', 'aria-label': 'Open ' + holding.symbol + ' on ' + holding.chainName} : {})},
      el('span', {class: 'qxfd-wallet-identity'}, el('b', {}, holding.symbol), el('span', {class: 'qxfd-wallet-chip'}, holding.chainName)),
      metric('Amount', compact(holding.units)), metric('Value', usd(holding.valueUsd)),
      metric('P&L', (holding.approximate && holding.pnlUsd !== null ? '≈ ' : '') + signedUsd(holding.pnlUsd), tone(holding.pnlUsd)),
      metric('24h', change(holding.change24), tone(holding.change24)));
    if (holding.open) row.addEventListener('click', () => handlers.onOpen?.(holding.open));
    return row;
  };
  const makeTrade = trade => {
    const details = el(trade.open ? 'button' : 'div', {class: 'qxfd-wallet-trade-main', ...(trade.open ? {type: 'button', 'aria-label': 'Open ' + trade.symbol} : {})},
      el('span', {class: tone(trade.side === 'Buy' ? 1 : -1)}, trade.side), el('b', {}, trade.symbol || '—'),
      el('span', {}, compact(number(trade.quote)) + ' ' + (trade.quoteSymbol || '—')), el('span', {class: 'qxfd-wallet-caption'}, age(trade.ts, now)));
    if (trade.open) details.addEventListener('click', () => handlers.onOpen?.(trade.open));
    return el('div', {class: 'qxfd-wallet-trade'}, details, trade.txUrl ? el('a', {class: 'qxfd-wallet-tx', href: trade.txUrl, target: '_blank', rel: 'noopener', 'aria-label': 'View transaction on explorer'}, '↗') : null);
  };
  let active = 'holdings';
  const select = name => {
    active = name;
    for (const tab of tabs.children) { const selected = tab.dataset.view === name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
    body.setAttribute('aria-labelledby', 'qxfd-wallet-tab-' + name);
    const rows = name === 'holdings' ? view.holdings.map(makeHolding) : view.trades.map(makeTrade);
    body.replaceChildren(...(rows.length ? rows : [el('p', {class: 'qxfd-wallet-empty'}, name === 'holdings' ? 'No holdings found on supported chains.' : 'No trades on QHooks markets yet.')]));
    caption.hidden = !solana && name !== 'history';
  };
  for (const [name, label] of solana ? [['holdings', 'Holdings']] : [['holdings', 'Holdings'], ['history', 'History']]) {
    const tab = button(label, {role: 'tab', id: 'qxfd-wallet-tab-' + name, 'data-view': name, 'aria-controls': 'qxfd-wallet-content'});
    tab.addEventListener('click', () => select(name));
    tabs.append(tab);
  }
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const name = solana || event.key === 'Home' ? 'holdings' : event.key === 'End' ? 'history' : active === 'holdings' ? 'history' : 'holdings';
    select(name); tabs.querySelector('[aria-selected="true"]')?.focus();
  });
  panel.append(tabs, body, caption);
  select('holdings');
}
