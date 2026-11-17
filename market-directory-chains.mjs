// The EVM directory's accepted identities, including retained historical rows.
// Add Monad only after its directory rows are verified; Solana uses a separate flow.
import {chainById} from './chains.mjs';
import {launchChains} from './chain-catalog.mjs';

export const DIRECTORY_CHAINS = Object.freeze(['1', '56', '8453', '42161', '4663', '5042', '99801', '99901']);

export function directoryChainFor(id) {
  const current = launchChains.find(chain => chain.id === id);
  if (current) return current;
  return Object.freeze({id, name: chainById(id)?.name || 'Chain ' + id, slug: null});
}
