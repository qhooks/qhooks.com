// Outside-token venue facts for the terminal (mktsearch, 2026-11-12). Read-only chain reads; no wallet calls.
// - tokenFacts: is this address an ERC-20 here (symbol() and decimals() both answer)?
// - ponsLaunch: Pons V2 launchpad tokens (Robinhood Chain) trade on their own bonding curve until they graduate to a v4
//   pool. Before that, DexScreener only lists third-party pools (AEON's: a 56.1%-fee pool with $4.56 in it), so the
//   terminal must name the curve instead of quoting one of those. Factory/curve facts verified on-chain 2026-11-12
//   (PonsV2LaunchFactory verified on Sourcify; getLaunchedToken(AEON).curve = 0xe364…8875).
// Robinhood, Elysium and Monad reads go through the site's read relay (/api/rpc/<chain>, display-cached); the rest use
// the chain's public RPC.
import {chainById} from './chains.mjs';

const RELAY = new Set(['4663', '99901', '143']);
const PONS = {'4663': '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e'};
export const hasLaunchpad = chainId => Object.hasOwn(PONS, String(chainId));
export const THIN_LIQUIDITY_USD = 500; // a listed pool under this is not a market: no Buy against it
const SYMBOL = '0x95d89b41', DECIMALS = '0x313ce567', GET_LAUNCHED = '0x3cf28b5a';
const word = (hex, i) => (hex || '').replace(/^0x/, '').slice(i * 64, (i + 1) * 64);
const pad = a => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

async function calls(chainId, list, {fetcher = globalThis.fetch, signal} = {}) {
  chainId = String(chainId);
  const body = list.map(([to, data], i) => ({jsonrpc: '2.0', id: i, method: 'eth_call', params: [{to, data}, 'latest']}));
  if (RELAY.has(chainId)) {
    const r = await fetcher('/api/rpc/' + chainId, {method: 'POST', headers: {'content-type': 'application/json', 'x-qhooks-read-purpose': 'display'}, body: JSON.stringify(body), signal});
    if (!r.ok) throw Error('rpc ' + r.status);
    const out = await r.json(), by = new Map((Array.isArray(out) ? out : [out]).map(x => [x?.id, x]));
    return list.map((_, i) => typeof by.get(i)?.result === 'string' ? by.get(i).result : null);
  }
  const {ethCall} = await import('./qx-chain.mjs');
  return Promise.all(list.map(([to, data]) => ethCall(chainId, to, data).catch(() => null)));
}

export function decodeString(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (!h || /^0*$/.test(h)) return null;
  try {
    let bytes;
    if (h.length >= 128 && BigInt('0x' + h.slice(0, 64)) === 32n) { const n = Number(BigInt('0x' + h.slice(64, 128))); bytes = h.slice(128, 128 + n * 2); }
    else bytes = h.slice(0, 64).replace(/(00)+$/, ''); // bytes32 symbols
    const s = new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) || [], b => parseInt(b, 16))).replace(/[\u0000-\u001f]/g, '').trim();
    return s ? s.slice(0, 24) : null;
  } catch { return null; }
}

/// {symbol, decimals} when the address is an ERC-20 on this chain, else null. Never throws.
export async function tokenFacts(chainId, address, opts = {}) {
  try {
    const [s, d] = await calls(chainId, [[address, SYMBOL], [address, DECIMALS]], opts);
    const symbol = decodeString(s), decimals = d && /^0x[0-9a-f]+$/i.test(d) && d.length > 2 ? Number(BigInt(d)) : null;
    return symbol && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? {symbol, decimals} : null;
  } catch { return null; }
}

/// A Pons V2 launch for this token: {venue:'Pons', curve, graduated, progress (0-1 or null), curveUrl}, or null.
export async function ponsLaunch(chainId, token, opts = {}, prefetched) {
  const factory = PONS[String(chainId)];
  if (!factory || !/^0x[0-9a-f]{40}$/i.test(token || '')) return null;
  try {
    const [rec] = prefetched !== undefined ? [prefetched] : await calls(chainId, [[factory, GET_LAUNCHED + pad(token)]], opts);
    // LaunchedToken (all static): token, curve, deployer, creatorFeeRecipient, pairToken, graduationThreshold, poolFee,
    // tickSpacing, creatorTaxBps, buybackEnabled, phase, sweptQuote, sweptTokens, sweptAt, exists.
    if (!rec || rec.length < 2 + 15 * 64 || BigInt('0x' + word(rec, 14)) !== 1n) return null;
    if ('0x' + word(rec, 0).slice(24) !== token.toLowerCase()) return null;
    const curve = '0x' + word(rec, 1).slice(24);
    // phase (GraduationPhase): 0 NotGraduated (trading on the curve), 1 Swept, 2 PoolCreated, 3 Rescued. One read: the
    // record decides it, so the page doesn't wait on a second round trip for the curve's own state. Progress needs the
    // curve (realQuoteReserve / graduationThreshold) and is left to the curve-trading work.
    const graduated = BigInt('0x' + word(rec, 10)) !== 0n, progress = null;
    const explorer = chainById(String(chainId))?.explorer;
    return {venue: 'Pons', curve, graduated, progress, curveUrl: explorer ? explorer.replace(/\/$/, '') + '/address/' + curve : null};
  } catch { return null; }
}

/// symbol(), decimals() and the launchpad record in one read; the curve's state in a second only for a launchpad token.
/// {symbol, decimals, pons} (symbol null when not an ERC-20 here). Never throws.
export async function outsideFacts(chainId, token, opts = {}) {
  const factory = PONS[String(chainId)];
  try {
    const [s, d, rec] = await calls(chainId, [[token, SYMBOL], [token, DECIMALS], ...(factory ? [[factory, GET_LAUNCHED + pad(token)]] : [])], opts);
    const symbol = decodeString(s), decimals = d && /^0x[0-9a-f]+$/i.test(d) && d.length > 2 ? Number(BigInt(d)) : null;
    return {symbol, decimals, pons: factory && rec ? await ponsLaunch(chainId, token, opts, rec) : null};
  } catch { return {symbol: null, decimals: null, pons: null}; }
}

/// Plain line for an ungraduated curve token while its curve market is refreshing.
export function curveLine(symbol, pons) {
  const pct = pons.progress == null ? '' : ', ' + Math.round(pons.progress * 100) + '% of the way';
  // curves (2026-11-12): the page normally opens a curve token as a full market (qx-curve-market.mjs). This line shows only
  // while that read is refreshing.
  return (symbol || 'This token') + ' trades on a ' + pons.venue + ' bonding curve (not graduated yet' + pct + '). Refreshing its market…';
}
