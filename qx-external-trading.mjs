// Route availability follows the pinned integration, independently of market discovery.
import {chainById} from './chains.mjs';
import {hasDirectRoute} from './qx-elysium-keys.mjs';
export function externalTradingNote(chainId) {
 const chain=chainById(chainId);
 return chain&&!chain.data.zeroEx&&!hasDirectRoute(chainId)?'Trading on '+chain.short+' is coming soon':null;
}
