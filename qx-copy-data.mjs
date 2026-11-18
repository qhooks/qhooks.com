export const MIN_CLOSED_TRADES = 5;
export const copyWinRate = row => Number.isFinite(row?.closed) && row.closed >= MIN_CLOSED_TRADES && Number.isFinite(row.winRate) ? Math.round(row.winRate * 100) + '%' : '—';
export function lastHourView(body, {now = Date.now(), failed = false} = {}) {
  if (failed || !Number.isFinite(body?.at) || body.at <= 0 || body.at > now + 5000 || now - body.at > 120000 || body.refreshing || !Array.isArray(body?.trades)) return {status: 'Refreshing', message: 'Trades are refreshing. Try again in a moment.', trades: []};
  const end = Math.floor(now / 1000), start = end - 3600;
  const trades = body.trades.filter(t => Number.isFinite(t.ts) && t.ts >= start && t.ts <= end).slice(0,6);
  return {status: 'Live', message: trades.length ? '' : 'No trades in the last hour', trades};
}
// Preserve each sale's actual time instead of imposing twelve identical time buckets.
export function copySparkPoints(series, width = 72, height = 26) {
  const points = (series || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (points.length < 2) return null;
  const lo = Math.min(0,...points.map(p => p[1])), hi = Math.max(0,...points.map(p => p[1])), span = hi-lo || 1;
  const from = points[0][0], duration = Math.max(1,points.at(-1)[0]-from);
  return points.map(([at,value]) => [(at-from)/duration*width, height-2-(value-lo)/span*(height-4)].map(n=>n.toFixed(1)).join(',')).join(' ');
}
export const UNPRICED_TITLE = "Some trades can't be priced yet";
export const copyRowPriced = r => r?.complete === true && Number.isFinite(r.pnlUsd);
// Unpriced traders stay listed (PnL and Win '—'); priced rows first by PnL, then the rest by trade count.
export function copyBoardRows(rows, chains) {
  const own = (rows || []).filter(r => (r.chains || []).some(c => chains.includes(c)));
  const priced = own.filter(copyRowPriced).sort((a, b) => b.pnlUsd - a.pnlUsd);
  const rest = own.filter(r => !copyRowPriced(r)).map(r => ({...r, pnlUsd: null, winRate: null})).sort((a, b) => (b.trades || 0) - (a.trades || 0));
  return [...priced, ...rest];
}
