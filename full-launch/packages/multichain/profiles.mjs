// Network identity/fee architecture only. A profile never admits a contract or enables sending.
const rows = [
 ['8453','0x2105','base','Base','op-stack','separate-data-and-operator-fees','https://mainnet.base.org','https://basescan.org','ETH'],
 ['4663','0x1237','robinhood','Robinhood Chain','nitro','data-fee-in-estimate-gas','https://rpc.mainnet.chain.robinhood.com','https://robinhoodchain.blockscout.com','ETH'],
 ['1','0x1','ethereum','Ethereum','ethereum','execution-only','https://ethereum-rpc.publicnode.com','https://etherscan.io','ETH'],
 ['42161','0xa4b1','arbitrum','Arbitrum One','nitro','data-fee-in-estimate-gas','https://arb1.arbitrum.io/rpc','https://arbiscan.io','ETH'],
 ['56','0x38','bnb','BNB Chain','bsc','bsc-execution','https://bsc-dataseed.bnbchain.org','https://bscscan.com','BNB'],
 ['5042','0x13b2','arc','Arc','arc-stablecoin','execution-only-native-usdc','https://rpc.mainnet.arc.io','https://explorer.arc.io','USDC'],
 // Elysium mainnet (2026-11-09; Kinetiq docs). Hidden in public/chains.mjs until go-public.
 ['99901','0x1863d','elysium','Elysium','nitro','data-fee-in-estimate-gas','https://rpc.elysium.kinetiq.xyz','https://elysium.kinetiq.xyz','HYPE'],
 // Elysium testnet: hidden test profile (public/chains.mjs status 'testnet'); resolves on the fork harness only.
 ['99801','0x185d9','elysium-testnet','Elysium Testnet','nitro','data-fee-in-estimate-gas','https://testnet-rpc.elysium.kinetiq.xyz','https://explorer-elysium-testnet.t.conduit.xyz','HYPE']
];
export const networkProfiles=Object.freeze(rows.map(([id,hexId,slug,name,feeModel,feeAccounting,publicRpc,explorer,nativeSymbol])=>Object.freeze({
 id,hexId,slug,name,feeModel,feeAccounting,publicRpc,explorer,nativeSymbol,nativeDecimals:18,
 nativeErc20SharedBalance:id==='5042',
 // Contract/runtime binding and each complete transaction flow are admitted separately.
 walletActionsEnabled:false,poolActionsEnabled:false,tokenLaunchEnabled:false
})));
export function networkProfile(id){
 if(typeof id!=='string')throw new TypeError('Canonical decimal chain ID required');
 const profile=networkProfiles.find(x=>x.id===id);
 if(!profile)throw new TypeError('Unsupported chain');return profile;
}
export function requireRpcChain(id,rpcChain){
 const profile=networkProfile(id);
 if(typeof rpcChain!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(rpcChain)||rpcChain!==profile.hexId)throw new TypeError('Selected chain does not match provider');
 return profile;
}
