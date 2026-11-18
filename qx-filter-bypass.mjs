// "<N> hidden by your filters · Show all". Pure: no storage, no reads.
// Show all pauses the filters for one view (tab + chain + exact filters) in memory;
// the saved filter record is never touched, and any filter or view change ends the pause.
import {filterDiscovery,validateDiscoveryFilters} from './qx-discovery-model.mjs';
import {discoveryCandidate} from './qx-discovery-rank.mjs';
import {projectTrendingContracts} from './qx-discovery-groups.mjs';
const BLANK=Object.freeze(validateDiscoveryFilters());
const active=filters=>Object.values(filters||{}).some(v=>v!==''&&v!=null);
export const bypassKey=state=>JSON.stringify([state.tab,String(state.chain),state.filters||{}]);
export const viewFilters=(state,bypass)=>bypass&&active(state.filters)&&bypass===bypassKey(state)?BLANK:state.filters;
function listed(rows,state,filters,factsOf,now){
 let out=filterDiscovery(rows,{tab:state.tab,window:state.window,filters,factsOf,now}).filter(discoveryCandidate);
 out=out.filter(r=>state.chain==='all'||String(r.chainId)===String(state.chain));
 const projection=projectTrendingContracts(out,{...state,filters,expanded:new Set(),now});
 return projection.active?projection.listingCount:out.length;
}
/** Listings the user's filters remove from the received rows of this view (0 when no filters). */
export function hiddenByFilters(rows,{state,factsOf=row=>row.discoveryFacts||{},now=Date.now()}={}){
 if(!active(state?.filters)||!Array.isArray(rows)||!rows.length)return 0;
 let filters;try{filters=validateDiscoveryFilters(state.filters);}catch{return 0;}
 return Math.max(0,listed(rows,state,BLANK,factsOf,now)-listed(rows,state,filters,factsOf,now));
}
