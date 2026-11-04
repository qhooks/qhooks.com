import {freezePoolTokens} from '../../prototypes/qpools/client/pool-constructor.mjs';
import {networkProfile} from '../multichain/profiles.mjs';
export function normalizeWalletAssets(chainId,tokens){
 networkProfile(chainId);const checked=freezePoolTokens(tokens);
 if(chainId==='5042'&&checked.includes('0x3600000000000000000000000000000000000000'))throw new TypeError('ERC20 USDC aliases native USDC; use native USDC only');
 return Object.freeze([...checked].sort());
}
