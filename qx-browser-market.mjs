// Token lists and search read by the visitor's own browser (2026-11-09). The server's copies of GeckoTerminal and
// DexScreener share Cloudflare's egress and get rate limited (429/503 on every chain), which left the terminal's
// Tokens list empty on Ethereum, Arbitrum and Elysium and thin on BNB and Robinhood. Both providers allow browser
// CORS, so each visitor reads with their own allowance. Read-only: no wallet calls, no keys, no QHooks storage.
// Order: server rows first, then GeckoTerminal pools, then DexScreener boosts/profiles/search. The last good list per
// view is kept on the device so a refresh never paints a blank list.
export const NETWORKS = Object.freeze({
  '143': { gecko: 'monad', dex: 'monad', search: ['monad', 'WMON'] },
  '8453': { gecko: 'base', dex: 'base', search: ['base', 'WETH base'] },
  '1': { gecko: 'eth', dex: 'ethereum', search: ['ethereum', 'WETH'] },
  '42161': { gecko: 'arbitrum', dex: 'arbitrum', search: ['arbitrum', 'ARB'] },
  '56': { gecko: 'bsc', dex: 'bsc', search: ['bsc', 'WBNB'] },
  '4663': { gecko: 'robinhood', dex: 'robinhood', search: ['robinhood'] },
  '99901': { gecko: 'elysium', dex: 'elysium', search: ['elysium', 'WHYPE'] },
  solana: { gecko: 'solana', dex: 'solana', search: ['solana'] },
});
const DEX_TO_ID = Object.fromEntries(Object.entries(NETWORKS).map(([id, n]) => [n.dex, id]));
const GECKO_TO_ID = Object.fromEntries(Object.entries(NETWORKS).map(([id, n]) => [n.gecko, id]));
// "All" reads these when the server has nothing: the chains QHooks trades on, EVM first.
export const ALL_ORDER = ['8453', '4663', '56', '42161', '1', '99901', '143'];
const GECKO = 'https://api.geckoterminal.com/api/v2';
const DEX = 'https://api.dexscreener.com';
export const MIN_ROWS = 12;
const CACHE_KEY = 'qhooks:terminal:browser-feed:v1', CACHE_MAX_AGE = 6 * 3600000;
const EVM = /^0x[0-9a-f]{40}$/i, MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const num = v => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const frac = v => { const n = num(v); return n === null ? null : n / 100; };
const low = (chainId, a) => chainId === 'solana' ? String(a || '') : String(a || '').toLowerCase();
const httpsOrNull = v => typeof v === 'string' && /^https:\/\//i.test(v) && !/missing\.png/i.test(v) ? v : null;
const tidy = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';

// Per-provider backoff, shared by every caller on the page.
const blocked = { gecko: 0, dex: 0 }, backoff = { gecko: 0, dex: 0 };
export function resetBrowserMarket() { blocked.gecko = blocked.dex = 0; backoff.gecko = backoff.dex = 0; memo.clear(); }
const memo = new Map();
async function getJson(provider, url, { fetcher, now, signal, ttl = 45000 }) {
  const hit = memo.get(url);
  if (hit && now() - hit.at < ttl) return hit.body;
  if (now() < blocked[provider]) return null;
  const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, 5000);
  if (signal?.aborted) return null;
  signal?.addEventListener?.('abort', abort, { once: true });
  try {
    const r = await fetcher(url, { headers: { accept: 'application/json' }, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (r.status === 429 || r.status >= 500) { backoff[provider] = Math.min(backoff[provider] ? backoff[provider] * 2 : 20000, 180000); blocked[provider] = now() + backoff[provider]; return null; }
    if (!r.ok) return null;
    const body = await r.json();
    backoff[provider] = 0; memo.set(url, { at: now(), body });
    if (memo.size > 80) memo.delete(memo.keys().next().value);
    return body;
  } catch {
    // A provider's 429 often comes without CORS headers, so the browser reports it as a network error: back off too.
    if (!signal?.aborted && !controller.signal.aborted) { backoff[provider] = Math.min(backoff[provider] ? backoff[provider] * 2 : 20000, 180000); blocked[provider] = now() + backoff[provider]; }
    return null;
  } finally { clearTimeout(timer); signal?.removeEventListener?.('abort', abort); }
}

// GeckoTerminal JSON:API pools → feed rows (the /api/terminal/market/feed row shape).
export function geckoRows(body, chainId, observedAt = Date.now()) {
  const data = Array.isArray(body?.data) ? body.data : [], included = new Map((Array.isArray(body?.included) ? body.included : []).map(x => [x?.id, x?.attributes || {}]));
  const windows = ['m5', 'm15', 'h1', 'h6', 'h24'], rows = [], seen = new Set();
  for (const pool of data) {
    const a = pool?.attributes || {}, rel = pool?.relationships || {};
    const baseId = rel.base_token?.data?.id || '', quoteId = rel.quote_token?.data?.id || '';
    const net = String(baseId).split('_')[0], cid = chainId || GECKO_TO_ID[net];
    if (!cid || !NETWORKS[cid]) continue;
    const base = included.get(baseId) || {}, quote = included.get(quoteId) || {};
    const address = low(cid, base.address || String(baseId).slice(String(baseId).indexOf('_') + 1));
    const poolAddress = low(cid, a.address);
    if (!(cid === 'solana' ? MINT.test(address) : EVM.test(address)) || !poolAddress || seen.has(address)) continue;
    seen.add(address);
    const [baseName = '', quoteName = ''] = String(a.name || '').split(' / ');
    const tx = a.transactions || {}, created = Date.parse(a.pool_created_at);
    rows.push({
      chainId: cid, pool: poolAddress, dex: tidy(rel.dex?.data?.id, 60) || null,
      token: { address, symbol: tidy(base.symbol || baseName, 20) || '?', name: tidy(base.name || baseName, 100), logo: httpsOrNull(base.image_url) },
      quote: { address: quote.address ? low(cid, quote.address) : null, symbol: tidy(quote.symbol || quoteName.split(' ')[0], 20) || null },
      createdAt: Number.isFinite(created) ? created : null,
      priceUsd: num(a.base_token_price_usd), liquidityUsd: num(a.reserve_in_usd), marketCapUsd: num(a.market_cap_usd), fdvUsd: num(a.fdv_usd),
      volumeUsd: Object.fromEntries(windows.map(w => [w, num(a.volume_usd?.[w])])),
      change: Object.fromEntries(windows.map(w => [w, frac(a.price_change_percentage?.[w])])),
      txns: Object.fromEntries(windows.map(w => [w, { buys: num(tx[w]?.buys), sells: num(tx[w]?.sells), buyers: num(tx[w]?.buyers), sellers: num(tx[w]?.sellers) }])),
      makers: { h24: null }, lifecycle: null, safety: null, observedAt, stale: false,
      provenance: { provider: 'geckoterminal', discoverySource: 'browser', sampling: 'browser_pool_sample' },
    });
  }
  return rows;
}

// DexScreener pairs → feed rows, deepest pool per token.
export function dexRows(pairs, chainId, observedAt = Date.now()) {
  const best = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const cid = DEX_TO_ID[p?.chainId];
    if (!cid || (chainId && cid !== chainId) || num(p.priceUsd) === null) continue;
    const address = low(cid, p.baseToken?.address);
    if (!(cid === 'solana' ? MINT.test(address) : EVM.test(address))) continue;
    const key = cid + ':' + address, had = best.get(key);
    if (!had || (num(p.liquidity?.usd) ?? -1) > (num(had.liquidity?.usd) ?? -1)) best.set(key, p);
  }
  const windows = ['m5', 'h1', 'h6', 'h24'];
  return [...best.values()].map(p => {
    const cid = DEX_TO_ID[p.chainId];
    return {
      chainId: cid, pool: low(cid, p.pairAddress), dex: tidy(p.dexId, 60) || null,
      token: { address: low(cid, p.baseToken.address), symbol: tidy(p.baseToken.symbol, 20) || '?', name: tidy(p.baseToken.name, 100), logo: httpsOrNull(p.info?.imageUrl) },
      quote: { address: p.quoteToken?.address ? low(cid, p.quoteToken.address) : null, symbol: tidy(p.quoteToken?.symbol, 20) || null },
      createdAt: num(p.pairCreatedAt), priceUsd: num(p.priceUsd), liquidityUsd: num(p.liquidity?.usd), marketCapUsd: num(p.marketCap), fdvUsd: num(p.fdv),
      volumeUsd: Object.fromEntries(windows.map(w => [w, num(p.volume?.[w])])), change: Object.fromEntries(windows.map(w => [w, frac(p.priceChange?.[w])])),
      txns: Object.fromEntries(windows.map(w => [w, { buys: num(p.txns?.[w]?.buys), sells: num(p.txns?.[w]?.sells) }])),
      makers: { h24: null }, lifecycle: null, safety: null, observedAt, stale: false,
      provenance: { provider: 'dexscreener', discoverySource: 'browser', sampling: 'browser_pair_sample' },
    };
  });
}

const GECKO_DURATION = { m5: '5m', m15: '5m', h1: '1h', h6: '6h', h12: '6h', h24: '24h', d7: '24h' };
function geckoUrl(tab, network, window) {
  const inc = 'include=base_token,quote_token,dex';
  if (tab === 'new') return `${GECKO}/networks/${network}/new_pools?${inc}`;
  if (tab === 'volume') return `${GECKO}/networks/${network}/pools?${inc}&sort=h24_volume_usd_desc`;
  return `${GECKO}/networks/${network}/trending_pools?${inc}&duration=${GECKO_DURATION[window] || '24h'}`;
}

// DexScreener has no per-chain trending list; boosts and profiles across chains, then pairs by address,
// and finally a chain-name search, fill the list for one chain.
async function dexFeed(chainId, opts) {
  const n = NETWORKS[chainId];
  const lists = await Promise.all(['/token-boosts/top/v1', '/token-boosts/latest/v1', '/token-profiles/latest/v1'].map(p => getJson('dex', DEX + p, opts)));
  const addresses = [...new Set(lists.flatMap(l => Array.isArray(l) ? l : []).filter(x => x?.chainId === n.dex && x.tokenAddress).map(x => low(chainId, x.tokenAddress)))].slice(0, 30);
  let rows = [];
  if (addresses.length) rows = dexRows(await getJson('dex', `${DEX}/tokens/v1/${n.dex}/${addresses.join(',')}`, opts), chainId, opts.now());
  for (const q of n.search) {
    if (rows.length >= MIN_ROWS) break;
    const body = await getJson('dex', `${DEX}/latest/dex/search?q=${encodeURIComponent(q)}`, opts);
    rows = mergeRows(rows, dexRows(body?.pairs, chainId, opts.now()));
  }
  return rows;
}

export function sortForTab(rows, tab, window = 'h24') {
  const list = [...rows], v = (r, k) => num(k(r));
  const desc = k => (a, b) => (v(b, k) ?? -Infinity) - (v(a, k) ?? -Infinity);
  if (tab === 'new') list.sort(desc(r => r.createdAt));
  else if (tab === 'volume') list.sort(desc(r => r.volumeUsd?.h24));
  else if (tab === 'gainers') list.sort(desc(r => r.change?.[window] ?? r.change?.h24));
  else if (tab === 'losers') list.sort((a, b) => (v(a, r => r.change?.[window] ?? r.change?.h24) ?? Infinity) - (v(b, r => r.change?.[window] ?? r.change?.h24) ?? Infinity));
  return list;
}

export const tokenKey = r => String(r.chainId) + ':' + low(String(r.chainId), r.token?.address);
export function mergeRows(first, second, limit = 100) {
  const seen = new Set(), out = [];
  for (const r of [...(first || []), ...(second || [])]) {
    if (!r?.token?.address) continue;
    const k = tokenKey(r); if (seen.has(k)) continue;
    seen.add(k); out.push(r); if (out.length >= limit) break;
  }
  return out;
}

async function chainFeed(tab, chainId, window, opts) {
  const n = NETWORKS[chainId]; if (!n) return { rows: [], source: null };
  let rows = geckoRows(await getJson('gecko', geckoUrl(tab, n.gecko, window), opts), chainId, opts.now()), source = rows.length ? 'GeckoTerminal' : null;
  // One list alone can be thin (new pairs, or trending pools sharing a token): top it up from the other list.
  if (rows.length < MIN_ROWS) rows = mergeRows(rows, geckoRows(await getJson('gecko', geckoUrl(tab === 'trending' ? 'volume' : 'trending', n.gecko, window), opts), chainId, opts.now()));
  // Show what GeckoTerminal gave at once; the DexScreener top-up follows.
  if (rows.length && rows.length < MIN_ROWS) opts.onRows?.({ rows, source });
  if (rows.length < MIN_ROWS) { const more = await dexFeed(chainId, opts); if (more.length) { rows = mergeRows(rows, more); source = source ? source + ' · DexScreener' : 'DexScreener'; } }
  return { rows, source };
}

// The browser's own list for one Discover view, in the server's {version:1, rows} contract.
export async function browserFeed({ tab = 'trending', chain = 'all', window = 'h24', fetcher = globalThis.fetch, now = Date.now, signal, onPartial } = {}) {
  const partial = onPartial ? ({ rows, source }) => { try { onPartial({ version: 1, tab, chain, window, rows: sortForTab(rows, tab, window), observedAt: now(), stale: false, browser: true, source }); } catch {} } : null;
  const opts = { fetcher, now, signal, onRows: partial };
  let rows = [], sources = new Set();
  if (chain === 'all') {
    // One read per chain, in parallel (six calls, well inside GeckoTerminal's per-visitor allowance).
    // Per chain, in parallel: GeckoTerminal first (six calls); a chain it doesn't answer (429s arrive without CORS
    // headers) reads DexScreener's chain search instead, so one provider's limit never empties a chain.
    const movers = ['gainers', 'losers'].includes(tab), per = movers ? 20 : 12;
    const lists = await Promise.all(ALL_ORDER.map(async id => {
      const got = geckoRows(await getJson('gecko', geckoUrl(movers ? 'trending' : tab, NETWORKS[id].gecko, window), opts), id, now()).slice(0, per);
      if (got.length >= 5) { sources.add('GeckoTerminal'); return got; }
      const found = await Promise.all(NETWORKS[id].search.map(q => getJson('dex', `${DEX}/latest/dex/search?q=${encodeURIComponent(q)}`, opts).then(b => dexRows(b?.pairs, id, now()))));
      const more = mergeRows(got, found.flat()).slice(0, per); if (more.length > got.length) sources.add('DexScreener');
      return more;
    }));
    for (const got of lists) rows = rows.concat(got);
    if (rows.length && rows.length < MIN_ROWS) partial?.({ rows, source: 'GeckoTerminal' });
    if (rows.length < MIN_ROWS) {
      const lists = await Promise.all(['/token-boosts/top/v1', '/token-profiles/latest/v1'].map(p => getJson('dex', DEX + p, opts)));
      const byChain = new Map();
      for (const x of lists.flatMap(l => Array.isArray(l) ? l : [])) { const id = DEX_TO_ID[x?.chainId]; if (!id || !x.tokenAddress) continue; const s = byChain.get(id) || new Set(); if (s.size < 30) s.add(low(id, x.tokenAddress)); byChain.set(id, s); }
      const found = await Promise.all([...byChain].map(([id, set]) => getJson('dex', `${DEX}/tokens/v1/${NETWORKS[id].dex}/${[...set].join(',')}`, opts).then(p => dexRows(p, id, now()))));
      for (const got of found) { if (got.length) sources.add('DexScreener'); rows = mergeRows(rows, got); }
    }
  } else {
    const got = await chainFeed(tab, chain, window, opts); rows = got.rows; if (got.source) for (const s of got.source.split(' · ')) sources.add(s);
  }
  rows = sortForTab(mergeRows(rows, []), tab, window);
  return { version: 1, tab, chain, window, rows, observedAt: now(), stale: false, browser: true, source: [...sources].join(' · ') || null };
}

// Last good list per view, on this device only. Read failures are ignored: the page works without it.
export function readCachedFeed(storage, key, now = Date.now()) {
  try {
    const all = JSON.parse(storage?.getItem(CACHE_KEY) || '{}'), hit = all?.[key];
    if (!hit || !Array.isArray(hit.rows) || !hit.rows.length || !(now - hit.at < CACHE_MAX_AGE)) return null;
    return { version: 1, ...hit.meta, rows: hit.rows, observedAt: hit.at, cached: true, stale: true };
  } catch { return null; }
}
export function writeCachedFeed(storage, key, data, now = Date.now()) {
  try {
    if (!storage?.setItem || !data?.rows?.length) return;
    const all = JSON.parse(storage.getItem(CACHE_KEY) || '{}'), next = { ...all, [key]: { at: now, rows: data.rows.slice(0, 60), meta: { tab: data.tab, chain: data.chain, window: data.window, source: data.source || null } } };
    const keys = Object.keys(next).sort((a, b) => next[b].at - next[a].at).slice(0, 24);
    storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keys.map(k => [k, next[k]]))));
  } catch {}
}

// Search hits in the /api/terminal/x/search result shape: name, symbol or contract, on one chain or all.
export function hitFromRow(r) {
  return { chainId: r.chainId, address: r.token.address, symbol: r.token.symbol, name: r.token.name, logo: r.token.logo, pool: r.pool,
    priceUsd: r.priceUsd, change24: r.change?.h24 ?? null, volume24Usd: r.volumeUsd?.h24 ?? null, liquidityUsd: r.liquidityUsd,
    mcapUsd: r.marketCapUsd, fdvUsd: r.fdvUsd, createdAt: r.createdAt, source: 'browser' };
}
export async function browserSearch({ q, chain = 'all', fetcher = globalThis.fetch, now = Date.now, signal } = {}) {
  const query = String(q || '').trim(), opts = { fetcher, now, signal, ttl: 30000 };
  if (query.length < 2) return [];
  const only = chain !== 'all' && NETWORKS[chain] ? chain : null;
  let rows = [];
  // An exact contract: ask each chain's token endpoint directly (DexScreener search can miss brand-new pairs).
  if (EVM.test(query) || MINT.test(query)) {
    const ids = only ? [only] : EVM.test(query) ? ALL_ORDER : ['solana'];
    const found = await Promise.all(ids.map(id => getJson('dex', `${DEX}/tokens/v1/${NETWORKS[id].dex}/${low(id, query)}`, opts).then(p => dexRows(p, id, now()))));
    rows = mergeRows(rows, found.flat());
    if (!rows.length) for (const id of ids) { rows = mergeRows(rows, geckoRows(await getJson('gecko', `${GECKO}/search/pools?query=${encodeURIComponent(query)}&network=${NETWORKS[id].gecko}&include=base_token,quote_token,dex`, opts), id, now())); if (rows.length) break; }
  }
  if (!rows.length) {
    const body = await getJson('dex', `${DEX}/latest/dex/search?q=${encodeURIComponent(query)}`, opts);
    rows = dexRows(body?.pairs, only, now());
  }
  if (rows.length < 3 && only) rows = mergeRows(rows, geckoRows(await getJson('gecko', `${GECKO}/search/pools?query=${encodeURIComponent(query)}&network=${NETWORKS[only].gecko}&include=base_token,quote_token,dex`, opts), only, now()));
  const ql = query.toLowerCase(), exact = r => r.token.address === low(r.chainId, query) || r.token.symbol.toLowerCase() === ql.replace(/^\$/, '') ? 1 : 0;
  return rows.sort((a, b) => exact(b) - exact(a) || (num(b.liquidityUsd) ?? -1) - (num(a.liquidityUsd) ?? -1)).slice(0, 30).map(hitFromRow);
}
