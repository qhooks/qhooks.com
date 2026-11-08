// Exact-pool, quote-token buy example. SDK reads + unsigned calldata only.
// Browser: import { quoteAndBuild } from '/examples/partner-quote.mjs';
// Node: import { quoteAndBuild } from './partner-quote.mjs';
import { API, CHAINS, FEE_ROUTER, PERMIT2, VERSION, createClient } from '../sdk/qhooks.mjs';

const ZERO = '0x' + '0'.repeat(40);
const MAX_INPUT = 10n ** 38n - 1n; // The public quote API accepts at most 38 decimal digits.
const MAX_UINT128 = (1n << 128n) - 1n;
export const EXAMPLE_LIMITS = Object.freeze({ maxSlippageBps: 500, maxDeadlineSeconds: 1800, routerFeeBps: 100 });

function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function address(value, label, nonzero = false) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/i.test(value) || (nonzero && value.toLowerCase() === ZERO)) fail('invalid_address', label + ' must be an explicit public EVM address.');
  return value.toLowerCase();
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('invalid_bounds', label + ' must be an integer from ' + min + ' to ' + max + '.');
  return value;
}
function raw(value, label, max = MAX_UINT128) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || value.length > 39) fail('invalid_amount', label + ' must be a positive raw integer string.');
  const n = BigInt(value);
  if (n > max) fail('invalid_amount', label + ' exceeds the supported bound.');
  return n;
}
function checkDeadline(deadline, now) {
  const seconds = now();
  if (!Number.isSafeInteger(seconds) || seconds < 0) fail('invalid_clock', 'Clock must return Unix seconds.');
  integer(deadline, 1, Number.MAX_SAFE_INTEGER, 'deadline');
  if (deadline <= seconds || deadline > seconds + EXAMPLE_LIMITS.maxDeadlineSeconds) fail('invalid_deadline', 'deadline must be in the future and within 30 minutes.');
}
function inputOf(input, now) {
  if (!input || typeof input !== 'object') fail('invalid_input', 'An explicit input object is required.');
  const chainId = String(input.chainId ?? '');
  if (!Object.hasOwn(CHAINS, chainId)) fail('invalid_chain', 'Choose a chain supported by the current SDK.');
  if (typeof input.poolId !== 'string' || !/^0x[0-9a-f]{64}$/i.test(input.poolId)) fail('invalid_pool', 'poolId must be an exact bytes32 pool ID.');
  if (!['rewards', 'direct'].includes(input.route)) fail('invalid_route', 'Choose rewards or direct explicitly.');
  const referrer = input.referrer == null ? ZERO : address(input.referrer, 'referrer');
  if (input.route === 'direct' && referrer !== ZERO) fail('invalid_referrer', 'Direct routing does not create QHooks terminal referral credit.');
  const out = {
    chainId, poolId: input.poolId.toLowerCase(), trader: address(input.trader, 'trader', true),
    amountIn: raw(input.amountIn, 'amountIn', MAX_INPUT), route: input.route,
    quoteCurrency: address(input.quoteCurrency, 'quoteCurrency'),
    quoteDecimals: integer(input.quoteDecimals, 0, 255, 'quoteDecimals'),
    slippageBps: integer(input.slippageBps, 0, EXAMPLE_LIMITS.maxSlippageBps, 'slippageBps'),
    deadline: input.deadline, referrer
  };
  checkDeadline(out.deadline, now);
  return Object.freeze(out);
}
function poolOf(pools, selected) {
  if (!Array.isArray(pools)) fail('invalid_directory', 'The pool directory did not return a pool list.');
  // Match the requested ID first, then require its chain. Never fall back to a different pool.
  const matches = pools.filter(p => typeof p?.poolId === 'string' && p.poolId.toLowerCase() === selected.poolId);
  if (matches.length !== 1) fail('pool_not_unique', 'The exact pool must appear once in the directory.');
  const p = matches[0], expected = CHAINS[selected.chainId];
  if (String(p.chainId) !== selected.chainId) fail('pool_chain_mismatch', 'The selected pool belongs to another chain.');
  if (p.router?.routable !== true) fail('pool_not_routable', 'Pool rules are unavailable or currently refuse routing. Read the directory router notes and retry after the rules permit it.');
  if (!['qhooks-launch-blocks', 'qhooks-pair'].includes(p.hook?.kind)) fail('unsupported_hook', 'This example supports listed QHooks launch and pair hooks only.');
  if (p.hookData !== '0x') fail('unsupported_hook_data', 'This example requires the directory’s empty hook data.');
  const key = {
    currency0: address(p.key?.currency0, 'currency0'), currency1: address(p.key?.currency1, 'currency1'),
    fee: integer(p.key?.fee, 0, 0xffffff, 'pool fee'), tickSpacing: integer(p.key?.tickSpacing, 1, 0x7fffff, 'tick spacing'),
    hooks: address(p.key?.hooks, 'hooks', true)
  };
  if (BigInt(key.currency0) >= BigInt(key.currency1)) fail('invalid_pool_key', 'Pool currencies must be distinct and sorted.');
  if (address(p.poolManager, 'poolManager') !== expected.manager || address(p.quoter, 'quoter') !== expected.quoter || address(p.hook?.address, 'hook address') !== key.hooks) fail('pool_identity_mismatch', 'Pool manager, quoter or hook does not match the selected directory identity.');
  const quote = { address: address(p.quote?.address, 'directory quote currency'), decimals: integer(p.quote?.decimals, 0, 255, 'directory quote decimals') };
  const token = { address: address(p.token?.address, 'token', true), decimals: integer(p.token?.decimals, 0, 255, 'token decimals') };
  if (quote.address !== selected.quoteCurrency || quote.decimals !== selected.quoteDecimals) fail('quote_currency_mismatch', 'The requested quote currency or decimals differ from the directory.');
  const zeroForOne = key.currency0 === quote.address;
  if ((!zeroForOne && key.currency1 !== quote.address) || token.address !== (zeroForOne ? key.currency1 : key.currency0) || p.token.currency !== (zeroForOne ? 1 : 0)) fail('pool_currency_mismatch', 'Quote and token metadata must match opposite PoolKey currencies.');
  if (!/^[1-9][0-9]*$/.test(String(p.sqrtPriceX96 ?? ''))) fail('uninitialized_pool', 'The directory must report an initialized pool price.');
  return { chainId: selected.chainId, poolId: selected.poolId, key, quote, token, zeroForOne,
    rules: Array.isArray(p.router.rules) ? [...p.router.rules] : [],
    notes: Array.isArray(p.router.notes) ? [...p.router.notes] : [] };
}
function chainOf(chains, selected) {
  if (!Array.isArray(chains)) fail('invalid_chains', 'The chain directory did not return a chain list.');
  const matches = chains.filter(c => String(c?.chainId) === selected.chainId);
  if (matches.length !== 1) fail('chain_not_unique', 'The exact chain must appear once in the chain directory.');
  const chain = matches[0], expected = CHAINS[selected.chainId];
  if (address(chain.poolManager, 'chain poolManager') !== expected.manager || address(chain.v4Quoter, 'chain v4Quoter') !== expected.quoter || address(chain.universalRouter, 'chain universalRouter') !== expected.router || address(chain.permit2, 'chain permit2') !== PERMIT2) fail('chain_identity_mismatch', 'The chain directory contracts differ from the current SDK.');
  if (selected.route === 'rewards' && (chain.feeRouterDeployed !== true || address(chain.qhooks?.feeRouter, 'chain feeRouter') !== FEE_ROUTER)) fail('router_unavailable', 'QHooks rewards router is not confirmed deployed on this chain. No deployment or setup transaction is built.');
  return chain;
}

/** Quote an exact listed pool as the public trader and build unsigned SDK calldata.
 * Only quote-token -> launch-token exact-input buys are supported by this example.
 * Dependencies are read-only fetch and Unix-second clock seams; no provider or signer.
 */
export async function quoteAndBuild(input, { fetcher = globalThis.fetch.bind(globalThis), now = () => Math.floor(Date.now() / 1000) } = {}) {
  const selected = inputOf(input, now);
  let expectedQuote = null;
  const read = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(API).origin || (options.method && options.method !== 'GET')) fail('unexpected_request', 'This example only reads the public QHooks API.');
    checkDeadline(selected.deadline, now);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(url, { ...options, method: 'GET', credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (parsed.pathname === '/api/v1/quote') {
        const j = await response.clone().json();
        if (!response.ok) fail('quote_refused', 'Quote refused: ' + (j.reason || j.error || response.status));
        if (!expectedQuote || String(j.chainId) !== selected.chainId || j.poolId?.toLowerCase() !== selected.poolId || j.trader?.toLowerCase() !== selected.trader || j.zeroForOne !== expectedQuote.zeroForOne || j.amountIn !== expectedQuote.amountIn) fail('quote_identity_mismatch', 'The quote response does not match the requested chain, pool, trader, direction and raw amount.');
      }
      return response;
    } finally { clearTimeout(timer); }
  };
  const q = createClient({ fetch: read });
  const pool = poolOf(await q.pools({ chain: selected.chainId }), selected);
  chainOf(await q.chains(), selected);
  const routerFee = selected.route === 'rewards' ? selected.amountIn * 100n / 10000n : 0n;
  const quotedAmountIn = selected.amountIn - routerFee;
  expectedQuote = { zeroForOne: pool.zeroForOne, amountIn: quotedAmountIn.toString() };
  const quote = await q.quote({ chainId: selected.chainId, pool, zeroForOne: pool.zeroForOne, amountIn: quotedAmountIn, trader: selected.trader });
  const amountOut = raw(quote.amountOut.toString(), 'quoted amountOut');
  const minOut = q.withSlippage(amountOut, selected.slippageBps);
  if (minOut <= 0n) fail('zero_minimum', 'The bounded slippage would produce zero minimum output.');
  checkDeadline(selected.deadline, now);
  const options = { chainId: selected.chainId, pool, zeroForOne: pool.zeroForOne, amountIn: selected.amountIn, minOut, deadline: selected.deadline, hookData: '0x' };
  const tx = selected.route === 'rewards'
    ? await q.prepareFeeRouterSwap({ ...options, feeOnInput: true, feeBps: 100, referrer: selected.referrer })
    : q.universalRouterSwap(options);
  checkDeadline(selected.deadline, now);
  const expectedRouter = selected.route === 'rewards' ? FEE_ROUTER : CHAINS[selected.chainId].router;
  if (tx.to !== expectedRouter || tx.value !== (selected.quoteCurrency === ZERO ? selected.amountIn : 0n) || !/^0x[0-9a-f]+$/i.test(tx.data)) fail('invalid_unsigned_build', 'The SDK build does not match the selected route.');
  const approvals = selected.quoteCurrency === ZERO ? [] : selected.route === 'rewards'
    ? [{ token: selected.quoteCurrency, spender: FEE_ROUTER, amountRaw: selected.amountIn.toString(), kind: 'ERC20 allowance' }]
    : [{ token: selected.quoteCurrency, spender: PERMIT2, amountRaw: selected.amountIn.toString(), kind: 'ERC20 allowance' }, { token: selected.quoteCurrency, spender: expectedRouter, amountRaw: selected.amountIn.toString(), kind: 'Permit2 allowance; choose its expiration separately' }];
  return {
    kind: 'qhooks-unsigned-quote-build', sdkVersion: VERSION, chainId: selected.chainId, poolId: selected.poolId,
    trader: selected.trader, route: selected.route, quoteCurrency: pool.quote, outputCurrency: pool.token,
    amountIn: selected.amountIn.toString(), routerFeeBps: selected.route === 'rewards' ? 100 : 0,
    routerFeeAmount: routerFee.toString(), quotedAmountIn: quotedAmountIn.toString(),
    amountOut: amountOut.toString(), minOut: minOut.toString(), slippageBps: selected.slippageBps,
    deadline: selected.deadline, quotedAt: now(), quoteSource: quote.source,
    rewards: selected.route === 'rewards' ? 'QHooks router cashback and referral accounting; no payout or eligibility guarantee.' : 'No QHooks terminal fee or terminal rewards.',
    referrer: selected.route === 'rewards' ? selected.referrer : null,
    rules: pool.rules, notes: pool.notes, approvalsRequired: approvals,
    transaction: { chainId: selected.chainId, from: selected.trader, to: tx.to, data: tx.data, value: tx.value.toString() },
    nextStep: 'Review chain, currencies, allowances, router, minimum output, deadline and gas in the user’s wallet. Requote immediately before signing; this example does not approve, sign or submit.'
  };
}
