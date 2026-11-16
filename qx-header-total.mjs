// headertotal (2026-11-13, Randall approved): the header's "$X all chains" includes tokens bought outside QHooks (ROOQ,
// AEON…), priced exactly as the portfolio list prices them: the same /api/portfolio/evm/<w> answer (same server cache
// row), the same outside-token repricing kept on this device (qx-wallet-pnl.mjs), the same total (mergePortfolios).
// The read is marked x-qhooks-read-purpose: header-total so the server meters its Alchemy share under the tag
// "header-total" and stops at the $5/month cap (server/header-total.mjs); then it answers 503 header_total_cap and the
// header keeps its QHooks-only total, labelled "Total excludes some tokens · Refreshing".
// No timer: the header calls this on its existing triggers (open, connect, chain switch, trade, return to the tab).
export const EXCLUDES = 'Total excludes some tokens · Refreshing';
import {portfolioReader} from './qx-portfolio-read.mjs';
export async function headerTotal(owner,{fetchImpl=globalThis.fetch,load=()=>Promise.all([import('/qx-portfolio.mjs'),import('/qx-wallet-pnl.mjs')]),onLater=null}={}){
 const w=String(owner||'').toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(w))return {capped:false,total:null};
 const reader=portfolioReader({fetchImpl}),saved=reader.cached('evm',w);
 const [{mergePortfolios},{outsideCosts}]=await load(),costs=outsideCosts();
 const value=(report,refreshing=false)=>{
  if(costs.apply(report))report=reader.accept('evm',w,report,{derived:true,refreshing});
  const result={capped:false,total:mergePortfolios([report]).valueUsd,partial:!!report.partial,refreshing};
  if(typeof onLater==='function')void costs.refresh(report).then(changed=>{if(changed){const accepted=reader.accept('evm',w,report,{derived:true,refreshing});onLater(mergePortfolios([accepted]).valueUsd,{partial:!!accepted.partial});}},()=>{});
  return result;
 };
 const fresh=()=>reader.read('evm',w,{purpose:'header-total',force:true}).then(report=>value(report,!!report.refreshing));
 if(saved){
  if(!saved.fresh||saved.report.refreshing)void fresh().then(r=>onLater?.(r.total,{partial:r.partial}),()=>{});
  return value(saved.report,!saved.fresh||!!saved.report.refreshing);
 }
 try{return await fresh();}catch(e){return {capped:!!e.capped,total:null};}
}
