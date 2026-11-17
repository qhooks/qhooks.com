// User-selected discovery filters, using already observed QProof and pool facts.
// No reads, scans, wallet operations or default enablement.
export const SAFE_START=Object.freeze({liquidityMin:'10000',hideQproofDanger:'yes',verifiedLiquidityOnly:'yes'});
export const SAFE_START_LABELS=Object.freeze({hideQproofDanger:'Hide QProof red flags',verifiedLiquidityOnly:'Verified LP position only'});
export const safeStartSelection=(filters={})=>({...filters,...SAFE_START,liquidityMin:String(Math.max(Number(filters.liquidityMin)||0,Number(SAFE_START.liquidityMin)))});
const AGE=300000,evm=/^0x[\da-f]{40}$/i,sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function filterOwner(value){
 const raw=typeof value==='object'?(value?.address??value?.wallet??value?.key):value;
 if(evm.test(raw||''))return 'evm:'+raw.toLowerCase();
 const address=typeof raw==='string'&&raw.startsWith('solana:')?raw.slice(7):raw;
 return sol.test(address||'')?'solana:'+address:'guest';
}
const key=owner=>'qhooks:discovery:filters:v2:'+filterOwner(owner);
export function readDiscoveryFilters(storage,owner){try{const text=storage?.getItem(key(owner));if(!text||text.length>8192)return null;const v=JSON.parse(text);return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
export function writeDiscoveryFilters(storage,owner,filters){try{const text=JSON.stringify(filters);if(text.length>8192||!storage?.setItem)return false;storage.setItem(key(owner),text);return storage.getItem(key(owner))===text;}catch{return false;}}
const fresh=(at,now)=>Number.isSafeInteger(at)&&at>0&&at<=now+5000&&now-at<=AGE;
const samePool=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^0x[\da-f]{64}$/i.test(a)&&a.toLowerCase()===b.toLowerCase();
export function safeStartFacts(row,evidence={},now=Date.now()){
 const q=evidence.qproof,lp=evidence.lp,pool=row.pool||row.launch?.poolId;
 return {qproofDanger:fresh(q?.at,now)&&q.level==='danger',verifiedLiquidity:lp?.noRemove===true&&fresh(lp.at,now)&&samePool(pool,lp.poolId)};
}
export function safeStartMatches(row,filters,facts={},now=Date.now()){
 if(filters.hideQproofDanger==='yes'&&(facts.qproofDanger===true||row.safety?.flag==='danger'))return false;
 if(filters.verifiedLiquidityOnly==='yes'&&facts.verifiedLiquidity!==true)return false;
 return true;
}
