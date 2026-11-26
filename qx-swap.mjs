// Swaps through a launch pool and its hook with the chain's Universal Router: exact-in single-pool
// trades paid from an ERC-20 (via Permit2), and buys paid in the native coin (wrapped first, or routed
// native → USDC → token). Quotes run through the same pool and hook, so block charges are included.
import { abi, calldata, ethCall, words, keyTuple, KEY_T, send, sendCallsAtomic, signTypedData, ensureAllowance, connectedAddress, rpc, NATIVE, MANAGER } from '/qx-chain.mjs';
import { silentActive } from '/qx-instant-bridge.mjs';
import { stockPair } from '/full-launch/packages/multichain-launch/stock-pairs.mjs';
import {bestPool,bestSellPool,sellPoolCandidates,directPoolPlan,poolQuoteInfo,sellQuoteUsd,nativePoolPlans,poolQuoteArgs} from './qx-best-pool.mjs';
import {chainById} from './chains.mjs';
import { chainMap } from '/chains.mjs';
import {extraAddress} from './qx-extras.mjs';
import {keccakHex} from './qdrops-core.mjs';
import {createSiteHookReferrals} from './qx-hook-referral.mjs';

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

// The selected partner is established by slug lineage + current registry,
// then proven against the pool's native code/config and the trader's binding.
const hookReferrals=createSiteHookReferrals({getTrader:connectedAddress});
const poolIdOf=key=>keccakHex(Uint8Array.from(abi([KEY_T],[keyTuple(key)]).slice(2).match(/../g),v=>parseInt(v,16)));
async function hookContext(chainId,key,poolId){
 const selected=hookReferrals.needsContext(key);
 return {chainId:String(chainId),key,poolId:poolId||poolIdOf(key),manager:MANAGER[chainId],
  ...(selected?{router:await extraAddress('feeRouter',chainId),rpc:calls=>Promise.all(calls.map(([method,params])=>rpc(chainId,method,params,{purpose:'transaction',signal:AbortSignal.timeout(5000)})))}:{})};
}
async function prepareHookData(chainId,key,poolId){return hookReferrals.prepare(await hookContext(chainId,key,poolId));}
const chainHookData=(chainId,key,forSwap=false)=>hookReferrals.data(String(chainId),key,{forSwap});
export function hookData(key,chainId){
 return chainHookData(chainId??(hookReferrals.needsContext(key)?hookReferrals.stampedChain(key):'legacy'),key,true);
}
export function selectedHookReferralPartner(){
 const s=hookReferrals.selection();
 if(!hookReferrals.selectedPartner())return null;
 if(['pending','unavailable'].includes(s.status)&&s.stateSlug===s.slug)throw Error('Your referral link is still loading. Refresh and try again.');
 return s.slug;
}
export function hookReferralFor(key,chainId){
 try{return hookReferrals.metadata(String(chainId??hookReferrals.stampedChain(key)),key);}
 catch{return {state:'unavailable',blocking:true,reason:'context_stale',appliedHookReferrer:null};}
}
export async function assertHookReferralsCurrent(chainId,hops){
 const seen=new Set();
 for(const hop of hops){const id=poolIdOf(hop.key);if(seen.has(id)||!hookReferrals.needsContext(hop.key))continue;seen.add(id);await hookReferrals.assertCurrent(await hookContext(chainId,hop.key,id));}
}
const markHookQuote=(chainId,key,data)=>hookReferrals.markQuoted(String(chainId),key,data);

/// What `amountIn` of one side of `key` buys of the other, through the pool and its hook.
export async function quoteSingle(chainId, key, zeroForOne, amountIn) {
  const {data}=await prepareHookData(chainId,key);
  const r = await ethCall(chainId, ROUTES[chainId].quoter, calldata('0xaa9d21cb', [`(${KEY_T},bool,uint128,bytes)`], [[keyTuple(key), zeroForOne, amountIn, data]]), connectedAddress() || undefined);
  markHookQuote(chainId,key,data);return BigInt(r.slice(0, 66));
}

function singleParams(chainId, key, zeroForOne, amountIn, minOut) {
  return ROUTES[chainId].extended
    ? abi([`(${KEY_T},bool,uint128,uint128,uint256,bytes)`], [[keyTuple(key), zeroForOne, amountIn, minOut, 0n, chainHookData(chainId,key,true)]])
    : abi([`(${KEY_T},bool,uint128,uint128,bytes)`], [[keyTuple(key), zeroForOne, amountIn, minOut, chainHookData(chainId,key,true)]]);
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
  const {data}=await prepareHookData(chainId,key);
  const route = nativeRoute(chainId, quoteToken), from = connectedAddress() || undefined;
  if (route.stock) {
    const stock = stockPair(chainId, route.stock);
    const tries = await Promise.all(route.ethTiers.flatMap(([f1, t1]) => route.stockTiers.map(async ([f2, t2]) => {
      const path = [[route.usdg, f1, t1, Z, '0x'], [route.stock, f2, t2, Z, '0x'], [token, key.fee, key.tickSpacing, key.hooks, data]];
      try { const r = await ethCall(chainId, route.quoter, calldata('0xca253dc9', [`(address,${PATH_T}[],uint128)`], [[Z, path, amountIn]]), from); return { out: BigInt(r.slice(0, 66)), path }; }
      catch { return null; }
    })));
    const best = tries.filter(Boolean).sort((a, b) => (b.out > a.out ? 1 : -1))[0];
    if (!best) throw new Error('No route for this amount');
    markHookQuote(chainId,key,data);return { out: best.out, path: best.path, label: NATIVE[chainId] + ' → USDG → ' + stock.symbol + ' → ' + symbol };
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
  markHookQuote(chainId,key,data);return { out: best.out, path: best.path, label: NATIVE[chainId] + ' → ' + (route.hopSymbol || 'USDC') + ' (' + best.fee / 10000 + '% pool) → ' + symbol };
}

/// Router calldata for a native-coin buy; send it with value = amountIn.
export function nativeSwapCall(chainId, key, token, quoteToken, amountIn, minOut, q, deadline) {
  const route = nativeRoute(chainId, quoteToken);
  const data=chainHookData(chainId,key,true);
  if(!route.wrap&&q.path.at(-1)?.[4]!==data)throw Error('Referral data changed. Refresh the quote.');
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
import {FEE_BPS} from './qx-trade-fee-policy.mjs';
export {FEE_BPS};
const HOP_T = `(${KEY_T},bool,bytes)`;
/// Router calldata for an exact-in swap through `hops` ([{ key, zeroForOne }]); `wrap` wraps native value first.
function checkHopReferrals(chainId, hops, referrer) {
  for(const hop of hops){
    chainHookData(chainId,hop.key,true);
    const m=hookReferralFor(hop.key,chainId);
    if(m.state==='applied'&&String(referrer||Z).toLowerCase()!==m.appliedHookReferrer)throw Error('Referral choice changed. Refresh the quote.');
  }
}
export function feeSwapCall(chainId, hops, amountIn, minOut, wrap, feeOnInput, deadline, referrer = savedReferrer()) {
  checkHopReferrals(chainId, hops, referrer);
  return calldata('0xf5ec7c4b', ['address', HOP_T + '[]', 'uint128', 'uint128', 'address', 'bool', 'uint16', 'uint256', 'address'],
    [MANAGER[chainId], hops.map(x => [keyTuple(x.key), x.zeroForOne, chainHookData(chainId,x.key,true)]), amountIn, minOut, wrap || Z, feeOnInput, FEE_BPS, deadline, referrer || Z]);
}
/// The referrer this visitor arrived with (wallet-early.js stores it from ?ref=), never the trader themselves.
export function savedReferrer() {
  if (['pending','unavailable'].includes(globalThis.__qhooksPartnerReferral?.status)) throw new Error('Your referral link is still loading. Refresh and try again.');
  let r = globalThis.__qhooksPartnerReferral?.referrer || null; try { const stored=localStorage.getItem('qhooks:ref');if(/^0x[0-9a-f]{40}$/.test(stored||'')&&!/^0x0{40}$/.test(stored))r=stored; } catch {}
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

// ---- Sells without a separate approve (fr2switch, 2026-11-26) ----
// Robinhood Chain trades go to QFeeRouterV2, a new spender, so a first sell of a token there would need a fresh approve.
// sellThroughRouter hides it where the wallet allows: (a) EIP-5792 atomic [approve, swap] in one confirm (sendCallsAtomic's
// own capability check), (b) on a router with Permit2 sells, a Permit2 SignatureTransfer signature when the token already
// allows Permit2 (swapPermit2 / swapViaPermit2, no approve tx), else (c) approve then swap as before.
export const FEE_ROUTER_V2 = '0x352a4a1d927ed21bddf5e22b1eed728714438bcd';
const PERMIT2_SELL_ROUTERS = Object.freeze({ '4663': FEE_ROUTER_V2 });
export const SIGN_TO_SELL = 'Sign to sell (no approval needed)';
/// Whether `router` on `chainId` has swapPermit2 / swapViaPermit2 (QFeeRouterV2 only).
export const supportsPermit2Sell = (chainId, router) => !!router && PERMIT2_SELL_ROUTERS[String(chainId)] === String(router).toLowerCase();
/// Permit2 PermitTransferFrom the wallet signs: exactly `amount` of `token` to `spender` (the router), once, by `deadline`
/// (the same deadline the swap call carries).
export function permit2SellTyped({ chainId, token, amount, spender, nonce, deadline }) {
  return {
    domain: { name: 'Permit2', chainId: Number(chainId), verifyingContract: PERMIT2 },
    primaryType: 'PermitTransferFrom',
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
      PermitTransferFrom: [{ name: 'permitted', type: 'TokenPermissions' }, { name: 'spender', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }],
      TokenPermissions: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }]
    },
    message: { permitted: { token: String(token).toLowerCase(), amount: String(amount) }, spender: String(spender).toLowerCase(), nonce: String(nonce), deadline: String(deadline) }
  };
}
/// The router's `permit` argument: abi.encode(uint256 nonce, bytes signature).
export function encodeSellPermit(nonce, signature) {
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(signature || '')) throw Error('The wallet did not return a signature');
  return abi(['uint256', 'bytes'], [BigInt(nonce), signature]);
}
/// A fresh Permit2 unordered nonce (random 248 bits; Permit2's bitmap takes any unused value).
export function permit2Nonce() { const b = crypto.getRandomValues(new Uint8Array(31)); return BigInt('0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('')); }
const SWAP_PERMIT2_T = ['address', HOP_T + '[]', 'uint128', 'uint128', 'bool', 'uint16', 'uint256', 'address', 'bytes'];
/// Pure QFeeRouterV2.swapPermit2 calldata. route = { chainId, hops: [{ key, zeroForOne, hookData? }], manager? }
/// (hookData defaults to 0x; manager to the chain's pool manager). Sells: feeOnInput false.
export function swapPermit2Calldata(route, amountIn, minOut, deadline, referrer, nonce, signature, { feeOnInput = false, feeBps = FEE_BPS } = {}) {
  if (route.wrap && BigInt(route.wrap) !== 0n) throw Error('swapPermit2 cannot wrap the native coin');
  const manager = route.manager || MANAGER[route.chainId]; if (!manager) throw Error('No pool manager for this chain');
  return calldata('0xd0d3c5db', SWAP_PERMIT2_T, [manager, route.hops.map(x => [keyTuple(x.key), x.zeroForOne, x.hookData ?? '0x']),
    amountIn, minOut, feeOnInput, feeBps, deadline, referrer || Z, encodeSellPermit(nonce, signature)]);
}
/// feeSwapCall's Permit2 twin for a sell (same hook data and referral checks; no wrap, not payable).
export function feeSwapPermit2Call(chainId, hops, amountIn, minOut, deadline, nonce, signature, referrer = savedReferrer()) {
  checkHopReferrals(chainId, hops, referrer);
  return swapPermit2Calldata({ chainId, hops: hops.map(x => ({ ...x, hookData: chainHookData(chainId, x.key, true) })) }, amountIn, minOut, deadline, referrer, nonce, signature);
}
/// viaSwapCall's Permit2 twin (QFeeRouterV2.swapViaPermit2): same arguments plus the permit; tokenIn must be an ERC-20.
export function viaSwapPermit2Call(target, data, tokenIn, tokenOut, amountIn, minOut, feeOnInput, deadline, nonce, signature, referrer = savedReferrer()) {
  return calldata('0x653b77c3', ['address', 'bytes', 'address', 'address', 'uint256', 'uint256', 'bool', 'uint16', 'uint256', 'address', 'bytes'],
    [target, data, tokenIn, tokenOut, amountIn, minOut, feeOnInput, FEE_BPS, deadline, referrer || Z, encodeSellPermit(nonce, signature)]);
}
/// The decision: 'allowed' (router allowance covers it) · 'batch' (atomic approve+swap) · 'permit' (Permit2 signature) · 'approve'.
export function chooseSellApproval({ amountIn, routerAllowance, atomic = false, permit2Sell = false, permit2Allowance = 0n }) {
  if (routerAllowance >= amountIn) return 'allowed';
  if (permit2Sell && permit2Allowance >= amountIn) return 'permit';
  if (atomic) return 'batch';
  return 'approve';
}
// A wallet that cannot sign typed data at all falls back to the approve; a decline stops the sell.
const signUnsupported = e => [4200, -32601, -32602].includes(Number(e?.code));
/// Sends a sell of `amountIn` of `token` through `router` with the fewest wallet steps. swapTx(deadline) builds the plain
/// swap; permitSwapTx(deadline, {nonce, signature}) the Permit2 one (omit it where the route cannot use Permit2);
/// deadline() is read when each swap is built. Returns { mode, receipt }.
export async function sellThroughRouter({ chainId, token, router, owner, amountIn, deadline, swapTx, permitSwapTx, onStatus = () => {}, assertContext = () => {} }, deps = {}) {
  const d = { ethCall, sendCallsAtomic, signTypedData, send, ensureAllowance, nonce: permit2Nonce, silent: silentActive, ...deps };
  const allowance = spender => d.ethCall(chainId, token, calldata('0xdd62ed3e', ['address', 'address'], [owner, spender])).then(BigInt);
  assertContext();
  const routerAllowance = await allowance(router); assertContext();
  if (chooseSellApproval({ amountIn, routerAllowance }) === 'allowed') return { mode: 'allowed', receipt: await d.send(chainId, await swapTx(await deadline()), onStatus, assertContext) };
  // Order (lead, 2026-11-26): Permit2 signature first, then one EIP-5792 batch (approve + swap), then approve, swap.
  const permit2Sell = supportsPermit2Sell(chainId, router) && typeof permitSwapTx === 'function';
  const permit2Allowance = permit2Sell ? await allowance(PERMIT2).catch(() => 0n) : 0n; assertContext();
  if (chooseSellApproval({ amountIn, routerAllowance, permit2Sell, permit2Allowance }) === 'permit') {
    const when = await deadline(), nonce = d.nonce();
    onStatus(d.silent() ? 'Sending…' : SIGN_TO_SELL);
    let signature = null;
    try { signature = await d.signTypedData(chainId, permit2SellTyped({ chainId, token, amount: amountIn, spender: router, nonce, deadline: when })); }
    catch (e) { if (!signUnsupported(e)) throw e; }
    assertContext();
    if (signature) return { mode: 'permit', receipt: await d.send(chainId, await permitSwapTx(when, { nonce, signature }), onStatus, assertContext) };
  }
  const approve = { to: token, data: calldata('0x095ea7b3', ['address', 'uint256'], [router, amountIn]) };
  const batch = await d.sendCallsAtomic(chainId, [approve, await swapTx(await deadline())], onStatus, assertContext);
  if (batch) return { mode: 'batch', receipt: batch.at(-1) || null };
  assertContext();
  await d.ensureAllowance(chainId, token, router, amountIn, onStatus, assertContext); assertContext();
  return { mode: 'approve', receipt: await d.send(chainId, await swapTx(await deadline()), onStatus, assertContext) };
}
export const cashbackOf =(chainId, router, who, currency) => ethCall(chainId, router, calldata('0x4f123156', ['address', 'address'], [who, currency])).then(BigInt);
export const claimCall = currency => calldata('0x1e83409a', ['address'], [currency]);

/// Multi-pool quotes carry their exact hops through review, funding and fee-router submission.
export async function quotePoolRoutes(chainId, pools, token, amountIn, side, native = true, quoteToken = null, nativeUsd = null) {
 const chain = chainById(chainId), eligible = side==='sell'?sellPoolCandidates(chain,pools,nativeUsd,native?null:quoteToken):native ? pools : pools.filter(p => p.quote.toLowerCase() === quoteToken?.toLowerCase()&&(poolQuoteInfo(chain,p).kind!=='custom'||sellQuoteUsd(chain,p,nativeUsd)>0));
 const plans = eligible.flatMap(pool => side==='sell'?[directPoolPlan(pool,token)]:native ? nativePoolPlans(chain, pool, token) : [directPoolPlan(pool,token,'buy')]);
 const quotes = await Promise.all(plans.map(async plan => {
  try {
   const contexts=await Promise.all(plan.hops.map(h=>prepareHookData(chainId,h.key,h.key===plan.pool.key?(plan.pool.id||plan.pool.poolId):undefined)));
   const data=k=>contexts[plan.hops.findIndex(h=>h.key===k)].data;
   const a = poolQuoteArgs(plan, amountIn, data), r = await ethCall(chainId, chain.contracts.quoter, calldata(a.selector,a.types,a.values),connectedAddress()||undefined);
   plan.hops.forEach((h,i)=>markHookQuote(chainId,h.key,contexts[i].data));
   const symbol=poolQuoteInfo(chain,plan.pool).quoteSymbol;return {...plan,out:BigInt(r.slice(0,66)),...(side==='sell'?{quoteUsd:sellQuoteUsd(chain,plan.pool,nativeUsd)}:{}),label:(side==='sell'?'Receive '+symbol+' · ':'')+'via '+symbol+' pool'};
  } catch(error) { if(error?.code==='hook_referral_unavailable')throw error;return null; }
 }));
 const best = side==='sell'?bestSellPool(quotes,{chain,nativeUsd,pools,quoteToken:native?null:quoteToken}):bestPool(quotes);if(!best)throw Error('No route for this amount');return best;
}

// Same-chain home USDC uses the existing v4 quoter and QFeeRouter route.
export async function quotePayAsset(chainId, key, token, quoteToken, asset, amountIn) {
  const {data}=await prepareHookData(chainId,key);
  if (asset.toLowerCase() === quoteToken.toLowerCase()) return {out: await quoteSingle(chainId,key,key.currency0.toLowerCase() === asset.toLowerCase(),amountIn), hops:[{key,zeroForOne:key.currency0.toLowerCase() === asset.toLowerCase()}]};
  const tries = await Promise.all(TIERS.map(async ([fee,tickSpacing]) => {
    const bridge = plainKey(asset,quoteToken,fee,tickSpacing);
    try {
      const path = [[quoteToken,fee,tickSpacing,Z,'0x'],[token,key.fee,key.tickSpacing,key.hooks,data]];
      const r = await ethCall(chainId,ROUTES[chainId].quoter,calldata('0xca253dc9',[`(address,${PATH_T}[],uint128)`],[[asset,path,amountIn]]),connectedAddress() || undefined);
      return {out:BigInt(r.slice(0,66)),hops:[{key:bridge,zeroForOne:bridge.currency0.toLowerCase() === asset.toLowerCase()},{key,zeroForOne:key.currency0.toLowerCase() === quoteToken.toLowerCase()}],label:'USDC → ' + token};
    } catch { return null; }
  }));
  const best = tries.filter(Boolean).sort((a,b) => a.out > b.out ? -1 : 1)[0];
  if (!best) throw Error('No route for this home asset');
  markHookQuote(chainId,key,data);return best;
}
