// Discover's data contract and presentation helpers. No DOM, wallet calls or currency estimates.
import { stockPair } from './full-launch/packages/multichain-launch/stock-pairs.mjs';

export const DASH = '—';
export const CHAINS = [
  ['all', 'All', null], ['8453', 'Base', 'base'], ['1', 'Ethereum', 'ethereum'],
  ['42161', 'Arbitrum', 'arbitrum'], ['56', 'BNB', 'bnb'],
  ['4663', 'Robinhood', 'robinhood'], ['solana', 'Solana', 'solana'],
];
export const TABS = [['trending', 'Trending'], ['new', 'New pairs'], ['gainers', 'Top gainers'], ['volume', 'Volume']];
export const SORT_KEYS = ['price', 'm5', 'h1', 'h24', 'volume', 'liquidity', 'mcap', 'txns', 'makers'];
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
  const labels = { ok: 'No flags reported', warn: 'Caution', danger: 'Danger' };
  if (!safety || !Object.hasOwn(labels, safety.flag)) return { flag: null, label: DASH, title: 'No safety data' };
  const reasons = Array.isArray(safety.reasons) ? safety.reasons.filter(x => typeof x === 'string' && x.trim()) : [];
  return { flag: safety.flag, label: labels[safety.flag], title: [labels[safety.flag], ...reasons].join(' · ') };
}

// These are the units ticket.quickBuy actually accepts for external tokens today. In particular,
// its launch-native routing check falls back to the dollar quote on BNB and Solana.
export function externalQuick(chainId, address, quick = {}) {
  const chain = String(chainId);
  const cls = ['8453', '1', '42161', '4663'].includes(chain) ? 'eth' : 'usd';
  const unit = cls === 'eth' ? 'ETH' : chain === '56' ? 'USDT' : 'USDC';
  return {
    cls, unit, value: String(quick[cls] ?? (cls === 'eth' ? '0.01' : '10')),
    stock: !!stockPair(chain, address),
      supported: CHAINS.some(([id]) => id !== 'all' && id === chain),
  };
}

export function launchQuick(market, quick = {}) {
  const cls = /^W?ETH$/.test(market.quoteSymbol || '') ? 'eth' : /^W?BNB$/.test(market.quoteSymbol || '') ? 'bnb' : 'usd';
  return { cls, value: String(quick[cls] ?? ({ eth: '0.01', bnb: '0.05', usd: '10' })[cls]),
    unit: cls === 'eth' ? 'ETH' : cls === 'bnb' ? 'BNB' : market.quoteSymbol || 'USDC',
    stock: !!stockPair(String(market.chainId), market.token), supported: true };
}

export function launchRow(market) {
  const s = market.summary || {};
  return {
    chainId: String(market.chainId), pool: market.controller, dex: 'QHooks', launch: market,
    token: { address: market.token, symbol: market.symbol, name: market.name, logo: market.logo },
    quote: { symbol: market.quoteSymbol }, createdAt: market.launchedAt,
    priceUsd: s.priceUsd ?? null, volumeUsd: { h24: s.volume24Usd ?? null }, liquidityUsd: s.liquidityUsd ?? null,
    marketCapUsd: s.mcapUsd ?? null, fdvUsd: s.fdvUsd ?? null,
    quoteAmounts: { price: s.price, volume: s.volume24, liquidity: s.liquidity, mcap: s.mcap, unit: market.quoteSymbol },
    change: { m5: null, h1: null, h24: s.change24 ?? null },
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

export function rowViewModel(row, { now = Date.now(), quick = {} } = {}) {
  const chainId = String(row.chainId), token = row.token || {};
  const chain = CHAINS.find(([id]) => id === chainId);
  // Zero means the provider doesn't know the cap: fall back to FDV (tagged), else a dash.
  const known = value => nonnegative(value) > 0 ? value : null;
  const cap = known(row.marketCapUsd) ?? known(row.fdvUsd);
  const buys = nonnegative(row.txns?.h24?.buys), sells = nonnegative(row.txns?.h24?.sells);
  const numeric = {
    price: nonnegative(row.priceUsd), m5: number(row.change?.m5), h1: number(row.change?.h1), h24: number(row.change?.h24),
    volume: nonnegative(row.volumeUsd?.h24), liquidity: nonnegative(row.liquidityUsd), mcap: cap,
    txns: buys !== null && sells !== null ? buys + sells : null, makers: nonnegative(row.makers?.h24),
  };
  const quote = row.quoteAmounts;
  const displayMoney = (key, precise = false) => numeric[key] !== null ? money(numeric[key], { precise }) :
    quote?.unit ? money(quote[key], { unit: quote.unit, precise }) : DASH;
  const symbol = typeof token.symbol === 'string' && token.symbol.trim() ? token.symbol : '?';
  const address = typeof token.address === 'string' ? token.address : '';
  return {
    key: rowKey(row), row, chainId, chainName: chain?.[1] || chainId, chainIcon: chain?.[2], address,
    symbol, name: typeof token.name === 'string' ? token.name : '', logo: safeLogo(token.logo),
    letter: symbol.replace(/^\$/, '').slice(0, 1).toUpperCase() || '?', age: age(row.createdAt, now),
    price: displayMoney('price', true), m5: percent(numeric.m5), h1: percent(numeric.h1), h24: percent(numeric.h24),
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
    tab: ['launches', ...TABS.map(([id]) => id)].includes(read('tab')) ? read('tab') : 'trending',
    chain: CHAINS.some(([id]) => id === read('chain')) ? read('chain') : 'all',
    sort: SORT_KEYS.includes(sort?.key) ? { key: sort.key, direction: sort.direction === 'asc' ? 'asc' : 'desc' } : { key: null, direction: 'desc' },
  };
}

export function savePreference(storage, key, value) {
  try { storage?.setItem('qxt:discover:' + key, typeof value === 'string' ? value : JSON.stringify(value)); } catch {}
}

export const hasTokenHash = hash => /^#(?:t|m|pool)=/.test(hash || '');

// One in-flight request per selection. A late response must never replace a newer tab's rows.
export function createFeedLoader({ fetcher, changed, timeout = 12000 }) {
  let generation = 0, active = null;
  const cache = new Map();
  function cancel() { generation++; active?.abort(); active = null; }
  async function load(tab, chain) {
    cancel();
    const mine = generation, key = tab + ':' + chain, controller = new AbortController();
    active = controller;
    changed({ key, loading: true, data: cache.get(key) || null, error: null });
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher('/api/terminal/x/feed?' + new URLSearchParams({ tab, chain }), { cache: 'no-store', signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Feed unavailable (' + response.status + ')');
      if (body?.version !== 1 || !Array.isArray(body.rows)) throw new Error('Invalid feed response');
      const data = { ...body, rows: body.rows.filter(r => r && r.token && typeof r.token.address === 'string' && CHAINS.some(([id]) => id !== 'all' && id === String(r.chainId))) };
      if (mine !== generation) return;
      cache.set(key, data);
      changed({ key, loading: false, data, error: null });
    } catch (error) {
      if (mine !== generation) return;
      changed({ key, loading: false, data: cache.get(key) || null, error: error.name === 'AbortError' ? 'Feed request timed out' : error.message || 'Feed unavailable' });
    } finally {
      clearTimeout(timer);
      if (mine === generation) active = null;
    }
  }
  return { load, cancel };
}
