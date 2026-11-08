// Live market numbers read by the visitor's own browser from DexScreener's public API (CORS *),
// so the shared server egress rate limit never freezes a visible page. Read-only; no wallet calls.
// The server copy stays the first paint and the fallback.
export const DEX_CHAINS = Object.freeze({ '8453': 'base', '1': 'ethereum', '42161': 'arbitrum', '56': 'bsc', '4663': 'robinhood', solana: 'solana' });
const API = 'https://api.dexscreener.com/tokens/v1/';
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const frac = v => { const n = num(v); return n === null ? null : n / 100; };
const lower = (chainId, a) => chainId === 'solana' ? String(a || '') : String(a || '').toLowerCase();

let blockedUntil = 0, backoffMs = 0;
export function liveBackoff() { return { blockedUntil, backoffMs }; }
export function resetLiveBackoff() { blockedUntil = 0; backoffMs = 0; }

// One request for up to 30 addresses on one chain. Returns raw pairs, or null when skipped/failed.
export async function fetchDexPairs(chainId, addresses, { fetcher = globalThis.fetch, now = Date.now } = {}) {
  const chain = DEX_CHAINS[String(chainId)], list = [...new Set(addresses.map(a => lower(chainId, a)).filter(Boolean))].slice(0, 30);
  if (!chain || !list.length || now() < blockedUntil) return null;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
  try {
    const r = await fetcher(API + chain + '/' + list.join(','), { headers: { accept: 'application/json' }, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (r.status === 429 || r.status >= 500) { backoffMs = Math.min(backoffMs ? backoffMs * 2 : 30000, 240000); blockedUntil = now() + backoffMs; return null; }
    if (!r.ok) return null;
    const body = await r.json();
    backoffMs = 0;
    return Array.isArray(body) ? body : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// The pair for this token: the same pool when known, otherwise the deepest pool where it is the base token.
export function pickPair(pairs, chainId, token, pool) {
  const t = lower(chainId, token), p = pool ? lower(chainId, pool) : null;
  const mine = (pairs || []).filter(x => lower(chainId, x?.baseToken?.address) === t);
  return (p && mine.find(x => lower(chainId, x.pairAddress) === p)) || mine.sort((a, b) => (num(b.liquidity?.usd) ?? -1) - (num(a.liquidity?.usd) ?? -1))[0] || null;
}

// Fields in the shape the terminal header (/x/token) uses.
export function headerPatch(pair, at = Date.now()) {
  if (!pair || num(pair.priceUsd) === null) return null;
  return { priceUsd: num(pair.priceUsd), priceNative: num(pair.priceNative), change24: frac(pair.priceChange?.h24), mcapUsd: num(pair.marketCap) ?? num(pair.fdv), fdvUsd: num(pair.fdv),
    liquidityUsd: num(pair.liquidity?.usd), volume24Usd: num(pair.volume?.h24), buys24: num(pair.txns?.h24?.buys), sells24: num(pair.txns?.h24?.sells), observedAt: at, stale: false, source: 'DexScreener', live: true };
}

// Fields in the shape the token list (feed rows) uses.
export function rowPatch(pair, at = Date.now()) {
  if (!pair || num(pair.priceUsd) === null) return null;
  const windows = ['m5', 'h1', 'h6', 'h24'];
  return { priceUsd: num(pair.priceUsd), liquidityUsd: num(pair.liquidity?.usd), marketCapUsd: num(pair.marketCap) ?? num(pair.fdv), fdvUsd: num(pair.fdv),
    change: Object.fromEntries(windows.map(w => [w, frac(pair.priceChange?.[w])])), volumeUsd: Object.fromEntries(windows.map(w => [w, num(pair.volume?.[w])])),
    txns: Object.fromEntries(windows.map(w => [w, { buys: num(pair.txns?.[w]?.buys), sells: num(pair.txns?.[w]?.sells) }])), observedAt: at, stale: false, live: true };
}

// Merge a row patch without dropping windows the server had and DexScreener lacks.
export function applyRowPatch(row, patch) {
  if (!patch) return row;
  const keep = (a, b) => Object.fromEntries(Object.keys({ ...a, ...b }).map(k => [k, b?.[k] ?? a?.[k] ?? null]));
  return { ...row, ...patch, change: keep(row.change, patch.change), volumeUsd: keep(row.volumeUsd, patch.volumeUsd), txns: { ...(row.txns || {}), ...Object.fromEntries(Object.entries(patch.txns).filter(([, v]) => v.buys !== null)) } };
}
