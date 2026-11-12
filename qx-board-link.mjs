// Shareable community board addresses; legacy fragment links remain supported.
// (EVM addresses lowercased; Solana mints keep their case). A QHooks launch's token address redirects to its launch board.
import {boardUrl} from './qx-board-address.mjs';
import { h } from '/qx-chain.mjs';
export const tokenBoardHref = (chainId, address) => boardUrl({kind:'token',chainId,address});
/** boardHref({chainId, address}) → token board; boardHref(chainId, controller) → launch board. */
export const boardHref = (a, b) => a && typeof a === 'object' ? tokenBoardHref(a.chainId, a.address) : boardUrl({kind:'launch',chainId:a,controller:b});
/** boardLink({chainId, address}, opts) or boardLink(chainId, controller, opts). */
export function boardLink(a, b, c) {
  const obj = a && typeof a === 'object', { cls = 'qb-boardlink', label = 'Community board →' } = (obj ? b : c) || {};
  return h('a', { class: cls, href: obj ? boardHref(a) : boardHref(a, b) }, label);
}
export const tokenBoardLink = (chainId, address, opts) => boardLink({ chainId, address }, opts);
