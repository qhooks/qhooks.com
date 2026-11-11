// Exact-pool observations only. Empty intervals are not invented trades.
export const SWAP_TIMEFRAMES = Object.freeze([1, 60, 300, 900, 3600, 14400, 86400]);
export function swapCandles(swaps = [], tf = 60) {
  if (!SWAP_TIMEFRAMES.includes(Number(tf))) throw Error('invalid_timeframe');
  const bars = new Map();
  const ordered = swaps.filter(t => Number.isFinite(t.ts) && t.ts >= 0 && Number.isFinite(t.price) && t.price > 0)
    .slice().sort((a,b) => a.ts-b.ts || (a.block||0)-(b.block||0) || (a.idx||0)-(b.idx||0));
  for (const t of ordered) {
    const time = Math.floor(t.ts / tf) * tf, volume = Number.isFinite(t.quote ?? t.volume) ? Math.max(0, t.quote ?? t.volume) : 0;
    const bar = bars.get(time);
    if (!bar) bars.set(time, {time, open:t.price, high:t.price, low:t.price, close:t.price, volume});
    else { bar.high=Math.max(bar.high,t.price); bar.low=Math.min(bar.low,t.price); bar.close=t.price; bar.volume+=volume; }
  }
  return [...bars.values()];
}
// Locally indexed complete buckets take precedence over short provider history.
export function mergeSwapCandles(provider = [], indexed = []) {
  const map = new Map(provider.filter(b => Number.isFinite(b?.time)).map(b => [b.time,b]));
  for (const b of indexed) map.set(b.time,b);
  return [...map.values()].sort((a,b)=>a.time-b.time);
}
