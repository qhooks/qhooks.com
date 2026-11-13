// Launchpad curves on the terminal's outside-token page (curves, 2026-11-12; Randall on BULW's "Buy it on Pons" line:
// "No I wanna buy it here"). Read-only here: the server route /api/curve/<chain>/<token> (server/curve-market.mjs) says
// where the token trades and the curve's state; this module turns that into the page's header, chart, trades and the
// bonding-progress cell, and gives the ticket a fresh on-chain read for its curve buy quote.
import {hasCurveVenue, curveVenuesFor, ALLOWANCE_HOLDER} from './qx-curve-venues.mjs';
import {SEL, pad, word, big, aggregate3, decodeAggregate3, directBuyQuote} from './qx-curve-core.mjs';

const none = new Set(), stats = new Map();
const key = (chainId, token) => String(chainId) + ':' + String(token).toLowerCase();

/// The curve venue for a token ({phase:'curve'|'graduating'|'pool'|'rescued', …}) or null when it isn't a launchpad token.
export async function readCurve(chainId, token, {fetcher = globalThis.fetch, signal} = {}) {
  const k = key(chainId, token);
  if (String(chainId) === 'solana' || !hasCurveVenue(chainId) || none.has(k)) return null;
  const r = await fetcher('/api/curve/' + k.replace(':', '/'), {cache: 'no-store', signal});
  if (r.status === 404) { none.add(k); return null; }
  if (!r.ok) throw Error('curve_' + r.status);
  const c = await r.json();
  return c && c.token === k.split(':')[1] ? c : null;
}

const SHORT = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
/// The outside-token header (the /api/terminal/x/token shape) for a curve token. `t` is the server's DexScreener header
/// when it has one: its logo and links are kept, but every number comes from the launchpad (DexScreener only sees
/// third-party pools until graduation, AEON's being a 56.1%-fee pool holding $4.56).
export function curveHeader(c, t = null) {
  const s = stats.get(key(c.chainId, c.token)) || {};
  const q = c.quote || {}, phase = c.phase;
  const listed = (t?.pools || []).find(p => String(p.address).toLowerCase() === c.pool?.id);
  const pools = phase === 'curve' ? [{address: c.curve, dex: c.venue.name + ' curve', kind: 'curve', quoteAddress: q.address, quoteSymbol: q.symbol, liquidityUsd: c.raisedUsd ?? null, volume24Usd: s.volumeUsd ?? null}]
    : phase === 'pool' && c.pool?.id ? [{address: c.pool.id, dex: c.venue.name + ' pool', kind: 'pool', quoteAddress: q.address, quoteSymbol: q.symbol, liquidityUsd: listed?.liquidityUsd ?? null, volume24Usd: listed?.volume24Usd ?? null}]
    : [];
  const links = {website: c.links?.website || t?.links?.website || null, x: c.links?.x || t?.links?.x || null, telegram: c.links?.telegram || t?.links?.telegram || null};
  const graduated = phase === 'pool';
  return {chainId: String(c.chainId), address: c.token, symbol: c.symbol || t?.symbol || 'token', name: c.name || t?.name || c.symbol || '',
    logo: t?.logo || c.logo || null, logoURI: t?.logoURI || c.logo || null, decimals: c.decimals ?? 18,
    priceUsd: c.priceUsd ?? (graduated ? t?.priceUsd : null) ?? null, change24: s.change24 ?? (graduated ? t?.change24 : null) ?? null,
    mcapUsd: c.mcapUsd ?? null, fdvUsd: c.mcapUsd ?? null,
    liquidityUsd: phase === 'curve' ? c.raisedUsd ?? null : listed?.liquidityUsd ?? null,
    volume24Usd: s.volumeUsd ?? (graduated ? t?.volume24Usd : null) ?? null, buys24: s.buys ?? null, sells24: s.sells ?? null,
    pools, links, description: c.description || null, source: c.venue.name, observedAt: c.observedAt || Date.now(), stale: false, curve: c};
}

/// Chart and trades from the curve's own events, in the terminal's history shape. Graduated tokens: the curve's history,
/// then the pool's (the caller merges). Null when the route can't answer yet.
export async function curveHistory({chainId, token, tf, signal, fetcher = globalThis.fetch}) {
  try {
    const r = await fetcher('/api/curve/' + String(chainId) + '/' + String(token).toLowerCase() + '/history?tf=' + tf, {cache: 'no-store', signal});
    if (!r.ok) return null;
    const b = await r.json();
    if (!Array.isArray(b?.candles) || !Array.isArray(b?.trades)) return null;
    if (b.stats24) stats.set(key(chainId, token), b.stats24);
    return b;
  } catch { return null; }
}
export const curveStats = (chainId, token) => stats.get(key(chainId, token)) || null;

/// History body → the terminal's data fields (same keys loadExternalHistory returns).
export function curveHistoryData(b, chainId) {
  const trades = b.trades.map(x => ({id: x.tx + ':' + x.index + ':' + (x.wallet || '') + ':' + x.ts, logIndex: x.index, ts: Math.floor(x.ts / 1000), buy: x.side === 'buy',
    price: x.priceUsd ?? x.priceQuote, token: x.amountToken, quote: x.valueUsd ?? x.valueQuote, trader: String(x.wallet || '').toLowerCase(), tx: x.tx, pool: 0}));
  const last = b.trades[0]?.ts || null, lastBar = b.candles.at(-1)?.time ? b.candles.at(-1).time * 1000 : null;
  return {candles: b.candles, trades, tradeCoverage: {scope: 'curve_events', provider: 'QHooks RPC', complete: true},
    marketCoverage: {candles: b.candles.length ? 'available' : 'unavailable', trades: 'available'},
    historyFreshness: {candles: {available: b.candles.length > 0, observedAt: b.observedAt, stale: false, lastEventAt: lastBar}, trades: {available: true, observedAt: b.observedAt, stale: false, lastEventAt: last}},
    curveStats: b.stats24 ? {change24: b.stats24.change24, volume24: b.stats24.volumeUsd, buys24: b.stats24.buys, sells24: b.stats24.sells, trades24: b.stats24.buys + b.stats24.sells} : null};
}

const fmtQ = (v, d) => { const n = Number(BigInt(v || '0')) / 10 ** d; return n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(2); };
/// The bonding-progress stat: "Bonding curve 46% · 1.94 / 4.2 ETH" over a bar. [] when the token is not on a curve.
export function curveStatCells(h, c) {
  if (!c) return [];
  if (c.phase === 'graduating') return [h('div', {class: 'qxt-curve-cell'}, h('dt', {}, 'Bonding curve'), h('dd', {}, 'Complete · moving to its pool'))];
  if (c.phase !== 'curve') return [];
  const pct = Math.max(0, Math.min(100, Math.round((c.progress || 0) * 1000) / 10)), q = c.quote || {};
  const bar = h('span', {class: 'qxt-curve-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Bonding curve progress'}, h('i', {style: 'width:' + pct + '%'}));
  return [h('div', {class: 'qxt-curve-cell', title: 'Graduates to a ' + (q.symbol || '') + ' pool at ' + fmtQ(c.threshold, q.decimals ?? 18) + ' ' + (q.symbol || '') + ' raised'},
    h('dt', {}, 'Bonding curve'), h('dd', {}, pct + '% · ' + fmtQ(c.raised, q.decimals ?? 18) + ' / ' + fmtQ(c.threshold, q.decimals ?? 18) + ' ' + (q.symbol || ''), bar))];
}
/// The plain "where it trades" line under the stats.
export function curveSyncLine(c) {
  const n = c.venue?.name || 'Launchpad';
  if (c.phase === 'curve') return n + ' bonding curve ' + SHORT(c.curve) + ' · buys go straight to the curve, sells via 0x · QHooks router';
  if (c.phase === 'graduating') return n + ' curve complete · its pool opens in a moment';
  if (c.phase === 'pool') return 'Graduated from the ' + n + ' curve · pool ' + SHORT(c.pool?.id) + ' · execution via 0x · QHooks router';
  return n + ' launch closed (rescued) · no trading';
}
/// Ticket text for a phase without a trade route; null when the token can be traded.
export function curveNoRoute(c) {
  if (!c) return null;
  if (c.phase === 'graduating') return 'This curve is complete and moving into its pool. Trading opens in a moment.';
  if (c.phase === 'rescued') return 'This ' + (c.venue?.name || '') + ' launch was rescued and closed. It can no longer be traded.';
  return null;
}

// ---- the ticket's curve buy: a fresh on-chain read (one Multicall3 call), then the shared maths ----
const fresh = new Map();
async function liveCurve(c, router, rpc) {
  const k = c.curve + ':' + router, hit = fresh.get(k);
  if (hit && Date.now() - hit.at < 3000) return hit.value;
  const v = curveVenuesFor(c.chainId)[0];
  const value = (async () => {
    const ret = await rpc(String(c.chainId), 'eth_call', [{to: v.multicall, data: aggregate3([[c.curve, SEL.getReserves], [c.curve, SEL.sellableTokens], [c.curve, SEL.currentSnipeTaxBps + pad(router)], [v.factory, SEL.getLaunchedToken + pad(c.token)]])}, 'latest']);
    const r = decodeAggregate3(ret);
    if (!r[0] || !r[1]) throw Error('curve_read');
    const phase = r[3] ? ['curve', 'graduating', 'pool', 'rescued'][Number(big(word(r[3], 10)))] || 'unknown' : c.phase;
    return {...c, phase, quoteReserve: big(word(r[0], 0)), tokenReserve: big(word(r[0], 1)), sellable: big(word(r[1], 0)), snipe: r[2] ? big(word(r[2], 0)) : 0n};
  })();
  fresh.set(k, {at: Date.now(), value}); value.catch(() => fresh.delete(k));
  return value;
}
/// The direct curve buy through QFeeRouter: a 0x-quote-shaped answer ({buyAmount, minBuyAmount, tx:{to,data}, sources})
/// for the ticket's existing outside-token flow, or an Error with a plain sentence.
export async function curveBuyQuote({c, amountIn, slippageBps, router, feeBps, rpc, formatUnits}) {
  const s = await liveCurve(c, router, rpc);
  if (s.phase !== 'curve') throw Error(curveNoRoute(s) || 'This token has left its curve. Refresh the page to trade it in its pool.');
  const q = directBuyQuote({state: {...s, quote: c.quote, feeBps: c.feeBps, creatorTaxBps: c.creatorTaxBps}, amountIn, routerFeeBps: feeBps, slippageBps, router, allowanceHolder: ALLOWANCE_HOLDER[String(c.chainId)], snipeBps: s.snipe});
  if (q.error === 'finishes_curve') throw Object.assign(Error(q.maxIn > 0n ? 'The curve has room for about ' + formatUnits(q.maxIn, 18, 4) + ' ' + (c.quote?.symbol || 'ETH') + ' more. Buy that or less here.' : 'The curve is full. It moves into its pool in a moment.'), {maxIn: q.maxIn});
  if (q.error) throw Error(q.error === 'too_small' ? 'Amount too small for the curve.' : 'No route on the curve right now.');
  return q;
}
/// Curve fee line for the quote (the launchpad's own fee and the creator's tax, both fixed at launch).
export const curveFeeText = c => c ? (c.venue?.name || 'Curve') + ' fee ' + ((c.feeBps + c.creatorTaxBps) / 100).toFixed(c.creatorTaxBps % 100 || c.feeBps % 100 ? 1 : 0) + '% (protocol ' + (c.feeBps / 100) + '% + creator ' + (c.creatorTaxBps / 100) + '%)' : '';
