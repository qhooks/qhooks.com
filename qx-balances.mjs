// A wallet's balances across QHooks' chains, for the account menu (Randall, 2026-11-05: "can't find my base eth").
// Per chain: the native coin and its dollar stablecoin (USDC; USDG on Robinhood Chain), read straight from each
// chain's public RPC (all in the page CSP). Dollar values: stablecoins at $1, ETH and BNB from Chainlink's USD feeds
// (ETH/USD on Base, BNB/USD on BNB Chain).
// menufast (2026-11-12, Randall: "Balances take forever to load"): the menu showed "Reading your balances on every
// chain" for many seconds because the read ran in stages (prices, then the held-token list with a cold market read per
// token, then every chain with 8 s timeouts and a retry). Now:
//  - the last reading for this wallet is kept in localStorage and paints at once;
//  - every chain's reads, the prices and the held-token list start together; each read has one 3 s timeout;
//  - a chain's row is reported (onProgress) as soon as its coins are read, and again once its launch tokens are;
//  - a chain that doesn't answer keeps its last reading, marked refreshing, instead of blanking;
//  - prices, the token behind each market and the launch lists are cached, so held tokens never wait on a cold
//    market read after the first time.
import { visibleChains, isArcFamily, chainById } from './chains.mjs';

// Dollar stablecoin per chain: [symbol, address, decimals] (addresses/decimals checked on chain 2026-11-05).
const STABLE = {
  '8453': ['USDC', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6], '1': ['USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6],
  '42161': ['USDC', '0xaf88d065e77c8cc2239327c5edb3a432268e5831', 6], '56': ['USDC', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', 18],
  '4663': ['USDG', '0x5fc5360d0400a0fd4f2af552add042d716f1d168', 6],
  '143': ['USDC', chainById('143').usdc, 6],
};
// Chainlink USD feeds (description() checked: "ETH / USD", "BNB / USD"; 8 decimals).
const FEEDS = { ETH: ['8453', '0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70'], BNB: ['56', '0x0567f2323251f0aab15c8dfb1967e4e8a7d42aee'] };
const TTL = 60000, KEY = 'qhooks.balances.v3.', MS = 3000;

// ---------- small persistent caches (localStorage when there is one; memory otherwise) ----------
const store = (() => { try { return globalThis.localStorage || null; } catch { return null; } })();
const memo = new Map();
function cacheGet(key, maxAge) {
  let v = memo.get(key);
  if (v === undefined && store) { try { v = JSON.parse(store.getItem(key) || 'null'); } catch { v = null; } if (v) memo.set(key, v); }
  return v && (maxAge == null || Date.now() - v.at < maxAge) ? v.value : undefined;
}
function cachePut(key, value) { const v = { at: Date.now(), value }; memo.set(key, v); if (store) try { store.setItem(key, JSON.stringify(v)); } catch {} }

const timeout = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
async function rpc(fetcher, url, method, params, ms = MS) {
  const r = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: timeout(ms) });
  const j = await r.json(); if (j.error || typeof j.result !== 'string') throw Error(j.error?.message || 'no result'); return j.result;
}
const getJson = async (fetcher, url) => { const r = await fetcher(url, { cache: 'no-store', signal: timeout(MS) }); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
const units = (hex, decimals) => { const v = BigInt(hex === '0x' ? 0 : hex); return Number(v) / 10 ** decimals; };

// Native coin prices: a cached price (15 min) is used as is; an older one (up to a day) only if the read fails.
async function usdPrice(fetcher, symbol) {
  if (symbol === 'USDC') return 1; // Arc's native coin
  const key = 'qhooks.usd.v1.' + symbol, fresh = cacheGet(key, 15 * 60000);
  if (fresh != null) return fresh;
  let p = null;
  try {
    if (symbol === 'MON') {
      const j = await getJson(fetcher, '/api/funding/native-prices?symbols=MON'), v = j?.prices?.MON;
      p = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
    } else {
      const f = FEEDS[symbol], c = f && chainById(f[0]);
      if (c) {
        const r = await rpc(fetcher, c.rpc, 'eth_call', [{ to: f[1], data: '0xfeaf968c' }, 'latest']); // latestRoundData()
        const answer = BigInt('0x' + r.slice(66, 130)), updated = Number(BigInt('0x' + r.slice(194, 258)));
        p = answer > 0n && Date.now() / 1000 - updated <= 86400 ? Number(answer) / 1e8 : null; // a broken feed: amounts without dollars
      }
    }
  } catch { p = null; }
  if (p != null) { cachePut(key, p); return p; }
  return cacheGet(key, 86400000) ?? null;
}

const WRAPPED = { ETH: 'WETH', BNB: 'WBNB', MON: 'WMON' };
const raw = hex => BigInt(!hex || hex === '0x' ? 0 : hex).toString();
const QHOOKS_TOKEN = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
/// QHooks launch tokens the wallet holds (terminal index positions → token address from the market, balance on chain).
/// The token behind a market never changes, so it is remembered; only markets seen for the first time are read.
async function launchTokens(owner, fetcher, chains) {
  let positions = [];
  try { positions = (await getJson(fetcher, '/api/terminal/wallet/' + owner.toLowerCase()))?.positions || []; } catch {}
  positions = positions.filter(p => chains.some(c => c.id === String(p.chainId)) && /^0x[0-9a-fA-F]{40}$/.test(p.controller || '') && Number(p.balance) > 1e-9);
  const traded = (await Promise.all(positions.slice(0, 20).map(async p => {
    const mk = 'qhooks.mkt.v1.' + p.chainId + ':' + p.controller.toLowerCase();
    let meta = cacheGet(mk);
    if (!meta) {
      try { const m = (await getJson(fetcher, '/api/terminal/market/' + p.chainId + '/' + p.controller.toLowerCase() + '?tf=60'))?.meta || null;
        if (m && /^0x[0-9a-fA-F]{40}$/.test(String(m.token || ''))) { meta = { token: String(m.token).toLowerCase(), symbol: m.symbol, decimals: m.decimals, quoteSymbol: m.quoteSymbol }; cachePut(mk, meta); }
      } catch {}
    }
    if (!meta) return null;
    return { chainId: String(p.chainId), address: meta.token, symbol: String(meta.symbol || p.symbol || 'token').slice(0, 16), decimals: Number(meta.decimals ?? 18),
      price: Number(p.price) || null, quoteSymbol: String(meta.quoteSymbol || p.quoteSymbol || '') };
  }))).filter(Boolean);
  // Also every QHooks launch on each chain (2026-11-09): tokens that arrived by transfer (no indexed trade) were missing,
  // e.g. an email wallet holding 1M QHOOKS showed only ETH. Balances are read on chain; a price is fetched only if held.
  const seen = new Set(traded.map(t => t.chainId + ':' + t.address)), listed = [];
  const add = t => { const k = t.chainId + ':' + t.address; if (!seen.has(k) && /^0x[0-9a-f]{40}$/.test(t.address)) { seen.add(k); listed.push(t); } };
  add({ chainId: '4663', address: QHOOKS_TOKEN, symbol: 'QHOOKS', decimals: 18, price: null, quoteSymbol: 'WETH', needPrice: true });
  await Promise.all(chains.filter(c => c.simpleLaunch || c.simpleLaunchNext).map(async c => {
    const lk = 'qhooks.launches.v1.' + c.id;
    let list = cacheGet(lk, 10 * 60000);
    if (!list) {
      try { list = ((await getJson(fetcher, '/api/v1/launches?chain=' + c.id))?.launches || []).slice(0, 40).map(l => ({ token: String(l.token || '').toLowerCase(), symbol: l.symbol, decimals: l.decimals })); cachePut(lk, list); }
      catch { list = cacheGet(lk) || []; }
    }
    for (const l of list) add({ chainId: c.id, address: l.token, symbol: String(l.symbol || 'token').slice(0, 16), decimals: Number(l.decimals ?? 18), price: null, quoteSymbol: '', needPrice: true });
  }));
  return [...traded, ...listed];
}
/// USD per token for a held launch token without an indexed price: the market summary price × its quote's USD price.
/// Remembered for 5 minutes; an older price (up to a day) stands in if the read fails.
async function launchUsd(fetcher, chainId, token, quoteUsd) {
  const key = 'qhooks.tokusd.v1.' + chainId + ':' + token, fresh = cacheGet(key, 5 * 60000);
  if (fresh != null) return fresh;
  let p = null;
  try {
    const j = await getJson(fetcher, '/api/terminal/market/' + chainId + '/' + token + '?tf=60');
    p = Number(j?.summary?.priceUsd) || null;
    if (!p) { const q = quoteUsd(String(j?.meta?.quoteSymbol || '')), v = Number(j?.summary?.price); p = q != null && v > 0 ? v * q : null; }
  } catch {}
  if (p != null) { cachePut(key, p); return p; }
  return cacheGet(key, 86400000) ?? null;
}

const rowValue = r => (r.native.usd || 0) + (r.stable?.usd || 0) + (r.tokens || []).reduce((a, x) => a + (x.usd || 0), 0);
function summarize(owner, rows) {
  return { owner: owner.toLowerCase(), at: Date.now(), total: rows.reduce((t, r) => t + rowValue(r), 0),
    partial: rows.some(r => r.error || r.refreshing || (r.native.amount > 0 && r.native.usd == null) || r.tokens.some(x => x.error || (x.amount > 0 && x.usd == null))), rows };
}

/// Reads every visible chain for `owner`. Returns { owner, at, total, partial, rows:[{ chainId, name, icon, native:{symbol,
/// amount, usd}, stable:{symbol, amount, usd}|null, tokens, error }] }. `usd` is null when no price is known.
/// onRow(row) is called for each chain as soon as its coins are read, and again with its launch tokens.
export async function readBalances(owner, { fetcher = (...a) => fetch(...a), chains = visibleChains(), onRow = null } = {}) {
  const symbols = [...new Set(chains.map(c => c.native))];
  const pricesP = Promise.all(symbols.map(s => usdPrice(fetcher, s).then(p => [s, p], () => [s, null]))).then(Object.fromEntries);
  const pad = owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const heldP = launchTokens(owner, fetcher, chains).catch(() => []);
  const quoteUsdFrom = prices => q => /^(USDC|USDG|USDT|DAI)$/i.test(q) ? 1 : prices[String(q).replace(/^W/i, '').toUpperCase()] ?? null;
  const tell = row => { try { onRow?.(row); } catch {} };
  const balanceOf = (c, address) => rpc(fetcher, c.rpc, 'eth_call', [{ to: address, data: '0x70a08231' + pad }, 'latest']);
  const rows = await Promise.all(chains.map(async c => {
    const st = isArcFamily(c.id) ? null : STABLE[c.id]; // Arc's USDC is its native balance; don't count it twice
    const wrapped = c.wrappedNative && WRAPPED[c.native] ? { address: c.wrappedNative.toLowerCase(), symbol: WRAPPED[c.native], decimals: 18, kind: 'wrapped' } : null;
    const [[n, s, w], prices] = await Promise.all([Promise.allSettled([rpc(fetcher, c.rpc, 'eth_getBalance', [owner, 'latest']),
      st ? balanceOf(c, st[1]) : Promise.resolve(null), wrapped ? balanceOf(c, wrapped.address) : Promise.resolve(null)]), pricesP]);
    const native = n.status === 'fulfilled' ? units(n.value, 18) : null, stable = st && s.status === 'fulfilled' ? units(s.value, st[2]) : null;
    const price = prices[c.native], quoteUsd = quoteUsdFrom(prices);
    const coin = (t, read, unitUsd) => read.status !== 'fulfilled' ? { ...t, amount: null, rawAmount: null, usd: null, error: true }
      : (a => ({ address: t.address, symbol: t.symbol, decimals: t.decimals, kind: t.kind, amount: a, rawAmount: raw(read.value), usd: unitUsd != null ? a * unitUsd : null }))(units(read.value, t.decimals));
    const wrappedRow = wrapped ? [coin(wrapped, w, price ?? null)].filter(t => t.error || t.amount > 0) : [];
    const row = { chainId: c.id, name: c.name, icon: c.icon,
      native: { symbol: c.native, amount: native, rawAmount: n.status === 'fulfilled' ? raw(n.value) : null, usd: native != null && price != null ? native * price : null }, tokens: wrappedRow,
      stable: st ? { symbol: st[0], address: st[1], decimals: st[2], amount: stable, rawAmount: s.status === 'fulfilled' ? raw(s.value) : null, usd: stable } : null,
      error: n.status === 'rejected' || (st && s.status === 'rejected') };
    const held = (await heldP).filter(t => t.chainId === c.id);
    if (!held.length) { tell(row); return row; }
    tell({ ...row, tokensPending: true });
    // Launch tokens: balances on chain; listed (not traded) tokens that can't be read are dropped quietly, and only
    // what is held gets a price.
    const reads = await Promise.allSettled(held.map(t => balanceOf(c, t.address)));
    const launch = await Promise.all(held.map(async (t, i) => {
      const r = reads[i];
      if (r.status !== 'fulfilled') return t.needPrice ? null : { address: t.address, symbol: t.symbol, decimals: t.decimals, kind: 'launch', amount: null, rawAmount: null, usd: null, error: true };
      const amount = units(r.value, t.decimals); if (!(amount > 0)) return null;
      const unitUsd = t.needPrice ? await launchUsd(fetcher, c.id, t.address, quoteUsd) : t.price != null && quoteUsd(t.quoteSymbol) != null ? t.price * quoteUsd(t.quoteSymbol) : null;
      return { address: t.address, symbol: t.symbol, decimals: t.decimals, kind: 'launch', amount, rawAmount: raw(r.value), usd: unitUsd != null ? amount * unitUsd : null };
    }));
    const done = { ...row, tokens: [...wrappedRow, ...launch.filter(Boolean)] };
    tell(done); return done;
  }));
  return summarize(owner, rows);
}

// Name held assets without a dollar price separately from balances that are still being read.
export function balanceTotalNote(data) {
  const rows = data?.rows || [], unpriced = [...new Set(rows.flatMap(r => [r.native, r.stable, ...(r.tokens || [])])
    .filter(a => a?.amount > 0 && a.usd == null).map(a => a.symbol))];
  const notes = unpriced.length ? [unpriced.join(', ') + ' not in total'] : [];
  if (rows.some(r => r.error || r.refreshing || r.tokens?.some(t => t.error)) || data?.partial && !notes.length) notes.push('Some chains refreshing');
  return notes.length ? ' · ' + notes.join(' · ') : '';
}

const mem = new Map();
/// Cached reading for `owner`: { data, fresh }. `data` may be older than a minute (shown while refreshing); it survives
/// reloads (localStorage), so the menu paints the last balances at once.
export function cachedBalances(owner) {
  const k = owner.toLowerCase(); let data = mem.get(k);
  if (!data && store) { try { data = JSON.parse(store.getItem(KEY + k) || 'null'); } catch {} if (data?.rows) mem.set(k, data); else data = null; }
  return { data: data || null, fresh: !!data && !data.reading && Date.now() - data.at < TTL };
}
const inflight = new Map();
/// Reads (or reuses an in-flight read), caches the result and reports progress: onProgress(data) is called each time a
/// chain's row lands, with the rows still being read carried over from the last reading and marked `refreshing`.
/// A chain that doesn't answer keeps its last reading (refreshing) instead of an empty row. opts.chains limits the read
/// to those chains (the rest keep their reading).
export function refreshBalances(owner, opts = {}) {
  const k = owner.toLowerCase(), chains = opts.chains || visibleChains(), ids = chains.map(c => c.id), key = k + '|' + ids.join(',');
  const listeners = inflight.get(key)?.listeners;
  if (listeners) { if (opts.onProgress) listeners.add(opts.onProgress); return inflight.get(key).promise; }
  const prev = cachedBalances(k).data, prevRows = new Map((prev?.rows || []).map(r => [r.chainId, r])), got = new Map(), subs = new Set(opts.onProgress ? [opts.onProgress] : []);
  const order = [...new Set([...visibleChains().map(c => c.id), ...ids, ...prevRows.keys()])];
  const keepOld = (r) => { const old = prevRows.get(r.chainId); if (!old) return r;
    // a coin that wasn't answered keeps its last reading; launch tokens still being read keep theirs too
    const out = { ...r }; let stale = false;
    if (r.native.amount == null && old.native.amount != null) { out.native = old.native; stale = true; }
    if (r.stable && r.stable.amount == null && old.stable?.amount != null) { out.stable = old.stable; stale = true; }
    if (r.tokensPending) out.tokens = [...r.tokens, ...(old.tokens || []).filter(t => t.kind === 'launch')];
    if (stale) { out.error = false; out.refreshing = true; }
    return out; };
  const merged = (final) => {
    const rows = [];
    for (const id of order) {
      if (got.has(id)) rows.push(keepOld(got.get(id)));
      else if (prevRows.has(id)) rows.push(ids.includes(id) && !final ? { ...prevRows.get(id), refreshing: true } : prevRows.get(id));
    }
    const d = summarize(k, rows); if (!final) d.reading = true; return d;
  };
  const publish = (d) => { mem.set(k, d); for (const f of subs) try { f(d); } catch {} };
  const promise = readBalances(owner, { ...opts, chains, onRow: (row) => { got.set(row.chainId, row); publish(merged(false)); } })
    .then(() => { const d = merged(true); publish(d); if (store) try { store.setItem(KEY + k, JSON.stringify(d)); } catch {} return d; })
    .finally(() => inflight.delete(key));
  inflight.set(key, { promise, listeners: subs });
  return promise;
}
