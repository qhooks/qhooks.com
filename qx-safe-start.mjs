// User-selected discovery filters, using already observed QProof and pool facts.
// No reads, scans, wallet operations or default enablement.
// Safe-start v2 (2026-11-18): hide only proven-bad tokens. An observed QProof Danger
// verdict or proven pulled LP hides a row; unknown QProof, unknown LP and unknown
// liquidity pass. Unknown is never relabelled as verified. No liquidity floor: the
// default Trending floor ($1K liquidity · $500 24h volume · 10 trades) still applies.
export const SAFE_START_VERSION=2;
export const SAFE_START=Object.freeze({hideQproofDanger:'yes'});
// v1 Apply fingerprint: these three fields at these exact values (other user fields may be present).
export const SAFE_START_V1=Object.freeze({liquidityMin:'10000',hideQproofDanger:'yes',verifiedLiquidityOnly:'yes'});
export const SAFE_START_LABELS=Object.freeze({hideQproofDanger:'Hide QProof Danger · pulled LP',verifiedLiquidityOnly:'Verified LP position only'});
export const SAFE_START_SUMMARY='Hides tokens QProof flags as Danger or with pulled liquidity. Unchecked tokens stay visible.';
// Apply keeps every field the user set; it only switches the proven-bad filter on.
export const safeStartSelection=(filters={})=>({...stripMarker(migrateLegacySafeStart(filters).filters),...SAFE_START});
const MARKER=['origin','v'];
function stripMarker(record){const out={...(record||{})};for(const k of MARKER)delete out[k];return out;}
export const markSafeStart=filters=>({...stripMarker(filters),origin:'safe-start',v:SAFE_START_VERSION});
/** True when all three v1 fields hold their exact v1 values and the record has no marker. Other fields are ignored. */
export function isLegacySafeStart(record){
 if(!record||typeof record!=='object'||Array.isArray(record)||'origin' in record||'v' in record)return false;
 return Object.entries(SAFE_START_V1).every(([k,v])=>record[k]!=null&&String(record[k]).trim()===v);
}
/** Idempotent: relaxes only the three v1 fields to v2 and stamps origin/version; every other field is kept as is. */
export function migrateLegacySafeStart(record){
 if(!isLegacySafeStart(record))return {filters:record,migrated:false};
 return {filters:markSafeStart({...record,liquidityMin:'',verifiedLiquidityOnly:'',...SAFE_START}),migrated:true};
}
const AGE=300000,evm=/^0x[\da-f]{40}$/i,sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function filterOwner(value){
 const raw=typeof value==='object'?(value?.address??value?.wallet??value?.key):value;
 if(evm.test(raw||''))return 'evm:'+raw.toLowerCase();
 const address=typeof raw==='string'&&raw.startsWith('solana:')?raw.slice(7):raw;
 return sol.test(address||'')?'solana:'+address:'guest';
}
const key=owner=>'qhooks:discovery:filters:v2:'+filterOwner(owner);
function readRaw(storage,owner){try{const text=storage?.getItem(key(owner));if(!text||text.length>8192)return null;const v=JSON.parse(text);return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
// Reading repairs records left by the v1 Apply (it hid every unknown-LP row) and stamps them once.
export function readDiscoveryFilters(storage,owner){
 const v=readRaw(storage,owner);if(!v)return null;
 const {filters,migrated}=migrateLegacySafeStart(v);
 if(migrated)writeDiscoveryFilters(storage,owner,filters);
 return filters;
}
export function writeDiscoveryFilters(storage,owner,filters){try{const text=JSON.stringify(filters);if(text.length>8192||!storage?.setItem)return false;storage.setItem(key(owner),text);return storage.getItem(key(owner))===text;}catch{return false;}}
const fresh=(at,now)=>Number.isSafeInteger(at)&&at>0&&at<=now+5000&&now-at<=AGE;
const samePool=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^0x[\da-f]{64}$/i.test(a)&&a.toLowerCase()===b.toLowerCase();
const tri=(known,value)=>known?value:null;
/** Tri-state facts: true = proven, false = proven otherwise, null = unknown. */
export function safeStartFacts(row,evidence={},now=Date.now()){
 const q=evidence.qproof,lp=evidence.lp,pool=row.pool||row.launch?.poolId;
 const qKnown=fresh(q?.at,now)&&typeof q?.level==='string',lpKnown=!!lp&&fresh(lp.at,now)&&samePool(pool,lp.poolId);
 return {
  qproofDanger:tri(qKnown,q?.level==='danger'),
  verifiedLiquidity:tri(lpKnown&&(lp.noRemove===true||lp.pulled===true),lp?.noRemove===true&&lp?.pulled!==true),
  lpPulled:tri(lpKnown&&(lp.noRemove===true||lp.pulled===true),lp?.pulled===true),
 };
}
/** Proven-bad only. Unknown (null/undefined) always passes hideQproofDanger.
 * verifiedLiquidityOnly is a separate opt-in strict filter; Safe-start never sets it. */
export function safeStartMatches(row,filters,facts={}){
 if(filters.hideQproofDanger==='yes'&&(facts.qproofDanger===true||facts.lpPulled===true||row.safety?.flag==='danger'))return false;
 if(filters.verifiedLiquidityOnly==='yes'&&facts.verifiedLiquidity!==true)return false;
 return true;
}
