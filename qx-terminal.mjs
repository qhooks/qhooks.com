// Trading terminal: every listed QHooks launch across six chains in one feed, a live chart, tape,
// holders and positions from the worker's index (/api/terminal), and a trade ticket that quotes through
// each pool and its blocks. The launch tools (rules, auction, limit orders, second pool, team locks) are
// the Trade page's own panels, mounted here unchanged and fed the same pool event.
import { CHAIN_NAME, h, connectedAddress } from '/qx-chain.mjs';
import { createChart, CrosshairMode } from '/vendor/lightweight-charts/lightweight-charts.standalone.production.mjs';
import { mountTicket } from '/qx-terminal-trade.mjs';
import { afterBuy, onReached } from '/qx-terminal-tpsl.mjs';
import { getWalletHub } from '/wallet-hub.mjs';
import { trustList, trustOf, badge, copyLabel } from '/qx-trust.mjs';

const CHAINS = [['all', 'All'], ['8453', 'Base'], ['1', 'Ethereum'], ['42161', 'Arbitrum'], ['56', 'BNB'], ['4663', 'Robinhood']];
const ICON = { '8453': 'base', '1': 'ethereum', '42161': 'arbitrum', '56': 'bnb', '4663': 'robinhood', '5042': 'arc', solana: 'solana' };
const EXPLORER = { '8453': 'https://basescan.org', '1': 'https://etherscan.io', '42161': 'https://arbiscan.io', '56': 'https://bscscan.com', '4663': 'https://robinhoodchain.blockscout.com', '5042': 'https://explorer.arc.io', solana: 'https://solscan.io' };
const TFS = [[1, '1s'], [60, '1m'], [300, '5m'], [900, '15m'], [3600, '1h'], [14400, '4h'], [86400, '1D']];
const BITS = ['Opening bell', 'Anti-snipe', 'Wallet cap', 'Max trade', 'Cooldown', 'Holder gate', 'Exit clock', 'Sandwich guard', 'Impact fee', 'Storm fee', 'Session fee', 'Tax', 'Whale tiers', 'Auto burn', 'King', 'Last buyer wins', 'Buyback', 'Referrals', 'Points'];
const QUICK = { usd: '10', eth: '0.01', bnb: '0.05' };
const DEAD = '0x000000000000000000000000000000000000dead', ZERO = '0x0000000000000000000000000000000000000000';
const $ = id => document.getElementById(id);
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem('qhooks:terminal:' + k); localStorage.setItem('qhooks:terminal:' + k, v); } catch {} return null; };
const now = () => Math.floor(Date.now() / 1000);

const state = { chain: store('chain') || 'all', feed: store('feed') || 'new', tf: Number(store('tf')) || 60, unit: 'price', filter: 'all', pane: 'trades',
  markets: [], sel: null, pool: null, data: null, cursor: -1, watch: new Set(JSON.parse(store('watch') || '[]')), quick: { ...QUICK, ...JSON.parse(store('quick') || '{}') }, me: null,
  tracked: JSON.parse(store('tracked') || '{}'), activity: [], alerts: store('alerts') === '1', xhits: [], xq: '', trust: {} };
if (!TFS.some(([t]) => t === state.tf)) state.tf = 60;

// ---- Formatting ----
const SUB = '₀₁₂₃₄₅₆₇₈₉';
function price(p) {
  if (!p) return '—';
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: p >= 1000 ? 2 : 4 });
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  // Leading zeros after the point are written as a subscript count: 0.0₅1234 = 0.000001234.
  const e = Math.floor(Math.log10(p)), z = -e - 1, digits = String(Math.round(p / 10 ** (e - 3))).slice(0, 4).replace(/0+$/, '') || '0';
  return z >= 4 ? '0.0' + String(z).split('').map(d => SUB[d]).join('') + digits : '0.' + '0'.repeat(z) + digits;
}
function compact(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  return a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : a >= 1 ? n.toFixed(2) : a ? price(n) : '0';
}
const stable = sym => /^(USDC|USDT|DAI|USD)/.test(sym || '');
// No number yet: a bare dash, not "— WETH".
const money = (n, sym) => n == null || Number.isNaN(n) ? '—' : stable(sym) ? '$' + compact(n) : compact(n) + ' ' + (sym || '');
const pct = (n, sign = true) => n == null ? '—' : (sign && n > 0 ? '+' : '') + (n * 100).toFixed(Math.abs(n) < 0.1 ? 2 : 1) + '%';
const age = ts => { const d = Math.max(0, now() - ts); return d < 60 ? d + 's' : d < 3600 ? Math.floor(d / 60) + 'm' : d < 86400 ? Math.floor(d / 3600) + 'h' : Math.floor(d / 86400) + 'd'; };
const clock = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ':' + String(s % 60).padStart(2, '0'); };
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';
// A token's avatar: its ticker's first letter on a colour drawn from its address, with the chain as a small badge.
const hue = a => { let x = 0; for (const c of String(a || '').slice(2, 14)) x = (x * 31 + parseInt(c, 16)) % 360; return x; };
const avatar = (m, size = '') => h('span', { class: 'qxt-av ' + size, style: '--h:' + hue(m.token || m.controller), 'aria-hidden': 'true' }, h('span', {}, (m.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase()), icon(m.chainId));
const icon = id => h('img', { src: '/chain-symbol-icons/' + ICON[id] + '.svg', alt: CHAIN_NAME[id] || '', width: 14, height: 14, class: 'qxt-ci' });
const keyOf = m => m.chainId + ':' + m.controller;
const unitOf = m => /^W?ETH$/.test(m.quoteSymbol || '') ? 'eth' : /^W?BNB$/.test(m.quoteSymbol || '') ? 'bnb' : 'usd';
const QUNIT = { usd: 'USDC', eth: 'ETH', bnb: 'BNB' };

// ---- Wallet: the site's shared wallet dialog (email or Google, MetaMask Mobile, browser wallets), the same one
// Trade and Launch use. The address goes into #qt-connection, which the shared panels read. ----
const hub = getWalletHub(window);
function setConnection(address, chainId) {
  state.me = address ? address.toLowerCase() : null;
  $('qt-connection').textContent = state.me ? (CHAIN_NAME[chainId] || 'EVM') + ' · ' + state.me : '';
  $('qxt-connect').textContent = state.me ? short(state.me) : 'Connect wallet';
  $('qxt-connect').classList.toggle('on', !!state.me);
  renderPane(); loadPositions(); if (state.data) renderChart();
}
// Trading a launch on another chain switches the wallet's network, which the hub treats as a new connection.
// When the terminal asked for that switch, rejoin the same wallet instead of showing it disconnected.
let walletKey = '', walletUuid = null, rejoinUntil = 0, rejoining = false, rejoinTimer = null, rejoinTries = 0;
window.addEventListener('qhooks:chain-switch', () => { rejoinUntil = Date.now() + 20000; rejoinTries = 0; });
// Outside the hub's own notification (connecting notifies again), one attempt at a time, a few tries at most.
function rejoin() {
  if (rejoinTimer || rejoining) return;
  rejoinTimer = setTimeout(async () => {
    rejoinTimer = null;
    const s = hub.snapshot();
    if (s.current || !walletUuid || Date.now() > rejoinUntil || rejoinTries >= 5) { if (!s.current) showWallet(null); return; }
    if (s.busy) { rejoin(); return; }
    rejoining = true; rejoinTries++;
    try { await hub.connect(walletUuid); } catch {} finally { rejoining = false; }
    if (!hub.snapshot().current) rejoin();
  }, 400);
}
function showWallet(c) { const key = c ? c.owner.toLowerCase() + '@' + c.chainId : ''; if (key !== walletKey) { walletKey = key; setConnection(c?.owner, c?.chainId); } }
hub.subscribe(s => {
  const c = s.current;
  if (c) { walletUuid = c.entry.uuid; showWallet(c); return; }
  if (rejoining) return;
  if (walletUuid && Date.now() < rejoinUntil && rejoinTries < 5) { rejoin(); return; }
  showWallet(null);
});
$('qxt-connect').addEventListener('click', () => {
  const menu = $('qxt-wallets');
  if (!menu.hidden) { menu.hidden = true; return; }
  if (!state.me) { hub.open(); return; }
  menu.replaceChildren(h('button', { type: 'button', onclick: () => { menu.hidden = true; hub.open(); } }, 'Wallet details'),
    h('button', { type: 'button', onclick: () => { menu.hidden = true; hub.disconnect(); } }, 'Disconnect'));
  menu.hidden = false;
});
window.__qxtReady = true; // wallet-early.js stops handling Connect taps from here

// ---- Feed ----
function feedRows() {
  const q = $('qxt-search').value.trim().toLowerCase(), t = now();
  let rows = state.markets.filter(m => m.live && (!q || [m.name, m.symbol, m.token, m.controller].some(v => (v || '').toLowerCase().includes(q))));
  if (state.feed === 'opening') rows = rows.filter(m => (m.auctionEndsAt || 0) > t || (m.opensAt || 0) > t || t - m.launchedAt < 3600).sort((a, b) => (a.auctionEndsAt || a.opensAt || a.launchedAt) - (b.auctionEndsAt || b.opensAt || b.launchedAt));
  else if (state.feed === 'trending') rows = rows.filter(m => m.summary?.trades24).sort((a, b) => b.summary.volume24 - a.summary.volume24);
  else if (state.feed === 'watch') rows = rows.filter(m => state.watch.has(keyOf(m))).sort((a, b) => b.launchedAt - a.launchedAt);
  else rows.sort((a, b) => b.launchedAt - a.launchedAt);
  // Launches that copy an earlier verified launch's ticker or name stay listed, labelled, below the rest.
  if (state.feed !== 'watch') rows = [...rows.filter(m => !state.trust[keyOf(m)]?.copyOf), ...rows.filter(m => state.trust[keyOf(m)]?.copyOf)];
  return rows;
}
function badges(m) {
  const t = now(), out = [], tr = state.trust[keyOf(m)];
  if (tr?.copyOf) out.push(copyLabel(tr.copyOf, { compact: true }));
  else if (tr?.verified) out.push(badge(tr.verified, { compact: true }));
  if ((m.auctionEndsAt || 0) > t) out.push(h('span', { class: 'qxt-badge warm' }, 'Auction ' + clock(m.auctionEndsAt - t)));
  else if ((m.opensAt || 0) > t) out.push(h('span', { class: 'qxt-badge warm' }, 'Opens ' + clock(m.opensAt - t)));
  const bits = BITS.filter((_, i) => (m.mask >> i) & 1 && i !== 0 && i !== 5);
  if (bits.length) out.push(h('span', { class: 'qxt-badge', title: bits.join(', ') }, bits.length <= 2 ? bits.join(' · ') : bits.slice(0, 2).join(' · ') + ' +' + (bits.length - 2)));
  if (m.pools.includes('eth')) out.push(h('span', { class: 'qxt-badge' }, 'ETH pool'));
  return out;
}
function xRows() {
  const q = $('qxt-search').value.trim();
  if (q.length < 2 || state.xq !== q) return [];
  const mine = new Set(state.markets.map(m => m.chainId + ':' + (m.token || '').toLowerCase()));
  return state.xhits.filter(x => !mine.has(x.chainId + ':' + x.address.toLowerCase()));
}
function xItem(x) {
  const sel = state.sel?.ext && state.sel.chainId === x.chainId && state.sel.ext === x.address;
  const row = h('button', { type: 'button', class: 'qxt-row', onclick: () => selectExternal(x.chainId, x.address) },
    avatar({ token: x.address, symbol: x.symbol, chainId: x.chainId }),
    h('span', { class: 'qxt-r1' }, h('b', {}, x.symbol || '?'), h('span', { class: 'qxt-muted qxt-trunc' }, x.name || '')),
    h('span', { class: 'qxt-r2' }, h('span', {}, h('i', {}, 'Liq '), x.liquidityUsd != null ? '$' + compact(x.liquidityUsd) : '—'), h('span', {}, h('i', {}, 'V '), x.volume24Usd != null ? '$' + compact(x.volume24Usd) : '—'),
      h('span', { class: x.change24 > 0 ? 'up' : x.change24 < 0 ? 'down' : '' }, x.change24 != null ? pct(x.change24) : '')));
  return h('li', { class: 'qxt-x' + (sel ? ' sel' : '') }, row);
}
function renderFeed() {
  if (state.feed === 'wallets') return renderWallets();
  const rows = feedRows(), list = $('qxt-list'), xs = xRows();
  const xPart = xs.length ? [h('li', { class: 'qxt-sect' }, 'All tokens'), ...xs.map(xItem)] : $('qxt-search').value.trim().length >= 2 && state.xq !== $('qxt-search').value.trim() ? [h('li', { class: 'qxt-sect' }, 'Searching all tokens…')] : [];
  if (!rows.length && xPart.length) { list.replaceChildren(h('li', { class: 'qxt-sect' }, 'QHooks launches'), h('li', { class: 'qxt-empty' }, 'No launch matches.'), ...xPart); return; }
  if (!rows.length) {
    list.replaceChildren(h('li', { class: 'qxt-empty' }, state.markets.length ? (state.feed === 'watch' ? 'Star a launch to keep it here.' : 'Nothing here right now.') : 'No launches are listed yet. Launches appear here once they are listed on Markets.'));
    return;
  }
  list.replaceChildren(...rows.map((m, i) => {
    const s = m.summary, u = unitOf(m), sel = state.sel && keyOf(state.sel) === keyOf(m);
    const row = h('button', { type: 'button', class: 'qxt-row', onclick: () => select(m.chainId, m.controller) },
      avatar(m),
      h('span', { class: 'qxt-r1' }, h('b', {}, m.symbol), h('span', { class: 'qxt-muted qxt-trunc' }, m.name), h('span', { class: 'qxt-age' }, age(m.launchedAt))),
      s ? h('span', { class: 'qxt-r2' }, h('span', {}, h('i', {}, 'MC '), money(s.mcap, m.quoteSymbol)), h('span', {}, h('i', {}, 'V '), money(s.volume24, m.quoteSymbol)),
        h('span', {}, h('i', {}, 'H '), String(s.holders ?? '—')), h('span', { class: s.change24 > 0 ? 'up' : s.change24 < 0 ? 'down' : '' }, pct(s.change24)))
        : h('span', { class: 'qxt-r2 qxt-quiet' }, 'No stats yet'),
      h('span', { class: 'qxt-r3' }, ...badges(m)));
    const qb = h('button', { type: 'button', class: 'qxt-qb', title: 'Buy ' + state.quick[u] + ' ' + QUNIT[u] + ' now (your wallet confirms)', onclick: () => quickBuy(m) }, '⚡ ' + state.quick[u]);
    return h('li', { class: (sel ? 'sel ' : '') + (i === state.cursor ? 'cur' : ''), 'data-key': keyOf(m) }, row, qb);
  }), ...xPart);
}
async function loadFeed() {
  try {
    const r = await fetch('/api/terminal/feed?chain=' + state.chain, { cache: 'no-store' });
    const [j, trust] = await Promise.all([r.ok ? r.json() : null, trustList()]);
    state.trust = trust;
    if (j) { state.markets = j.markets || []; renderFeed(); }
  } catch {}
}

// ---- Chart ----
let chart, candles, volume;
function css(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }
function ensureChart() {
  if (chart) return;
  const el = $('qxt-chart'), line = css('--qxt-grid'), up = css('--qxt-up'), down = css('--qxt-down');
  chart = createChart(el, { autoSize: true, layout: { background: { color: 'transparent' }, textColor: css('--qx-muted'), fontFamily: css('--qx-sans'), fontSize: 11 },
    grid: { vertLines: { color: line }, horzLines: { color: line } }, rightPriceScale: { borderColor: line, scaleMargins: { top: 0.12, bottom: 0.24 } },
    timeScale: { borderColor: line, timeVisible: true, secondsVisible: false, rightOffset: 6 }, crosshair: { mode: CrosshairMode.Normal } });
  candles = chart.addCandlestickSeries({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceFormat: { type: 'custom', formatter: price, minMove: 1e-12 } });
  volume = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
}
let lastChartKey = '';
function renderChart() {
  const d = state.data; if (!d) return;
  ensureChart();
  const k = state.unit === 'mcap' ? d.summary?.supply || 1 : 1, up = css('--qxt-up-a'), down = css('--qxt-down-a');
  $('qxt-chart-empty').hidden = d.candles.length > 0;
  $('qxt-chart-empty').textContent = d.synced.behind > 0 && !d.candles.length ? 'Reading this launch’s history from the chain…' : 'No trades in this window yet.';
  candles.setData(d.candles.map(c => ({ time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })));
  volume.setData(d.candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? up : down })));
  // Your trades, the creator's and tracked wallets', marked on their bars.
  const tag = t => t.trader === state.me ? '' : t.trader === d.meta.owner ? 'Dev ' : state.tracked[t.trader] + ' ';
  const marks = d.trades.filter(t => t.pool < 2 && (t.trader === state.me || t.trader === d.meta.owner || state.tracked[t.trader])).map(t => ({ time: t.ts - t.ts % d.tf, position: t.buy ? 'belowBar' : 'aboveBar',
    color: t.trader === state.me ? css('--qx-brass') : t.trader === d.meta.owner ? css('--qx-ink') : css('--qx-sage'), shape: t.buy ? 'arrowUp' : 'arrowDown', size: 0.6, text: tag(t).trim() }))
    .filter(m => d.candles.some(c => c.time === m.time))
    // One marker per bar, side and wallet kind: a burst of trades in one bar reads as one arrow, not a stack.
    .filter((m, i, all) => all.findIndex(o => o.time === m.time && o.position === m.position && o.color === m.color) === i).sort((a, b) => a.time - b.time);
  candles.setMarkers(marks);
  chart.applyOptions({ timeScale: { secondsVisible: d.tf < 60 } });
  const key = keyOf(state.sel) + d.tf + state.unit;
  // A new market or timeframe opens on the latest ~90 bars, so a young launch sits at the right edge.
  // Show the last 90 bars; a young launch with few bars gets a 60-bar window from its first bar instead of a sliver at the right edge.
  if (key !== lastChartKey) { lastChartKey = key; const n = d.candles.length, from = n > 90 ? n - 90 : -Math.max(3, Math.round((60 - n) / 3)); chart.timeScale().setVisibleLogicalRange({ from, to: Math.max(n + 4, from + 60) }); }
}

// ---- Header ----
/// Verified creator or copy warning next to the launch's name (qx-trust.mjs).
function headTrust() {
  let el = $('qxt-trust');
  if (!el) { el = h('span', { id: 'qxt-trust', class: 'qxt-trust' }); $('qxt-name').after(el); }
  const sel = state.sel; if (!sel || sel.ext) { el.replaceChildren(); return; }
  const k = keyOf(sel); el.dataset.key = k;
  trustOf(sel.chainId, sel.controller).then(t => { if (el.dataset.key === k) el.replaceChildren(...[t?.copyOf ? copyLabel(t.copyOf) : null, t?.verified ? badge(t.verified) : null].filter(Boolean)); });
}
function renderHead() {
  const d = state.data, m = d.meta, s = d.summary || {};
  $('qxt-symbol').textContent = m.symbol; $('qxt-name').textContent = m.name;
  document.title = m.symbol + ' ' + price(s.price) + ' | QHooks Terminal';
  const ci = $('qxt-chain-icon'); ci.src = '/chain-symbol-icons/' + ICON[m.chainId] + '.svg'; ci.alt = CHAIN_NAME[m.chainId]; ci.hidden = false;
  const av = $('qxt-av'); if (av) { av.hidden = false; av.style.setProperty('--h', hue(m.token || state.sel?.controller)); av.firstChild.textContent = (m.symbol || '?').replace(/^\$/, '').slice(0, 1).toUpperCase(); }
  const copy = $('qxt-copy'); copy.hidden = false; copy.textContent = short(m.token); copy.title = 'Copy ' + m.token;
  $('qxt-share').hidden = false; $('qxt-share').textContent = 'Share';
  const star = $('qxt-star'); star.hidden = false; const on = state.watch.has(keyOf(state.sel)); star.textContent = on ? '★' : '☆'; star.setAttribute('aria-pressed', String(on));
  const q = m.quoteSymbol, cell = (k, v, cls) => [h('div', {}, h('dt', {}, k), h('dd', { class: cls || '' }, v))];
  if (d.ext) {
    star.hidden = true; headTrust();
    const v = d.safety?.verdict, verdict = { ok: ['No known risks', 'up'], caution: ['Caution', 'warn'], danger: ['High risk', 'down'], unknown: ['Not scanned', ''] }[v] || ['Checking…', ''];
    $('qxt-stats').replaceChildren(
      ...cell('Price', s.price ? '$' + price(s.price) : '—'), ...cell('24h', pct(s.change24), s.change24 > 0 ? 'up' : s.change24 < 0 ? 'down' : ''),
      ...cell('MCap', money(s.mcap, 'USD')), ...cell('Liquidity', money(s.liquidity, 'USD')), ...cell('Vol 24h', money(s.volume24, 'USD')),
      ...cell('Trades 24h', s.trades24 != null ? s.buys24 + ' / ' + s.sells24 : '—'), ...cell('Safety', verdict[0], verdict[1]));
    $('qxt-sync').textContent = 'Outside token · routed by 0x';
    return;
  }
  headTrust();
  $('qxt-stats').replaceChildren(
    ...cell('Price', s.price ? price(s.price) + ' ' + q : '—'), ...cell('24h', pct(s.change24), s.change24 > 0 ? 'up' : s.change24 < 0 ? 'down' : ''),
    ...cell('MCap', money(s.mcap, q)), ...cell('Vol 24h', money(s.volume24, q)), ...cell('Trades 24h', s.trades24 != null ? s.buys24 + ' / ' + s.sells24 : '—'),
    ...cell('Holders', s.holders ?? '—'), ...cell('Top 10', pct(s.top10, false)), ...cell('Burned', s.supply ? pct(s.burned / (s.supply + s.burned), false) : '—'),
    ...cell('Team locked', s.supply ? pct(s.locked / (s.supply + s.burned), false) : '—'));
  const sync = d.synced;
  $('qxt-sync').textContent = sync.behind > 50 ? 'Reading history… ' + sync.behind.toLocaleString() + ' blocks to go' : sync.at ? 'Live · block ' + sync.block.toLocaleString() : '';
}

// ---- Bottom panes ----
function labelFor(addr) {
  const d = state.data; if (!d) return null; const m = d.meta;
  if (addr === state.me) return 'You';
  if (state.tracked[addr]) return state.tracked[addr];
  if (addr === m.owner) return 'Creator';
  if (addr === m.manager) return 'Uniswap pool';
  if (addr === DEAD || addr === ZERO) return 'Burned';
  if (addr === m.controller) return 'Launch contract';
  if (addr === m.engine) return 'Blocks engine';
  if (addr === m.locks) return 'Team locks';
  if (addr === m.auction) return 'Opening auction';
  if (m.pools.some(p => p.label === 'eth' && p.key.hooks === addr)) return 'ETH pool';
  return null;
}
const link = (chainId, path, text) => h('a', { href: EXPLORER[chainId] + (chainId === 'solana' ? path.replace(/^\/address\//, '/account/') : path), target: '_blank', rel: 'noopener' }, text);
// ---- Tracked wallets ----
function saveTracked() { store('tracked', JSON.stringify(state.tracked)); loadActivity(true); renderPane(); if (state.feed === 'wallets') renderFeed(); if (state.data) renderChart(); }
function track(addr, label) { state.tracked[addr] = (label || '').trim().slice(0, 24) || 'Wallet ' + addr.slice(2, 6); saveTracked(); toast('Tracking ' + state.tracked[addr] + '.'); }
function untrack(addr) { delete state.tracked[addr]; saveTracked(); }
/// An address cell: explorer link, its label, and a one-click Track for addresses nobody named yet.
function who(chainId, addr, extra = null) {
  if (!addr) return h('td', {}, '—');
  const label = labelFor(addr), tracked = !!state.tracked[addr], person = !label || tracked;
  return h('td', {}, link(chainId, '/address/' + addr, short(addr)), label ? h('span', { class: 'qxt-tag' + (tracked ? ' tracked' : '') }, label) : null, extra,
    person && !tracked && addr !== state.me ? h('button', { type: 'button', class: 'qxt-track', title: 'Track this wallet', onclick: () => track(addr) }, '+ Track') : null);
}
function renderPane() {
  const pane = $('qxt-pane'), d = state.data;
  $('qxt-trade-filters').hidden = state.pane !== 'trades';
  if (state.pane === 'positions') return renderPositions();
  if (!d) { pane.replaceChildren(h('p', { class: 'qxt-empty' }, 'Pick a launch to see its trades and holders.')); return; }
  const m = d.meta, q = m.quoteSymbol;
  if (d.ext && (state.pane === 'holders' || state.pane === 'traders')) { pane.replaceChildren(h('p', { class: 'qxt-empty' }, 'Holders and top traders are shown for QHooks launches. For outside tokens, see the explorer.')); return; }
  if (state.pane === 'holders') {
    const total = (d.summary?.supply || 0) + (d.summary?.burned || 0);
    pane.replaceChildren(h('table', { class: 'qxt-table' }, h('thead', {}, h('tr', {}, ...['#', 'Holder', 'Share', 'Amount'].map(t => h('th', {}, t)))),
      h('tbody', {}, ...d.holders.map((r, i) => { const share = total ? r.units / total : 0;
        return h('tr', {}, h('td', {}, String(i + 1)), who(m.chainId, r.holder),
          h('td', {}, h('span', { class: 'qxt-bar', style: '--w:' + Math.min(100, share * 100).toFixed(1) + '%' }, pct(share, false))), h('td', {}, compact(r.units))); }))));
    return;
  }
  if (state.pane === 'traders') {
    const rows = (d.traders || []).map(r => { const avg = r.bought ? r.spent / r.bought : 0, costed = Math.max(0, Math.min(r.balance, r.bought - r.sold));
      return { ...r, pnl: r.received - r.sold * avg + costed * ((d.summary?.price || 0) - avg) }; });
    if (!rows.length) { pane.replaceChildren(h('p', { class: 'qxt-empty' }, 'No trades yet.')); return; }
    pane.replaceChildren(h('table', { class: 'qxt-table' }, h('thead', {}, h('tr', {}, ...['Trader', 'Bought', 'Sold', 'Holds', 'PnL', 'Trades', 'Last'].map(t => h('th', {}, t)))),
      h('tbody', {}, ...rows.map(r => h('tr', {}, who(m.chainId, r.trader), h('td', {}, money(r.spent, q)), h('td', {}, money(r.received, q)), h('td', {}, compact(r.balance)),
        h('td', { class: r.pnl > 0 ? 'up' : r.pnl < 0 ? 'down' : '' }, (r.pnl > 0 ? '+' : '') + money(r.pnl, q)), h('td', {}, String(r.n)), h('td', {}, age(r.last)))))));
    return;
  }
  const rows = d.trades.filter(t => state.filter === 'all' || (state.filter === 'buy' ? t.buy : state.filter === 'sell' ? !t.buy : state.filter === 'me' ? t.trader === state.me : t.trader === m.owner));
  if (!rows.length) { pane.replaceChildren(h('p', { class: 'qxt-empty' }, d.trades.length ? 'No trades match this filter.' : 'No trades yet.')); return; }
  pane.replaceChildren(h('table', { class: 'qxt-table' }, h('thead', {}, h('tr', {}, ...['Age', 'Side', 'Price', 'Amount', 'Value', 'Trader', ''].map(t => h('th', {}, t)))),
    h('tbody', {}, ...rows.map(t => { const eth = t.pool === 2;
      return h('tr', { class: t.buy ? 'b' : 's' }, h('td', { title: new Date(t.ts * 1000).toLocaleString() }, age(t.ts)), h('td', { class: t.buy ? 'up' : 'down' }, t.buy ? 'Buy' : 'Sell'),
        h('td', {}, price(t.price)), h('td', {}, compact(t.token)), h('td', {}, eth ? compact(t.quote) + ' ETH' : money(t.quote, q)),
        t.via === 'auction' ? h('td', {}, link(m.chainId, '/address/' + t.trader, short(t.trader)), h('span', { class: 'qxt-tag' }, 'Auction batch')) : who(m.chainId, t.trader, eth ? h('span', { class: 'qxt-tag' }, 'ETH pool') : null),
        h('td', {}, link(m.chainId, '/tx/' + t.tx, '↗'))); }))));
}
// ---- Toasts and alerts ----
function toast(text, ...actions) {
  const el = h('div', { class: 'qxt-toast' }, h('span', {}, text), ...actions.map(([label, fn]) => h('button', { type: 'button', onclick: () => { el.remove(); fn(); } }, label)),
    h('button', { type: 'button', class: 'qxt-x', ariaLabel: 'Dismiss', onclick: () => el.remove() }, '×'));
  $('qxt-toasts').append(el);
  setTimeout(() => el.remove(), actions.length ? 15000 : 6000);
  if (state.alerts && document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('QHooks', { body: text, icon: '/qhooks-logo.jpg' }); } catch {} }
}

// ---- Tracked wallets: activity across every listed launch ----
const seen = new Set();
let activityTimer = null, primed = false; // primed: the first load only records what is already there
async function loadActivity(quiet = false) {
  const list = Object.keys(state.tracked);
  clearTimeout(activityTimer);
  if (!list.length) { state.activity = []; if (state.feed === 'wallets') renderWallets(); return; }
  try {
    const r = await fetch('/api/terminal/activity?w=' + list.slice(0, 50).join(','), { cache: 'no-store' });
    if (r.ok) {
      const trades = (await r.json()).trades || [], first = !primed;
      for (const t of trades.slice().reverse()) {
        const id = t.tx + t.trader + t.token;
        if (seen.has(id)) continue;
        seen.add(id);
        // New trades by tracked wallets: a toast with Open and, for buys, Copy.
        if (!first && !quiet && t.ts > now() - 600) toast((state.tracked[t.trader] || short(t.trader)) + (t.buy ? ' bought ' : ' sold ') + compact(t.token) + ' ' + t.symbol + ' for ' + money(t.quote, t.quoteSymbol),
          ['Open', () => select(t.chainId, t.controller)], ...(t.buy ? [['Copy', () => copyTrade(t)]] : []));
      }
      state.activity = trades; primed = true;
      if (state.feed === 'wallets') renderWallets();
    }
  } catch {}
  activityTimer = setTimeout(() => { if (!document.hidden) loadActivity(); else activityTimer = setTimeout(loadActivity, 10000); }, 10000);
}
/// Copy a tracked wallet's buy: open that launch and buy your own quick-buy amount (your wallet confirms).
async function copyTrade(t) {
  const m = state.markets.find(x => x.chainId === t.chainId && x.controller === t.controller) || { chainId: t.chainId, controller: t.controller, quoteSymbol: t.quoteSymbol };
  return quickBuy(m);
}
const walletStats = new Map();
async function loadWalletStats(addr) {
  const hit = walletStats.get(addr);
  if (hit && Date.now() - hit.at < 60000) return hit;
  try {
    const r = await fetch('/api/terminal/wallet/' + addr, { cache: 'no-store' }); if (!r.ok) return null;
    const ps = (await r.json()).positions || [];
    let pnl = 0, spent = 0, sym = null;
    for (const p of ps) { const avg = p.bought ? p.spent / p.bought : 0, costed = Math.max(0, Math.min(p.balance, p.bought - p.sold)); pnl += p.received - p.sold * avg + costed * (p.price - avg); spent += p.spent; sym ??= p.quoteSymbol; }
    const v = { at: Date.now(), pnl, spent, open: ps.filter(p => p.balance > 0).length, sym };
    walletStats.set(addr, v); return v;
  } catch { return null; }
}
function renderWallets() {
  const list = $('qxt-list'), addrs = Object.keys(state.tracked);
  const addr = h('input', { type: 'text', placeholder: '0x… wallet to track', autocomplete: 'off', spellcheck: false, ariaLabel: 'Wallet address' });
  const name = h('input', { type: 'text', placeholder: 'Name', maxLength: 24, ariaLabel: 'Wallet name' });
  const add = h('button', { type: 'button', class: 'qxt-mini' }, 'Track');
  add.addEventListener('click', () => { const a = addr.value.trim().toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(a)) { addr.focus(); return; } track(a, name.value); });
  const alerts = h('label', { class: 'qxt-alerts' }, h('input', { type: 'checkbox', checked: state.alerts, onchange: async e => {
    state.alerts = e.target.checked; store('alerts', state.alerts ? '1' : '0');
    if (state.alerts && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  } }), h('span', {}, 'Desktop alerts while this tab is in the background'));
  const items = [h('li', { class: 'qxt-addw' }, h('div', { class: 'qxt-addrow' }, addr, name, add), alerts)];
  for (const a of addrs) {
    const stats = h('span', { class: 'qxt-r2' }, 'Loading…');
    loadWalletStats(a).then(v => { stats.replaceChildren(...(v ? [h('span', { class: v.pnl > 0 ? 'up' : v.pnl < 0 ? 'down' : '' }, h('i', {}, 'PnL '), (v.pnl > 0 ? '+' : '') + money(v.pnl, v.sym || 'USDC')), h('span', {}, h('i', {}, 'Spent '), money(v.spent, v.sym || 'USDC')), h('span', {}, h('i', {}, 'Open '), String(v.open))] : ['—'])); });
    items.push(h('li', { class: 'qxt-wallet-row' }, h('div', { class: 'qxt-row' }, h('span', { class: 'qxt-r1' }, h('b', {}, state.tracked[a]), h('span', { class: 'qxt-muted qxt-trunc' }, short(a))), stats),
      h('button', { type: 'button', class: 'qxt-x', title: 'Stop tracking', ariaLabel: 'Stop tracking ' + state.tracked[a], onclick: () => untrack(a) }, '×')));
  }
  if (!addrs.length) items.push(h('li', { class: 'qxt-empty' }, 'Track wallets from any trades, holders or top-traders list (+ Track), or paste an address above. Their trades across every chain show here, with alerts.'));
  else if (!state.activity.length) items.push(h('li', { class: 'qxt-empty' }, 'No trades by tracked wallets in listed launches yet.'));
  for (const t of state.activity.slice(0, 40)) items.push(h('li', { class: 'qxt-act' }, h('button', { type: 'button', class: 'qxt-row', onclick: () => select(t.chainId, t.controller) },
    h('span', { class: 'qxt-r1' }, icon(t.chainId), h('b', {}, state.tracked[t.trader] || short(t.trader)), h('span', { class: t.buy ? 'up' : 'down' }, t.buy ? 'bought' : 'sold'), h('b', {}, t.symbol), h('span', { class: 'qxt-age' }, age(t.ts))),
    h('span', { class: 'qxt-r2' }, h('span', {}, compact(t.token) + ' ' + t.symbol), h('span', {}, money(t.quote, t.quoteSymbol)), h('span', {}, h('i', {}, '@ '), price(t.price)))),
    t.buy ? h('button', { type: 'button', class: 'qxt-qb', title: 'Buy your quick-buy amount of ' + t.symbol + ' (your wallet confirms)', onclick: () => copyTrade(t) }, 'Copy') : null));
  list.replaceChildren(...items);
}

let positions = null;
async function loadPositions() {
  if (!state.me) { positions = null; return; }
  try { const r = await fetch('/api/terminal/wallet/' + state.me, { cache: 'no-store' }); if (r.ok) positions = (await r.json()).positions; } catch {}
  if (state.pane === 'positions') renderPositions();
}
function renderPositions() {
  const pane = $('qxt-pane');
  if (!state.me) { pane.replaceChildren(h('p', { class: 'qxt-empty' }, 'Connect a wallet to see your positions across every chain.')); return; }
  if (!positions?.length) { pane.replaceChildren(h('p', { class: 'qxt-empty' }, positions ? 'No positions in listed launches yet.' : 'Loading…')); return; }
  pane.replaceChildren(h('table', { class: 'qxt-table' }, h('thead', {}, h('tr', {}, ...['Token', 'Balance', 'Value', 'Avg buy', 'PnL', ''].map(t => h('th', {}, t)))),
    h('tbody', {}, ...positions.map(p => {
      const avg = p.bought ? p.spent / p.bought : 0, value = p.balance * p.price;
      // PnL counts only tokens that were bought; a creator's own allocation has no cost basis.
      const costed = Math.max(0, Math.min(p.balance, p.bought - p.sold)), pnl = p.received - p.sold * avg + costed * (p.price - avg);
      return h('tr', {}, h('td', {}, icon(p.chainId), ' ', h('b', {}, p.symbol || short(p.controller))), h('td', {}, compact(p.balance)), h('td', {}, money(value, p.quoteSymbol)),
        h('td', {}, avg ? price(avg) : '—'), h('td', { class: pnl > 0 ? 'up' : pnl < 0 ? 'down' : '' }, (pnl > 0 ? '+' : '') + money(pnl, p.quoteSymbol) + (p.spent ? ' (' + pct(pnl / p.spent) + ')' : '')),
        h('td', {}, h('button', { type: 'button', class: 'qxt-mini', onclick: () => select(p.chainId, p.controller) }, 'Open')));
    }))));
}

// ---- Selecting a market ----
let ticket, poll = null, mseq = 0;
async function loadMarket() {
  if (!state.sel) return;
  if (state.sel.ext) return loadExternal();
  const mine = mseq, { chainId, controller } = state.sel;
  try {
    const r = await fetch(`/api/terminal/market/${chainId}/${controller}?tf=${state.tf}`, { cache: 'no-store' });
    if (mine !== mseq) return;
    if (!r.ok) { $('qxt-sync').textContent = r.status === 404 ? 'This launch is not listed yet.' : 'Market data is unavailable right now.'; return; }
    state.data = await r.json();
    renderHead(); renderChart(); if (state.pane !== 'positions') renderPane();
    if (!state.markets.find(m => keyOf(m) === keyOf(state.sel))?.summary) loadFeed();
  } catch { $('qxt-sync').textContent = 'Market data is unavailable right now.'; }
}
async function select(chainId, controller, { quiet = false } = {}) {
  // On phones the list sits below the market, so picking a launch brings its chart into view.
  if (!quiet && matchMedia('(max-width: 760px)').matches) $('qxt-head').scrollIntoView({ block: 'start' });
  const mine = ++mseq;
  state.sel = { chainId, controller }; state.data = null; lastChartKey = ''; chosen = false;
  history.replaceState(null, '', '#m=' + chainId + ':' + controller);
  renderTools();
  renderFeed();
  $('qxt-sync').textContent = 'Loading…';
  const r = await fetch(`/api/markets/${chainId}/${controller}`, { cache: 'no-store' });
  if (mine !== mseq) return;
  if (!r.ok) { $('qxt-sync').textContent = 'This launch is not listed.'; return; }
  const pool = (await r.json()).pool;
  state.pool = pool; window.__qhooksPool = pool;
  document.dispatchEvent(new CustomEvent('qhooks:pool', { detail: pool }));
  const ready = ticket.setPool(pool).catch(e => { $('qxt-sync').textContent = e.message; });
  await loadMarket();
  clearInterval(poll); poll = setInterval(() => { if (!document.hidden) loadMarket(); }, 5000);
  if (!quiet) $('qxt-main').classList.add('has-market');
  return ready;
}
// ---- Any token (outside QHooks launches): market data from /api/terminal/x/*, trades routed by 0x ----
async function loadExternal() {
  const mine = mseq, { chainId, ext } = state.sel;
  try {
    const tr = await fetch(`/api/terminal/x/token/${chainId}/${ext}`, { cache: 'no-store' });
    if (mine !== mseq) return;
    if (!tr.ok) { $('qxt-sync').textContent = tr.status === 404 ? 'No market found for this token.' : 'Market data is unavailable right now.'; return; }
    const t = await tr.json(), pool = t.pools?.[0]?.address, tf = state.tf < 60 ? 60 : state.tf;
    const [cr, xr] = pool ? await Promise.all([fetch(`/api/terminal/x/candles/${chainId}/${pool}?tf=${tf}`, { cache: 'no-store' }), fetch(`/api/terminal/x/trades/${chainId}/${pool}`, { cache: 'no-store' })]) : [null, null];
    const candles = cr?.ok ? (await cr.json()).candles || [] : [], trades = xr?.ok ? (await xr.json()).trades || [] : [];
    if (mine !== mseq) return;
    state.data = { ext: true, tf, token: t, safety: state.data?.safety || null,
      meta: { symbol: t.symbol, name: t.name, token: t.address, chainId, quoteSymbol: 'USD', owner: null },
      summary: { price: t.priceUsd, change24: t.change24, mcap: t.mcapUsd ?? t.fdvUsd, fdv: t.fdvUsd, liquidity: t.liquidityUsd, volume24: t.volume24Usd, buys24: t.buys24, sells24: t.sells24, trades24: t.buys24 != null ? t.buys24 + t.sells24 : null },
      candles, trades: trades.map(x => ({ ts: Math.floor(x.ts / 1000), buy: x.side === 'buy', price: x.priceUsd, token: x.amountToken, quote: x.valueUsd, trader: (x.wallet || '').toLowerCase(), tx: x.tx, pool: 0 })),
      holders: [], traders: [], synced: { behind: 0, at: 0, block: 0 } };
    renderHead(); renderChart(); if (state.pane !== 'positions') renderPane();
  } catch { $('qxt-sync').textContent = 'Market data is unavailable right now.'; }
}
async function selectExternal(chainId, address, { quiet = false } = {}) {
  if (!quiet && matchMedia('(max-width: 760px)').matches) $('qxt-head').scrollIntoView({ block: 'start' });
  const mine = ++mseq;
  if (address.startsWith('0x')) address = address.toLowerCase(); // Solana mints are case-sensitive
  state.sel = { chainId, controller: null, ext: address }; state.pool = null; state.data = null; lastChartKey = ''; chosen = false;
  history.replaceState(null, '', '#t=' + chainId + ':' + address);
  document.querySelector('.qxt-tools').hidden = true;
  renderFeed(); $('qxt-sync').textContent = 'Loading…';
  await loadExternal();
  if (mine !== mseq || !state.data) return;
  const t = state.data.token;
  const ready = ticket.setExternal({ chainId, address, symbol: t.symbol, decimals: t.decimals }).catch(e => { $('qxt-sync').textContent = e.message; });
  fetch(`/api/terminal/x/safety/${chainId}/${address}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(v => {
    if (mine !== mseq || !v) return; state.data.safety = v; ticket.setSafety(v); renderHead();
  }).catch(() => {});
  clearInterval(poll); poll = setInterval(() => { if (!document.hidden) loadExternal(); }, 15000);
  if (!quiet) $('qxt-main').classList.add('has-market');
  return ready;
}
async function quickBuy(m) {
  const u = unitOf(m);
  if (!state.me) { $('qxt-connect').click(); return; }
  await select(m.chainId, m.controller);
  await ticket.quickBuy(u === 'usd' ? 'usd' : u, state.quick[u]);
}
/// A Trade link (#pool=…) lists the market if needed, then opens it.
async function openPoolLink(text) {
  const pool = JSON.parse(text);
  const got = await fetch(`/api/markets/${pool.chainId}/${pool.controller}`, { cache: 'no-store' });
  if (got.status === 404) {
    $('qxt-sync').textContent = 'Listing this launch…';
    await fetch('/api/markets', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: text });
    loadFeed();
  }
  return select(pool.chainId, pool.controller);
}

// ---- Controls ----
function pressGroup(group, attr, value) { for (const b of group.querySelectorAll('button')) b.setAttribute(b.getAttribute('role') === 'tab' ? 'aria-selected' : 'aria-pressed', String(b.dataset[attr] === String(value))); }
$('qxt-chains').replaceChildren(...CHAINS.map(([id, name]) => h('button', { type: 'button', 'data-chain': id, ariaPressed: String(id === state.chain), title: id === 'all' ? 'All chains' : CHAIN_NAME[id] },
  id === 'all' ? null : icon(id), h('span', {}, name))));
$('qxt-chains').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.chain = b.dataset.chain; store('chain', state.chain); pressGroup($('qxt-chains'), 'chain', state.chain); loadFeed(); });
$('qxt-feed-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.feed = b.dataset.feed; store('feed', state.feed); pressGroup($('qxt-feed-tabs'), 'feed', state.feed); state.cursor = -1; renderFeed(); });
pressGroup($('qxt-feed-tabs'), 'feed', state.feed);
$('qxt-tf').replaceChildren(...TFS.map(([t, label]) => h('button', { type: 'button', 'data-tf': String(t), ariaPressed: String(t === state.tf) }, label)));
const setTf = t => { state.tf = t; store('tf', String(t)); pressGroup($('qxt-tf'), 'tf', t); mseq++; loadMarket(); };
$('qxt-tf').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTf(Number(b.dataset.tf)); });
document.querySelector('[aria-label="Chart units"]').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.unit = b.dataset.unit; pressGroup(b.parentElement, 'unit', state.unit); renderChart(); });
$('qxt-data-tabs').addEventListener('click', e => { const b = e.target.closest('button[role="tab"]'); if (!b) return; state.pane = b.dataset.pane; pressGroup($('qxt-data-tabs'), 'pane', state.pane); if (state.pane === 'positions') loadPositions(); renderPane(); });
$('qxt-trade-filters').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.filter = b.dataset.filter; pressGroup($('qxt-trade-filters'), 'filter', state.filter); renderPane(); });
let xTimer = null;
$('qxt-search').addEventListener('input', () => {
  state.cursor = -1; renderFeed();
  clearTimeout(xTimer);
  const q = $('qxt-search').value.trim(); if (q.length < 2) return;
  xTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/terminal/x/search?' + new URLSearchParams({ q, ...(state.chain !== 'all' ? { chain: state.chain } : {}) }), { cache: 'no-store' });
      const body = r.ok ? await r.json() : { results: [] };
      if ($('qxt-search').value.trim() !== q) return;
      state.xhits = body.results || []; state.xq = q; renderFeed();
    } catch { state.xhits = []; state.xq = q; renderFeed(); }
  }, 350);
});
$('qxt-star').addEventListener('click', () => { const k = keyOf(state.sel); state.watch.has(k) ? state.watch.delete(k) : state.watch.add(k); store('watch', JSON.stringify([...state.watch])); renderHead(); renderFeed(); });
// Share: a qhooks.com/l/<chain>/<controller> link that shows a preview card on X and in chats.
$('qxt-share').addEventListener('click', async () => {
  const me = connectedAddress() || '', refq = /^0x[0-9a-fA-F]{40}$/.test(me) ? '?ref=' + me.toLowerCase() : '';
  if (state.sel?.ext) { const l = 'https://qhooks.com/terminal.html' + refq + '#t=' + state.sel.chainId + ':' + state.sel.ext; try { await navigator.clipboard.writeText(l); $('qxt-share').textContent = 'Link copied'; setTimeout(() => { $('qxt-share').textContent = 'Share'; }, 1500); } catch {} return; }
  const p = state.pool; if (!p) return;
  // Sharing while connected makes the sharer the referrer of whoever trades through the link.
  const link = 'https://qhooks.com/l/' + p.chainId + '/' + p.controller + (/^0x[0-9a-fA-F]{40}$/.test(me) ? '?ref=' + me.toLowerCase() : '');
  try { if (navigator.share && matchMedia('(pointer:coarse)').matches) await navigator.share({ url: link }); else { await navigator.clipboard.writeText(link); $('qxt-share').textContent = 'Link copied'; setTimeout(() => { $('qxt-share').textContent = 'Share'; }, 1500); } } catch {}
});
$('qxt-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.data.meta.token); $('qxt-copy').textContent = 'Copied'; setTimeout(() => renderHead(), 1200); } catch {} });
// Quick-buy amounts, one per unit (USDC, ETH, BNB).
const quickRow = document.querySelector('.qxt-quick');
quickRow.replaceChildren(h('span', {}, '⚡ Quick buy'), ...Object.keys(QUICK).map(u => h('label', {}, h('input', { type: 'text', inputMode: 'decimal', value: state.quick[u], ariaLabel: 'Quick buy amount in ' + QUNIT[u],
  oninput: e => { if (/^\d*\.?\d*$/.test(e.target.value) && e.target.value) { state.quick[u] = e.target.value; store('quick', JSON.stringify(state.quick)); renderFeed(); } } }), h('span', {}, QUNIT[u]))));

// Launch tools: one tab per shared panel that has something to show for this launch.
const TOOLS = [['qta', 'Auction'], ['qts', 'TP/SL'], ['qtb', 'Rules'], ['qtt', 'Terms'], ['qto', 'Limit'], ['qtp', 'ETH pool'], ['qtz', 'Staking'], ['qtm', 'Modules'], ['qtv', 'Vesting'], ['qtl', 'Team'], ['qtk', 'Keys']];
let tool = null, chosen = false;
function renderTools() {
  const shown = TOOLS.filter(([id]) => !$(id).hidden);
  // Until someone picks a tab, the first panel in TOOLS order wins (auction, then rules), whichever loads first.
  if (!chosen || !shown.some(([id]) => id === tool)) tool = shown[0]?.[0] || null;
  $('qxt-tool-tabs').replaceChildren(...shown.map(([id, label]) => h('button', { role: 'tab', type: 'button', 'data-tool': id, ariaSelected: String(id === tool), onclick: () => { tool = id; chosen = true; renderTools(); } }, label)));
  for (const [id] of TOOLS) $(id).toggleAttribute('data-off', id !== tool);
  document.querySelector('.qxt-tools').hidden = !shown.length;
}
const toolWatch = new MutationObserver(renderTools);
for (const [id] of TOOLS) toolWatch.observe($(id), { attributes: true, attributeFilter: ['hidden'] });

// Keyboard: trading keys work anywhere outside a text field; Enter sends from the amount field too.
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (typing) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  const k = e.key.toLowerCase(), rows = feedRows();
  if (k === '/') { e.preventDefault(); $('qxt-search').focus(); }
  else if (k === '?') $('qxt-keys').showModal();
  else if (k === 'w') $('qxt-feed-tabs').querySelector('[data-feed="wallets"]').click();
  else if (k === 'b' || k === 's') { ticket.setSide(k === 'b' ? 'buy' : 'sell'); $('qxt-amount').focus(); e.preventDefault(); }
  else if (/^[1-4]$/.test(k)) ticket.preset(Number(k) - 1);
  else if (k === 'enter') ticket.submit();
  else if (k === 'j' || k === 'k') { if (!rows.length) return; state.cursor = Math.max(0, Math.min(rows.length - 1, state.cursor + (k === 'j' ? 1 : -1))); renderFeed(); document.querySelector('.qxt-list li.cur')?.scrollIntoView({ block: 'nearest' }); }
  else if (k === 'o' && rows[state.cursor]) select(rows[state.cursor].chainId, rows[state.cursor].controller);
  else if (k === '[' || k === ']') { const i = TFS.findIndex(([t]) => t === state.tf), n = TFS[Math.max(0, Math.min(TFS.length - 1, i + (k === ']' ? 1 : -1)))][0]; if (n !== state.tf) setTf(n); }
});

// ---- Start ----
ticket = mountTicket($('qxt-ticket'), { onTraded: async ({ side, moved, status }) => {
  setTimeout(loadMarket, 1500); setTimeout(loadPositions, 3000);
  // Auto TP/SL: a buy can set the saved take-profit and stop on exactly what it bought.
  if (side === 'buy') try { if (await afterBuy(moved, status)) { status('TP/SL set on the ' + compact(Number(moved) / 1e18) + ' bought.'); toast('TP/SL placed on your buy.'); } } catch (e) { toast('TP/SL was not placed: ' + (e.message || 'error')); }
} });
onReached(text => toast(text, ['Open TP/SL', () => document.querySelector('#qxt-tool-tabs [data-tool="qts"]')?.click()]));
loadActivity(true);
renderTools(); renderPane();
await loadFeed();
setInterval(() => { if (!document.hidden) loadFeed(); }, 15000);
setInterval(() => { if (!document.hidden && state.markets.some(m => (m.auctionEndsAt || m.opensAt || 0) > now())) renderFeed(); }, 1000);
const hash = location.hash.slice(1);
try {
  if (hash.startsWith('pool=')) await openPoolLink(decodeURIComponent(hash.slice(5)));
  else if (/^m=\d+:0x[0-9a-f]{40}$/.test(hash)) { const [c, a] = hash.slice(2).split(':'); await select(c, a); }
  else if (/^t=(\d+:0x[0-9a-fA-F]{40}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(hash)) { const [c, a] = hash.slice(2).split(':'); await selectExternal(c, a); }
  else { const first = feedRows()[0]; if (first) await select(first.chainId, first.controller, { quiet: true }); }
} catch (e) { $('qxt-sync').textContent = e.message || 'Could not open that launch'; }

// A launch or token link opened while the terminal is already open (#m= or #t=) switches to it.
addEventListener('hashchange', () => {
  const h2 = location.hash.slice(1);
  if (/^m=\d+:0x[0-9a-f]{40}$/.test(h2)) { const [c, a] = h2.slice(2).split(':'); if (state.sel?.controller !== a) select(c, a); }
  else if (/^t=(\d+:0x[0-9a-fA-F]{40}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(h2)) { const [c, a] = h2.slice(2).split(':'); if (state.sel?.ext !== (a.startsWith('0x') ? a.toLowerCase() : a)) selectExternal(c, a); }
});

// Phones: a bottom bar to jump between the launch list, the chart and the trade ticket.
for (const b of document.querySelectorAll('.qxt-mnav button')) b.addEventListener('click', () => document.querySelector(b.dataset.to)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
