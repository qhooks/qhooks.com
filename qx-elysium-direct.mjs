// Direct Uniswap v4 route for outside Elysium tokens (2026-11-09; Randall: "Build it"). 0x doesn't serve Elysium, so
// the terminal trades these tokens on Elysium's canonical PoolManager through Elysium's QFeeRouter (0xff20…: the same 1%
// fee, 30% cashback, 20% referral as QHooks launches). This module only picks the pool:
// - candidates: the token's pool ids from the market header (DexScreener/GeckoTerminal), else GeckoTerminal's pool list;
// - each id's PoolKey from its Initialize event on the PoolManager (so only canonical-manager pools qualify);
// - the other side must be native HYPE or WHYPE; hooks must be none or on REVIEWED_HOOKS;
// - the deepest qualifying pool (by listed USD liquidity) wins.
import {chainById} from './chains.mjs';

import {DIRECT_CHAINS, Z, INITIALIZE, REVIEWED_HOOKS, hasDirectRoute, low, sha256Hex, word, signed24, keyFromInitialize, judgeKey} from './qx-elysium-keys.mjs';
// Moved to qx-elysium-keys.mjs (pure, Worker-safe); re-exported so callers keep importing from here.
export {DIRECT_CHAINS, REVIEWED_HOOKS, hasDirectRoute, keyFromInitialize, judgeKey};
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
