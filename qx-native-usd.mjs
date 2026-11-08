// ETH/USD in the browser for launch pages (lead, launch night 2026-11-07). When the launch index has no dated
// ETH/USD sample (our server-side native price source is being refused), the terminal reads a keyless public spot
// price itself: Coinbase spot first, DexScreener's mainnet WETH price as the fallback. No keys, nothing stored.
// The values are marked source:'browser' and use the current price for every row shown.
const TTL = 60000, TIMEOUT = 3500;
const WETH_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
let cache = null, inflight = null;

const timed = (url) => fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT)});
async function coinbase() {
  const j = await (await timed('https://api.coinbase.com/v2/prices/ETH-USD/spot')).json();
  const v = Number(j?.data?.amount); if (!(v > 0)) throw Error('no price'); return v;
}
async function dexscreener() {
  const rows = await (await timed('https://api.dexscreener.com/tokens/v1/ethereum/' + WETH_MAINNET)).json();
  const best = (Array.isArray(rows) ? rows : []).filter(p => p?.baseToken?.address?.toLowerCase() === WETH_MAINNET.toLowerCase() && Number(p.priceUsd) > 0)
    .sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0))[0];
  const v = Number(best?.priceUsd); if (!(v > 0)) throw Error('no price'); return v;
}
/** { usd, observedAt, source } or null. Cached for a minute; one request in flight at a time. */
export async function ethUsd(now = Date.now()) {
  if (cache && now - cache.observedAt < TTL) return cache;
  inflight ||= (async () => {
    for (const [source, read] of [['coinbase', coinbase], ['dexscreener', dexscreener]]) {
      try { const usd = await read(); return (cache = {usd, observedAt: Date.now(), source}); } catch {}
    }
    return cache; // last good value (may be null)
  })().finally(() => { inflight = null; });
  return inflight;
}
const finite = v => typeof v === 'number' && Number.isFinite(v);
/** Fill dollar values on a launch-index response that came back without ETH/USD. Returns the same object. */
export async function fillNativeUsd(data, read = ethUsd) {
  const q = data?.nativeQuote;
  if (!q || q.symbol !== 'ETH' || (finite(q.usd) && q.usd > 0)) return data;
  const p = await read().catch(() => null); if (!p?.usd) return data;
  const usd = p.usd;
  data.nativeQuote = {...q, usd, observedAt: p.observedAt, source: 'browser:' + p.source};
  const s = data.summary;
  if (s) {
    if (!finite(s.priceUsd) && finite(s.price)) s.priceUsd = s.price * usd;
    if (!finite(s.mcapUsd) && finite(s.mcap)) s.mcapUsd = s.mcap * usd;
    if (!finite(s.volume24Usd) && finite(s.volume24)) s.volume24Usd = s.volume24 * usd;
  }
  if (Array.isArray(data.trades)) data.trades = data.trades.map(t => finite(t.valueUsd) ? t : {...t, quoteUsd: usd, usdObservedAt: p.observedAt,
    valueUsd: finite(t.quote) ? t.quote * usd : null, priceUsd: finite(t.price) ? t.price * usd : null});
  return data;
}
