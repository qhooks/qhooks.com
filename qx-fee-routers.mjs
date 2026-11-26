// Every QFeeRouter a chain has had (FR2SWITCH 2026-11-26). Trades go to the first; readers of cashback, referrals and
// trade history read all of them (Robinhood Chain: QFeeRouterV2 0x352a…8bcd now, the shared 0x79d2…8bff before).
// No other imports than chains.mjs, so server and page code can both use it.
import {chainById} from './chains.mjs';
export const SHARED_FEE_ROUTER = '0x79d211f5137d22b0fe3bfda81fbb8b7f53248bff';
const A = /^0x[0-9a-f]{40}$/i;
/// The router new trades go to on this chain.
export function feeRouterOf(chainId) {
  const a = chainById(String(chainId))?.extras?.feeRouter;
  return typeof a === 'string' && A.test(a) ? a.toLowerCase() : SHARED_FEE_ROUTER;
}
/// [current, ...previous] for this chain, lowercase, no duplicates.
export function feeRoutersOf(chainId) {
  const prev = chainById(String(chainId))?.extras?.feeRoutersPrev;
  return [...new Set([feeRouterOf(chainId), ...(Array.isArray(prev) ? prev : []).filter(a => typeof a === 'string' && A.test(a)).map(a => a.toLowerCase())])];
}
/// Is `a` any fee router of this chain (current or previous)?
export const isFeeRouterOf = (chainId, a) => typeof a === 'string' && feeRoutersOf(chainId).includes(a.toLowerCase());
