// Owns a row intent only; quotes, approvals, signatures and receipts stay in the shared ticket.
// G3 (2026-11-18): the intent is a per-sheet controller keyed by token+preset, independent of the row DOM, so refresh
// ticks and row rebuilds never restart or kill it. A quote that has sat for requoteMs is re-quoted at most once per
// requoteMs, at most maxRequotes times per open sheet (then the sheet waits for an explicit Refresh), never in a loop.
// close() cancels: a pending prepare is ignored and its requests are aborted. Quote math, amounts, signer and the
// submit path are unchanged: prepare/send are the caller's (the shared ticket).
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export const saleKey=(row,percent)=>row?String(row.chainId)+':'+String(row.address||'').toLowerCase()+':'+percent:'';
export function createRowSale({owner,prepare,send,onChange=()=>{},schedule=setTimeout,unschedule=clearTimeout,now=()=>Date.now(),requoteMs=15000,maxRequotes=8}={}){
 let state={phase:'idle'},serial=0,timer=null,requoteTimer=null,disposed=false,aborter=null,requotes=0;
 const publish=next=>{state={...state,...next};onChange(state);return state;};
 const active=()=>['preparing','undo','confirm','submitting','pending'].includes(state.phase);
 const valid=()=>!disposed&&same(state.owner,owner());
 const stop=()=>{unschedule(timer);timer=null;};
 const stopRequote=()=>{unschedule(requoteTimer);requoteTimer=null;};
 const abort=()=>{try{aborter?.abort();}catch{}aborter=null;};
 async function execute(confirmed){
  if(!['undo','confirm'].includes(state.phase)||state.requoting)return;stop();stopRequote();
  if(!valid())return publish({phase:'error',message:'Your wallet changed. Review the sell again.'});
  publish({phase:'submitting',message:'Selling…'});
  try{const result=await send(state.review,{confirmed,onStatus:message=>publish({message})});
   const receipt=result?.receipt,hash=receipt?.transactionHash||receipt?.signature;
   if(!hash||!(receipt.status==='0x1'||receipt.status==='Success'))throw Object.assign(Error('The sell is awaiting confirmation. Check wallet activity.'),{mayHaveSubmitted:receipt?.status!=='0x0'});
   publish({phase:'sold',message:'Sold ✓',hash});
  }catch(error){publish({phase:error?.pending||error?.mayHaveSubmitted?'pending':'error',hash:error?.txHash||null,message:error?.message||'Could not complete the sell.'});}
 }
 // One quote read for the current row+preset. requote=true keeps the reviewed quote on screen (Sell disabled) meanwhile.
 async function quote(row,percent,{requote=false}={}){
  const id=++serial;stopRequote();abort();aborter=typeof AbortController==='function'?new AbortController():null;const signal=aborter?.signal;
  publish(requote?{requoting:true,message:'Refreshing the quote…'}:{phase:'preparing',key:saleKey(row,percent),row,percent,owner:owner(),review:null,hash:null,quotedAt:null,requoting:false,stale:false,message:'Refreshing balance and sell quote…'});
  try{const review=await prepare(row,percent,state.owner,()=>!disposed&&id===serial&&valid(),signal);if(id!==serial||disposed)return false;
   if(!valid())throw Error('Your wallet changed. Review the sell again.');
   if(!review)throw Error('No sell quote is available.');
   aborter=null;
   const auto=!requote&&review.silent&&!review.confirmRequired;publish({review,quotedAt:now(),requoting:false,stale:false,phase:auto?'undo':'confirm',message:auto?'Selling in 2s…':'Sell '+percent+'% '+row.symbol});
   if(auto)timer=schedule(()=>void execute(false),2000);else armRequote();return true;
  }catch(error){if(id===serial&&!disposed){aborter=null;publish({phase:'error',requoting:false,message:error?.message||'The sell quote is refreshing.'});}return false;}
 }
 function armRequote(){
  stopRequote();if(state.phase!=='confirm'||disposed)return;
  if(requotes>=maxRequotes){publish({stale:true,message:'Quote paused. Refresh it to sell.'});return;}
  requoteTimer=schedule(()=>{requoteTimer=null;if(state.phase!=='confirm'||state.requoting||disposed)return;requotes++;void quote(state.row,state.percent,{requote:true});},requoteMs);
 }
 return {
  snapshot:()=>state,
  async begin(row,percent){
   if(disposed)return false;
   // Same token and preset while its sheet is open: keep the controller (no restart on a re-tap or a rebuilt row).
   if(active()&&state.key===saleKey(row,percent))return true;
   if(active())return false;
   if(![25,50,100].includes(percent)||!owner())return false;
   requotes=0;return quote(row,percent);
  },
  confirm:()=>execute(true),
  // Manual refresh of a paused or failed quote (a user action, outside the automatic budget).
  refresh(){if(disposed||!state.row)return false;if(state.phase==='confirm'){requotes=0;void quote(state.row,state.percent,{requote:true});return true;}if(state.phase==='error'&&!state.hash){requotes=0;void quote(state.row,state.percent);return true;}return false;},
  retry(){return this.refresh();},
  cancel(){if(!['preparing','undo','confirm'].includes(state.phase))return false;serial++;stop();stopRequote();abort();publish({phase:'cancelled',requoting:false,message:'Cancelled. Nothing sent.'});return true;},
  // Closing the sheet: anything not yet sent is cancelled and its requests aborted; a sent sell keeps its own status.
  close(){const was=state.phase;if(['preparing','undo','confirm'].includes(was)){serial++;stop();}stopRequote();abort();if(!['submitting','pending'].includes(was))publish({phase:'closed',requoting:false,message:''});return was;},
  changed(){if(active()&&!same(state.owner,owner())&&state.phase!=='submitting'&&state.phase!=='pending'){serial++;stop();stopRequote();abort();publish({phase:'error',message:'Your wallet changed. Review the sell again.'});}},
  dispose(){disposed=true;serial++;stop();stopRequote();abort();},
 };
}
