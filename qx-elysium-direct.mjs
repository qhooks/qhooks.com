// Direct Uniswap v4 route for outside Elysium tokens (2026-11-09; Randall: "Build it"). 0x doesn't serve Elysium, so
// the terminal trades these tokens on Elysium's canonical PoolManager through Elysium's QFeeRouter (0xff20…: the same 1%
// fee, 30% cashback, 20% referral as QHooks launches). This module only picks the pool:
// - candidates: the token's pool ids from the market header (DexScreener/GeckoTerminal), else GeckoTerminal's pool list;
// - each id's PoolKey from its Initialize event on the PoolManager (so only canonical-manager pools qualify);
// - the other side must be native HYPE or WHYPE; hooks must be none or on REVIEWED_HOOKS;
// - the deepest qualifying pool (by listed USD liquidity) wins.
import {chainById} from './chains.mjs';

export const DIRECT_CHAINS = Object.freeze(['99901']);
const Z = '0x0000000000000000000000000000000000000000';
const INITIALIZE = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438'; // Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)
// Third-party hooks reviewed by behaviour on an Elysium mainnet fork (2026-11-09, real pools, through 0xff20, real gas
// fields): buy 0.01 HYPE then sell everything back succeeded; round trip kept 94–96% (their per-side charge + the 1% fee).
// Pools reviewed: VOLTA, VOID (A); FEMO, AETHER (B); HYPEPE, ISLAND, TESTICLES (C); EVERMOR (D); KSTOCK (E). Hookless CLU: 97.9%.
// Source is not published for either, so this is a behaviour review only. Add a hook here only with the same evidence.
// owner: the hook has an owner (owner()/transferOwnership present, checked on chain 2026-11-09). Source isn't published, so
// we can't rule out the owner changing the tax: the ticket says so. E has no owner/admin functions in its bytecode.
// sha256: the hook's runtime code as reviewed. The route re-reads the code before every pool choice and refuses a hook whose
// code differs (metamorphic redeploy etc.): re-review with lead/elysium-direct/recheck-hooks.mjs, then update the pin.
// Fill vs quote matched (≥ 99.94%) with real EIP-1559 fields at 2 and 20 gwei, from two senders: no gas-price pricing.
export const REVIEWED_HOOKS = Object.freeze({
  '99901': Object.freeze({
    '0x3ab88ddc3cf2a012af88b60828edb4553697e5dc': Object.freeze({name: 'Elysium launchpad hook A (VOLTA, VOID pools)', owner: true, sha256: '305967e1f393416b1fc19f4326be9afb1f374861b0e4019d612e9cf3f61c90d7'}),
    '0xe0def4221b9840a610d4e7d55812a79a6431a8ec': Object.freeze({name: 'Elysium launchpad hook B (FEMO, AETHER pools; dynamic fee)', owner: true, sha256: '90ea20f74386f2944cfeea919236b8bd34bcb5f11dbc0f9d48be2dfbca7fd9b8'}),
    '0x6b1216a40b65c83e9c9e18a562c446697b8cf8ec': Object.freeze({name: 'Elysium launchpad hook C (HYPEPE, ISLAND, TESTICLES, ELYSCAN pools)', owner: true, sha256: '67a92b955e732b458f78572f8f8088832f3adc15b69c71aa160439d7c7b0f65f'}),
    '0xc5a2ad712ebbca9f416bd9091731a7578c2a68cc': Object.freeze({name: 'Elysium launchpad hook D (EVERMOR pool)', owner: true, sha256: '071d4c2009edead5d9c691674d78ec1c818ddb294c43165b8d7a746d63e6b911'}),
    '0x7dbf4bb9cf964b818d9fe82515cc945c6c3ea5cc': Object.freeze({name: 'Elysium launchpad hook E (KSTOCK pool)', owner: false, sha256: '9617a480e5c94b2409306471925874a567979c5c670c3b1d3cc18ece494f9e32'}),
  }),
});
export const hasDirectRoute = chainId => DIRECT_CHAINS.includes(String(chainId));
const low = v => String(v || '').toLowerCase();
const sha256Hex = async code => { const b = Uint8Array.from((String(code).slice(2).match(/../g) || []).map(x => parseInt(x, 16))); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), x => x.toString(16).padStart(2, '0')).join(''); };
const word = (hex, i) => hex.slice(2 + i * 64, 66 + i * 64);
const signed24 = w => { const v = BigInt('0x' + w); return Number(v >= 1n << 255n ? v - (1n << 256n) : v); };

/// Decodes an Initialize log into a PoolKey, or null.
export function keyFromInitialize(log) {
  if (!log || low(log.topics?.[0]) !== INITIALIZE || !log.data || log.data.length < 2 + 64 * 3) return null;
  return {id: low(log.topics[1]), key: {currency0: '0x' + low(log.topics[2]).slice(26), currency1: '0x' + low(log.topics[3]).slice(26),
    fee: Number(BigInt('0x' + word(log.data, 0))), tickSpacing: signed24(word(log.data, 1)), hooks: '0x' + word(log.data, 2).slice(24)}};
}
/// Whether a PoolKey may be traded for `token` on `chainId`: token on one side, native HYPE or WHYPE on the other, hook
/// none or reviewed. Returns {quote} (Z for native HYPE) or {refused: reason}.
export function judgeKey(chainId, token, key) {
  const c = chainById(chainId), wrapped = low(c?.wrappedNative), t = low(token), c0 = low(key.currency0), c1 = low(key.currency1);
  if (c0 !== t && c1 !== t) return {refused: 'pair'};
  const other = c0 === t ? c1 : c0;
  if (other !== Z && other !== wrapped) return {refused: 'quote'};
  if (low(key.hooks) !== Z && !REVIEWED_HOOKS[String(chainId)]?.[low(key.hooks)]) return {refused: 'hook'};
  return {quote: other};
}
async function geckoPools(token, signal) {
  try {
    const r = await fetch('https://api.geckoterminal.com/api/v2/networks/elysium/tokens/' + token + '/pools?page=1', {headers: {accept: 'application/json'}, signal});
    if (!r.ok) return [];
    return ((await r.json()).data || []).filter(p => /uniswap-v4/.test(p.relationships?.dex?.data?.id || '')).map(p => ({address: low(p.attributes?.address), liquidityUsd: Number(p.attributes?.reserve_in_usd) || 0}));
  } catch { return []; }
}
/// The deepest tradable pool for an outside token: {key, quote, poolId, liquidityUsd, hookNote} or {refused, detail}.
export async function resolveDirectPool(chainId, token, candidates = [], {signal} = {}) {
  chainId = String(chainId);
  const c = chainById(chainId);
  if (!hasDirectRoute(chainId) || !c?.contracts?.manager) return {refused: 'chain'};
  let pools = (candidates || []).map(p => ({address: low(p.address), liquidityUsd: Number(p.liquidityUsd) || 0})).filter(p => /^0x[0-9a-f]{64}$/.test(p.address));
  if (!pools.length) pools = (await geckoPools(token, signal)).filter(p => /^0x[0-9a-f]{64}$/.test(p.address));
  if (!pools.length) return {refused: 'no_pool'};
  const depth = new Map(pools.map(p => [p.address, p.liquidityUsd]));
  const {rpc} = await import('./qx-chain.mjs'); // browser-only helper, loaded lazily so the constants above stay node-importable
  const logs = await rpc(chainId, 'eth_getLogs', [{address: c.contracts.manager, fromBlock: '0x0', toBlock: 'latest', topics: [INITIALIZE, [...depth.keys()].slice(0, 20)]}]);
  const judged = (logs || []).map(keyFromInitialize).filter(Boolean).map(x => ({...x, ...judgeKey(chainId, token, x.key), liquidityUsd: depth.get(x.id) || 0}));
  // A reviewed hook only counts while its code is exactly what was reviewed.
  const pinned = new Map();
  for (const x of judged) {
    const hk = low(x.key.hooks), want = REVIEWED_HOOKS[chainId]?.[hk]?.sha256;
    if (x.refused || hk === Z) continue;
    if (!pinned.has(hk)) pinned.set(hk, rpc(chainId, 'eth_getCode', [hk, 'latest']).then(sha256Hex).then(got => !!want && got === want).catch(() => false));
    if (!await pinned.get(hk)) x.refused = 'hook';
  }
  const ok = judged.filter(x => !x.refused).sort((a, b) => b.liquidityUsd - a.liquidityUsd);
  if (ok.length) { const best = ok[0], hook = REVIEWED_HOOKS[chainId]?.[low(best.key.hooks)] || null; return {key: best.key, quote: best.quote, poolId: best.id, liquidityUsd: best.liquidityUsd, hookNote: hook?.name || null, hookOwner: !!hook?.owner}; }
  return {refused: judged.some(x => x.refused === 'hook') ? 'hook' : 'no_pool'};
}
export function refusalText(r) {
  return r?.refused === 'hook' ? 'Trading for this token on QHooks is coming: its pool runs a hook we haven’t reviewed yet.'
    : 'Trading for this token on QHooks is coming.';
}
