// QHooks own-pool markets whose index is catching up (2026-11-11): the header price and chart come from the same
// DexScreener pair read the terminal uses for outside tokens, until the index is within 300 blocks again.
// Read-only. One DexScreener read per token per 20 s at most, and only while the market view is already polling.
import { fetchDexPairs, pickPair } from './qx-dex-live.mjs';

export const BEHIND_BLOCKS = 300, QUIET_MS = 180000, PAIR_TTL_MS = 20000;
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const lower = v => String(v || '').toLowerCase();

// Behind by more than 300 blocks, or the index has not synced this market for over 3 minutes while not at the head.
export function ownIndexBehind(data, now = Date.now()) {
  if (!data || data.ext || !data.synced) return false;
  const behind = num(data.synced.behind), at = num(data.synced.at);
  if (behind !== null && behind > BEHIND_BLOCKS) return true;
  return at !== null && at > 0 && now - at > QUIET_MS && (behind > 0 || data.stale === true);
}

const launchPool = data => data?.meta?.pools?.find(p => p.label === 'launch') || data?.meta?.pools?.[0] || null;

// Selection in the shape qx-provider-chart.mjs takes. Provider candles start at one minute.
export function ownProviderSelection(data) {
  const m = data?.meta, pool = launchPool(data);
  if (!m || !pool?.id) return null;
  const tf = Number(data.tf) || 60;
  return { chainId: String(m.chainId), token: lower(m.token), pool: lower(pool.id), quote: lower(pool.quote || m.quote), asset: m.symbol, tf: tf < 60 ? 60 : tf };
}

// Header fields from the pair. The quote-token price is used only when the pair's quote is this launch's quote token.
export function applyProviderPrice(data, pair) {
  const s = data?.summary, usd = num(pair?.priceUsd);
  if (!s || !(usd > 0)) return false;
  const pool = launchPool(data), quote = lower(pool?.quote || data.meta?.quote);
  const native = lower(pair.quoteToken?.address) === quote ? num(pair.priceNative) : null;
  const quoteUsd = num(data.nativeQuote?.usd);
  const supply = num(s.supply ?? data.meta?.supply);
  s.priceUsd = usd;
  if (native > 0) s.price = native; else if (quoteUsd > 0) s.price = usd / quoteUsd;
  if (supply > 0) { s.mcapUsd = usd * supply; if (num(s.price) > 0) s.mcap = s.price * supply; }
  const change = num(pair.priceChange?.h24);
  if (change !== null) s.change24 = change / 100;
  s.priceFromProvider = true; s.priceFromPool = false;
  return true;
}

const cache = new Map(), inflight = new Map();
const keyOf = data => String(data?.meta?.chainId) + ':' + lower(data?.meta?.token);

// The last pair read for this token, if under 20 s old.
export function cachedPair(data, now = Date.now()) {
  const hit = cache.get(keyOf(data));
  return hit && now - hit.at < PAIR_TTL_MS ? hit.pair : null;
}

// Reads the pair when the cached one is older than 20 s. Resolves null when nothing new was read.
export function refreshPair(data, { fetcher, now = Date.now } = {}) {
  const key = keyOf(data), hit = cache.get(key);
  if (hit && now() - hit.at < PAIR_TTL_MS) return Promise.resolve(null);
  if (inflight.has(key)) return inflight.get(key);
  const sel = ownProviderSelection(data);
  if (!sel) return Promise.resolve(null);
  const run = fetchDexPairs(sel.chainId, [sel.token], fetcher ? { fetcher } : {})
    .then(pairs => { const pair = pickPair(pairs, sel.chainId, sel.token, sel.pool); if (pair) cache.set(key, { pair, at: now() }); return pair; })
    .catch(() => null).finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

export function clearPairCache() { cache.clear(); inflight.clear(); }
