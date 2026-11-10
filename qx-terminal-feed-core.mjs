// Discover's data contract and presentation helpers. No DOM, wallet calls or currency estimates.
import {WINDOWS,DISCOVERY_TABS,lifecycle} from './qx-discovery-model.mjs';
import { stockPair } from './full-launch/packages/multichain-launch/stock-pairs.mjs';
import { chainById } from './chains.mjs';
import { DIRECT_CHAINS } from './qx-elysium-direct.mjs';
import {safetyChecked,plainMarketError} from './qx-terminal-data.mjs';
import {officialLogo} from './qx-official.mjs';

export const DASH = '—';
// Chip order (Randall, 2026-11-09): "sol-rh-bnb-Elysium-eth-base-arb".
export const CHAINS = [
  ['all', 'All', null], ['solana', 'Solana', 'solana'], ['4663', 'Robinhood', 'robinhood'], ['56', 'BNB', 'bnb'],
  ['99901', 'Elysium', 'elysium'], ['1', 'Ethereum', 'ethereum'], ['8453', 'Base', 'base'], ['42161', 'Arbitrum', 'arbitrum'],
];
export const TABS = DISCOVERY_TABS;
export function feedSourceLabel(source){
 if(typeof source!=='string')return '';
 if(/dex\s*screener/i.test(source)&&/boost|promot/i.test(source))return 'Boosted tokens · DexScreener';
 if(/geckoterminal.*trending.*pool/i.test(source))return 'Trending pools · GeckoTerminal'+(/prices from dex\s*screener/i.test(source)?' · prices from DexScreener':'');
 return source;
}
export const SORT_KEYS = ['price', 'm5', 'm15', 'h1', 'h6', 'h12', 'h24', 'd7', 'move', 'volume', 'liquidity', 'mcap', 'txns', 'makers'];
export const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = value => number(value) !== null && value >= 0 ? value : null;
const trim = value => value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');

export function compact(value) {
  const n = number(value);
  if (n === null) return DASH;
  const a = Math.abs(n);
  for (const [scale, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (a >= scale) return trim((n / scale).toFixed(1)) + suffix;
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function price(value) {
  const n = nonnegative(value);
  if (n === null) return DASH;
  if (!n) return '0';
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 2 : 4 });
  // Round before counting zeros, so a value rounding across a power of ten stays correct.
  const [mantissa, exponent] = n.toExponential(3).split('e');
  const zeros = -Number(exponent) - 1;
  const digits = mantissa.replace('.', '').replace(/0+$/, '');
  if (zeros >= 4) return '0.0' + String(zeros).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]) + digits;
  return trim(n.toFixed(Math.max(0, zeros + 4)));
}

export function money(value, { unit = 'USD', precise = false } = {}) {
  if (nonnegative(value) === null) return DASH;
  const text = precise ? price(value) : compact(value);
  return unit === 'USD' ? '$' + text : text + ' ' + (unit || DASH);
}

export function percent(value) {
  const n = number(value);
  if (n === null) return DASH;
  const p = Number((n * 100).toFixed(2)) || 0;
  // Moves of 1,000% and up read as +2.2K% so the column never truncates.
  const a = Math.abs(p), body = a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toLocaleString('en-US', { maximumFractionDigits: a >= 100 ? 1 : 2 });
  return (p > 0 ? '+' : p < 0 ? '-' : '') + body + '%';
}

export function timestamp(value) {
  if (typeof value === 'string' && value.trim() && !/^\d+(\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const n = nonnegative(value);
  return n === null || n === 0 ? null : n < 1e12 ? n * 1000 : n;
}

export function age(value, now = Date.now()) {
  const at = timestamp(value);
  if (at === null || !Number.isFinite(now)) return DASH;
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return seconds + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
  return Math.floor(seconds / 86400) + 'd';
}

export function safetyLabel(safety) {
  const labels = { ok: 'No flags', warn: 'Caution', danger: 'Danger' };
  if (!safety || !Object.hasOwn(labels, safety.flag) || safety.flag==='ok'&&!safetyChecked(safety)) return { flag: null, label: 'Not checked', title: 'Not checked' };
  const reasons = Array.isArray(safety.reasons) ? safety.reasons.filter(x => typeof x === 'string' && x.trim()) : [];
  return { flag: safety.flag, label: labels[safety.flag], title: [labels[safety.flag], ...reasons].join(' · ') };
}

// These are the units ticket.quickBuy actually accepts for external tokens today. In particular,
// its launch-native routing check falls back to the dollar quote on BNB and Solana.
export function externalQuick(chainId, address, quick = {}) {
  const chain = String(chainId);
  // HYPE chains (Elysium): pools quote in (W)HYPE, so quick buy is in HYPE like the ticket's own presets (2026-11-09).
  const cls = ['8453', '1', '42161', '4663'].includes(chain) ? 'eth' : chainById(chain)?.native === 'HYPE' ? 'hype' : 'usd';
  const unit = cls === 'eth' ? 'ETH' : cls === 'hype' ? 'HYPE' : chain === '56' ? 'USDT' : 'USDC';
  return {
    cls, unit, value: String(quick[cls] ?? (cls === 'eth' ? '0.01' : cls === 'hype' ? '0.1' : '10')),
    stock: !!stockPair(chain, address),
      // Outside tokens buy through 0x; a chain without it (Elysium) has no proven route, so no quick buy there (2026-11-09).
      // Elysium outside tokens go through the direct pool route (qx-elysium-direct.mjs); a token without an allowed pool gets
      // the ticket's "coming" message and nothing is sent.
      supported: CHAINS.some(([id]) => id !== 'all' && id === chain) && (chainById(chain)?.data?.zeroEx !== false || DIRECT_CHAINS.includes(chain)),
  };
}

export function launchQuick(market, quick = {}) {
  const q = market.quoteSymbol || chainById(market.chainId)?.quote?.symbol || '';
  const cls = /^W?ETH$/.test(q) ? 'eth' : /^W?BNB$/.test(q) ? 'bnb' : /^W?HYPE$/.test(q) ? 'hype' : 'usd';
  return { cls, value: String(quick[cls] ?? ({ eth: '0.01', bnb: '0.05', usd: '10', hype: '0.1' })[cls]),
    unit: cls === 'eth' ? 'ETH' : cls === 'bnb' ? 'BNB' : cls === 'hype' ? 'HYPE' : market.quoteSymbol || 'USDC',
    stock: !!stockPair(String(market.chainId), market.token), supported: true };
}

export function launchRow(market) {
  const s = market.summary || {};
  return {
    chainId: String(market.chainId), pool: market.controller, dex: 'QHooks', launch: market,
    token: { address: market.token, symbol: market.symbol, name: market.name, logo: market.logo || officialLogo(market.chainId, market.token) },
    quote: { symbol: market.quoteSymbol }, createdAt: market.launchedAt,
    priceUsd: s.priceUsd ?? null, volumeUsd: { h24: s.volume24Usd ?? null }, liquidityUsd: s.liquidityUsd ?? null,
    marketCapUsd: s.mcapUsd ?? null, fdvUsd: s.fdvUsd ?? null,
    quoteAmounts: { price: s.price, volume: s.volume24, liquidity: s.liquidity, mcap: s.mcap, unit: market.quoteSymbol },
    change: { m5: null, h1: null, h6: null, h24: s.change24 ?? null },
    txns: { h24: { buys: s.buys24 ?? null, sells: s.sells24 ?? null } }, makers: { h24: null }, safety: null,
  };
}

export function searchRow(hit) {
  return { chainId: String(hit.chainId), pool: '', token: hit, createdAt: hit.createdAt ?? null,
    priceUsd: hit.priceUsd ?? null, change: { h24: hit.change24 ?? null },
    volumeUsd: { h24: hit.volume24Usd ?? null }, liquidityUsd: hit.liquidityUsd ?? null,
    marketCapUsd: hit.mcapUsd ?? null, fdvUsd: hit.fdvUsd ?? null, safety: null };
}

export function rowKey(row) {
  const address = row.launch?.controller || row.token?.address || '';
  return String(row.chainId) + ':' + (String(row.chainId) === 'solana' ? address : address.toLowerCase()) + ':' + (row.pool || '');
}

export function rowViewModel(row, { now = Date.now(), quick = {}, window = 'h24' } = {}) {
  const chainId = String(row.chainId), token = row.token || {};
  const chain = CHAINS.find(([id]) => id === chainId);
  // Zero means the provider doesn't know the cap: fall back to FDV (tagged), else a dash.
  const known = value => nonnegative(value) > 0 ? value : null;
  const cap = known(row.marketCapUsd) ?? known(row.fdvUsd);
  const buys = nonnegative(row.txns?.h24?.buys), sells = nonnegative(row.txns?.h24?.sells);
  const numeric = {
    ...Object.fromEntries(WINDOWS.map(([key])=>[key,number(row.change?.[key])])),move:number(row.change?.[window]),price: nonnegative(row.priceUsd), m5: number(row.change?.m5), h1: number(row.change?.h1), h6: number(row.change?.h6), h24: number(row.change?.h24),
    volume: nonnegative(row.volumeUsd?.h24), liquidity: nonnegative(row.liquidityUsd), mcap: cap,
    txns: buys !== null && sells !== null ? buys + sells : null, makers: nonnegative(row.makers?.h24),
  };
  const quote = row.quoteAmounts;
  const displayMoney = (key, precise = false) => numeric[key] !== null ? money(numeric[key], { precise }) :
    quote?.unit && Number(quote[key]) > 0 ? money(quote[key], { unit: quote.unit, precise }) : DASH; // no "0 WETH" cap for an untraded launch (quoteusd)
  const symbol = typeof token.symbol === 'string' && token.symbol.trim() ? token.symbol : '?';
  const address = typeof token.address === 'string' ? token.address : '';
  return {
    key: rowKey(row), row, chainId, chainName: chain?.[1] || chainId, chainIcon: chain?.[2], address,
    lifecycle:lifecycle(row),move:percent(numeric.move),symbol, name: typeof token.name === 'string' ? token.name : '', logo: safeLogo(token.logo) || safeLogo(officialLogo(chainId, address)),
    letter: symbol.replace(/^\$/, '').slice(0, 1).toUpperCase() || '?', age: age(row.createdAt, now),
    price: displayMoney('price', true), m5: percent(numeric.m5), h1: percent(numeric.h1), h6: percent(numeric.h6), h24: percent(numeric.h24),
    volume: displayMoney('volume'), liquidity: displayMoney('liquidity'), mcap: displayMoney('mcap'),
    capKind: known(row.marketCapUsd) === null && known(row.fdvUsd) !== null ? 'FDV' : '',
    buys: compact(buys), sells: compact(sells), makers: compact(numeric.makers), numeric,
    safety: safetyLabel(row.safety), quick: row.launch ? launchQuick(row.launch, quick) : externalQuick(chainId, address, quick),
  };
}

export function safeLogo(url) {
  if (typeof url !== 'string') return null;
  return /^https:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : null;
}

export function sortRows(rows, sort = {}) {
  if (!SORT_KEYS.includes(sort.key)) return [...rows];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = number(a.numeric[sort.key]), y = number(b.numeric[sort.key]);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return (x - y) * sign;
  });
}

export function preferences(storage) {
  const read = key => { try { return storage?.getItem('qxt:discover:' + key); } catch { return null; } };
  let sort;
  try { sort = JSON.parse(read('sort')); } catch {}
  return {
    // First open: Gainers (Randall, 2026-11-09: "auto open to top gainers 6h"); a saved choice wins.
    tab: ['launches', ...TABS.map(([id]) => id)].includes(read('tab')) ? read('tab') : 'gainers',
    chain: CHAINS.some(([id]) => id === read('chain')) ? read('chain') : 'all',
    sort: SORT_KEYS.includes(sort?.key) ? { key: sort.key, direction: sort.direction === 'asc' ? 'asc' : 'desc' } : { key: null, direction: 'desc' },
  };
}

export function savePreference(storage, key, value) {
  try { storage?.setItem('qxt:discover:' + key, typeof value === 'string' ? value : JSON.stringify(value)); } catch {}
}

export const hasTokenHash = hash => /^#(?:t|m|pool)=/.test(hash || '');

// One in-flight request per selection. A late response must never replace a newer tab's rows.
// The server list and the visitor's own browser read (qx-browser-market.mjs) race: the browser read starts once the
// server has not answered with a full, current list within browserDelay (or at once when the server fails), and
// whichever answers first paints. Server rows stay first once both are in (dedupe by chain + token). The last good
// list per view is kept on the device, so a reload paints it at once and a failed refresh keeps it ("Refreshing…").
export function createFeedLoader({ fetcher, changed, timeout = 12000, serverTimeout = 12000, browserDelay = 2500, browser = null, storage = null, minRows = 12, cacheRead = null, cacheWrite = null }) {
  let generation = 0, active = null;
  const cache = new Map();
  function cancel() { generation++; active?.abort(); active = null; }
  const usable = rows => (Array.isArray(rows) ? rows : []).filter(r => r && r.token && typeof r.token.address === 'string' && CHAINS.some(([id]) => id !== 'all' && id === String(r.chainId)));
  const full = data => !!data && data.rows.length >= minRows && data.stale !== true;
  // The server's discovery feed has no Elysium list (400 invalid_query, polled every 30 s): read it in the browser only.
  const SERVER_SKIP = new Set(['99901']);
  // Gainers/Losers rank the whole received set by the window's move; dust (under $10k liquidity or 24 h volume) can't top it.
  const FLOOR = 10000;
  const MOVERS = ['gainers', 'losers'];
  function rankRows(rows, tab, window) {
    const move = r => { const v = r.change?.[window]; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
    const ok = r => !r.launch ? (Number(r.liquidityUsd) >= FLOOR && Number(r.volumeUsd?.h24) >= FLOOR) : true;
    return rows.filter(r => move(r) !== null && (tab === 'gainers' ? move(r) > 0 : move(r) < 0) && ok(r))
      .sort((a, b) => tab === 'gainers' ? move(b) - move(a) : move(a) - move(b));
  }
  function ranked(data, tab, window) {
    if (!data || !MOVERS.includes(tab)) return data;
    const rows = rankRows(data.rows, tab, window);
    return rows.length ? { ...data, rows } : data;
  }
  async function serverRead(tab, chain, window, parent) {
    if (SERVER_SKIP.has(String(chain))) return null;
    const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, serverTimeout);
    parent.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetcher('/api/terminal/market/feed?' + new URLSearchParams({ tab, chain,window }), { cache: 'no-store', signal: controller.signal });
      const body = await response.json();
      if (!response.ok || body?.version !== 1 || !Array.isArray(body.rows)) return null;
      return { ...body, rows: usable(body.rows) };
    } catch { return null; } finally { clearTimeout(timer); parent.removeEventListener('abort', abort); }
  }
  function merged(server, own, tab, chain, window) {
    const extra = usable(own?.rows);
    if (!extra.length) return server?.rows.length ? server : null;
    const seen = new Set(), rows = [];
    for (const r of [...(server?.rows || []), ...extra]) { const k = String(r.chainId) + ':' + (String(r.chainId) === 'solana' ? r.token.address : r.token.address.toLowerCase()); if (!seen.has(k)) { seen.add(k); rows.push(r); } }
    const serverFresh = server && server.rows.length && server.stale !== true;
    return { version: 1, ...(server || {}), tab, chain, window, rows, browser: true, status: undefined, error: undefined, fallback: undefined,
      source: [server?.rows.length ? feedSourceLabel(server.source) : null, ...String(own.source || '').split(' · ')].filter((v, i, all) => v && !all.slice(0, i).some(p => p && p.includes(v))).join(' · ') || null,
      observedAt: serverFresh ? server.observedAt : own.observedAt, stale: serverFresh ? !!server.stale : false };
  }
  async function load(tab, chain,window='h24') {
    cancel();
    const mine = generation, key = tab + ':' + chain + ':' + window, controller = new AbortController();
    active = controller;
    const retained = cache.get(key) || cacheRead?.(storage, key) || null;
    changed({ key, loading: true, data: retained, error: null });
    const timer = setTimeout(() => controller.abort(), timeout);
    let server = null, serverDone = false, own = null, ownRun = null, early;
    const live = () => mine === generation;
    const paintPartial = () => { const data = ranked(merged(server, own, tab, chain, window), tab, window); if (live() && data?.rows.length) changed({ key, loading: true, data, error: null }); };
    const startOwn = () => {
      if (!browser) return Promise.resolve();
      return ownRun ||= browser({ tab, chain, window, signal: controller.signal, onPartial: d => { if (!own) { own = d; paintPartial(); own = null; } } }).catch(() => null).then(d => { own = d; if (!serverDone) paintPartial(); });
    };
    try {
      if (browser) early = setTimeout(() => { if (!serverDone) void startOwn(); }, browserDelay);
      server = await serverRead(tab, chain, window, controller.signal); serverDone = true;
      if (!live()) return;
      // Movers count as full only when enough rows survive the ranking (the server's All list is mostly unranked boosts).
      const enough = d => full(d) && (!MOVERS.includes(tab) || rankRows(d.rows, tab, window).length >= minRows);
      if (browser && !enough(server)) {
        // Paint whatever the server had while the browser read finishes.
        if (server?.rows.length) paintPartial();
        await startOwn();
        if (!live()) return;
      }
      let data = ranked(enough(server) ? server : merged(server, own, tab, chain, window), tab, window);
      // A provider limit can make one refresh much thinner than the last good list: keep those rows behind the new ones
      // and say "Refreshing…" (stale) until a full read lands, instead of shrinking the list on screen.
      if (data?.rows.length && retained?.rows?.length && data.rows.length < retained.rows.length / 2) {
        const seen = new Set(data.rows.map(r => String(r.chainId) + ':' + String(r.token.address).toLowerCase()));
        data = { ...data, rows: [...data.rows, ...retained.rows.filter(r => r?.token?.address && !seen.has(String(r.chainId) + ':' + String(r.token.address).toLowerCase()))], stale: true };
      }
      if (!data?.rows.length) {
        if (retained?.rows?.length) { changed({ key, loading: false, data: { ...retained, stale: true }, error: null }); return; }
        throw new Error(plainMarketError());
      }
      cache.set(key, data); cacheWrite?.(storage, key, data);
      changed({ key, loading: false, data, error: null });
    } catch (error) {
      if (!live()) return;
      changed({ key, loading: false, data: retained, error: error.name === 'AbortError' ? 'Feed request timed out. Try again.' : plainMarketError() });
    } finally {
      clearTimeout(timer); clearTimeout(early);
      if (live()) active = null;
    }
  }
  return { load, cancel };
}
