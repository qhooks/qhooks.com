// QHooks JavaScript SDK v1 — https://qhooks.com/sdk/qhooks.mjs
// One ES module, no dependencies, no build step. Works in browsers, Node 18+, Deno, Bun and Workers.
//   import { createClient } from 'https://qhooks.com/sdk/qhooks.mjs';
//   const q = createClient({ rpc: { '8453': 'https://mainnet.base.org' } });
//   const pools = await q.pools({ chain: '8453' });
//   const out = await q.quote({ pool: pools[0], zeroForOne: true, amountIn: 10n ** 6n, trader: me });
//   const tx = q.feeRouterSwap({ pool: pools[0], zeroForOne: true, amountIn: 10n ** 6n, minOut: q.withSlippage(out.amountOut, 100) });
// Reads use the public API (https://qhooks.com/api.html) and, for quotes, the chain's own RPC when given.
// The SDK never holds keys or sends transactions: it returns { to, data, value } for your wallet to send.

export const VERSION = '1.1.0';
export const API = 'https://qhooks.com/api/v1';
const Z = '0x0000000000000000000000000000000000000000';
export const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
export const FEE_ROUTER = '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff';
/// Uniswap v4 per chain: PoolManager, V4Quoter, Universal Router (extended = single-pool params carry an extra word).
export const CHAINS = Object.freeze({
  '8453': { name: 'Base', manager: '0x498581ff718922c3f8e6a244956af099b2652b2b', quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d', router: '0x6ff5693b99212da76ad316178a184ab56d299b43' },
  '4663': { name: 'Robinhood Chain', manager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94', router: '0x06afba43fd06227fa663b0daecf536f6eaa6bf99', extended: true },
  '1': { name: 'Ethereum', manager: '0x000000000004444c5dc75cb358380d2e3de08a90', quoter: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203', router: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af' },
  '42161': { name: 'Arbitrum One', manager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32', quoter: '0x3972c00f7ed4885e145823eb7c655375d275a1c5', router: '0x96b2fd2f80e9428daa65d859653117d453981ab4' },
  '56': { name: 'BNB Chain', manager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df', quoter: '0x9f75dd27d6664c475b90e105573e550ff69437b0', router: '0x91bf3bfaef8d771a74e1a8fe460b3ee646b2e588' }
});

// ---- ABI encoding: address, bool, uintN, intN, bytes32, bytes, string, T[], tuples "(a,b)" ----
const W = 64, pad = h => h.padStart(W, '0');
function split(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
const isArr = t => t.endsWith('[]'), isTup = t => t.startsWith('('), members = t => split(t.slice(1, -1));
const dyn = t => t === 'bytes' || t === 'string' || isArr(t) || (isTup(t) && members(t).some(dyn));
const headSize = t => !dyn(t) && isTup(t) ? members(t).reduce((n, x) => n + headSize(x), 0) : 32;
function word(t, v) {
  if (t === 'address') { const h = String(v).toLowerCase().replace(/^0x/, ''); if (!/^[0-9a-f]{40}$/.test(h)) throw new TypeError('Bad address ' + v); return pad(h); }
  if (t === 'bool') return pad(v ? '1' : '0');
  if (t === 'bytes32') { const h = String(v).toLowerCase().replace(/^0x/, ''); if (!/^[0-9a-f]{64}$/.test(h)) throw new TypeError('Bad bytes32'); return h; }
  const m = /^(u?)int(\d*)$/.exec(t); if (!m) throw new TypeError('Unsupported type ' + t);
  let n = BigInt(v); const bits = BigInt(m[2] || 256);
  if (m[1]) { if (n < 0n || n >= 1n << bits) throw new RangeError(t + ' out of range'); } else { if (n < -(1n << (bits - 1n)) || n >= 1n << (bits - 1n)) throw new RangeError(t + ' out of range'); if (n < 0n) n += 1n << 256n; }
  return pad(n.toString(16));
}
function one(t, v) {
  if (t === 'bytes' || t === 'string') { const h = t === 'string' ? Array.from(new TextEncoder().encode(v), b => b.toString(16).padStart(2, '0')).join('') : String(v).replace(/^0x/, ''); return pad((h.length / 2).toString(16)) + h.padEnd(Math.ceil(h.length / W) * W, '0'); }
  if (isArr(t)) return pad(v.length.toString(16)) + list(v.map(() => t.slice(0, -2)), v);
  if (isTup(t)) return list(members(t), v);
  return word(t, v);
}
function list(types, values) {
  if (types.length !== values.length) throw new TypeError('ABI arity');
  const heads = [], tails = []; let off = types.reduce((n, t) => n + headSize(t), 0);
  types.forEach((t, i) => { const e = one(t, values[i]); if (dyn(t)) { heads.push(pad(off.toString(16))); tails.push(e); off += e.length / 2; } else heads.push(e); });
  return heads.join('') + tails.join('');
}
export const encode = (types, values) => '0x' + list(types, values);
export const calldata = (selector, types, values) => selector + list(types, values);
const KEY_T = '(address,address,uint24,int24,address)';
const keyTuple = k => [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks];
const keyOf = pool => pool.key || pool;
const chainOf = (pool, chainId) => String(chainId || pool.chainId || '');

/// minOut for `amountOut` with `bps` slippage (100 = 1%).
export const withSlippage = (amountOut, bps) => BigInt(amountOut) * (10000n - BigInt(bps)) / 10000n;
/// The input currency of a swap direction.
export const currencyIn = (pool, zeroForOne) => zeroForOne ? keyOf(pool).currency0 : keyOf(pool).currency1;

// ---- Transactions (returned, never sent) ----
/// ERC-20 approve(spender, amount).
export const approve = (token, spender, amount) => ({ to: token, data: calldata('0x095ea7b3', ['address', 'uint256'], [spender, amount]), value: 0n });
/// Permit2 approve(token, spender, amount, expiration) — needed once per token before Universal Router swaps.
export const permit2Approve = (token, spender, amount, expiration) => ({ to: PERMIT2, data: calldata('0x87517c45', ['address', 'address', 'uint160', 'uint48'], [token, spender, amount, expiration]), value: 0n });

/// A swap through QFeeRouter (the router the QHooks terminal uses): exact input along `hops`, at least `minOut` of the
/// last output after the router fee. ERC-20 input: approve FEE_ROUTER first. Native input: sent as value.
/// feeBps is the router fee (the terminal uses 100 = 1%; capped on chain); feeOnInput takes it from the input
/// (use true when paying with the quote token). `referrer` is credited on the trader's first referred trade.
export function feeRouterSwap({ chainId, pool, hops, zeroForOne, amountIn, minOut, feeOnInput = true, feeBps = 100, deadline, referrer = Z, wrapNative = Z, hookData = '0x' }) {
  const path = hops || [{ key: keyOf(pool), zeroForOne, hookData }];
  const c = chainOf(pool || path[0], chainId); if (!CHAINS[c]) throw new TypeError('Unsupported chain ' + c);
  const first = path[0], inCurrency = first.zeroForOne ? first.key.currency0 : first.key.currency1;
  const dl = BigInt(deadline ?? Math.floor(Date.now() / 1000) + 600);
  return { to: FEE_ROUTER, value: BigInt(inCurrency) === 0n || wrapNative !== Z ? BigInt(amountIn) : 0n,
    data: calldata('0xf5ec7c4b', ['address', `(${KEY_T},bool,bytes)[]`, 'uint128', 'uint128', 'address', 'bool', 'uint16', 'uint256', 'address'],
      [CHAINS[c].manager, path.map(h => [keyTuple(h.key), h.zeroForOne, h.hookData || '0x']), amountIn, minOut, wrapNative, feeOnInput, feeBps, dl, referrer]) };
}

/// A direct exact-input swap on one v4 pool through Uniswap's Universal Router (what aggregators use), with no
/// QHooks router fee. ERC-20 input: approve PERMIT2, then permit2Approve(token, CHAINS[chainId].router, …). Native input: value.
export function universalRouterSwap({ chainId, pool, zeroForOne, amountIn, minOut, deadline, hookData = '0x' }) {
  const c = chainOf(pool, chainId), r = CHAINS[c]; if (!r) throw new TypeError('Unsupported chain ' + c);
  const k = keyOf(pool), [cin, cout] = zeroForOne ? [k.currency0, k.currency1] : [k.currency1, k.currency0];
  const single = r.extended
    ? encode([`(${KEY_T},bool,uint128,uint128,uint256,bytes)`], [[keyTuple(k), zeroForOne, amountIn, minOut, 0n, hookData]])
    : encode([`(${KEY_T},bool,uint128,uint128,bytes)`], [[keyTuple(k), zeroForOne, amountIn, minOut, hookData]]);
  // V4_SWAP: SWAP_EXACT_IN_SINGLE (0x06), SETTLE_ALL (0x0c), TAKE_ALL (0x0f)
  const v4 = encode(['bytes', 'bytes[]'], ['0x060c0f', [single, encode(['address', 'uint256'], [cin, amountIn]), encode(['address', 'uint256'], [cout, minOut])]]);
  const dl = BigInt(deadline ?? Math.floor(Date.now() / 1000) + 600);
  return { to: r.router, value: BigInt(cin) === 0n ? BigInt(amountIn) : 0n, data: calldata('0x3593564c', ['bytes', 'bytes[]', 'uint256'], ['0x10', [v4], dl]) };
}

// ---- Client ----
/// options: { api = API, rpc: { [chainId]: url } | (chainId) => url, fetch = globalThis.fetch }
export function createClient({ api = API, rpc = {}, fetch: f = globalThis.fetch.bind(globalThis) } = {}) {
  const get = async path => { const r = await f(api + path); const j = await r.json(); if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; e.body = j; throw e; } return j; };
  const query = params => { const q = new URLSearchParams(); for (const [key, value] of Object.entries(params || {})) if (value !== undefined && value !== null && value !== '' && value !== false) q.set(key, value === true ? '1' : String(value)); return q.size ? '?' + q : ''; };
  const segment = value => encodeURIComponent(String(value));
  // client.hook(chainId, hook) is the routing view (QHooks pools behind a hook, for routers).
  // client.hooks.get(chainId, hook) is the discovery view: live evidence, capabilities, shared code, Tape activity.
  const hooks = Object.freeze({
    list: params => get('/hooks' + query(params)),
    get: (chainId, address) => get('/hooks/' + segment(chainId) + '/' + segment(address.toLowerCase())),
    compare: ids => get('/hooks/compare' + query({ ids: Array.isArray(ids) ? ids.join(',') : ids })),
    family: fp => get('/hooks/families/' + segment(fp)),
    projects: params => get('/hooks/projects' + query(params)),
    project: id => get('/hooks/projects/' + segment(id)),
    tape: Object.freeze({
      status: params => get('/hooks/tape/status' + query(params)),
      pools: params => get('/hooks/tape/pools' + query(params)),
      swaps: params => get('/hooks/tape/swaps' + query(params)),
      activity: params => get('/hooks/tape/activity' + query(params))
    })
  });
  const rpcUrl = c => typeof rpc === 'function' ? rpc(c) : rpc[c];
  async function rpcCall(chainId, method, params) {
    const url = rpcUrl(chainId); if (!url) throw new Error('No RPC for chain ' + chainId);
    const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json(); if (j.error) { const e = new Error(j.error.message || method + ' failed'); e.data = j.error.data; throw e; } return j.result;
  }
  async function call(chainId, req) {
    const url = rpcUrl(chainId); if (!url) throw new Error('No RPC for chain ' + chainId);
    const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [req, 'latest'] }) });
    const j = await r.json(); if (j.error) { const e = new Error(j.error.message || 'eth_call failed'); e.data = j.error.data; throw e; } return j.result;
  }
  const client = Object.freeze({
    hooks,
    chains: () => get('/chains').then(j => j.chains),
    markets: ({ chain } = {}) => get('/markets' + (chain ? '?chain=' + chain : '')).then(j => j.markets),
    market: (chainId, controller) => get(`/markets/${chainId}/${controller.toLowerCase()}`),
    trades: (chainId, controller) => get(`/markets/${chainId}/${controller.toLowerCase()}/trades`).then(j => j.trades),
    holders: (chainId, controller) => get(`/markets/${chainId}/${controller.toLowerCase()}/holders`),
    candles: (chainId, controller, tf = 3600) => get(`/markets/${chainId}/${controller.toLowerCase()}/candles?tf=${tf}`).then(j => j.candles),
    pools: ({ chain } = {}) => get('/pools' + (chain ? '?chain=' + chain : '')).then(j => j.pools),
    hook: (chainId, hook) => get(`/hooks/${chainId}/${hook.toLowerCase()}`),
    wallet: address => get('/wallets/' + address.toLowerCase()),
    /// Reviewed builder-marketplace modules (Studio's list).
    modules: () => f(new URL('/market/modules.json', api).href).then(r => r.json()),
    /// Exact-input quote through the hook (charges included). With an RPC for the chain it simulates on the V4Quoter
    /// with from = trader, so wallet-keyed launch rules (tx.origin) are applied as for the real swap; otherwise it
    /// asks the API, which does the same.
    async quote({ chainId, pool, zeroForOne, amountIn, trader = Z }) {
      const c = chainOf(pool, chainId), k = keyOf(pool);
      if (rpcUrl(c)) {
        const r = await call(c, { from: trader, to: CHAINS[c].quoter, data: calldata('0xaa9d21cb', [`(${KEY_T},bool,uint128,bytes)`], [[keyTuple(k), zeroForOne, amountIn, '0x']]) });
        return { amountOut: BigInt('0x' + r.slice(2, 66)), gasEstimate: BigInt('0x' + r.slice(66, 130)), source: 'rpc' };
      }
      const id = pool.poolId; if (!id) throw new Error('Pass a pool from pools() or an RPC URL for chain ' + c);
      const j = await get(`/quote?chain=${c}&pool=${id}&zeroForOne=${!!zeroForOne}&amountIn=${BigInt(amountIn)}&trader=${trader.toLowerCase()}`);
      return { amountOut: BigInt(j.amountOut), gasEstimate: BigInt(j.gasEstimate), source: 'api' };
    },
    /// Whether QFeeRouter exists on a chain yet (it is created by the first trade that needs it). When it does not,
    /// `setup` is the one-time transaction that creates it at FEE_ROUTER (deterministic deployer, anyone may send it).
    async feeRouterStatus(chainId) {
      const code = rpcUrl(chainId) ? await rpcCall(String(chainId), 'eth_getCode', [FEE_ROUTER, 'latest']) : (await get('/chains')).chains.find(c => c.chainId === String(chainId))?.feeRouterDeployed ? '0x01' : '0x';
      if (code && code !== '0x') return { deployed: true, setup: null };
      const x = await f(new URL('/full-launch/extras.json', api).href).then(r => r.json());
      return { deployed: false, setup: { to: x.deployer, data: x.salt + x.contracts.feeRouter.initCode.slice(2), value: 0n } };
    },
    /// feeRouterSwap, refusing to build a swap for a chain where QFeeRouter does not exist yet (that call would do nothing).
    async prepareFeeRouterSwap(opts) {
      const c = chainOf(opts.pool || opts.hops?.[0], opts.chainId);
      if (!(await client.feeRouterStatus(c)).deployed) throw new Error('QFeeRouter is not deployed on chain ' + c + ' yet: send feeRouterStatus(' + c + ').setup first, or use universalRouterSwap');
      return feeRouterSwap(opts);
    },
    withSlippage, feeRouterSwap, universalRouterSwap, approve, permit2Approve, currencyIn
  });
  return client;
}
