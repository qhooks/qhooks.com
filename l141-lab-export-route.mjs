// L141 is a routing boundary only: it neither compiles, deploys, nor combines hooks.
import {hookIntegration} from './l125-hook-integrations.mjs';
import {recipeChain,recipeChains} from '/trade-client/apps/marketplace-preview/l124-launch-recipe.mjs';

export const graduationFamilyId='qgraduation-pq-liquidity-migration';
export const localSourceChainId='31337';
export const launchProfiles=Object.freeze(recipeChains.map(({id,name,quoteSymbol,nativeSymbol})=>Object.freeze({id,name,quoteSymbol,nativeSymbol})));

const ensure=(value,message)=>{if(!value)throw new TypeError(message);};
export function selectedLaunchChain(search,defaultChainId='8453'){
 ensure(typeof search==='string','URL search is required');
 recipeChain(defaultChainId);
 const params=new URLSearchParams(search);
 if(!params.has('chain'))return defaultChainId;
 const values=params.getAll('chain');
 ensure(values.length===1&&values[0].length>0,'Invalid selected launch chain');
 try{return recipeChain(values[0]).id;}catch{throw new TypeError('Unsupported selected launch chain');}
}

export function labExportRoute(familyId,chainId){
 const family=hookIntegration(familyId);
 ensure(family,'Choose an admitted hook family');
 if(familyId===graduationFamilyId){
  const chain=recipeChain(chainId);
  return Object.freeze({familyId,kind:'qgraduation-launch-recipe',profile:family.profile,chainId:chain.id,chainName:chain.name,localOnly:false,compiled:false,deployed:false,launchEnabled:true,builderHref:'/l141-graduation-studio?chain='+encodeURIComponent(chain.id),downloadHref:family.download.href,notice:'Configure a public '+chain.name+' recipe, then continue explicitly to launch review.'});
 }
 ensure(family.availability==='Source toolkit','Unsupported Lab export family');
 return Object.freeze({familyId,kind:'local-source-kit',profile:family.profile,chainId:localSourceChainId,chainName:'Local development chain',localOnly:true,compiled:false,deployed:false,launchEnabled:false,builderHref:family.builder.href,downloadHref:family.download.href,notice:'This family currently exports a local-chain (31337) source kit.'});
}

export function allLabExportRoutes(chainId='8453'){
 return Object.freeze(admittedFamilyIds.map(id=>labExportRoute(id,chainId)));
}

// The L125 catalog is frozen and contains these eight admitted families.
export const admittedFamilyIds=Object.freeze(['qcreator-fee-pq-vault','qrevenue-split-pq-vaults','qprice-band-pq-governance','qvolume-epochs-pq-renewal','qcircuit-recovery-pq-resume','qdynamic-fee-pq-governance','qdirectional-fees-pq-schedules',graduationFamilyId]);
