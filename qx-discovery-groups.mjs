import{capDiscoveryObservations}from'./qx-discovery-freshness.mjs';
import{discoveryCandidate,trendingCandidate,observedActivity,rankDiscovery}from'./qx-discovery-rank.mjs';
export const TRENDING_ACTIVITY=Object.freeze({volume24Usd:500,transactions:20});
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export const discoveryContractKey=row=>String(row.chainId)+':'+(String(row.chainId)==='solana'?String(row.token?.address||''):String(row.token?.address||'').toLowerCase());
const ticker=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,'').trim().normalize('NFC').toUpperCase():'';
export function defaultTrendingMode({tab,query='',filters={},sort={}}={}){return tab==='trending'&&!String(query).trim()&&!Object.values(filters).some(v=>v!==null&&v!==undefined&&String(v).trim()!=='')&&(!sort?.key||sort.key==='hot'&&sort.direction!=='asc');}
// Filters, windows and sort preferences never bypass Trending's listing policy.
// Explicit search remains a direct route to every received contract.
export function trendingProjectionMode({tab,query=''}={}){return tab==='trending'&&!String(query).trim();}
export function trendingActivity(row){const volume24Usd=numeric(row.volumeUsd?.h24),transactions=observedActivity(row,'h24');return{volume24Usd,transactions,eligible:volume24Usd!==null&&volume24Usd>=TRENDING_ACTIVITY.volume24Usd&&transactions!==null&&transactions>=TRENDING_ACTIVITY.transactions};}
const knownDesc=(a,b)=>a===null?b===null?0:1:b===null?-1:b-a;
const memberOrder=(a,b)=>knownDesc(numeric(a.liquidityUsd),numeric(b.liquidityUsd))||knownDesc(numeric(a.volumeUsd?.h24),numeric(b.volumeUsd?.h24))||knownDesc(observedActivity(a,'h24'),observedActivity(b,'h24'))||(discoveryContractKey(a)<discoveryContractKey(b)?-1:discoveryContractKey(a)>discoveryContractKey(b)?1:0);
/** Final Trending listing projection in every chain/window/sort/filter view. Never alter raw loader/cache/API records.
 * A same-ticker bucket is a presentation group, never an asset/issuer assertion.
 * No envelope time is admitted as a provider observation. */
export function projectTrendingContracts(rows,{expanded=new Set(),now=Date.now(),window='h24',chain='all',...view}={}){
 if(!trendingProjectionMode(view))return{active:false,rows,metadata:new Map(),listingCount:rows.length,receivedContracts:rows.length};
 const received=new Map();for(const row of rows){if(!row?.token?.address||!row.chainId)continue;const key=discoveryContractKey(row);if(!received.has(key))received.set(key,row);}
 const groups=new Map();for(const original of received.values()){
  // Expiry removes observations only. Identity/safety/holder facts and source clocks remain independent.
  const row=capDiscoveryObservations(original,{now});if(!discoveryCandidate(row))continue;
  const symbol=ticker(row.token?.symbol),id=symbol&&symbol!=='?'?String(row.chainId)+'\u0000'+symbol:'contract:'+discoveryContractKey(row);
  if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);
 }
 const selected=[],byRepresentative=new Map();
 for(const[id,members]of groups){
  const eligible=members.filter(row=>trendingCandidate(row,{window,filters:view.filters||{}})&&trendingActivity(row).eligible).sort(memberOrder);if(!eligible.length)continue;
  const representative=eligible[0],key=discoveryContractKey(representative),ordered=[representative,...members.filter(row=>discoveryContractKey(row)!==key).sort(memberOrder)];
  selected.push(representative);byRepresentative.set(key,{id,members:ordered,expanded:expanded.has(id),representative:key});
 }
 const ordered=rankDiscovery(selected,{window,now,chain,limit:Infinity,filters:view.filters||{}}),projected=[],metadata=new Map();
 for(const row of ordered){const group=byRepresentative.get(discoveryContractKey(row));projected.push(row);if(group.members.length>1){metadata.set(discoveryContractKey(row),{...group,isRepresentative:true});if(group.expanded)for(const member of group.members.slice(1)){projected.push(member);metadata.set(discoveryContractKey(member),{...group,isRepresentative:false});}}}
 return{active:true,rows:projected,metadata,listingCount:ordered.length,receivedContracts:received.size};
}
