// Cold price for a QHooks launch page (own-pool or Simple launch). On a cold load the launch index can take a while,
// so the browser reads the pool's spot price itself (Uniswap v4 StateView.getSlot0 on the pool id) and the header
// shows a price at once. The index replaces it as soon as it arrives and the pool read never paints over it again.
export const GET_SLOT0 = '0xc815641c';
const ADDR = /^0x[0-9a-f]{40}$/i, POOL_ID = /^0x[0-9a-f]{64}$/i;
const own = (o, k) => o && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined;
const lower = v => typeof v === 'string' ? v.toLowerCase() : null;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** Pool facts from the /api/markets/:chain/:controller record (own-pool `observation` or Simple `launch`), or null. */
export function coldPoolSpec(record, chain) {
  const pool = own(record, 'pool'), obs = own(record, 'observation'), launch = own(record, 'launch');
  const ctor = own(pool, 'constructor'), key = own(pool, 'key') || own(launch, 'key'), fields = own(pool, 'tokenFields');
  const poolId = [own(pool, 'poolId'), own(obs, 'poolId'), own(launch, 'poolId')].find(v => POOL_ID.test(String(v || '')));
  const c0 = lower(own(key, 'currency0') || own(ctor, 'currency0')), c1 = lower(own(key, 'currency1') || own(ctor, 'currency1'));
  const quote = lower(own(launch, 'quote') || own(obs, 'quote') || own(ctor, 'quote'));
  const token = lower(own(launch, 'token') || own(obs, 'token') || (quote && c0 && c1 ? (c0 === quote ? c1 : c0) : null));
  const view = chain?.contracts?.stateView;
  if (!poolId || !ADDR.test(c0 || '') || !ADDR.test(c1 || '') || !ADDR.test(token || '') || ![c0, c1].includes(token) || !ADDR.test(view || '')) return null;
  const decimals = num(own(launch, 'decimals') ?? own(obs, 'decimals') ?? own(fields, 'decimals'), 18);
  const chainQuote = lower(chain?.quote?.address) === quote ? chain.quote : null;
  const quoteDecimals = num(own(obs, 'quoteDecimals') ?? chainQuote?.decimals, 18);
  const quoteSymbol = own(obs, 'quoteSymbol') || chainQuote?.symbol || (lower(chain?.wrappedNative) === quote ? 'WETH' : null);
  // Raw supply (launch.supply / observation.totalSupply are base units); tokenFields.totalSupply is not consistently scaled.
  const rawSupply = own(launch, 'supply') ?? own(obs, 'totalSupply');
  let supply = null; try { if (rawSupply != null) supply = Number(BigInt(rawSupply)) / 10 ** decimals; } catch {}
  return {
    chainId: String(own(pool, 'chainId') ?? own(launch, 'chainId') ?? chain?.id ?? ''), poolId: poolId.toLowerCase(), stateView: view,
    token, quote, tokenIs0: token === c0, decimals, quoteDecimals, quoteSymbol,
    symbol: own(launch, 'symbol') || own(obs, 'symbol') || own(fields, 'symbol') || null,
    name: own(launch, 'name') || own(obs, 'tokenName') || own(fields, 'tokenName') || null, supply,
  };
}

/** Quote per token (human units) from a getSlot0 return word, or null. sqrtPriceX96² / 2¹⁹² = currency1 per currency0 (raw). */
export function spotFromSlot0(raw, { tokenIs0, decimals = 18, quoteDecimals = 18 }) {
  const word = String(raw || '').replace(/^0x/, '').slice(0, 64);
  if (!/^[0-9a-f]{64}$/i.test(word)) return null;
  const sqrt = BigInt('0x' + word) & ((1n << 160n) - 1n); if (sqrt === 0n) return null;
  const r = (Number(sqrt) / 2 ** 96) ** 2, perToken = tokenIs0 ? r : 1 / r;
  const p = perToken * 10 ** (decimals - quoteDecimals);
  return Number.isFinite(p) && p > 0 ? p : null;
}

const STABLE = /^(USD|USDC|USDT)$/i, ETHISH = /^W?ETH$/i;
/** { price, priceUsd, mcap, mcapUsd, quoteSymbol, observedAt, source:'pool' } or null. Dollars when ETH/USD is known. */
export async function readColdPrice(spec, { rpc, ethUsd, quoteUsd, now = Date.now }) {
  if (!spec) return null;
  const raw = await rpc(spec.chainId, 'eth_call', [{ to: spec.stateView, data: GET_SLOT0 + spec.poolId.slice(2) }, 'latest']);
  const price = spotFromSlot0(raw, spec); if (!price) return null;
  const mcap = spec.supply > 0 ? price * spec.supply : null;
  let usd = STABLE.test(spec.quoteSymbol || '') ? 1 : null;
  if (usd == null && ETHISH.test(spec.quoteSymbol || '') && ethUsd) { const v = await Promise.resolve().then(ethUsd).catch(() => null); usd = Number(v?.usd ?? v) > 0 ? Number(v?.usd ?? v) : null; }
  // Any other quote (WHYPE, WBNB…): the caller's quote price lookup, when given (2026-11-10, quoteusd).
  if (usd == null && quoteUsd) { const v = await Promise.resolve(spec.quoteSymbol).then(quoteUsd).catch(() => null); usd = Number(v) > 0 ? Number(v) : null; }
  return { price, priceUsd: usd ? price * usd : null, mcap, mcapUsd: usd && mcap != null ? mcap * usd : null, quoteSymbol: spec.quoteSymbol, observedAt: now(), source: 'pool' };
}

/**
 * Whether a finished pool read may still paint. Only before the index has painted this same selection: once the
 * index price is on screen, a late pool read must never replace it (no flip-backs).
 */
export const coldMayPaint = ({ revision, current, hasIndexData }) => revision === current && !hasIndexData;

export const COLD_CHART_MESSAGE = 'Loading price history… about a minute';
