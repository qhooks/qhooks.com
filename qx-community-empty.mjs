export const RANKING_WAIT='Rankings appear once callers have 5 timed calls';
export const boardHasNoCalls=({posts=[],pinned=[],next=null,linkedCall=null}={})=>!next&&![...posts,...pinned,...(linkedCall?[linkedCall]:[])].some(post=>post.kind==='call');
export function firstCallPrompt(doc,{href='/community#make-a-call',text='No calls yet. Put your thesis on record.'}={}){
 const box=doc.createElement('div'),note=doc.createElement('p'),link=doc.createElement('a');
 box.className='qx-first-call';note.className='qa-empty';note.textContent=text;link.className='qx-link';link.href=href;link.textContent='Be the first to call it →';box.append(note,link);return box;
}
// Qualification comes from the scoring API; the UI never recomputes a score.
export function qualifiedCallers(body){
 if(body?.version!==2||body.coverage?.completeRecordSet!==true||!Array.isArray(body.callers))return [];
 return body.callers.filter(row=>row?.version===2&&row.rankEligible===true&&row.coverage?.completeRecordSet===true).slice(0,50);
}
export function mountCallerRankings(container,note,{document:doc=globalThis.document,fetcher=globalThis.fetch,loadRows=()=>import('./qx-board-rows.mjs')}={}){
 let disposed=false;
 async function refresh(){
  container.hidden=true;note.hidden=false;note.textContent=RANKING_WAIT;
  try{
   const response=await fetcher('/api/community/v2/callers',{cache:'no-store'});if(!response.ok)throw Error('unavailable');
   const body=await response.json();if(disposed)return;
   const rows=qualifiedCallers(body);container.replaceChildren();
   if(body?.coverage?.completeRecordSet===false){note.textContent=RANKING_WAIT+'. The caller record set is incomplete.';return;}
   if(!rows.length)return;
   const m=await loadRows();if(disposed)return;container.replaceChildren(...rows.map((row,index)=>m.callerRow(row,index+1)));container.hidden=false;note.hidden=true;
  }catch{
   if(disposed)return;container.hidden=true;note.hidden=false;note.textContent=RANKING_WAIT+'. Caller records are unavailable right now. ';
   const retry=doc.createElement('button');retry.type='button';retry.className='qx-btn qx-btn-ghost';retry.textContent='Retry caller records';retry.addEventListener('click',()=>void refresh());note.append(retry);
  }
 }
 const ready=refresh();return{ready,refresh,dispose(){disposed=true;}};
}
