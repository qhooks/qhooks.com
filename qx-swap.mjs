// Swaps through a launch pool and its hook with the chain's Universal Router: exact-in single-pool
// trades paid from an ERC-20 (via Permit2), and buys paid in the native coin (wrapped first, or routed
// native → USDC → token). Quotes run through the same pool and hook, so block charges are included.
import { abi, calldata, ethCall, words, keyTuple, KEY_T, send, ensureAllowance, connectedAddress, NATIVE, MANAGER } from '/qx-chain.mjs';
import { stockPair } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import {bestPool,bestSellPool,sellPoolCandidates,directPoolPlan,poolQuoteInfo,sellQuoteUsd,nativePoolPlans,poolQuoteArgs} from './qx-best-pool.mjs';
import {chainById} from './chains.mjs';
import { chainMap } from '/chains.mjs';

const Z = '0x0000000000000000000000000000000000000000';
export const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
// extended: this router's single-pool swap takes an extra uint256 (Robinhood Chain and Arc deployments).
// hop: native coin is routed through USDC; wrap: the launch is quoted in the wrapped native coin.
// From the registry (chains.mjs): hop = USDC-quoted chains route the native coin through USDC; wrap = quoted in
// the wrapped native coin; extended = the router's single-pool swap takes an extra word.
export const ROUTES = chainMap(c => Object.assign({ router: c.contracts.router, quoter: c.contracts.quoter },
  c.quote.wrapNative ? { wrap: c.quote.address } : c.family !== 'arc' && c.quote.symbol === 'USDC' ? { hop: c.quote.address } : {},
  c.contracts.extended ? { extended: true } : {}));
const TIERS = [[500, 10], [3000, 60], [100, 1]];
// Stock-paired launches on Robinhood Chain: the coin goes ETH → USDG → stock → token, through the deepest plain v4
// pools (no hooks) for the first two hops.
const STOCK_ROUTE = { '4663': { usdg: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', ethTiers: [[100, 1], [500, 10]], stockTiers: [[3000, 60], [100, 1], [10000, 200]] } };
const PATH_T = '(address,uint24,int24,address,bytes)';
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002';

/// Blocks pools credit the referrer kept from a ?ref= link; other pools get empty hook data.
export function hookData(key) {
  try {
    const ref = localStorage.getItem('qhooks:referrer:v1') || savedReferrer(); // a launch's referral block credits the same referrer
    if (ref && /^0x[0-9a-f]{40}$/.test(ref) && (BigInt(key.hooks) & 16383n) === 10956n) return '0x' + ref.slice(2).padStart(64, '0');
  } catch {}
  return '0x';
}

/// What `amountIn` of one side of `key` buys of the other, through the pool and its hook.
export async function quoteSingle(chainId, key, zeroForOne, amountIn) {
  const r = await ethCall(chainId, ROUTES[chainId].quoter, calldata('0xaa9d21cb', [`(${KEY_T},bool,uint128,bytes)`], [[keyTuple(key), zeroForOne, amountIn, hookData(key)]]), connectedAddress() || undefined);
  return BigInt(r.slice(0, 66));
}

function singleParams(chainId, key, zeroForOne, amountIn, minOut) {
  return ROUTES[chainId].extended
    ? abi([`(${KEY_T},bool,uint128,uint128,uint256,bytes)`], [[keyTuple(key), zeroForOne, amountIn, minOut, 0n, hookData(key)]])
    : abi([`(${KEY_T},bool,uint128,uint128,bytes)`], [[keyTuple(key), zeroForOne, amountIn, minOut, hookData(key)]]);
}

/// Router calldata for an exact-in single-pool swap paid from an ERC-20 the router pulls through Permit2.
export function singleSwapCall(chainId, key, zeroForOne, amountIn, minOut, deadline) {
  const [cin, cout] = zeroForOne ? [key.currency0, key.currency1] : [key.currency1, key.currency0];
  const v4 = abi(['bytes', 'bytes[]'], ['0x060c0f', [singleParams(chainId, key, zeroForOne, amountIn, minOut), abi(['address', 'uint256'], [cin, amountIn]), abi(['address', 'uint256'], [cout, minOut])]]);
  return calldata('0x3593564c', ['bytes', 'bytes[]', 'uint256'], ['0x10', [v4], deadline]);
}

/// Lets the router pull `amount` of `token` through Permit2, asking only for what is missing.
export async function ensurePermit2(chainId, token, amount, now, onStatus) {
  const router = ROUTES[chainId].router, me = connectedAddress();
  await ensureAllowance(chainId, token, PERMIT2, amount, onStatus);
  const allowed = words(await ethCall(chainId, PERMIT2, calldata('0x927da105', ['address', 'address', 'address'], [me, token, router])));
  if (allowed[0] < amount || Number(allowed[1]) < Number(now) + 600) {
    onStatus?.('Allow the router in your wallet…');
    await send(chainId, { to: PERMIT2, data: calldata('0x87517c45', ['address', 'address', 'uint160', 'uint48'], [token, router, amount, now + 3600n]) }, onStatus);
  }
}

/// Whether this launch can be bought with the chain's native coin in one transaction.
export function nativeRoute(chainId, quoteToken) {
  const route = ROUTES[chainId];
  if (route && STOCK_ROUTE[chainId] && stockPair(chainId, quoteToken)) return { ...route, wrap: null, stock: quoteToken, ...STOCK_ROUTE[chainId] };
  // USDG-paired launches on Robinhood Chain: the coin goes ETH → USDG (best plain pool) → token.
  if (route && STOCK_ROUTE[chainId] && String(quoteToken).toLowerCase() === STOCK_ROUTE[chainId].usdg) return { ...route, wrap: null, hop: STOCK_ROUTE[chainId].usdg, hopSymbol: 'USDG', usdg: true };
  if (route && (route.hop || route.wrap) === quoteToken) return route;
  const c = chainById(chainId), q = String(quoteToken).toLowerCase();
  if (route && c?.wrappedNative?.toLowerCase() === q) return {...route, hop: null, wrap: quoteToken};
  if (route && String(chainId) === '56' && q === '0x55d398326f99059ff775485246999027b3197955') return {...route, wrap: null, hop: quoteToken, hopSymbol: 'USDT'};
  return route && (route.hop || route.wrap) === quoteToken ? route : null;
}
const plainKey = (a, b, fee, tickSpacing) => { const [c0, c1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a]; return { currency0: c0, currency1: c1, fee, tickSpacing, hooks: Z }; };

/// Best native-coin route into `token`: wrap then the launch pool, or native → USDC (best fee tier) → launch pool.
export async function quoteNative(chainId, key, token, quoteToken, amountIn, symbol) {
  const route = nativeRoute(chainId, quoteToken), from = connectedAddress() || undefined, data = hookData(key);
  if (route.stock) {
    const stock = stockPair(chainId, route.stock);
    const tries = await Promise.all(route.ethTiers.flatMap(([f1, t1]) => route.stockTiers.map(async ([f2, t2]) => {
      const path = [[route.usdg, f1, t1, Z, '0x'], [route.stock, f2, t2, Z, '0x'], [token, key.fee, key.tickSpacing, key.hooks, data]];
      try { const r = await ethCall(chainId, route.quoter, calldata('0xca253dc9', [`(address,${PATH_T}[],uint128)`], [[Z, path, amountIn]]), from); return { out: BigInt(r.slice(0, 66)), path }; }
      catch { return null; }
    })));
    const best = tries.filter(Boolean).sort((a, b) => (b.out > a.out ? 1 : -1))[0];
    if (!best) throw new Error('No route for this amount');
    return { out: best.out, path: best.path, label: NATIVE[chainId] + ' → USDG → ' + stock.symbol + ' → ' + symbol };
  }
  if (route.wrap) {
    const out = await quoteSingle(chainId, key, key.currency0 === quoteToken, amountIn);
    return { out, label: NATIVE[chainId] + ' → W' + NATIVE[chainId] + ' → ' + symbol };
  }
  const tries = await Promise.all(TIERS.map(async ([fee, ts]) => {
    const path = [[route.hop, fee, ts, Z, '0x'], [token, key.fee, key.tickSpacing, key.hooks, data]];
    try { const r = await ethCall(chainId, route.quoter, calldata('0xca253dc9', [`(address,${PATH_T}[],uint128)`], [[Z, path, amountIn]]), from); return { out: BigInt(r.slice(0, 66)), fee, path }; }
    catch { return null; }
  }));
  const best = tries.filter(Boolean).sort((a, b) => (b.out > a.out ? 1 : -1))[0];
  if (!best) throw new Error('No route for this amount');
  return { out: best.out, path: best.path, label: NATIVE[chainId] + ' → ' + (route.hopSymbol || 'USDC') + ' (' + best.fee / 10000 + '% pool) → ' + symbol };
}

/// Router calldata for a native-coin buy; send it with value = amountIn.
export function nativeSwapCall(chainId, key, token, quoteToken, amountIn, minOut, q, deadline) {
  const route = nativeRoute(chainId, quoteToken);
  if (route.wrap) {
    const v4 = abi(['bytes', 'bytes[]'], ['0x060b0f', [singleParams(chainId, key, key.currency0 === quoteToken, amountIn, minOut), abi(['address', 'uint256', 'bool'], [route.wrap, amountIn, false]), abi(['address', 'uint256'], [token, minOut])]]);
    return calldata('0x3593564c', ['bytes', 'bytes[]', 'uint256'], ['0x0b10', [abi(['address', 'uint256'], [ADDRESS_THIS, amountIn]), v4], deadline]);
  }
  const exactIn = abi([`(address,${PATH_T}[],uint128,uint128)`], [[Z, q.path, amountIn, minOut]]);
  const v4 = abi(['bytes', 'bytes[]'], ['0x070c0f', [exactIn, abi(['address', 'uint256'], [Z, amountIn]), abi(['address', 'uint256'], [token, minOut])]]);
  return calldata('0x3593564c', ['bytes', 'bytes[]', 'uint256'], ['0x10', [v4], deadline]);
}

// ---- Platform fee router (QFeeRouter): 1% per trade. 30% comes back to the trader as claimable cashback
// (more for qualifying holders on Robinhood Chain), 20% to the trader's referrer (fixed on their first referred
// trade), the rest to the platform. The fee comes off the input on buys and off the output on sells, so it is
// always in the quote currency (or the native coin when paying with it).
export const FEE_BPS = 100n;
const HOP_T = `(${KEY_T},bool,bytes)`;
/// Router calldata for an exact-in swap through `hops` ([{ key, zeroForOne }]); `wrap` wraps native value first.
export function feeSwapCall(chainId, hops, amountIn, minOut, wrap, feeOnInput, deadline, referrer = savedReferrer()) {
  return calldata('0xf5ec7c4b', ['address', HOP_T + '[]', 'uint128', 'uint128', 'address', 'bool', 'uint16', 'uint256', 'address'],
    [MANAGER[chainId], hops.map(x => [keyTuple(x.key), x.zeroForOne, hookData(x.key)]), amountIn, minOut, wrap || Z, feeOnInput, FEE_BPS, deadline, referrer || Z]);
}
/// The referrer this visitor arrived with (wallet-early.js stores it from ?ref=), never the trader themselves.
export function savedReferrer() {
  let r = null; try { r = localStorage.getItem('qhooks:ref'); } catch {}
  const me = (connectedAddress() || '').toLowerCase();
  return r && /^0x[0-9a-f]{40}$/.test(r) && r !== me ? r : null;
}
/// A link that credits `who` as referrer.
export const referralLink = (who, path = '/terminal') => 'https://qhooks.com' + path + (path.includes('?') ? '&' : '?') + 'ref=' + who.toLowerCase();
/// The hops for a native-coin buy, matching what quoteNative chose.
export function nativeHops(chainId, key, quoteToken, q) {
  const route = nativeRoute(chainId, quoteToken);
  if (route.stock) {
    const [[usdg, f1, t1], [stock, f2, t2]] = q.path;
    const k1 = plainKey(Z, usdg, f1, t1), k2 = plainKey(usdg, stock, f2, t2);
    return { hops: [{ key: k1, zeroForOne: true }, { key: k2, zeroForOne: k2.currency0 === usdg }, { key, zeroForOne: key.currency0 === stock }], wrap: null };
  }
  if (route.wrap) return { hops: [{ key, zeroForOne: key.currency0 === quoteToken }], wrap: route.wrap };
  const [, fee, ts] = q.path[0];
  return { hops: [{ key: { currency0: Z, currency1: route.hop, fee, tickSpacing: ts, hooks: Z }, zeroForOne: true }, { key, zeroForOne: key.currency0 === route.hop }], wrap: null };
}
/// Router calldata for an outside-token trade through 0x (QFeeRouter.swapVia): the router takes the fee (cashback and
/// referral as above) and hands the rest to 0x's AllowanceHolder with the 0x quote's data. address(0) = the chain's coin.
export function viaSwapCall(target, data, tokenIn, tokenOut, amountIn, minOut, feeOnInput, deadline, referrer = savedReferrer()) {
  return calldata('0xa1dfd5d8', ['address', 'bytes', 'address', 'address', 'uint256', 'uint256', 'bool', 'uint16', 'uint256', 'address'],
    [target, data, tokenIn, tokenOut, amountIn, minOut, feeOnInput, FEE_BPS, deadline, referrer || Z]);
}
export const cashbackOf = (chainId, router, who, currency) => ethCall(chainId, router, calldata('0x4f123156', ['address', 'address'], [who, currency])).then(BigInt);
export const claimCall = currency => calldata('0x1e83409a', ['address'], [currency]);

/// Multi-pool quotes carry their exact hops through review, funding and fee-router submission.
export async function quotePoolRoutes(chainId, pools, token, amountIn, side, native = true, quoteToken = null, nativeUsd = null) {
 const chain = chainById(chainId), eligible = side==='sell'?sellPoolCandidates(chain,pools,nativeUsd,native?null:quoteToken):native ? pools : pools.filter(p => p.quote.toLowerCase() === quoteToken?.toLowerCase()&&(poolQuoteInfo(chain,p).kind!=='custom'||sellQuoteUsd(chain,p,nativeUsd)>0));
 const plans = eligible.flatMap(pool => side==='sell'?[directPoolPlan(pool,token)]:native ? nativePoolPlans(chain, pool, token) : [directPoolPlan(pool,token,'buy')]);
 const quotes = await Promise.all(plans.map(async plan => {
  try { const a = poolQuoteArgs(plan, amountIn, hookData), r = await ethCall(chainId, chain.contracts.quoter, calldata(a.selector,a.types,a.values),connectedAddress()||undefined);
   const symbol=poolQuoteInfo(chain,plan.pool).quoteSymbol;return {...plan,out:BigInt(r.slice(0,66)),...(side==='sell'?{quoteUsd:sellQuoteUsd(chain,plan.pool,nativeUsd)}:{}),label:(side==='sell'?'Receive '+symbol+' · ':'')+'via '+symbol+' pool'};
  } catch { return null; }
 }));
 const best = side==='sell'?bestSellPool(quotes,{chain,nativeUsd,pools,quoteToken:native?null:quoteToken}):bestPool(quotes);if(!best)throw Error('No route for this amount');return best;
}

// Same-chain home USDC uses the existing v4 quoter and QFeeRouter route.
export async function quotePayAsset(chainId, key, token, quoteToken, asset, amountIn) {
  if (asset.toLowerCase() === quoteToken.toLowerCase()) return {out: await quoteSingle(chainId,key,key.currency0.toLowerCase() === asset.toLowerCase(),amountIn), hops:[{key,zeroForOne:key.currency0.toLowerCase() === asset.toLowerCase()}]};
  const tries = await Promise.all(TIERS.map(async ([fee,tickSpacing]) => {
    const bridge = plainKey(asset,quoteToken,fee,tickSpacing);
    try {
      const path = [[quoteToken,fee,tickSpacing,Z,'0x'],[token,key.fee,key.tickSpacing,key.hooks,hookData(key)]];
      const r = await ethCall(chainId,ROUTES[chainId].quoter,calldata('0xca253dc9',[`(address,${PATH_T}[],uint128)`],[[asset,path,amountIn]]),connectedAddress() || undefined);
      return {out:BigInt(r.slice(0,66)),hops:[{key:bridge,zeroForOne:bridge.currency0.toLowerCase() === asset.toLowerCase()},{key,zeroForOne:key.currency0.toLowerCase() === quoteToken.toLowerCase()}],label:'USDC → ' + token};
    } catch { return null; }
  }));
  const best = tries.filter(Boolean).sort((a,b) => a.out > b.out ? -1 : 1)[0];
  if (!best) throw Error('No route for this home asset');
  return best;
}
