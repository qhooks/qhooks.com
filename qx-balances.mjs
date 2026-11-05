// A wallet's balances across QHooks' chains, for the account menu (Randall, 2026-11-05: "can't find my base eth").
// Per chain: the native coin and its dollar stablecoin (USDC; USDG on Robinhood Chain), read straight from each
// chain's public RPC (all in the page CSP). Dollar values: stablecoins at $1, ETH and BNB from Chainlink's USD feeds
// (ETH/USD on Base, BNB/USD on BNB Chain). All reads run in parallel; a chain that doesn't answer is marked, the rest
// still show. Results are cached per wallet for a minute (memory + sessionStorage) so reopening the menu is instant.
import { visibleChains, isArcFamily, chainById } from '/chains.mjs';

// Dollar stablecoin per chain: [symbol, address, decimals] (addresses/decimals checked on chain 2026-11-05).
const STABLE = {
  '8453': ['USDC', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6], '1': ['USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6],
  '42161': ['USDC', '0xaf88d065e77c8cc2239327c5edb3a432268e5831', 6], '56': ['USDC', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', 18],
  '4663': ['USDG', '0x5fc5360d0400a0fd4f2af552add042d716f1d168', 6],
};
// Chainlink USD feeds (description() checked: "ETH / USD", "BNB / USD"; 8 decimals).
const FEEDS = { ETH: ['8453', '0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70'], BNB: ['56', '0x0567f2323251f0aab15c8dfb1967e4e8a7d42aee'] };
const TTL = 60000, KEY = 'qhooks.balances.';

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
  const f = FEEDS[symbol], c = f && chainById(f[0]);
  if (!c) return null;
  const r = await rpc(fetcher, c.rpc, 'eth_call', [{ to: f[1], data: '0xfeaf968c' }, 'latest']); // latestRoundData()
  const answer = BigInt('0x' + r.slice(66, 130)), updated = Number(BigInt('0x' + r.slice(194, 258)));
  if (answer <= 0n || Date.now() / 1000 - updated > 86400) return null; // stale or broken feed: show amounts without dollars
  return Number(answer) / 1e8;
}

/// Reads every visible chain for `owner`. Returns { owner, at, total, partial, rows:[{ chainId, name, icon, native:{symbol,
/// amount, usd}, stable:{symbol, amount, usd}|null, error }] }. `usd` is null when no price is known.
export async function readBalances(owner, { fetcher = (...a) => fetch(...a), chains = visibleChains() } = {}) {
  const symbols = [...new Set(chains.map(c => c.native))];
  const prices = Object.fromEntries(await Promise.all(symbols.map(s => usdPrice(fetcher, s).then(p => [s, p], () => [s, null]))));
  const pad = owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const rows = await Promise.all(chains.map(async c => {
    const st = isArcFamily(c.id) ? null : STABLE[c.id]; // Arc's USDC is its native balance; don't count it twice
    const [n, s] = await Promise.allSettled([rpc(fetcher, c.rpc, 'eth_getBalance', [owner, 'latest']),
      st ? rpc(fetcher, c.rpc, 'eth_call', [{ to: st[1], data: '0x70a08231' + pad }, 'latest']) : Promise.resolve(null)]);
    const native = n.status === 'fulfilled' ? units(n.value, 18) : null, stable = st && s.status === 'fulfilled' ? units(s.value, st[2]) : null;
    const price = prices[c.native];
    return { chainId: c.id, name: c.name, icon: c.icon,
      native: { symbol: c.native, amount: native, usd: native != null && price != null ? native * price : null },
      stable: st ? { symbol: st[0], amount: stable, usd: stable } : null,
      error: n.status === 'rejected' || (st && s.status === 'rejected') };
  }));
  const total = rows.reduce((t, r) => t + (r.native.usd || 0) + (r.stable?.usd || 0), 0);
  return { owner: owner.toLowerCase(), at: Date.now(), total, partial: rows.some(r => r.error || (r.native.amount > 0 && r.native.usd == null)), rows };
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
