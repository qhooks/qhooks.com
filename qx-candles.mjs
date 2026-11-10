// Candles for the terminal's charts (2026-11-10). Read-only; no wallet calls.
// Order: our own feed /api/candles (QHooks index for launches; on-chain pool swaps for outside v4 pools on Robinhood and
// Elysium), then — for the open-source native chart only — GeckoTerminal OHLCV read by the visitor's browser.
// The TradingView Advanced Charts adapter (qx-tv-datafeed.mjs) calls this with browser:false: its license requires our
// own market data feed.
export const TFS = Object.freeze([60, 300, 900, 3600, 14400, 86400]);
const GECKO_NET = {'8453': 'base', '1': 'eth', '42161': 'arbitrum', '56': 'bsc', '4663': 'robinhood', '99901': 'elysium', solana: 'solana'};
const GECKO_TF = {60: ['minute', 1], 300: ['minute', 5], 900: ['minute', 15], 3600: ['hour', 1], 14400: ['hour', 4], 86400: ['day', 1]};
const finite = v => typeof v === 'number' && Number.isFinite(v);
const clean = bars => bars.filter(b => b && finite(b.time) && [b.open, b.high, b.low, b.close].every(v => finite(v) && v > 0)).sort((a, b) => a.time - b.time)
  .filter((b, i, all) => i === 0 || b.time !== all[i - 1].time);

/// Our own feed. Returns {bars, unit, source} or null (not indexed / refreshing).
export async function serverBars({chainId, controller, pool, token, quote, tf, from, to, signal, fetcher = globalThis.fetch}) {
  const q = new URLSearchParams({chain: String(chainId), tf: String(tf)});
  if (controller) q.set('controller', String(controller).toLowerCase());
  else { if (!pool || !token || !quote) return null; q.set('pool', String(pool).toLowerCase()); q.set('token', String(token).toLowerCase()); q.set('quote', String(quote).toLowerCase()); }
  if (finite(from)) q.set('from', String(Math.floor(from))); if (finite(to)) q.set('to', String(Math.floor(to)));
  try {
    const r = await fetcher('/api/candles?' + q, {cache: 'no-store', signal});
    if (!r.ok) return null;
    const b = await r.json();
    return b?.version === 1 && Array.isArray(b.bars) ? {bars: clean(b.bars), unit: b.unit || null, source: b.source || 'QHooks', earliest: b.earliest ?? null} : null;
  } catch (e) { if (signal?.aborted) throw e; return null; }
}

/// GeckoTerminal OHLCV from the visitor's browser (CORS *). Native chart only.
export async function browserBars({chainId, pool, tf, signal, fetcher = globalThis.fetch}) {
  const net = GECKO_NET[String(chainId)], [unit, aggregate] = GECKO_TF[tf] || [];
  if (!net || !unit || !pool) return null;
  try {
    const r = await fetcher(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${chainId === 'solana' ? pool : String(pool).toLowerCase()}/ohlcv/${unit}?aggregate=${aggregate}&limit=300&currency=usd&token=base`,
      {headers: {accept: 'application/json'}, credentials: 'omit', referrerPolicy: 'no-referrer', signal});
    if (!r.ok) return null;
    const list = (await r.json())?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(list)) return null;
    return {bars: clean(list.map(([t, o, h, l, c, v]) => ({time: Number(t), open: Number(o), high: Number(h), low: Number(l), close: Number(c), volume: Number(v) || 0}))), unit: 'USD', source: 'GeckoTerminal'};
  } catch (e) { if (signal?.aborted) throw e; return null; }
}

/// Best available bars for one market and timeframe. browser:false → our own feed only.
export async function loadBars(sel, {browser = true} = {}) {
  const own = await serverBars(sel);
  if (own?.bars.length || !browser) return own;
  return (await browserBars(sel)) || own;
}
