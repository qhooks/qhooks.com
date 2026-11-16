// Launchpad curves on the terminal's outside-token page (curves, 2026-11-12; Randall on BULW's "Buy it on Pons" line:
// "No I wanna buy it here"). Read-only here: the server route /api/curve/<chain>/<token> (server/curve-market.mjs) says
// where the token trades and the curve's state; this module turns that into the page's header, chart, trades and the
// bonding-progress cell, and gives the ticket a fresh on-chain read for its curve buy quote.
import {hasCurveVenue, curveVenuesFor, ALLOWANCE_HOLDER} from './qx-curve-venues.mjs';
import {SEL, pad, word, big, aggregate3, decodeAggregate3, directBuyQuote} from './qx-curve-core.mjs';

const none = new Map(), stats = new Map();
const key = (chainId, token) => String(chainId) + ':' + (String(chainId) === 'solana' ? String(token) : String(token).toLowerCase()); // Solana mints are case-sensitive

/// The curve venue for a token ({phase:'curve'|'graduating'|'pool'|'rescued', …}) or null when it isn't a launchpad token.
export async function readCurve(chainId, token, {fetcher = globalThis.fetch, signal} = {}) {
  const k = key(chainId, token);
  if (!hasCurveVenue(chainId) || (none.get(k) || 0) > Date.now()) return null;
  none.delete(k);
  const r = await fetcher('/api/curve/' + k.replace(':', '/'), {cache: 'no-store', signal});
  if (r.status === 404) { none.set(k, Date.now() + 60000); if (none.size > 400) none.delete(none.keys().next().value); return null; }
  if (!r.ok) throw Error('curve_' + r.status);
  const c = await r.json();
  return c && c.token === k.split(':')[1] && String(c.chainId) === String(chainId) ? c : null;
}

const SHORT = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
/// The outside-token header (the /api/terminal/x/token shape) for a curve token. `t` is the server's DexScreener header
/// when it has one: its logo and links are kept, but every number comes from the launchpad (DexScreener only sees
/// third-party pools until graduation, AEON's being a 56.1%-fee pool holding $4.56).
export function curveHeader(c, t = null) {
  const s = stats.get(key(c.chainId, c.token)) || {};
  const q = c.quote || {}, phase = c.phase;
  const same = (a, b) => c.chainId === 'solana' ? String(a) === String(b) : String(a).toLowerCase() === String(b).toLowerCase();
  // The curve's "pool" is the address its chart and trades are keyed by: the curve itself, or (four.meme) the token, which
  // GeckoTerminal lists as the curve's pool. Once graduated, the launchpad's own pool: a v4 pool id or a v2 pair address.
  const poolAddr = c.pool?.id || c.pool?.address || null;
  const pools = phase === 'curve' ? [{address: c.history === 'pool' && c.historyPool ? c.historyPool : c.curve, dex: c.venue.name + ' curve', kind: 'curve', quoteAddress: q.address, quoteSymbol: q.symbol, liquidityUsd: c.raisedUsd ?? null, volume24Usd: s.volumeUsd ?? null}]
    : phase === 'pool' && poolAddr ? [{address: poolAddr, dex: c.venue.name + ' pool', kind: 'pool', quoteAddress: q.address, quoteSymbol: q.symbol, liquidityUsd: (t?.pools || []).find(p => same(p.address, poolAddr))?.liquidityUsd ?? null, volume24Usd: null}]
    : [];
  const links = {website: c.links?.website || t?.links?.website || null, x: c.links?.x || t?.links?.x || null, telegram: c.links?.telegram || t?.links?.telegram || null};
  // DexScreener lists some curves as a pseudo-pair of their own (four.meme "fourmeme", flap "flapsh"): its 24h numbers are the
  // curve's, so they stand in until the curve's own trades are read. Any other pair's numbers are a third-party pool's.
  const ownPair = c.chainId === 'solana'
    ? !!t?.pools?.[0]?.address && same(t.pools[0].address, phase === 'pool' ? poolAddr : c.historyPool || c.curve)
    : (t?.pools || []).some(p => new RegExp(c.venue?.source || '^$', 'i').test(String(p.dex || '').replace(/sh$/, '')));
  const graduated = c.chainId === 'solana' ? ownPair : phase === 'pool' || ownPair;
  return {chainId: String(c.chainId), address: c.token, symbol: c.symbol || t?.symbol || 'token', name: c.name || t?.name || c.symbol || '',
    logo: t?.logo || c.logo || null, logoURI: t?.logoURI || c.logo || null, decimals: c.decimals ?? 18,
    priceUsd: c.priceUsd ?? (graduated ? t?.priceUsd : null) ?? null, change24: s.change24 ?? (graduated ? t?.change24 : null) ?? null,
    mcapUsd: c.mcapUsd ?? null, fdvUsd: c.mcapUsd ?? null,
    liquidityUsd: phase === 'curve' ? c.raisedUsd ?? null : pools[0]?.liquidityUsd ?? null,
    volume24Usd: s.volumeUsd ?? (graduated ? t?.volume24Usd : null) ?? null, buys24: s.buys ?? null, sells24: s.sells ?? null,
    pools, links, description: c.description || null, source: c.venue.name, observedAt: c.observedAt || Date.now(), stale: false, curve: c};
}

/// Chart and trades from the curve's own events, in the terminal's history shape. Graduated tokens: the curve's history,
/// then the pool's (the caller merges). Null when the route can't answer yet.
export async function curveHistory({chainId, token, tf, signal, fetcher = globalThis.fetch}) {
  try {
    const r = await fetcher('/api/curve/' + key(chainId, token).replace(':', '/') + '/history?tf=' + tf, {cache: 'no-store', signal});
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
  if (c.progress == null) return [h('div', {class: 'qxt-curve-cell'}, h('dt', {}, 'Bonding curve'), h('dd', {}, c.progressTitle || 'Progress unavailable'))];
  const pct = Math.max(0, Math.min(100, Math.round((c.progress || 0) * 1000) / 10)), q = c.quote || {};
  const label = c.progress > 0 && pct === 0 ? '<0.1' : String(pct);
  const text = c.progressText || (label + '% · ' + fmtQ(c.raised, q.decimals ?? 18) + ' / ' + fmtQ(c.threshold, q.decimals ?? 18) + ' ' + (q.symbol || ''));
  const bar = h('span', {class: 'qxt-curve-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-valuetext': text, 'aria-label': 'Bonding curve progress'}, h('i', {style: 'width:' + pct + '%'}));
  return [h('div', {class: 'qxt-curve-cell', title: c.progressTitle || 'Graduates to a ' + (q.symbol || '') + ' pool at ' + fmtQ(c.threshold, q.decimals ?? 18) + ' ' + (q.symbol || '') + ' raised'},
    h('dt', {}, 'Bonding curve'), h('dd', {}, text, bar))];
}
/// The plain "where it trades" line under the stats.
export function curveSyncLine(c) {
  const n = c.venue?.name || 'Launchpad';
  const suffix = c.chainId === 'solana' ? '' : ' · QHooks router';
  if (c.phase === 'curve') return n + ' bonding curve ' + SHORT(c.curve) + ' · ' + (c.venue?.buy === 'direct' ? 'buys go straight to the curve, sells via 0x' : 'trades through the curve via ' + (c.venue?.via || '0x')) + suffix;
  if (c.phase === 'graduating') return n + ' curve complete · its pool opens in a moment';
  if (c.phase === 'pool') return 'Graduated from the ' + n + ' curve · pool ' + SHORT(c.pool?.id || c.pool?.address) + ' · execution via ' + (c.venue?.via || '0x') + suffix;
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
export const curveFeeText = c => {
  if (!c) return '';
  const n = c.venue?.name || 'Curve', pct = b => (b / 100).toFixed(b % 100 ? 1 : 0) + '%';
  if (c.feeBps == null) return n + ' fees included in the quote';
  if (c.creatorTaxBps) return n + ' fee ' + pct(c.feeBps + c.creatorTaxBps) + ' (protocol ' + (c.feeBps / 100) + '% + creator ' + (c.creatorTaxBps / 100) + '%)';
  const tax = c.taxBps && (c.taxBps.buy || c.taxBps.sell) ? ' + token tax ' + pct(c.taxBps.buy || 0) + ' buy / ' + pct(c.taxBps.sell || 0) + ' sell' : '';
  return n + ' fee ' + pct(c.feeBps || 0) + tax;
};
/// A 0x quote for a buy on a curve must come through that curve, and must not take more tokens than the curve has left
/// before graduation (the curve would fill part of it and hand the rest back to 0x). Returns a plain sentence or null.
export function curveQuoteProblem(c, q, side) {
  if (!c || c.phase !== 'curve') return null;
  const src = new RegExp(c.venue?.source || '^$', 'i');
  if (!(q?.sources || []).some(x => src.test(String(x)))) return 'No route through the curve for this trade right now.';
  if (side === 'buy' && c.tokensLeft != null && BigInt(q.buyAmount || 0) * 1000n > BigInt(c.tokensLeft) * 999n)
    return 'This buy would finish the curve. Buy a smaller amount; the rest of the curve fills at graduation.';
  return null;
}
