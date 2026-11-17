// Public route metadata, derived from the same public registry as chain copy.
// Listing a network never enables an EVM deployment or wallet action.
import {PUBLIC_NETWORKS} from './chains.mjs';
export const launchChains=Object.freeze(PUBLIC_NETWORKS.map(chain=>Object.freeze({
 id:chain.id,slug:chain.key,name:chain.name,gas:chain.native,feeModel:chain.feeModel||chain.family,
 coreHref:chain.id==='8453'?'/deploy':null,
 status:chain.id==='8453'?'QPool core setup available':'Launch options on '+chain.name
})));
export function launchChain(id){if(typeof id!=='string')throw new TypeError('Choose a chain ID');const chain=launchChains.find(c=>c.id===id);if(!chain)throw new TypeError('Chain is not in this rollout');return chain;}
