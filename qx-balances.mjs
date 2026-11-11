// A wallet's balances across QHooks' chains, for the account menu (Randall, 2026-11-05: "can't find my base eth").
// Per chain: the native coin and its dollar stablecoin (USDC; USDG on Robinhood Chain), read straight from each
// chain's public RPC (all in the page CSP). Dollar values: stablecoins at $1, ETH and BNB from Chainlink's USD feeds
// (ETH/USD on Base, BNB/USD on BNB Chain). All reads run in parallel; a chain that doesn't answer is marked, the rest
// still show. Results are cached per wallet for a minute (memory + sessionStorage) so reopening the menu is instant.
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
const TTL = 60000, KEY = 'qhooks.balances.v2.';

async function once(fetcher, url, method, params, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctl.signal });
    const j = await r.json(); if (j.error || typeof j.result !== 'string') throw Error(j.error?.message || 'no result'); return j.result;
  } finally { clearTimeout(t); }
}
// Public RPCs rate-limit in bursts; one retry after a short pause covers a blip without slowing the normal case.
const rpc = (fetcher, url, method, params, ms = 8000) => once(fetcher, url, method, params, ms)
  .catch(() => new Promise(r => setTimeout(r, 700)).then(() => once(fetcher, url, method, params, ms)));
const units = (hex, decimals) => { const v = BigInt(hex === '0x' ? 0 : hex); return Number(v) / 10 ** decimals; };
async function usdPrice(fetcher, symbol) {
  if (symbol === 'USDC') return 1; // Arc's native coin
  if (symbol === 'MON') {
    const r = await fetcher('/api/funding/native-prices?symbols=MON', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
    const p = r.ok ? (await r.json()).prices?.MON : null;
    return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
  }
  const f = FEEDS[symbol], c = f && chainById(f[0]);
  if (!c) return null;
  const r = await rpc(fetcher, c.rpc, 'eth_call', [{ to: f[1], data: '0xfeaf968c' }, 'latest']); // latestRoundData()
  const answer = BigInt('0x' + r.slice(66, 130)), updated = Number(BigInt('0x' + r.slice(194, 258)));
  if (answer <= 0n || Date.now() / 1000 - updated > 86400) return null; // stale or broken feed: show amounts without dollars
  return Number(answer) / 1e8;
}

const WRAPPED = { ETH: 'WETH', BNB: 'WBNB', MON: 'WMON' };
const raw = hex => BigInt(!hex || hex === '0x' ? 0 : hex).toString();
/// QHooks launch tokens the wallet holds (terminal index positions → token address from the market, balance on chain).
async function launchTokens(owner, fetcher, chains) {
  let positions = [];
  try { const r = await fetcher('/api/terminal/wallet/' + owner.toLowerCase(), { cache: 'no-store' }); if (r.ok) positions = (await r.json())?.positions || []; } catch {}
  positions = positions.filter(p => chains.some(c => c.id === String(p.chainId)) && /^0x[0-9a-fA-F]{40}$/.test(p.controller || '') && Number(p.balance) > 1e-9);
  const traded = (await Promise.all(positions.slice(0, 20).map(async p => {
    let meta = null;
    try { const r = await fetcher('/api/terminal/market/' + p.chainId + '/' + p.controller.toLowerCase() + '?tf=60', { cache: 'no-store' }); if (r.ok) meta = (await r.json())?.meta || null; } catch {}
    const token = String(meta?.token || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(token)) return null;
    return { chainId: String(p.chainId), address: token, symbol: String(meta.symbol || p.symbol || 'token').slice(0, 16), decimals: Number(meta.decimals ?? 18),
      price: Number(p.price) || null, quoteSymbol: String(meta.quoteSymbol || p.quoteSymbol || '') };
  }))).filter(Boolean);
  // Also every QHooks launch on each chain (2026-11-09): tokens that arrived by transfer (no indexed trade) were missing,
  // e.g. an email wallet holding 1M QHOOKS showed only ETH. Balances are read on chain; a price is fetched only if held.
  const seen = new Set(traded.map(t => t.chainId + ':' + t.address)), listed = [];
  const add = t => { const k = t.chainId + ':' + t.address; if (!seen.has(k) && /^0x[0-9a-f]{40}$/.test(t.address)) { seen.add(k); listed.push(t); } };
  add({ chainId: '4663', address: QHOOKS_TOKEN, symbol: 'QHOOKS', decimals: 18, price: null, quoteSymbol: 'WETH', needPrice: true });
  await Promise.all(chains.filter(c => c.simpleLaunch || c.simpleLaunchNext).map(async c => {
    try {
      const r = await fetcher('/api/v1/launches?chain=' + c.id, { cache: 'no-store' }); if (!r.ok) return;
      for (const l of ((await r.json())?.launches || []).slice(0, 40)) add({ chainId: c.id, address: String(l.token || '').toLowerCase(),
        symbol: String(l.symbol || 'token').slice(0, 16), decimals: Number(l.decimals ?? 18), price: null, quoteSymbol: '', needPrice: true });
    } catch {}
  }));
  return [...traded, ...listed];
}
const QHOOKS_TOKEN = '0x20429af7ca3b0ce4d99edbaa0693f26c5df05195';
/// USD per token for a held launch token without an indexed price: the market summary price × its quote's USD price.
async function launchUsd(fetcher, chainId, token, quoteUsd) {
  try {
    const r = await fetcher('/api/terminal/market/' + chainId + '/' + token + '?tf=60', { cache: 'no-store' }); if (!r.ok) return null;
    const j = await r.json(), p = Number(j?.summary?.priceUsd) || null; if (p) return p;
    const q = quoteUsd(String(j?.meta?.quoteSymbol || '')), v = Number(j?.summary?.price);
    return q != null && v > 0 ? v * q : null;
  } catch { return null; }
}
/// Reads every visible chain for `owner`. Returns { owner, at, total, partial, rows:[{ chainId, name, icon, native:{symbol,
/// amount, usd}, stable:{symbol, amount, usd}|null, error }] }. `usd` is null when no price is known.
export async function readBalances(owner, { fetcher = (...a) => fetch(...a), chains = visibleChains() } = {}) {
  const symbols = [...new Set(chains.map(c => c.native))];
  const prices = Object.fromEntries(await Promise.all(symbols.map(s => usdPrice(fetcher, s).then(p => [s, p], () => [s, null]))));
  const pad = owner.toLowerCase().replace(/^0x/, '').padStart(64, '0'), held = await launchTokens(owner, fetcher, chains).catch(() => []);
  const quoteUsd = q => /^(USDC|USDG|USDT|DAI)$/i.test(q) ? 1 : prices[String(q).replace(/^W/i, '').toUpperCase()] ?? null;
  const rows = await Promise.all(chains.map(async c => {
    const st = isArcFamily(c.id) ? null : STABLE[c.id]; // Arc's USDC is its native balance; don't count it twice
    const [n, s] = await Promise.allSettled([rpc(fetcher, c.rpc, 'eth_getBalance', [owner, 'latest']),
      st ? rpc(fetcher, c.rpc, 'eth_call', [{ to: st[1], data: '0x70a08231' + pad }, 'latest']) : Promise.resolve(null)]);
    const native = n.status === 'fulfilled' ? units(n.value, 18) : null, stable = st && s.status === 'fulfilled' ? units(s.value, st[2]) : null;
    const price = prices[c.native];
    // Tokens: the wrapped native coin (WETH/WBNB) and any QHooks launch tokens held, each read on chain.
    const want = [...(c.wrappedNative && WRAPPED[c.native] ? [{ address: c.wrappedNative.toLowerCase(), symbol: WRAPPED[c.native], decimals: 18, kind: 'wrapped', unitUsd: price ?? null }] : []),
      ...held.filter(t => t.chainId === c.id).map(t => ({ address: t.address, symbol: t.symbol, decimals: t.decimals, kind: 'launch', needPrice: !!t.needPrice, unitUsd: t.price != null && quoteUsd(t.quoteSymbol) != null ? t.price * quoteUsd(t.quoteSymbol) : null }))];
    const reads = await Promise.allSettled(want.map(t => rpc(fetcher, c.rpc, 'eth_call', [{ to: t.address, data: '0x70a08231' + pad }, 'latest'])));
    // Listed (not traded) launch tokens: drop unreadable ones quietly (no balance known) and price only what is held.
    for (let i = 0; i < want.length; i++) if (want[i].needPrice && reads[i].status === 'fulfilled' && BigInt(reads[i].value && reads[i].value !== '0x' ? reads[i].value : 0) > 0n)
      want[i].unitUsd = await launchUsd(fetcher, c.id, want[i].address, quoteUsd);
    const tokens = want.map((t, i) => { if (reads[i].status !== 'fulfilled') return t.needPrice ? null : { ...t, amount: null, rawAmount: null, usd: null, error: true };
      const amount = units(reads[i].value, t.decimals); return { address: t.address, symbol: t.symbol, decimals: t.decimals, kind: t.kind, amount, rawAmount: raw(reads[i].value), usd: t.unitUsd != null ? amount * t.unitUsd : null }; })
      .filter(t => t && (t.error || t.amount > 0));
    return { chainId: c.id, name: c.name, icon: c.icon,
      native: { symbol: c.native, amount: native, rawAmount: n.status === 'fulfilled' ? raw(n.value) : null, usd: native != null && price != null ? native * price : null }, tokens,
      stable: st ? { symbol: st[0], address: st[1], decimals: st[2], amount: stable, rawAmount: s.status === 'fulfilled' ? raw(s.value) : null, usd: stable } : null,
      error: n.status === 'rejected' || (st && s.status === 'rejected') };
  }));
  const total = rows.reduce((t, r) => t + (r.native.usd || 0) + (r.stable?.usd || 0) + r.tokens.reduce((a, x) => a + (x.usd || 0), 0), 0);
  return { owner: owner.toLowerCase(), at: Date.now(), total, partial: rows.some(r => r.error || (r.native.amount > 0 && r.native.usd == null) || r.tokens.some(x => x.error || (x.amount > 0 && x.usd == null))), rows };
}

// Name held assets without a dollar price separately from balances that could not be read.
export function balanceTotalNote(data) {
  const rows = data?.rows || [], unpriced = [...new Set(rows.flatMap(r => [r.native, r.stable, ...(r.tokens || [])])
    .filter(a => a?.amount > 0 && a.usd == null).map(a => a.symbol))];
  const notes = unpriced.length ? [unpriced.join(', ') + ' not in total'] : [];
  if (rows.some(r => r.error || r.tokens?.some(t => t.error)) || data?.partial && !notes.length) notes.push('Some balances unavailable');
  return notes.length ? ' · ' + notes.join(' · ') : '';
}

const mem = new Map();
/// Cached reading for `owner`: { data, fresh }. `data` may be older than a minute (shown while refreshing).
export function cachedBalances(owner) {
  const k = owner.toLowerCase(); let data = mem.get(k);
  if (!data) { try { data = JSON.parse(sessionStorage.getItem(KEY + k) || 'null'); } catch {} if (data) mem.set(k, data); }
  return { data: data || null, fresh: !!data && Date.now() - data.at < TTL };
}
const inflight = new Map();
/// Reads (or reuses an in-flight read) and caches the result.
export function refreshBalances(owner, opts) {
  const k = owner.toLowerCase();
  if (!inflight.has(k)) inflight.set(k, readBalances(owner, opts).then(d => { mem.set(k, d); try { sessionStorage.setItem(KEY + k, JSON.stringify(d)); } catch {} return d; }).finally(() => inflight.delete(k)));
  return inflight.get(k);
}
