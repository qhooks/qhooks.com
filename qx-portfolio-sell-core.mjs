// Owns a row intent only; quotes, approvals, signatures and receipts stay in the shared ticket.
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function createRowSale({owner,prepare,send,onChange=()=>{},schedule=setTimeout,unschedule=clearTimeout}={}){
 let state={phase:'idle'},serial=0,timer=null,disposed=false;
 const publish=next=>{state={...state,...next};onChange(state);return state;};
 const active=()=>['preparing','undo','confirm','submitting','pending'].includes(state.phase);
 const valid=()=>!disposed&&same(state.owner,owner());
 const stop=()=>{unschedule(timer);timer=null;};
 async function execute(confirmed){
  if(!['undo','confirm'].includes(state.phase))return;stop();
  if(!valid())return publish({phase:'error',message:'Your wallet changed. Review the sell again.'});
  publish({phase:'submitting',message:'Selling…'});
  try{const result=await send(state.review,{confirmed,onStatus:message=>publish({message})});
   const receipt=result?.receipt,hash=receipt?.transactionHash||receipt?.signature;
   if(!hash||!(receipt.status==='0x1'||receipt.status==='Success'))throw Object.assign(Error('The sell is awaiting confirmation. Check wallet activity.'),{mayHaveSubmitted:receipt?.status!=='0x0'});
   publish({phase:'sold',message:'Sold ✓',hash});
  }catch(error){publish({phase:error?.pending||error?.mayHaveSubmitted?'pending':'error',hash:error?.txHash||null,message:error?.message||'Could not complete the sell.'});}
 }
 return {
  snapshot:()=>state,
  async begin(row,percent){
   if(disposed||active())return false;
   if(![25,50,100].includes(percent)||!owner())return false;
   const id=++serial;publish({phase:'preparing',row,percent,owner:owner(),review:null,hash:null,message:'Refreshing balance and sell quote…'});
   try{const review=await prepare(row,percent,state.owner,()=>!disposed&&id===serial&&valid());if(id!==serial||disposed)return false;
    if(!valid())throw Error('Your wallet changed. Review the sell again.');
    if(!review)throw Error('No sell quote is available.');
    const auto=review.silent&&!review.confirmRequired;publish({review,phase:auto?'undo':'confirm',message:auto?'Selling in 2s…':'Sell '+percent+'% '+row.symbol});
    if(auto)timer=schedule(()=>void execute(false),2000);return true;
   }catch(error){if(id===serial&&!disposed)publish({phase:'error',message:error?.message||'The sell quote is refreshing.'});return false;}
  },
  confirm:()=>execute(true),
  cancel(){if(!['preparing','undo','confirm'].includes(state.phase))return false;serial++;stop();publish({phase:'cancelled',message:'Cancelled. Nothing sent.'});return true;},
  changed(){if(active()&&!same(state.owner,owner())&&state.phase!=='submitting'&&state.phase!=='pending'){serial++;stop();publish({phase:'error',message:'Your wallet changed. Review the sell again.'});}},
  dispose(){disposed=true;serial++;stop();},
 };
}
