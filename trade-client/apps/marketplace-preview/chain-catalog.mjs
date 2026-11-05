// Public route availability, not permission to transact. Explicit chain IDs only.
export const launchChains=Object.freeze([
 Object.freeze({id:'8453',slug:'base',name:'Base',gas:'ETH',feeModel:'op-stack',coreHref:'deploy.html',status:'QPool core setup available'}),
 Object.freeze({id:'4663',slug:'robinhood',name:'Robinhood Chain',gas:'ETH',feeModel:'nitro',coreHref:null,status:'Integration in progress'}),
 Object.freeze({id:'1',slug:'ethereum',name:'Ethereum',gas:'ETH',feeModel:'ethereum',coreHref:null,status:'Integration in progress'}),
 Object.freeze({id:'42161',slug:'arbitrum',name:'Arbitrum One',gas:'ETH',feeModel:'nitro',coreHref:null,status:'Integration in progress'}),
 Object.freeze({id:'56',slug:'bnb',name:'BNB Chain',gas:'BNB',feeModel:'bsc',coreHref:null,status:'Integration in progress'}),
 Object.freeze({id:'5042',slug:'arc',name:'Arc',gas:'USDC',feeModel:'arc-stablecoin',coreHref:null,status:'Integration in progress'}),
 Object.freeze({id:'99801',slug:'elysium-testnet',name:'Elysium Testnet',gas:'HYPE',feeModel:'nitro',coreHref:null,status:'Integration in progress'})
]);
export function launchChain(id){if(typeof id!=='string')throw new TypeError('Choose a chain ID');const chain=launchChains.find(c=>c.id===id);if(!chain)throw new TypeError('Chain is not in this rollout');return chain;}
