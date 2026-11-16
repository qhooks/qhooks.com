import {CONTRACT} from './qx-splitter-stats-contract.mjs';
// Add only reviewed deployments here. This reader never deploys or discovers a factory.
export const SPLITTERS=Object.freeze([{...CONTRACT,chainId:4663,name:'QWERTY',symbol:'QWERTY',decimals:18,otherSymbol:'QHOOKS',quoteSymbol:'WETH',quoteDecimals:18,chainName:'Robinhood Chain',explorer:'https://robinhoodchain.blockscout.com',rpc:'https://rpc.mainnet.chain.robinhood.com',fromBlock:113492000,bootstrapHead:113842472,confirmations:128,logStep:25000}]);
export const splitterFor=(chain,address)=>SPLITTERS.find(c=>String(c.chainId)===String(chain)&&c.address===String(address).toLowerCase());
export const splitterPath=c=>'/splitter/'+c.chainId+'/'+c.address;
