// Product routing only. These templates do not share deployment authority.
const creator='qcreator-fee-pq-vault',split='qrevenue-split-pq-vaults',graduation='qgraduation-pq-liquidity-migration';
const sourceScope='Source integration on local chain 31337. Use a compatible Uniswap v4 PoolManager, ordered ERC-20 currencies and the exact hook permission salt. Wallet and ML-DSA-65 authorization protect only the named action, not the EVM wallet, token transfers or every swap. Key enrollment has a separate, potentially substantial network cost. No automatic public-chain deployment or arbitrary hook combinations.';
const sourceSteps=Object.freeze(['Download the starter source kit, or configure your own settings in the Lab.','Use the included compiler input and integration guide to build the contracts. Replace example addresses and time windows before integration.','Enroll fresh keys, verify your manager and token pair, and exercise the protected action before deploying your configuration.']);
const rows=[
 [creator,'/lab','Creator Revenue','Creator-fee withdrawals','Fees','A single claim vault receives creator swap fees. Its owner needs both wallet and post-quantum approval to withdraw.'],
 [split,'/lab?template=split','Revenue Split','Each beneficiary’s fee withdrawals','Fees','Two beneficiaries receive their configured fee shares in separate vaults, with independent ownership and keys.'],
 ['qprice-band-pq-governance','/price-band-lab','Price Bands','Price-band updates','Pool policy','Constrain swaps to a configured price band. Changing the band requires wallet and post-quantum approval.'],
 ['qvolume-epochs-pq-renewal','/volume-epoch-lab','Volume Epochs','Expired volume-window renewal','Pool policy','Give each direction a raw-token trading budget per window. Renew expired windows with dual authorization.'],
 ['qcircuit-recovery-pq-resume','/circuit-lab','Circuit Recovery','Resuming paused swaps after cooldown','Pool policy','An oversized executed swap completes, then pauses later swaps. Resume after cooldown with dual authorization.'],
 ['qdynamic-fee-pq-governance','/fee-lab?template=dynamic','Dynamic Fees','LP-fee updates','Fees','Adjust the pool’s LP fee within a permanent ceiling using wallet and post-quantum approval.'],
 ['qdirectional-fees-pq-schedules','/fee-lab?template=directional','Directional Fees','Directional LP-fee schedule updates','Fees','Set different LP fees for each trading direction and authorize changes with both keys.']
];
const entries=rows.map(([id,href,name,protectedAction,category,summary])=>[id,{
 id,name,summary,category,profile:'ML-DSA-65',availability:'Source toolkit',protectedAction,
 scope:sourceScope,steps:sourceSteps,builder:{href,label:'Customize in the Lab'},
 download:{href:'l125-kits/'+id+'/source-kit.zip',label:'Download source kit'},
 reference:{href:'l125-kits/'+id+'/guide.txt',label:'Read integration guide'}
}]);
entries.push([graduation,{
 id:graduation,name:'QGraduation',category:'Liquidity',summary:'Launch a token with post-quantum-controlled liquidity and a graduation policy you choose.',
 profile:'SLH-DSA',availability:'Launch builder',protectedAction:'Controller-owned liquidity actions and graduation policy changes require wallet and post-quantum approval.',
 scope:'Choose Base, Robinhood Chain, Ethereum, Arbitrum One, BNB Chain or Arc in the builder. The downloadable Base example is public configuration only; it is not a key backup or deployed contract. Network and liquidity costs are shown in the launch flow. Net quote inflow is not market cap. Protection covers the controller-managed position, not arbitrary external pools, wallet transfers or cross-chain transit.',
 steps:['Open the launch builder and choose your chain, token details and liquidity policy.','Save a recipe, or import the downloadable Base example and change its settings. Continue explicitly into launch.','Connect your wallet, create and verify your separate quantum-key backup, then review each deployment and funding transaction.'],
 builder:{href:'/graduation-studio',label:'Build your launch'},
 download:{href:'l125-kits/'+graduation+'/launch-recipe.json',label:'Download example recipe'},
 reference:{href:'l125-kits/'+graduation+'/guide.txt',label:'Read launch guide'}
}]);
function freeze(value){if(value&&typeof value==='object'){for(const x of Object.values(value))freeze(x);Object.freeze(value);}return value;}
export const hookIntegrations=freeze(Object.fromEntries(entries));
export function hookIntegration(id){return typeof id==='string'&&Object.hasOwn(hookIntegrations,id)?hookIntegrations[id]:null;}
export function integrationId(search){const p=new URLSearchParams(search),ids=p.getAll('id');return ids.length===1?ids[0]:null;}
