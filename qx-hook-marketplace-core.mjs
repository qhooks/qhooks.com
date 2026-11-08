export const NATIVE_HOOKS = Object.freeze([
  {id:'none',name:'Memecoin',group:'Launch styles',description:'Open trading with no extra buy/sell tax, limits or launch games.',href:'/qtoken-studio?blocks=none&style=none',kind:'studio-preset'},
  {id:'fair',name:'Fair launch',group:'Launch styles',description:'Anti-snipe, wallet caps and cooldowns for the opening window.',href:'/qtoken-studio?blocks=fair&style=fair',kind:'studio-preset'},
  {id:'flywheel',name:'Holder engine',group:'Holder rewards',description:'Connect buybacks, staking payouts and referrals to launch income.',href:'/qtoken-studio?blocks=flywheel&style=flywheel',kind:'studio-preset'},
  {id:'burn',name:'Burn engine',group:'Tokenomics',description:'Burn on buys and direct launch income to buyback and burn.',href:'/qtoken-studio?blocks=burn&style=burn',kind:'studio-preset'},
  {id:'community',name:'Community',group:'Holder rewards',description:'Reward holders, charge quick exits and fund buybacks.',href:'/qtoken-studio?blocks=community&style=community',kind:'studio-preset'},
  {id:'dynamic-fees',name:'Dynamic fees',group:'Fee policy',description:'Configure a changing LP fee within a fixed ceiling.',href:'/fee-lab?template=dynamic',kind:'lab-template'},
  {id:'directional-fees',name:'Directional fees',group:'Fee policy',description:'Set separate buy and sell fee schedules with notice.',href:'/fee-lab?template=directional',kind:'lab-template'},
  {id:'price-bands',name:'Price bands',group:'Pool controls',description:'Keep a pool inside a price band with two-key policy changes.',href:'/price-band-lab',kind:'lab-template'},
  {id:'circuit-recovery',name:'Circuit recovery',group:'Pool controls',description:'Pause on a threshold and resume after the cooldown with both keys.',href:'/circuit-lab',kind:'lab-template'},
  {id:'graduation',name:'QGraduation',group:'Pool controls',description:'Choose when liquidity moves into its next pool.',href:'/graduation-lab',kind:'lab-template'}
]);
export function nativeHookKit(id) {
  const hook=NATIVE_HOOKS.find(h=>h.id===id);if(!hook)throw new TypeError('Choose a listed QHooks hook.');
  return {schemaVersion:1,kind:'qhooks-integration-kit',hook:hook.id,name:hook.name,entryPoint:'https://qhooks.com/'+hook.href,workflow:hook.kind,docs:'https://qhooks.com/integrate#platforms',api:'https://qhooks.com/api/v1',sdk:'https://qhooks.com/sdk/qhooks.mjs'};
}
export function externalHookKit(record) {
  if(!Number.isSafeInteger(Number(record.chainId))||Number(record.chainId)<=0||!/^0x[0-9a-fA-F]{40}$/.test(record.address||''))throw new TypeError('A chain and deployed hook address are required.');
  const chainId=Number(record.chainId),address=record.address.toLowerCase();
  return {schemaVersion:1,kind:'qhooks-external-hook-record',name:record.name||null,chainId,address,readiness:'compatibility-review-required',profile:'https://qhooks.com/discover-hook#'+chainId+':'+address,api:'https://qhooks.com/api/v1/hooks/'+chainId+'/'+address,permissions:record.permissions||record.capabilities||[],requirements:['Check the hook’s source, license and constructor restrictions.','Confirm the target chain and PoolManager.','Use one hook contract per v4 pool; compose behavior in that contract.'],docs:'https://qhooks.com/integrate#external-hooks'};
}
