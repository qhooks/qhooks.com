// Links to community boards. Launch boards: /board#m=<chain>:<controller>. Any token: /board#t=<chain>:<address>
// (EVM addresses lowercased; Solana mints keep their case). A QHooks launch's token address redirects to its launch board.
import { h } from '/qx-chain.mjs';
export const tokenBoardHref = (chainId, address) => '/board#t=' + chainId + ':' + (String(chainId) === 'solana' ? String(address) : String(address).toLowerCase());
/** boardHref({chainId, address}) → token board; boardHref(chainId, controller) → launch board. */
export const boardHref = (a, b) => a && typeof a === 'object' ? tokenBoardHref(a.chainId, a.address) : '/board#m=' + a + ':' + String(b).toLowerCase();
/** boardLink({chainId, address}, opts) or boardLink(chainId, controller, opts). */
export function boardLink(a, b, c) {
  const obj = a && typeof a === 'object', { cls = 'qb-boardlink', label = 'Community board →' } = (obj ? b : c) || {};
  return h('a', { class: cls, href: obj ? boardHref(a) : boardHref(a, b) }, label);
}
export const tokenBoardLink = (chainId, address, opts) => boardLink({ chainId, address }, opts);
