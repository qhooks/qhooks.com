import {CHAINS,feedSourceLabel} from './qx-terminal-feed-core.mjs';
import {freshnessState} from './qx-terminal-data.mjs';
// An unavailable list with no retained rows is a coverage state, not a refresh alarm.
export function renderFeedFeedback({state,heading,status,notice,noticeText,empty,retry,emptyText='',now=Date.now()}){
 const error=state.searchError||state.error,rows=state.data?.rows||[];
 const emptyChain=!state.query&&state.tab!=='launches'&&state.chain!=='all'&&!state.loading&&!rows.length&&!!(error||state.data?.status==='unavailable');
 heading.textContent='Tokens';
 empty.textContent=emptyChain?'No live list for '+(CHAINS.find(([id])=>id===state.chain)?.[1]||'this chain')+' right now. Try All or Solana.':emptyText;
 if(emptyChain){empty.hidden=false;empty.append(retry);}else notice.append(retry);
 notice.hidden=!error||emptyChain;
 noticeText.textContent=notice.hidden?'':(rows.length?'Showing the last loaded feed. ':'')+error;
 const fresh=freshnessState(state.data,now,{fresh:'Live · '});
 status.textContent=emptyChain?'Refreshing list…':state.tab!=='launches'&&state.data&&fresh.stale?'Refreshing…':error?'Could not refresh':state.searching?'Searching…':state.loading?'Refreshing…':state.tab==='launches'?'QHooks launches':fresh.label;
 status.dataset.delayed=String(!emptyChain&&(!!error||fresh.stale));
 return {emptyChain};
}
