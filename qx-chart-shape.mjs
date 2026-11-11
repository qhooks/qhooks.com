// Connect traded buckets without adding bars for minutes with no trades.
export function shapeCandles(bars) {
  const shaped = [];
  for (const bar of bars) {
    if (!bar || !['time', 'open', 'high', 'low', 'close', 'volume'].every(key => Number.isFinite(bar[key]))) continue;
    const next = { ...bar }, previous = shaped.at(-1);
    if (previous) {
      next.open = previous.close;
      next.high = Math.max(bar.high, next.open);
      next.low = Math.min(bar.low, next.open);
    }
    shaped.push(next);
  }
  return shaped;
}
