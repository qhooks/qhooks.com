import {CHAINS,feedSourceLabel} from './qx-terminal-feed-core.mjs';
import {discoveryLiveness} from './qx-discovery-liveness.mjs';
// Metadata-only projection, shared by data renders and the local source deadline.
export function feedFeedbackSource(state){
 const row=state.data;
 return {row,failed:!!(state.error||state.searchError||state.loading||state.searching||row?.error||row?.status==='unavailable'||row?.refreshing||row?.coverage?.degraded)};
}
export function feedFeedbackStatus(state,fresh){
 const source=feedFeedbackSource(state);
 fresh=source.failed?{refreshing:true,label:'Refreshing'}:fresh||discoveryLiveness(source.row);
 const error=state.searchError||state.error,rows=state.data?.rows||[];
 const emptyChain=!state.query&&state.tab!=='launches'&&state.chain!=='all'&&!state.loading&&!rows.length&&!!(error||state.data?.status==='unavailable');
 return {emptyChain,label:emptyChain?'List unavailable':!state.loading&&!state.searching&&!rows.length&&state.tab!=='launches'?'':state.tab!=='launches'&&state.data&&fresh.refreshing?'Refreshing':error?'Could not refresh':state.searching?'Searching…':state.loading?'Refreshing':state.tab==='launches'?'QHooks launches':fresh.label,delayed:emptyChain||!!error||fresh.refreshing};
}
// An unavailable list with no retained rows is a coverage state, not a refresh alarm.
export function renderFeedFeedback({state,heading,status,notice,noticeText,empty,emptyMessage=empty,retry,emptyText='',now=Date.now()}){
 const error=state.searchError||state.error,rows=state.data?.rows||[];
 const emptyChain=!state.query&&state.tab!=='launches'&&state.chain!=='all'&&!state.loading&&!rows.length&&!!(error||state.data?.status==='unavailable');
 heading.textContent='Tokens';
 emptyMessage.textContent=emptyChain?'No live list for '+(CHAINS.find(([id])=>id===state.chain)?.[1]||'this chain')+' right now. Try All or Solana.':emptyText;
 if(emptyChain){empty.hidden=false;emptyMessage.append(retry);}else notice.append(retry);
 notice.hidden=!error||emptyChain;
 noticeText.textContent=notice.hidden?'':(rows.length?'Showing the last loaded feed. ':'')+error;
 const source=feedFeedbackSource(state),fresh=discoveryLiveness(source.row,{now,failed:source.failed}),view=feedFeedbackStatus(state,fresh);
 status.textContent=view.label;
 status.dataset.delayed=String(view.delayed);
 return {emptyChain};
}
